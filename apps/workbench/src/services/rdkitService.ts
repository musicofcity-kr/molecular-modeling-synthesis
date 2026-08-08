import type { JSMol, RDKitLoader, RDKitModule } from '@rdkit/rdkit';
import type {
  ConnectivityDecision,
  MoleculeGraphSummary,
  MoleculeInput,
  MoleculeValidationResult,
  MoleculeValidationSource,
  StructureIntent,
} from '../types/molecule';
import { parseStrictV2000Layout } from '../chemistry/v2000MolBlock';
import {
  evaluateConnectivity,
  summarizeRDKitGraphJson,
} from '../chemistry/molecularGraphConnectivity';
import { formulaFromRDKitJson } from './molecularFormula';

export const STUDENT_VALIDATION_FAILURE_MESSAGE =
  '현재 구조는 계산에 사용할 수 있는 분자 구조로 확인되지 않았습니다. 원자 표기, 결합 수, 전하를 고친 뒤 다시 2D 구조 분석하기를 눌러 주세요.';
export const STUDENT_STRUCTURE_MISMATCH_MESSAGE =
  '편집기에서 가져온 두 구조 데이터가 서로 일치하지 않아 구조 검토가 필요합니다. 구조를 다시 불러오거나 다시 그린 뒤 확인해 주세요.';
const STUDENT_UNSUPPORTED_ISOTOPE_OR_RADICAL_MESSAGE =
  '동위원소 또는 라디칼 표기가 있는 구조는 현재 교육용 계산 범위에서 지원하지 않습니다. 표기를 임의로 지우지 말고 교사와 함께 검토해 주세요.';
const STUDENT_NONZERO_NET_CHARGE_MESSAGE =
  '전체 형식전하가 0이 아닌 이온 구조는 현재 교육용 계산 범위에서 지원하지 않습니다. 전하를 임의로 지우지 말고 교사와 함께 검토해 주세요.';
const STUDENT_NEUTRAL_CHARGE_SEPARATION_WARNING =
  '전하 분리 표기가 있지만 전체 형식전하가 0인 중성 구조입니다. 계산값은 RDKit.js가 확인한 구조에서 얻었으며, 공명 표현은 교사와 함께 검토해 주세요.';
const STUDENT_UNSUPPORTED_QUERY_MESSAGE =
  '질의 또는 모호한 구조 표기가 있어 계산을 중단했습니다. 원자와 결합을 하나의 명확한 분자 구조로 다시 지정해 주세요.';
const STUDENT_DISCONNECTED_FRAGMENT_MESSAGE =
  '현재 구조가 여러 조각으로 나뉘어 있습니다. 하나의 분자를 만들려면 원자 사이를 결합으로 연결해 주세요.';
const STUDENT_UNSUPPORTED_MOL_FORMAT_MESSAGE =
  'MOL 구조 데이터가 표준 V2000 형식으로 확인되지 않아 계산을 중단했습니다. 구조를 다시 불러오거나 다시 그린 뒤 확인해 주세요.';
const STUDENT_IONIC_CALCULATION_UNSUPPORTED_MESSAGE =
  '여러 이온 조각으로 이루어진 표현은 확인했지만, 현재 버전은 이를 하나의 분자식과 분자량으로 계산하지 않습니다. 이온 화합물 활동은 교사와 함께 검토해 주세요.';
const STUDENT_MIXTURE_CALCULATION_UNSUPPORTED_MESSAGE =
  '여러 성분으로 이루어진 혼합물 표현은 확인했지만, 현재 버전은 이를 하나의 분자식과 분자량으로 계산하지 않습니다. 성분별 구조를 나누어 검토해 주세요.';

type DescriptorResult = {
  amw?: number;
  exactmw?: number;
};

type RDKitJsonAtom = {
  chg?: number;
  isotope?: number;
  nRad?: number;
};

type RDKitJsonPayload = {
  defaults?: {
    atom?: RDKitJsonAtom;
  };
  molecules?: Array<{
    atoms?: RDKitJsonAtom[];
  }>;
};

type AtomAnnotationAssessment =
  | {
      ok: true;
      warnings: string[];
      developerLogs: string[];
    }
  | {
      ok: false;
      developerReason: string;
      studentMessage: string;
    };

type JSMolWithRemoveHsOptions = {
  remove_hs(detailsJson: string): string;
};

const V2000_QUERY_PROPERTY_TAGS = new Set(['SUB', 'UNS', 'RBC']);
const CONSERVATIVE_REMOVE_HS_OPTIONS = JSON.stringify({
  removeDegreeZero: false,
  removeHigherDegrees: false,
  removeOnlyHNeighbors: false,
  removeIsotopes: false,
  removeAndTrackIsotopes: false,
  removeDummyNeighbors: false,
  removeDefiningBondStereo: false,
  removeWithWedgedBond: false,
  removeWithQuery: false,
  removeMapped: false,
  removeInSGroups: false,
  showWarnings: true,
  removeNonimplicit: true,
  updateExplicitCount: false,
  removeHydrides: false,
  removeNontetrahedralNeighbors: false,
  sanitize: true,
});
const PRESERVE_HYDROGENS_WHEN_REPARSING = JSON.stringify({
  removeHs: false,
});

let rdkitModulePromise: Promise<RDKitModule> | null = null;
let rdkitInitializationCount = 0;
let browserScriptPromise: Promise<void> | null = null;

function locateRDKitWasm(): string {
  if (typeof window === 'undefined') {
    return 'node_modules/@rdkit/rdkit/dist/RDKit_minimal.wasm';
  }

  return '/rdkit/RDKit_minimal.wasm';
}

async function getNodeRDKitLoader(): Promise<RDKitLoader> {
  const packageName = '@rdkit/rdkit';
  const rdkitPackage = (await import(/* @vite-ignore */ packageName)) as unknown as
    | { default: RDKitLoader }
    | RDKitLoader;

  if (typeof rdkitPackage === 'function') {
    return rdkitPackage;
  }

  return rdkitPackage.default;
}

function loadBrowserRDKitScript(): Promise<void> {
  const browserWindow = window as unknown as { initRDKitModule?: RDKitLoader };

  if (browserWindow.initRDKitModule) {
    return Promise.resolve();
  }

  if (!browserScriptPromise) {
    browserScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/rdkit/RDKit_minimal.js';
      script.async = true;
      script.onload = () => {
        resolve();
      };
      script.onerror = () => {
        browserScriptPromise = null;
        reject(new Error('RDKit.js script asset failed to load.'));
      };
      document.head.appendChild(script);
    });
  }

  return browserScriptPromise;
}

async function getRDKitLoader(): Promise<RDKitLoader> {
  if (typeof window === 'undefined') {
    return getNodeRDKitLoader();
  }

  await loadBrowserRDKitScript();
  const browserWindow = window as unknown as { initRDKitModule?: RDKitLoader };

  if (!browserWindow.initRDKitModule) {
    throw new Error('RDKit.js loader was not initialized on window.');
  }

  return browserWindow.initRDKitModule;
}

export function initializeRDKit(): Promise<RDKitModule> {
  if (!rdkitModulePromise) {
    rdkitInitializationCount += 1;
    rdkitModulePromise = getRDKitLoader()
      .then((initRDKitModule) =>
        initRDKitModule({
          locateFile: locateRDKitWasm,
        }),
      )
      .catch((error: unknown) => {
        rdkitModulePromise = null;
        throw error;
      });
  }

  return rdkitModulePromise;
}

function selectValidationInput(input: MoleculeInput): {
  source?: MoleculeValidationSource;
  value?: string;
} {
  if (input.molBlock?.trim()) {
    return { source: 'mol-block', value: input.molBlock };
  }

  if (input.smiles?.trim()) {
    return { source: 'smiles', value: input.smiles };
  }

  return {};
}

function getHydrogenNormalizedCanonicalSmiles(
  rdkit: RDKitModule,
  molecule: JSMol,
  sourceLabel: string,
): string {
  let hydrogenNormalizedMolecule: JSMol | null = null;

  try {
    const hydrogenNormalizedMolBlock = (
      molecule as unknown as JSMolWithRemoveHsOptions
    ).remove_hs(CONSERVATIVE_REMOVE_HS_OPTIONS);
    hydrogenNormalizedMolecule = rdkit.get_mol(
      hydrogenNormalizedMolBlock,
      PRESERVE_HYDROGENS_WHEN_REPARSING,
    );

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
      throw new Error(
        `${sourceLabel} produced an empty RDKit canonical SMILES after removing explicit hydrogens.`,
      );
    }

    return canonicalSmiles;
  } finally {
    hydrogenNormalizedMolecule?.delete();
  }
}

function parseDescriptors(value: string): DescriptorResult {
  return JSON.parse(value) as DescriptorResult;
}

function findUnsupportedV2000QueryFeature(
  molBlock: string | undefined,
): {
  developerReason: string;
  studentMessage: string;
} | null {
  if (!molBlock?.trim()) {
    return null;
  }

  const layout = parseStrictV2000Layout(molBlock);

  if (!layout) {
    return {
      developerReason:
        'invalid or non-standard V2000 counts line at the required fourth line',
      studentMessage: STUDENT_UNSUPPORTED_MOL_FORMAT_MESSAGE,
    };
  }

  const { lines, countsLineIndex, atomCount, bondCount } = layout;

  const queryAtomSymbols = new Set(['*', 'A', 'Q', 'L', 'LP', 'R', 'R#']);
  const atomLines = lines.slice(
    countsLineIndex + 1,
    countsLineIndex + 1 + atomCount,
  );

  for (const atomLine of atomLines) {
    const symbol = atomLine.trim().split(/\s+/)[3];

    if (symbol && queryAtomSymbols.has(symbol)) {
      return {
        developerReason: `V2000 query atom symbol ${symbol}`,
        studentMessage: STUDENT_UNSUPPORTED_QUERY_MESSAGE,
      };
    }
  }

  const bondLines = lines.slice(
    countsLineIndex + 1 + atomCount,
    countsLineIndex + 1 + atomCount + bondCount,
  );

  for (const bondLine of bondLines) {
    const rawType = Number.parseInt(
      bondLine.trim().split(/\s+/)[2] ?? '',
      10,
    );

    if (rawType >= 5 && rawType <= 8) {
      return {
        developerReason: `V2000 query bond type ${rawType}`,
        studentMessage: STUDENT_UNSUPPORTED_QUERY_MESSAGE,
      };
    }
  }

  const propertyLines = lines.slice(
    countsLineIndex + 1 + atomCount + bondCount,
  );

  for (const propertyLine of propertyLines) {
    const [recordType, propertyTag] = propertyLine.trim().split(/\s+/);

    if (
      recordType === 'M' &&
      propertyTag &&
      V2000_QUERY_PROPERTY_TAGS.has(propertyTag)
    ) {
      return {
        developerReason: `V2000 query property M ${propertyTag}`,
        studentMessage: STUDENT_UNSUPPORTED_QUERY_MESSAGE,
      };
    }
  }

  return null;
}

function assessAtomAnnotations(rdkitJson: string): AtomAnnotationAssessment {
  const parsed = JSON.parse(rdkitJson) as RDKitJsonPayload;
  const atoms = parsed.molecules?.[0]?.atoms ?? [];
  const defaultAtom = parsed.defaults?.atom ?? {};
  let netFormalCharge = 0;
  let chargedAtomCount = 0;

  for (const [index, atom] of atoms.entries()) {
    const formalCharge = atom.chg ?? defaultAtom.chg ?? 0;
    const isotope = atom.isotope ?? defaultAtom.isotope ?? 0;
    const radicalElectronCount = atom.nRad ?? defaultAtom.nRad ?? 0;

    if (formalCharge !== 0) {
      netFormalCharge += formalCharge;
      chargedAtomCount += 1;
    }

    if (isotope !== 0 || radicalElectronCount !== 0) {
      const annotations = [
        ...(isotope !== 0 ? [`isotope=${isotope}`] : []),
        ...(radicalElectronCount !== 0
          ? [`nRad=${radicalElectronCount}`]
          : []),
      ];

      return {
        ok: false,
        developerReason: `unsupported atom annotation at atom ${
          index + 1
        }: ${annotations.join(', ')}`,
        studentMessage: STUDENT_UNSUPPORTED_ISOTOPE_OR_RADICAL_MESSAGE,
      };
    }
  }

  if (netFormalCharge !== 0) {
    return {
      ok: false,
      developerReason: `unsupported atom annotation: net formal charge ${netFormalCharge}`,
      studentMessage: STUDENT_NONZERO_NET_CHARGE_MESSAGE,
    };
  }

  if (chargedAtomCount > 0) {
    return {
      ok: true,
      warnings: [STUDENT_NEUTRAL_CHARGE_SEPARATION_WARNING],
      developerLogs: [
        `RDKit accepted a neutral charge-separated structure with ${chargedAtomCount} charged atoms and net formal charge 0.`,
      ],
    };
  }

  return {
    ok: true,
    warnings: [],
    developerLogs: [],
  };
}

function buildFailure(
  developerLog: string,
  source?: MoleculeValidationSource,
  validationStatus: 'invalid' | 'error' = 'invalid',
  studentMessage = STUDENT_VALIDATION_FAILURE_MESSAGE,
  graphContext: {
    structureIntent?: StructureIntent;
    graphSummary?: MoleculeGraphSummary;
    connectivityDecision?: ConnectivityDecision;
  } = {},
): MoleculeValidationResult {
  return {
    ok: false,
    validationStatus,
    source,
    studentMessage,
    warnings: [],
    errors: [studentMessage],
    developerLogs: [developerLog],
    ...graphContext,
  };
}

export async function validateMoleculeInput(
  input: MoleculeInput,
): Promise<MoleculeValidationResult> {
  const selectedInput = selectValidationInput(input);
  const structureIntent = input.structureIntent ?? 'single-molecule';

  if (!selectedInput.value || !selectedInput.source) {
    const graphSummary: MoleculeGraphSummary = {
      atomCount: 0,
      bondCount: 0,
      componentCount: 0,
      componentAtomCounts: [],
      isSingleComponent: false,
      isolatedAtomCount: 0,
    };
    const connectivityDecision = evaluateConnectivity(
      graphSummary,
      structureIntent,
    );

    return buildFailure(
      'RDKit validation failed before parsing: empty molecule input.',
      undefined,
      'invalid',
      STUDENT_VALIDATION_FAILURE_MESSAGE,
      { structureIntent, graphSummary, connectivityDecision },
    );
  }

  const v2000PreflightIssue = findUnsupportedV2000QueryFeature(input.molBlock);

  if (v2000PreflightIssue) {
    return buildFailure(
      `RDKit validation blocked ${v2000PreflightIssue.developerReason}.`,
      selectedInput.source,
      'invalid',
      v2000PreflightIssue.studentMessage,
      { structureIntent },
    );
  }

  let mol: JSMol | null = null;
  let smilesMol: JSMol | null = null;
  let validationGraphContext: {
    structureIntent?: StructureIntent;
    graphSummary?: MoleculeGraphSummary;
    connectivityDecision?: ConnectivityDecision;
  } = { structureIntent };

  try {
    const rdkit = await initializeRDKit();
    mol = rdkit.get_mol(selectedInput.value);

    if (!mol || !mol.is_valid()) {
      return buildFailure(
        `RDKit could not parse ${selectedInput.source} input.`,
        selectedInput.source,
        'invalid',
        STUDENT_VALIDATION_FAILURE_MESSAGE,
        validationGraphContext,
      );
    }

    const rawCanonicalSmiles = mol.get_smiles();
    const rdkitJson = mol.get_json();
    const graphSummary = summarizeRDKitGraphJson(rdkitJson);
    const connectivityDecision = evaluateConnectivity(
      graphSummary,
      structureIntent,
    );
    validationGraphContext = {
      structureIntent,
      graphSummary,
      connectivityDecision,
    };
    const graphContext = validationGraphContext;

    if (rawCanonicalSmiles.includes('~') || rawCanonicalSmiles.includes('*')) {
      return buildFailure(
        `RDKit validation blocked unsupported canonical query feature: ${rawCanonicalSmiles}.`,
        selectedInput.source,
        'invalid',
        STUDENT_UNSUPPORTED_QUERY_MESSAGE,
        graphContext,
      );
    }

    let canonicalSmiles = rawCanonicalSmiles;

    if (
      input.source === 'ketcher' &&
      input.molBlock?.trim() &&
      input.smiles?.trim()
    ) {
      smilesMol = rdkit.get_mol(input.smiles);

      if (!smilesMol || !smilesMol.is_valid()) {
        return buildFailure(
          'RDKit could not parse smiles input during Ketcher structure cross-check.',
          'smiles',
          'invalid',
          STUDENT_VALIDATION_FAILURE_MESSAGE,
          graphContext,
        );
      }

      const molBlockCanonicalSmiles = getHydrogenNormalizedCanonicalSmiles(
        rdkit,
        mol,
        'mol-block',
      );
      const rawSmilesCanonicalSmiles = smilesMol.get_smiles();
      const smilesAtomAnnotationAssessment = assessAtomAnnotations(
        smilesMol.get_json(),
      );

      if (!smilesAtomAnnotationAssessment.ok) {
        return buildFailure(
          `Ketcher smiles cross-check blocked ${smilesAtomAnnotationAssessment.developerReason}.`,
          'smiles',
          'invalid',
          smilesAtomAnnotationAssessment.studentMessage,
          graphContext,
        );
      }

      const smilesCanonicalSmiles = getHydrogenNormalizedCanonicalSmiles(
        rdkit,
        smilesMol,
        'smiles',
      );

      if (molBlockCanonicalSmiles !== smilesCanonicalSmiles) {
        return buildFailure(
          `Ketcher structure mismatch after explicit-hydrogen normalization: mol-block canonical SMILES ${molBlockCanonicalSmiles} (raw ${rawCanonicalSmiles}); smiles canonical SMILES ${smilesCanonicalSmiles} (raw ${rawSmilesCanonicalSmiles}).`,
          'mol-block',
          'invalid',
          STUDENT_STRUCTURE_MISMATCH_MESSAGE,
          graphContext,
        );
      }

      canonicalSmiles = molBlockCanonicalSmiles;
    }

    if (!connectivityDecision.allowed) {
      return buildFailure(
        `RDKit validation blocked disconnected molecular fragments: graph has ${graphSummary.componentCount} components for ${structureIntent} intent.`,
        selectedInput.source,
        'invalid',
        STUDENT_DISCONNECTED_FRAGMENT_MESSAGE,
        graphContext,
      );
    }

    if (
      connectivityDecision.status === 'multiple-components-allowed'
    ) {
      const studentMessage =
        structureIntent === 'ionic-compound'
          ? STUDENT_IONIC_CALCULATION_UNSUPPORTED_MESSAGE
          : STUDENT_MIXTURE_CALCULATION_UNSUPPORTED_MESSAGE;

      return buildFailure(
        `RDKit graph connectivity allowed ${graphSummary.componentCount} components for ${structureIntent} intent, but combined formula and molecular-weight output is outside the current education scope.`,
        selectedInput.source,
        'invalid',
        studentMessage,
        graphContext,
      );
    }

    const atomAnnotationAssessment = assessAtomAnnotations(rdkitJson);

    if (!atomAnnotationAssessment.ok) {
      return buildFailure(
        `RDKit validation blocked ${atomAnnotationAssessment.developerReason}.`,
        selectedInput.source,
        'invalid',
        atomAnnotationAssessment.studentMessage,
        graphContext,
      );
    }

    const descriptors = parseDescriptors(mol.get_descriptors());
    const molecularWeight = descriptors.amw;

    if (typeof molecularWeight !== 'number' || Number.isNaN(molecularWeight)) {
      return buildFailure(
        'RDKit descriptors did not include average molecular weight.',
        selectedInput.source,
        'error',
        STUDENT_VALIDATION_FAILURE_MESSAGE,
        graphContext,
      );
    }

    const molecularFormula = formulaFromRDKitJson(rdkitJson);

    return {
      ok: true,
      validationStatus: 'valid',
      source: selectedInput.source,
      smiles: input.smiles,
      molBlock: input.molBlock,
      canonicalSmiles,
      molecularFormula,
      molecularWeight,
      structureIntent,
      graphSummary,
      connectivityDecision,
      warnings: atomAnnotationAssessment.warnings,
      errors: [],
      developerLogs: [
        `RDKit ${rdkit.version()} validated ${selectedInput.source} input.`,
        ...(input.source === 'ketcher' &&
        input.molBlock?.trim() &&
        input.smiles?.trim()
          ? [
              `Ketcher MOL/SMILES cross-check passed with explicit-hydrogen-normalized canonical SMILES ${canonicalSmiles}.`,
            ]
          : []),
        ...atomAnnotationAssessment.developerLogs,
      ],
    };
  } catch (error) {
    const developerLog =
      error instanceof Error ? error.message : 'Unknown RDKit validation error.';

    return buildFailure(
      developerLog,
      selectedInput.source,
      'error',
      STUDENT_VALIDATION_FAILURE_MESSAGE,
      validationGraphContext,
    );
  } finally {
    smilesMol?.delete();
    mol?.delete();
  }
}

export function getRDKitInitializationCountForTests(): number {
  return rdkitInitializationCount;
}

export function resetRDKitForTests(): void {
  rdkitModulePromise = null;
  rdkitInitializationCount = 0;
  browserScriptPromise = null;
}
