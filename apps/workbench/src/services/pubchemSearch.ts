import type {
  PubChemCandidate,
  PubChemCandidateSearchResult,
  PubChemMatchStatus,
  MoleculeValidationResult,
  Molecule3DStructureMatchStatus,
} from '../types/molecule';
import { validateMoleculeInput } from './rdkitService';

type PubChemPropertyRecord = {
  CID?: number;
  Title?: string;
  MolecularFormula?: string;
  MolecularWeight?: string | number;
  CanonicalSMILES?: string;
  IsomericSMILES?: string;
  ConnectivitySMILES?: string;
  SMILES?: string;
};

type PubChemPropertyResponse = {
  PropertyTable?: {
    Properties?: PubChemPropertyRecord[];
  };
};

const PUBCHEM_PROPERTY_ENDPOINT =
  'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles/property/Title,MolecularFormula,MolecularWeight,CanonicalSMILES,IsomericSMILES/JSON';
const DEFAULT_PUBCHEM_TIMEOUT_MS = 15_000;

type PubChemRequestOptions = {
  timeoutMs?: number;
};

type PubChemResolvedMatchStatus = Exclude<
  PubChemMatchStatus,
  'not_requested' | 'searching' | 'error'
>;

const STUDENT_SEARCH_FAILURE_MESSAGE =
  'PubChem 후보 검색 중 오류가 발생했습니다. RDKit.js 검증 결과는 계속 사용할 수 있습니다.';

const RESPONSE_TEXT_LIMIT = 500;
const FORMULA_TOKEN_PATTERN = /([A-Z][a-z]?)(\d*)/g;

function excerptResponseText(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, RESPONSE_TEXT_LIMIT);
}

function toOptionalString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number') {
    return String(value);
  }

  return undefined;
}

function parsePubChemPropertyResponse(value: string): PubChemPropertyResponse {
  return JSON.parse(value) as PubChemPropertyResponse;
}

function buildStatus(candidateCount: number): PubChemResolvedMatchStatus {
  if (candidateCount === 0) {
    return 'no_match';
  }

  if (candidateCount === 1) {
    return 'single_candidate';
  }

  return 'multiple_candidates';
}

function buildStudentMessage(status: PubChemResolvedMatchStatus): string {
  switch (status) {
    case 'no_match':
      return 'PubChem에서 일치 후보를 찾지 못했습니다.';
    case 'single_candidate':
      return '외부 데이터 후보 1개를 찾았습니다. 자동 선택하지 않고 직접 확인해야 합니다.';
    case 'multiple_candidates':
      return '후보가 여러 개입니다. 표시된 후보 중 하나를 직접 선택하세요.';
  }
}

function mapPubChemCandidate(record: PubChemPropertyRecord): PubChemCandidate | null {
  if (typeof record.CID !== 'number' || !Number.isInteger(record.CID)) {
    return null;
  }

  return {
    cid: record.CID,
    title: record.Title,
    molecularFormula: record.MolecularFormula,
    molecularWeight: toOptionalString(record.MolecularWeight),
    canonicalSmiles: record.CanonicalSMILES ?? record.ConnectivitySMILES ?? record.SMILES,
    isomericSmiles: record.IsomericSMILES ?? record.SMILES,
    source: 'pubchem',
  };
}

function parseFormulaCounts(formula: string): Map<string, number> | null {
  const trimmedFormula = formula.trim();

  if (!trimmedFormula) {
    return null;
  }

  const counts = new Map<string, number>();
  let parsedLength = 0;
  let match: RegExpExecArray | null;

  FORMULA_TOKEN_PATTERN.lastIndex = 0;
  while ((match = FORMULA_TOKEN_PATTERN.exec(trimmedFormula)) !== null) {
    const [, symbol, rawCount] = match;
    const count = rawCount ? Number(rawCount) : 1;

    if (!Number.isFinite(count) || count <= 0) {
      return null;
    }

    parsedLength += match[0].length;
    counts.set(symbol, (counts.get(symbol) ?? 0) + count);
  }

  return parsedLength === trimmedFormula.length ? counts : null;
}

function haveSameFormula(leftFormula: string, rightFormula: string): boolean {
  const leftCounts = parseFormulaCounts(leftFormula);
  const rightCounts = parseFormulaCounts(rightFormula);

  if (!leftCounts || !rightCounts) {
    return leftFormula.trim() === rightFormula.trim();
  }

  if (leftCounts.size !== rightCounts.size) {
    return false;
  }

  for (const [symbol, count] of leftCounts) {
    if (rightCounts.get(symbol) !== count) {
      return false;
    }
  }

  return true;
}

function hasExplicitStereochemistry(smiles: string | undefined): boolean {
  return Boolean(smiles && /[@/\\]/.test(smiles));
}

export function evaluatePubChemCandidateForCurrentStructure(
  candidate: PubChemCandidate,
  validationResult: MoleculeValidationResult | null,
): {
  canLoad3D: boolean;
  studentMessage?: string;
  structureMatchStatus?: Molecule3DStructureMatchStatus;
  warnings: string[];
  developerLogs: string[];
} {
  if (validationResult?.ok !== true) {
    return {
      canLoad3D: false,
      studentMessage:
        'PubChem 후보를 3D로 불러오려면 먼저 현재 구조가 RDKit.js 검증을 통과해야 합니다.',
      warnings: [],
      developerLogs: [
        'PubChem candidate 3D load blocked: missing valid RDKit result.',
        `candidate CID: ${candidate.cid}`,
      ],
    };
  }

  const candidateFormula = candidate.molecularFormula?.trim();
  const candidateCanonicalSmiles = candidate.canonicalSmiles?.trim();
  const candidateIsomericSmiles = candidate.isomericSmiles?.trim();
  const candidateStructureSmiles =
    candidateIsomericSmiles || candidateCanonicalSmiles;
  const currentCanonicalSmiles = validationResult.canonicalSmiles;
  const currentHasExplicitStereo = hasExplicitStereochemistry(
    currentCanonicalSmiles,
  );
  const candidateHasExplicitStereo = hasExplicitStereochemistry(
    candidateStructureSmiles,
  );
  const hasExactStereoMatch =
    currentHasExplicitStereo &&
    candidateHasExplicitStereo &&
    candidateStructureSmiles === currentCanonicalSmiles;
  const hasMatchingStructureSmiles =
    candidateCanonicalSmiles === currentCanonicalSmiles ||
    candidateIsomericSmiles === currentCanonicalSmiles ||
    hasExactStereoMatch;
  const developerLogs = [
    'PubChem candidate compatibility check.',
    `candidate CID: ${candidate.cid}`,
    `RDKit formula: ${validationResult.molecularFormula}`,
    `PubChem formula: ${candidateFormula || 'not provided'}`,
    `RDKit canonicalSmiles: ${currentCanonicalSmiles}`,
    `PubChem canonicalSmiles: ${candidateCanonicalSmiles || 'not provided'}`,
    `PubChem isomericSmiles: ${candidateIsomericSmiles || 'not provided'}`,
  ];
  const warnings: string[] = [];

  if (!candidateCanonicalSmiles && !candidateIsomericSmiles) {
    if (!candidateFormula) {
      return {
        canLoad3D: false,
        studentMessage:
          '선택한 PubChem 후보에는 현재 구조와의 일치 여부를 확인할 근거가 없어 3D 불러오기를 중단했습니다.',
        warnings: [
          'PubChem 후보의 분자식과 구조 식별 정보가 모두 제공되지 않았습니다.',
        ],
        developerLogs: [
          ...developerLogs,
          'candidate blocked: canonical and isomeric SMILES not provided.',
          'candidate blocked: formula and canonical SMILES not provided.',
        ],
      };
    }

    return {
      canLoad3D: false,
      studentMessage:
        '선택한 PubChem 후보에는 현재 구조와 일치하는지 확인할 구조 식별값이 없어 3D 불러오기를 중단했습니다.',
      warnings: [
        '분자식만으로는 구조 이성질체를 구별할 수 없습니다. canonical 또는 isomeric SMILES가 필요합니다.',
      ],
      developerLogs: [
        ...developerLogs,
        'candidate blocked: canonical and isomeric SMILES not provided.',
      ],
    };
  }

  if (
    currentHasExplicitStereo !== candidateHasExplicitStereo ||
    (currentHasExplicitStereo &&
      candidateHasExplicitStereo &&
      !hasExactStereoMatch)
  ) {
    return {
      canLoad3D: false,
      studentMessage:
        '현재 구조와 PubChem 후보의 입체화학 표기가 일치하지 않아 3D 불러오기를 중단했습니다.',
      warnings: [
        '입체화학의 명시 여부 또는 isomeric SMILES가 다릅니다. 교사와 함께 구조를 검토해 주세요.',
      ],
      developerLogs: [
        ...developerLogs,
        'candidate blocked: stereochemistry mismatch.',
      ],
    };
  }

  if (
    candidateCanonicalSmiles &&
    candidateCanonicalSmiles !== currentCanonicalSmiles &&
    !hasExactStereoMatch
  ) {
    warnings.push(
      'PubChem SMILES 표기가 RDKit.js canonical SMILES와 달라 현재 구조의 3D 자료로 사용할 수 없습니다.',
    );

    return {
      canLoad3D: false,
      studentMessage:
        '선택한 외부 3D 자료 후보가 현재 구조와 일치하지 않아 불러오기를 중단했습니다.',
      warnings,
      developerLogs: [
        ...developerLogs,
        'candidate blocked: canonical SMILES mismatch.',
      ],
    };
  }

  if (
    candidateFormula &&
    !haveSameFormula(validationResult.molecularFormula, candidateFormula)
  ) {
    return {
      canLoad3D: false,
      studentMessage:
        '선택한 PubChem 후보의 분자식이 현재 RDKit.js 검증 결과와 달라 3D 불러오기를 중단했습니다.',
      warnings: [
        `RDKit.js 분자식: ${validationResult.molecularFormula}`,
        `PubChem 후보 분자식: ${candidateFormula}`,
      ],
      developerLogs: [...developerLogs, 'candidate blocked: formula mismatch.'],
    };
  }

  if (!hasMatchingStructureSmiles) {
    return {
      canLoad3D: false,
      studentMessage:
        '선택한 PubChem 후보의 구조 식별값이 현재 구조와 일치하지 않아 3D 불러오기를 중단했습니다.',
      warnings: [
        '분자식이 같더라도 구조 이성질체일 수 있으므로 현재 검증 구조와 정확히 일치하는 구조 식별값이 필요합니다.',
      ],
      developerLogs: [
        ...developerLogs,
        'candidate blocked: structure identifiers did not verify current structure.',
      ],
    };
  }

  if (!candidateFormula && hasMatchingStructureSmiles) {
    warnings.push(
      'PubChem 후보의 분자식이 제공되지 않았습니다. 구조 식별값은 현재 검증 구조와 일치합니다.',
    );

    return {
      canLoad3D: true,
      structureMatchStatus: 'verified',
      warnings,
      developerLogs: [
        ...developerLogs,
        'candidate allowed: canonical SMILES verified without formula.',
      ],
    };
  }

  return {
    canLoad3D: true,
    structureMatchStatus: 'verified',
    warnings,
    developerLogs: [
      ...developerLogs,
      'candidate allowed: verified.',
    ],
  };
}

/**
 * Re-checks string-mismatched PubChem candidate metadata with the same RDKit
 * validation path used for the current drawing.
 *
 * The legacy synchronous evaluator remains the fast path and keeps its public
 * contract. Only representation-level structure mismatches are retried here;
 * missing evidence, formula conflicts, and stereochemistry conflicts remain
 * fail-closed.
 */
export async function evaluatePubChemCandidateWithRdkitForCurrentStructure(
  candidate: PubChemCandidate,
  validationResult: MoleculeValidationResult | null,
): Promise<ReturnType<typeof evaluatePubChemCandidateForCurrentStructure>> {
  const preliminary = evaluatePubChemCandidateForCurrentStructure(
    candidate,
    validationResult,
  );

  if (preliminary.canLoad3D || validationResult?.ok !== true) {
    return preliminary;
  }

  const isRepresentationMismatch =
    preliminary.developerLogs.includes(
      'candidate blocked: canonical SMILES mismatch.',
    ) ||
    preliminary.developerLogs.includes(
      'candidate blocked: structure identifiers did not verify current structure.',
    );

  if (!isRepresentationMismatch) {
    return preliminary;
  }

  const candidateStructureSmiles =
    candidate.isomericSmiles?.trim() || candidate.canonicalSmiles?.trim();

  if (!candidateStructureSmiles) {
    return preliminary;
  }

  const candidateValidation = await validateMoleculeInput({
    source: 'import',
    validationStatus: 'unvalidated',
    smiles: candidateStructureSmiles,
    structureIntent: 'single-molecule',
  });

  if (!candidateValidation.ok) {
    return {
      ...preliminary,
      studentMessage:
        '선택한 외부 3D 자료 후보의 구조 식별값을 확인하지 못해 불러오기를 중단했습니다.',
      warnings: [
        '외부 자료 후보의 구조 문자열이 RDKit.js 구조 검증을 통과하지 못했습니다.',
      ],
      developerLogs: [
        ...preliminary.developerLogs,
        ...candidateValidation.developerLogs,
        'candidate blocked: candidate SMILES failed shared RDKit validation.',
      ],
    };
  }

  if (candidateValidation.canonicalSmiles !== validationResult.canonicalSmiles) {
    return {
      ...preliminary,
      developerLogs: [
        ...preliminary.developerLogs,
        ...candidateValidation.developerLogs,
        `RDKit-normalized candidate canonicalSmiles: ${candidateValidation.canonicalSmiles}`,
        'candidate blocked: RDKit-normalized canonical SMILES mismatch.',
      ],
    };
  }

  return {
    canLoad3D: true,
    structureMatchStatus: 'verified',
    warnings: [
      '외부 자료의 구조 표기는 달랐지만 RDKit.js로 정규화한 연결 구조가 현재 구조와 일치합니다.',
    ],
    developerLogs: [
      ...candidateValidation.developerLogs,
      `candidate CID: ${candidate.cid}`,
      `RDKit current canonicalSmiles: ${validationResult.canonicalSmiles}`,
      `RDKit-normalized candidate canonicalSmiles: ${candidateValidation.canonicalSmiles}`,
      'candidate allowed: shared RDKit normalization verified the structure.',
    ],
  };
}

export async function searchPubChemCandidatesByCanonicalSmiles(
  canonicalSmiles: string,
  fetchImpl: typeof fetch = fetch,
  requestOptions: PubChemRequestOptions = {},
): Promise<PubChemCandidateSearchResult> {
  const trimmedCanonicalSmiles = canonicalSmiles.trim();

  if (!trimmedCanonicalSmiles) {
    return {
      ok: false,
      status: 'error',
      candidates: [],
      studentMessage: STUDENT_SEARCH_FAILURE_MESSAGE,
      warnings: [],
      developerLogs: [
        'PubChem candidate search failed before request: empty canonicalSmiles.',
      ],
    };
  }

  const timeoutMs =
    requestOptions.timeoutMs ?? DEFAULT_PUBCHEM_TIMEOUT_MS;
  const abortController = new AbortController();
  let didTimeout = false;
  const timeoutId = setTimeout(() => {
    didTimeout = true;
    abortController.abort();
  }, timeoutMs);

  try {
    const body = new URLSearchParams({ smiles: trimmedCanonicalSmiles }).toString();
    const response = await fetchImpl(PUBCHEM_PROPERTY_ENDPOINT, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
      signal: abortController.signal,
    });
    const responseText = await response.text();

    if (!response.ok) {
      if (response.status === 404) {
        return {
          ok: true,
          status: 'no_match',
          candidates: [],
          studentMessage: buildStudentMessage('no_match'),
          warnings: [],
          developerLogs: [
            'PubChem candidate search returned no match.',
            `canonicalSmiles: ${trimmedCanonicalSmiles}`,
            'endpoint type: compound/smiles/property',
            `HTTP status: ${response.status} ${response.statusText}`.trim(),
            `response text: ${excerptResponseText(responseText)}`,
            'candidate CIDs: none',
          ],
        };
      }

      return {
        ok: false,
        status: 'error',
        candidates: [],
        studentMessage: STUDENT_SEARCH_FAILURE_MESSAGE,
        warnings: [],
        developerLogs: [
          'PubChem candidate search failed.',
          `canonicalSmiles: ${trimmedCanonicalSmiles}`,
          'endpoint type: compound/smiles/property',
          `HTTP status: ${response.status} ${response.statusText}`.trim(),
          `response text: ${excerptResponseText(responseText)}`,
        ],
      };
    }

    const parsedResponse = parsePubChemPropertyResponse(responseText);
    const candidates =
      parsedResponse.PropertyTable?.Properties?.map(mapPubChemCandidate).filter(
        (candidate): candidate is PubChemCandidate => candidate !== null,
      ) ?? [];
    const status = buildStatus(candidates.length);

    return {
      ok: true,
      status,
      candidates,
      studentMessage: buildStudentMessage(status),
      warnings:
        candidates.length > 0
          ? ['외부 데이터 후보이므로 수업용 시각화 자료로만 사용하세요.']
          : [],
      developerLogs: [
        'PubChem candidate search succeeded.',
        `canonicalSmiles: ${trimmedCanonicalSmiles}`,
        'endpoint type: compound/smiles/property',
        `candidate CIDs: ${
          candidates.length > 0
            ? candidates.map((candidate) => candidate.cid).join(', ')
            : 'none'
        }`,
      ],
    };
  } catch (error) {
    const wasAborted =
      didTimeout ||
      (error instanceof Error && error.name === 'AbortError');

    return {
      ok: false,
      status: 'error',
      candidates: [],
      studentMessage: STUDENT_SEARCH_FAILURE_MESSAGE,
      warnings: [],
      developerLogs: [
        'PubChem candidate search failed.',
        `canonicalSmiles: ${trimmedCanonicalSmiles}`,
        'endpoint type: compound/smiles/property',
        ...(wasAborted
          ? [
              didTimeout
                ? `request timeout: aborted after ${timeoutMs} ms.`
                : 'request aborted before completion.',
            ]
          : []),
        `error message: ${
          error instanceof Error ? error.message : 'Unknown PubChem search error'
        }`,
      ],
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
