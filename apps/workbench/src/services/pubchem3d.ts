import type { RDKitModule } from '@rdkit/rdkit';
import type {
  Molecule3DInput,
  Molecule3DStructureMatchStatus,
} from '../types/molecule';
import { initializeRDKit, validateMoleculeInput } from './rdkitService';

export type PubChem3DLoadStatus = 'idle' | 'loading' | 'success' | 'noData' | 'error';

export type PubChem3DLookupInput = {
  cid: number;
  label: string;
  pubchemName?: string;
  structureMatchStatus?: Molecule3DStructureMatchStatus;
  expectedCanonicalSmiles: string;
};

export type PubChem3DLookupResult =
  | {
      ok: true;
      status: 'success';
      molecule3D: Molecule3DInput;
      studentMessage: string;
      warnings: string[];
      developerLogs: string[];
    }
  | {
      ok: false;
      status: 'noData' | 'error';
      studentMessage: string;
      warnings: string[];
      developerLogs: string[];
    };

const PUBCHEM_3D_FAILURE_MESSAGE =
  '외부 3D 구조 데이터를 불러오지 못했습니다. 2D 구조 검증 결과는 계속 확인할 수 있습니다.';

const PUBCHEM_3D_NO_DATA_MESSAGE =
  'PubChem에 후보는 있지만 3D 좌표 데이터가 제공되지 않을 수 있습니다. 2D 구조와 분자식 검증 결과는 계속 사용할 수 있습니다.';

const PUBCHEM_3D_SOURCE_NOTE =
  'PubChem PUG-REST에서 CID 기반으로 가져온 계산 3D conformer SDF 좌표입니다. 현재 좌표에서 거리와 각도를 계산할 수 있지만, 실험값·문헌 기준값·이 앱의 최적화 결과로 해석하지 않습니다. 분자식과 몰 질량의 근거는 아닙니다.';

const PUBCHEM_3D_STRUCTURE_MISMATCH_MESSAGE =
  '외부 3D 구조가 현재 확인한 2D 구조와 일치하지 않아 불러오기를 중단했습니다. 현재 구조를 다시 확인해 주세요.';

const PUBCHEM_3D_STRUCTURE_VALIDATION_FAILURE_MESSAGE =
  '외부 3D 구조가 구조 검증을 통과하지 못해 불러오기를 중단했습니다. 2D 구조 검증 결과는 계속 확인할 수 있습니다.';

const RESPONSE_TEXT_LIMIT = 500;
const DEFAULT_PUBCHEM_TIMEOUT_MS = 15_000;

type PubChemRequestOptions = {
  timeoutMs?: number;
};

function buildPubChem3DSdfUrl(cid: number): string {
  return `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/record/SDF?record_type=3d`;
}

function excerptResponseText(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, RESPONSE_TEXT_LIMIT);
}

function hasSdfMolBlock(value: string): boolean {
  return value.includes('M  END');
}

function validateCid(cid: number): string | null {
  if (!Number.isInteger(cid) || cid <= 0) {
    return `Invalid PubChem CID: ${cid}`;
  }

  return null;
}

function getHydrogenNormalizedCanonicalSmiles(
  rdkit: RDKitModule,
  structure: string,
  sourceLabel: string,
): string {
  let molecule: ReturnType<RDKitModule['get_mol']> = null;
  let hydrogenNormalizedMolecule: ReturnType<RDKitModule['get_mol']> = null;

  try {
    molecule = rdkit.get_mol(structure);

    if (!molecule || !molecule.is_valid()) {
      throw new Error(`${sourceLabel} could not be parsed by RDKit.`);
    }

    const hydrogenNormalizedMolBlock = molecule.remove_hs();
    hydrogenNormalizedMolecule = rdkit.get_mol(hydrogenNormalizedMolBlock);

    if (
      !hydrogenNormalizedMolecule ||
      !hydrogenNormalizedMolecule.is_valid()
    ) {
      throw new Error(
        `${sourceLabel} could not be normalized by RDKit after removing explicit hydrogens.`,
      );
    }

    const canonicalSmiles = hydrogenNormalizedMolecule.get_smiles().trim();

    if (!canonicalSmiles) {
      throw new Error(`${sourceLabel} produced an empty RDKit canonical SMILES.`);
    }

    return canonicalSmiles;
  } finally {
    hydrogenNormalizedMolecule?.delete();
    molecule?.delete();
  }
}

async function verifySdfMatchesExpectedCanonicalStructure(
  sdf: string,
  expectedCanonicalSmiles: string,
): Promise<
  | {
      ok: true;
      expectedCanonicalSmiles: string;
      sdfCanonicalSmiles: string;
    }
  | {
      ok: false;
      expectedCanonicalSmiles?: string;
      sdfCanonicalSmiles?: string;
      developerMessage: string;
    }
> {
  const trimmedExpectedCanonicalSmiles = expectedCanonicalSmiles.trim();

  if (!trimmedExpectedCanonicalSmiles) {
    return {
      ok: false,
      developerMessage:
        'current RDKit canonical SMILES was missing before SDF verification.',
    };
  }

  try {
    const sdfValidation = await validateMoleculeInput({
      source: 'import',
      validationStatus: 'unvalidated',
      molBlock: sdf,
    });

    if (!sdfValidation.ok) {
      return {
        ok: false,
        developerMessage: [
          'PubChem 3D SDF failed the shared RDKit validation gate.',
          ...sdfValidation.developerLogs,
        ].join(' '),
      };
    }

    const rdkit = await initializeRDKit();
    const normalizedExpectedCanonicalSmiles =
      getHydrogenNormalizedCanonicalSmiles(
        rdkit,
        trimmedExpectedCanonicalSmiles,
        'current RDKit canonical structure',
      );
    const sdfCanonicalSmiles = getHydrogenNormalizedCanonicalSmiles(
      rdkit,
      sdf,
      'PubChem 3D SDF',
    );

    if (sdfCanonicalSmiles !== normalizedExpectedCanonicalSmiles) {
      return {
        ok: false,
        expectedCanonicalSmiles: normalizedExpectedCanonicalSmiles,
        sdfCanonicalSmiles,
        developerMessage:
          'PubChem 3D SDF structure verification failed: canonical mismatch.',
      };
    }

    return {
      ok: true,
      expectedCanonicalSmiles: normalizedExpectedCanonicalSmiles,
      sdfCanonicalSmiles,
    };
  } catch (error) {
    return {
      ok: false,
      developerMessage:
        error instanceof Error
          ? error.message
          : 'Unknown RDKit SDF structure verification error.',
    };
  }
}

export async function fetchPubChem3DSdf(
  input: PubChem3DLookupInput,
  fetchImpl: typeof fetch = fetch,
  requestOptions: PubChemRequestOptions = {},
): Promise<PubChem3DLookupResult> {
  const invalidCidReason = validateCid(input.cid);

  if (invalidCidReason) {
    return {
      ok: false,
      status: 'error',
      studentMessage: PUBCHEM_3D_FAILURE_MESSAGE,
      warnings: [],
      developerLogs: [
        'PubChem 3D SDF fetch failed.',
        `CID: ${input.cid}`,
        invalidCidReason,
      ],
    };
  }

  if (!input.expectedCanonicalSmiles.trim()) {
    return {
      ok: false,
      status: 'error',
      studentMessage: PUBCHEM_3D_STRUCTURE_VALIDATION_FAILURE_MESSAGE,
      warnings: [
        '현재 RDKit.js 검증 구조의 식별값이 없어 외부 3D 자료를 요청하지 않았습니다.',
      ],
      developerLogs: [
        'PubChem 3D SDF fetch failed.',
        `CID: ${input.cid}`,
        'current RDKit canonical SMILES was missing before PubChem request.',
      ],
    };
  }

  const url = buildPubChem3DSdfUrl(input.cid);
  const timeoutMs =
    requestOptions.timeoutMs ?? DEFAULT_PUBCHEM_TIMEOUT_MS;
  const abortController = new AbortController();
  let didTimeout = false;
  const timeoutId = setTimeout(() => {
    didTimeout = true;
    abortController.abort();
  }, timeoutMs);

  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: {
        Accept: 'chemical/x-mdl-sdfile, text/plain;q=0.9, */*;q=0.8',
      },
      signal: abortController.signal,
    });
    const responseText = await response.text();

    if (!response.ok) {
      const status = response.status === 404 ? 'noData' : 'error';

      return {
        ok: false,
        status,
        studentMessage:
          status === 'noData' ? PUBCHEM_3D_NO_DATA_MESSAGE : PUBCHEM_3D_FAILURE_MESSAGE,
        warnings: [],
        developerLogs: [
          'PubChem 3D SDF fetch failed.',
          `CID: ${input.cid}`,
          `HTTP status: ${response.status} ${response.statusText}`.trim(),
          `response text: ${excerptResponseText(responseText)}`,
        ],
      };
    }

    if (!responseText.trim() || !hasSdfMolBlock(responseText)) {
      return {
        ok: false,
        status: 'noData',
        studentMessage: PUBCHEM_3D_NO_DATA_MESSAGE,
        warnings: [],
        developerLogs: [
          'PubChem 3D SDF fetch failed.',
          `CID: ${input.cid}`,
          'response did not contain an SDF mol block.',
          `response text: ${excerptResponseText(responseText)}`,
        ],
      };
    }

    const structureVerification =
      await verifySdfMatchesExpectedCanonicalStructure(
        responseText,
        input.expectedCanonicalSmiles,
      );

    if (!structureVerification.ok) {
      const isCanonicalMismatch =
        Boolean(structureVerification.expectedCanonicalSmiles) &&
        Boolean(structureVerification.sdfCanonicalSmiles);

      return {
        ok: false,
        status: 'error',
        studentMessage: isCanonicalMismatch
          ? PUBCHEM_3D_STRUCTURE_MISMATCH_MESSAGE
          : PUBCHEM_3D_STRUCTURE_VALIDATION_FAILURE_MESSAGE,
        warnings: [
          isCanonicalMismatch
            ? '외부 3D 자료의 구조 식별값이 현재 RDKit.js 검증 구조와 다릅니다.'
            : '외부 3D 자료를 RDKit.js로 구조 검증하지 못했습니다.',
        ],
        developerLogs: [
          'PubChem 3D SDF structure verification failed.',
          `CID: ${input.cid}`,
          structureVerification.developerMessage,
          ...(structureVerification.expectedCanonicalSmiles
            ? [
                `expected canonical SMILES: ${structureVerification.expectedCanonicalSmiles}`,
              ]
            : []),
          ...(structureVerification.sdfCanonicalSmiles
            ? [`SDF canonical SMILES: ${structureVerification.sdfCanonicalSmiles}`]
            : []),
        ],
      };
    }

    return {
      ok: true,
      status: 'success',
      molecule3D: {
        format: 'sdf',
        data: responseText,
        label: input.label,
        sourceType: 'pubchem',
        coordinateDimension: '3d',
        structureMatchStatus: 'verified',
        coordinateSource: `PubChem CID ${input.cid}`,
        sourceNote: input.pubchemName
          ? `${PUBCHEM_3D_SOURCE_NOTE} PubChem name: ${input.pubchemName}.`
          : PUBCHEM_3D_SOURCE_NOTE,
        sourceUrl: url,
      },
      studentMessage: `${input.label}의 PubChem 3D 구조 데이터를 불러왔습니다.`,
      warnings: [],
      developerLogs: [
        `PubChem 3D SDF fetch succeeded: CID ${input.cid}.`,
        `PubChem 3D SDF structure verified against RDKit canonical SMILES: ${structureVerification.sdfCanonicalSmiles}.`,
      ],
    };
  } catch (error) {
    const wasAborted =
      didTimeout ||
      (error instanceof Error && error.name === 'AbortError');

    return {
      ok: false,
      status: 'error',
      studentMessage: PUBCHEM_3D_FAILURE_MESSAGE,
      warnings: [],
      developerLogs: [
        'PubChem 3D SDF fetch failed.',
        `CID: ${input.cid}`,
        ...(wasAborted
          ? [
              didTimeout
                ? `request timeout: aborted after ${timeoutMs} ms.`
                : 'request aborted before completion.',
            ]
          : []),
        `fetch error message: ${
          error instanceof Error ? error.message : 'Unknown fetch error'
        }`,
      ],
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
