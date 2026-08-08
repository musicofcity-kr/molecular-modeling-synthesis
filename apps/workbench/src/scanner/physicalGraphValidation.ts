import type { JSMol } from '@rdkit/rdkit';
import { initializeRDKit, validateMoleculeInput } from '../services/rdkitService';
import type { SupportedElement } from './atomDetection';
import {
  createPhysicalGraph,
  decideGraphConnectivity,
  summarizePhysicalGraph,
  type MoleculeGraphSummary,
  type PhysicalGraph,
  type StructureIntent,
} from './bondGraph';

export interface ConfirmedPhysicalGraphInput {
  revisionId: string;
  sourceRevision: string;
  graph: PhysicalGraph;
}

export interface LimitedIdentityRecord {
  id: string;
  nameKo: string;
  molecularFormula: string;
  canonicalSmilesVariants: readonly string[];
}

export type LimitedIdentityResolution =
  | { status: 'exact'; candidates: [LimitedIdentityRecord] }
  | { status: 'unknown'; candidates: [] }
  | {
      status: 'multiple';
      candidates: [LimitedIdentityRecord, LimitedIdentityRecord, ...LimitedIdentityRecord[]];
    }
  | { status: 'not-evaluated'; candidates: [] };

export interface PhysicalGraphValidationIssue {
  code:
    | 'graph-contract-invalid'
    | 'connectivity-blocked'
    | 'invalid-valence'
    | 'implicit-hydrogen-drift'
    | 'rdkit-invalid'
    | 'graph-mismatch';
  atomIds: string[];
  message: string;
}

interface PhysicalGraphValidationBase {
  n5Ready: boolean;
  revisionId: string;
  sourceRevision: string;
  structureIntent: StructureIntent;
  graphSummary: MoleculeGraphSummary;
  connectivityStatus:
    | 'empty'
    | 'single-component'
    | 'multiple-components-allowed'
    | 'multiple-components-blocked';
  issues: PhysicalGraphValidationIssue[];
  warnings: string[];
  errors: string[];
  developerLogs: string[];
}

export type PhysicalGraphValidationResult =
  | (PhysicalGraphValidationBase & {
      ok: true;
      validationStatus: 'valid';
      source: 'physical-graph';
      canonicalSmiles: string;
      molecularFormula: string;
      molecularWeight: number;
      identity: Exclude<LimitedIdentityResolution, { status: 'not-evaluated' }>;
      validatedGraph: PhysicalGraph;
      validationRepresentation: {
        format: 'mol-v2000';
        coordinateMeaning: 'topology-only';
        molBlock: string;
      };
    })
  | (PhysicalGraphValidationBase & {
      ok: false;
      validationStatus: 'invalid' | 'error';
      identity: { status: 'not-evaluated'; candidates: [] };
    });

export const LIMITED_MVP_IDENTITIES: readonly LimitedIdentityRecord[] = [
  {
    id: 'hydrogen',
    nameKo: '수소 분자',
    molecularFormula: 'H2',
    canonicalSmilesVariants: ['[H][H]'],
  },
  {
    id: 'oxygen',
    nameKo: '산소 분자',
    molecularFormula: 'O2',
    canonicalSmilesVariants: ['O=O'],
  },
  {
    id: 'nitrogen',
    nameKo: '질소 분자',
    molecularFormula: 'N2',
    canonicalSmilesVariants: ['N#N'],
  },
  {
    id: 'methane',
    nameKo: '메테인',
    molecularFormula: 'CH4',
    canonicalSmilesVariants: ['C'],
  },
  {
    id: 'water',
    nameKo: '물',
    molecularFormula: 'H2O',
    canonicalSmilesVariants: ['O'],
  },
  {
    id: 'ammonia',
    nameKo: '암모니아',
    molecularFormula: 'H3N',
    canonicalSmilesVariants: ['N'],
  },
  {
    id: 'carbon-dioxide',
    nameKo: '이산화 탄소',
    molecularFormula: 'CO2',
    canonicalSmilesVariants: ['O=C=O'],
  },
  {
    id: 'ethane',
    nameKo: '에테인',
    molecularFormula: 'C2H6',
    canonicalSmilesVariants: ['CC'],
  },
  {
    id: 'ethene',
    nameKo: '에텐',
    molecularFormula: 'C2H4',
    canonicalSmilesVariants: ['C=C'],
  },
  {
    id: 'methanol',
    nameKo: '메탄올',
    molecularFormula: 'CH4O',
    canonicalSmilesVariants: ['CO'],
  },
] as const;

const EMPTY_SUMMARY: MoleculeGraphSummary = {
  atomCount: 0,
  bondCount: 0,
  componentCount: 0,
  componentAtomCounts: [],
  isSingleComponent: false,
  isolatedAtomCount: 0,
};

const MAX_DIAGNOSTIC_BOND_ORDER: Record<SupportedElement, number> = {
  H: 1,
  C: 4,
  N: 3,
  O: 2,
  F: 1,
  Cl: 1,
};

const ELEMENT_NAME_KO: Record<SupportedElement, string> = {
  H: '수소',
  C: '탄소',
  N: '질소',
  O: '산소',
  F: '플루오린',
  Cl: '염소',
};

function formatCoordinate(value: number): string {
  return value.toFixed(4).padStart(10, ' ');
}

function formatCount(value: number): string {
  if (!Number.isInteger(value) || value < 0 || value > 999) {
    throw new Error(`V2000 count is outside the supported range: ${value}`);
  }
  return String(value).padStart(3, ' ');
}

/**
 * Converts confirmed topology to a deterministic validation-only Molfile.
 * Its generated 2D coordinates are layout placeholders, never measurements.
 */
export function physicalGraphToV2000MolBlock(graph: PhysicalGraph): string {
  const confirmedGraph = createPhysicalGraph(graph.atoms, graph.bonds, graph.revision);
  const atomIndexById = new Map(
    confirmedGraph.atoms.map(({ id }, index) => [id, index + 1]),
  );
  const countsLine =
    `${formatCount(confirmedGraph.atoms.length)}${formatCount(confirmedGraph.bonds.length)}` +
    '  0  0  0  0  0  0  0  0999 V2000';
  const atomLines = confirmedGraph.atoms.map((atom, index) => {
    const layoutX = index % 8;
    const layoutY = Math.floor(index / 8);
    return (
      `${formatCoordinate(layoutX)}${formatCoordinate(layoutY)}${formatCoordinate(0)}` +
      ` ${atom.element.padEnd(3, ' ')} 0  0  0  0  0  0  0  0  0  0  0  0`
    );
  });
  const bondLines = confirmedGraph.bonds.map(({ atomIds, order }) => {
    const firstIndex = atomIndexById.get(atomIds[0]);
    const secondIndex = atomIndexById.get(atomIds[1]);
    if (firstIndex === undefined || secondIndex === undefined) {
      throw new Error(`Confirmed bond references an unknown atom: ${atomIds.join(', ')}`);
    }
    return `${formatCount(firstIndex)}${formatCount(secondIndex)}${formatCount(order)}  0  0  0  0`;
  });

  return [
    `Physical graph revision ${confirmedGraph.revision}`,
    '  MoleculeWorkbench',
    'topology-only coordinates; not physical measurements',
    countsLine,
    ...atomLines,
    ...bondLines,
    'M  END',
  ].join('\n');
}

export function resolveLimitedIdentity(
  canonicalSmiles: string,
  records: readonly LimitedIdentityRecord[] = LIMITED_MVP_IDENTITIES,
): Exclude<LimitedIdentityResolution, { status: 'not-evaluated' }> {
  const candidates = records.filter(
    (record) => record.canonicalSmilesVariants.includes(canonicalSmiles),
  );

  if (candidates.length === 0) return { status: 'unknown', candidates: [] };
  if (candidates.length === 1) {
    return { status: 'exact', candidates: [candidates[0]] };
  }
  return {
    status: 'multiple',
    candidates: candidates as [
      LimitedIdentityRecord,
      LimitedIdentityRecord,
      ...LimitedIdentityRecord[],
    ],
  };
}

interface OverbondedAtom {
  id: string;
  element: SupportedElement;
  bondOrderSum: number;
  conservativeLimit: number;
}

function findOverbondedAtoms(graph: PhysicalGraph): OverbondedAtom[] {
  const orderSums = new Map(graph.atoms.map(({ id }) => [id, 0]));
  for (const { atomIds, order } of graph.bonds) {
    orderSums.set(atomIds[0], (orderSums.get(atomIds[0]) ?? 0) + order);
    orderSums.set(atomIds[1], (orderSums.get(atomIds[1]) ?? 0) + order);
  }
  return graph.atoms.flatMap((atom) => {
    const bondOrderSum = orderSums.get(atom.id) ?? 0;
    const conservativeLimit = MAX_DIAGNOSTIC_BOND_ORDER[atom.element];
    return bondOrderSum > conservativeLimit
      ? [{ id: atom.id, element: atom.element, bondOrderSum, conservativeLimit }]
      : [];
  });
}

function countPhysicalElements(graph: PhysicalGraph): Map<string, number> {
  const counts = new Map<string, number>();
  for (const atom of graph.atoms) {
    counts.set(atom.element, (counts.get(atom.element) ?? 0) + 1);
  }
  return counts;
}

function parseRDKitFormulaCounts(formula: string): Map<string, number> | null {
  const counts = new Map<string, number>();
  const pattern = /([A-Z][a-z]?)(\d*)/g;
  let consumed = '';
  for (const match of formula.matchAll(pattern)) {
    const [token, symbol, countText] = match;
    consumed += token;
    counts.set(symbol, (counts.get(symbol) ?? 0) + (countText ? Number(countText) : 1));
  }
  return consumed === formula && counts.size > 0 ? counts : null;
}

function findCompositionMismatch(
  graph: PhysicalGraph,
  molecularFormula: string,
): { atomIds: string[]; implicitHydrogenDrift: boolean } | null {
  const physicalCounts = countPhysicalElements(graph);
  const formulaCounts = parseRDKitFormulaCounts(molecularFormula);
  if (!formulaCounts) {
    return {
      atomIds: graph.atoms.map(({ id }) => id),
      implicitHydrogenDrift: false,
    };
  }

  const symbols = new Set([...physicalCounts.keys(), ...formulaCounts.keys()]);
  const mismatchedSymbols = [...symbols].filter(
    (symbol) => (physicalCounts.get(symbol) ?? 0) !== (formulaCounts.get(symbol) ?? 0),
  );
  if (mismatchedSymbols.length === 0) return null;

  const implicitHydrogenDrift =
    mismatchedSymbols.length === 1 &&
    mismatchedSymbols[0] === 'H' &&
    (formulaCounts.get('H') ?? 0) > (physicalCounts.get('H') ?? 0);
  const directlyMismatchedAtomIds = graph.atoms
    .filter((atom) => mismatchedSymbols.includes(atom.element))
    .map(({ id }) => id);
  return {
    atomIds: directlyMismatchedAtomIds.length > 0
      ? directlyMismatchedAtomIds
      : graph.atoms.map(({ id }) => id),
    implicitHydrogenDrift,
  };
}

async function getHydrogenNormalizedCanonicalSmiles(molBlock: string): Promise<string> {
  const rdkit = await initializeRDKit();
  let explicitMolecule: JSMol | null = null;
  let normalizedMolecule: JSMol | null = null;
  try {
    explicitMolecule = rdkit.get_mol(molBlock);
    if (!explicitMolecule?.is_valid()) {
      throw new Error('RDKit could not recreate the validated explicit-atom MolBlock.');
    }
    normalizedMolecule = rdkit.get_mol(explicitMolecule.remove_hs());
    if (!normalizedMolecule?.is_valid()) {
      throw new Error('RDKit could not normalize explicit hydrogens for identity matching.');
    }
    const canonicalSmiles = normalizedMolecule.get_smiles().trim();
    if (!canonicalSmiles) {
      throw new Error('RDKit returned empty H-normalized canonical SMILES.');
    }
    return canonicalSmiles;
  } finally {
    normalizedMolecule?.delete();
    explicitMolecule?.delete();
  }
}

function graphCountsMatch(
  physical: MoleculeGraphSummary,
  rdkit: { atomCount: number; bondCount: number; componentCount: number },
): boolean {
  return (
    physical.atomCount === rdkit.atomCount &&
    physical.bondCount === rdkit.bondCount &&
    physical.componentCount === rdkit.componentCount
  );
}

export async function validateConfirmedPhysicalGraph(
  input: ConfirmedPhysicalGraphInput,
  structureIntent: StructureIntent = 'single-molecule',
): Promise<PhysicalGraphValidationResult> {
  let graph: PhysicalGraph;
  try {
    if (!input.revisionId.trim() || !input.sourceRevision.trim()) {
      throw new Error('Confirmed graph revision provenance is required.');
    }
    graph = createPhysicalGraph(
      input.graph.atoms,
      input.graph.bonds,
      input.graph.revision,
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown Physical graph contract error.';
    return {
      ok: false,
      n5Ready: false,
      validationStatus: 'invalid',
      revisionId: input.revisionId,
      sourceRevision: input.sourceRevision,
      structureIntent,
      graphSummary: EMPTY_SUMMARY,
      connectivityStatus: 'empty',
      identity: { status: 'not-evaluated', candidates: [] },
      issues: [{
        code: 'graph-contract-invalid',
        atomIds: [],
        message: '확정된 원자·결합 기록을 다시 확인해 주세요.',
      }],
      warnings: [],
      errors: ['확정된 원자·결합 기록을 다시 확인해 주세요.'],
      developerLogs: [`Physical graph contract blocked validation: ${detail}`],
    };
  }

  const graphSummary = summarizePhysicalGraph(graph);
  const connectivity = decideGraphConnectivity(graph, structureIntent);
  const base = {
    n5Ready: false,
    revisionId: input.revisionId,
    sourceRevision: input.sourceRevision,
    structureIntent,
    graphSummary,
    connectivityStatus: connectivity.status,
  } as const;

  if (!connectivity.ok) {
    const message = connectivity.errors[0] ?? '원자 사이의 연결을 다시 확인해 주세요.';
    return {
      ...base,
      ok: false,
      validationStatus: 'invalid',
      identity: { status: 'not-evaluated', candidates: [] },
      issues: [{ code: 'connectivity-blocked', atomIds: [], message }],
      warnings: connectivity.warnings,
      errors: [message],
      developerLogs: [
        `Connectivity-first gate blocked RDKit for revision ${input.revisionId}: ${connectivity.status}.`,
      ],
    };
  }

  const overbondedAtoms = findOverbondedAtoms(graph);
  if (overbondedAtoms.length > 0) {
    const atomIds = overbondedAtoms.map(({ id }) => id);
    const details = overbondedAtoms
      .map(({ element, id, bondOrderSum, conservativeLimit }) =>
        `${ELEMENT_NAME_KO[element]} ${element}(${id}) 결합차수 합 ${bondOrderSum}, 현재 중성 모형 점검 기준 ${conservativeLimit}`,
      )
      .join(' · ');
    const message =
      `결합차수 또는 원자가를 다시 확인해 주세요: ${details}. ` +
      '이 기준은 현재 지원하는 중성 모형의 보수적 사전 점검이며 보편적 원자가 법칙이 아닙니다.';
    return {
      ...base,
      ok: false,
      validationStatus: 'invalid',
      identity: { status: 'not-evaluated', candidates: [] },
      issues: [{ code: 'invalid-valence', atomIds, message }],
      warnings: [],
      errors: [message],
      developerLogs: [
        `Scanner neutral-MVP preflight blocked overbonded atom IDs: ${atomIds.join(', ')}.`,
      ],
    };
  }

  let molBlock: string;
  try {
    molBlock = physicalGraphToV2000MolBlock(graph);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown V2000 conversion error.';
    return {
      ...base,
      ok: false,
      validationStatus: 'error',
      identity: { status: 'not-evaluated', candidates: [] },
      issues: [{
        code: 'graph-contract-invalid',
        atomIds: [],
        message: '검증용 구조 데이터를 만들 수 없습니다. 원자와 결합을 다시 확인해 주세요.',
      }],
      warnings: [],
      errors: ['검증용 구조 데이터를 만들 수 없습니다. 원자와 결합을 다시 확인해 주세요.'],
      developerLogs: [`Physical graph V2000 conversion failed: ${detail}`],
    };
  }

  const rdkitResult = await validateMoleculeInput({
    source: 'import',
    validationStatus: 'unvalidated',
    structureIntent,
    molBlock,
  });

  if (!rdkitResult.ok) {
    const actionableMessage = rdkitResult.studentMessage;
    return {
      ...base,
      ok: false,
      validationStatus: rdkitResult.validationStatus,
      identity: { status: 'not-evaluated', candidates: [] },
      issues: [{
        code: 'rdkit-invalid',
        atomIds: [],
        message: actionableMessage,
      }],
      warnings: rdkitResult.warnings,
      errors: [actionableMessage],
      developerLogs: [
        `RDKit rejected Physical graph revision ${input.revisionId}.`,
        ...rdkitResult.developerLogs,
      ],
    };
  }

  if (
    !rdkitResult.graphSummary ||
    !graphCountsMatch(graphSummary, rdkitResult.graphSummary)
  ) {
    return {
      ...base,
      ok: false,
      validationStatus: 'error',
      identity: { status: 'not-evaluated', candidates: [] },
      issues: [{
        code: 'graph-mismatch',
        atomIds: [],
        message: '검증 전후의 원자·결합 수가 달라 결과를 사용할 수 없습니다.',
      }],
      warnings: rdkitResult.warnings,
      errors: ['검증 전후의 원자·결합 수가 달라 결과를 사용할 수 없습니다.'],
      developerLogs: [
        `Physical/RDKit graph mismatch for revision ${input.revisionId}: ` +
          `physical ${graphSummary.atomCount}/${graphSummary.bondCount}/${graphSummary.componentCount}; ` +
          `RDKit ${rdkitResult.graphSummary?.atomCount ?? 'missing'}/` +
          `${rdkitResult.graphSummary?.bondCount ?? 'missing'}/` +
          `${rdkitResult.graphSummary?.componentCount ?? 'missing'}.`,
      ],
    };
  }

  const compositionMismatch = findCompositionMismatch(
    graph,
    rdkitResult.molecularFormula,
  );
  if (compositionMismatch) {
    const message = compositionMismatch.implicitHydrogenDrift
      ? '현재 모형에서 확인하지 않은 수소가 계산에 추가될 수 있어 결과를 표시하지 않았습니다. 수소 원자와 결합을 다시 확인해 주세요.'
      : '계산된 분자식의 원소 수가 사진에서 확인한 원자 수와 다릅니다. 원자 종류와 개수를 다시 확인해 주세요.';
    return {
      ...base,
      ok: false,
      validationStatus: 'invalid',
      identity: { status: 'not-evaluated', candidates: [] },
      issues: [{
        code: compositionMismatch.implicitHydrogenDrift
          ? 'implicit-hydrogen-drift'
          : 'graph-mismatch',
        atomIds: compositionMismatch.atomIds,
        message,
      }],
      warnings: rdkitResult.warnings,
      errors: [message],
      developerLogs: [
        `Physical/RDKit elemental composition mismatch for revision ${input.revisionId}: ` +
          `RDKit formula ${rdkitResult.molecularFormula}.`,
      ],
    };
  }

  let canonicalSmiles: string;
  try {
    canonicalSmiles = graph.atoms.every(({ element }) => element === 'H')
      ? rdkitResult.canonicalSmiles
      : await getHydrogenNormalizedCanonicalSmiles(molBlock);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown RDKit H-normalization error.';
    return {
      ...base,
      ok: false,
      validationStatus: 'error',
      identity: { status: 'not-evaluated', candidates: [] },
      issues: [{
        code: 'rdkit-invalid',
        atomIds: [],
        message: '검증된 연결 구조의 수소 표기를 정규화하지 못해 결과를 표시하지 않습니다.',
      }],
      warnings: rdkitResult.warnings,
      errors: ['검증된 연결 구조의 수소 표기를 정규화하지 못해 결과를 표시하지 않습니다.'],
      developerLogs: [`RDKit H-normalization failed: ${detail}`],
    };
  }

  const identity = resolveLimitedIdentity(canonicalSmiles);
  return {
    ...base,
    ok: true,
    n5Ready: identity.status === 'exact',
    validationStatus: 'valid',
    source: 'physical-graph',
    canonicalSmiles,
    molecularFormula: rdkitResult.molecularFormula,
    molecularWeight: rdkitResult.molecularWeight,
    identity,
    validatedGraph: graph,
    validationRepresentation: {
      format: 'mol-v2000',
      coordinateMeaning: 'topology-only',
      molBlock,
    },
    issues: [],
    warnings: [...connectivity.warnings, ...rdkitResult.warnings],
    errors: [],
    developerLogs: [
      `Physical graph revision ${input.revisionId} converted to topology-only V2000.`,
      ...rdkitResult.developerLogs,
    ],
  };
}
