import {
  isBondedMeasurementSelection,
  parseAtomsFromMolecule3DInput,
  parseBondedAtomPairsFromMolecule3DInput,
} from '../services/geometryMeasurement';
import type { GeometryMeasurementResult, Molecule3DInput } from '../types/molecule';
import type { SupportedElement } from './atomDetection';
import {
  createPhysicalGraph,
  summarizePhysicalGraph,
  type BondOrder,
  type MoleculeGraphSummary,
  type PhysicalGraph,
} from './bondGraph';
import type {
  ConfirmedPhysicalGraphInput,
  PhysicalGraphValidationResult,
} from './physicalGraphValidation';

type ValidExactPhysicalGraphValidation = Extract<
  PhysicalGraphValidationResult,
  { ok: true }
>;

export interface CurrentScannerRevision {
  physicalGraphRevisionId: string;
  sourceAtomRevision: string;
}

export interface PhysicalPhotoSummaryInput {
  imageLabel: string;
  sourceAtomRevision: string;
}

/**
 * Structural domain counterpart of the parent-owned N5 snapshot. Keeping this
 * interface outside the React stage prevents a domain -> UI dependency.
 */
export interface ConfirmedScientificReferenceEvidence {
  revisionId: string;
  sourceValidationRevision: string;
  sourceAtomRevision: string;
  identityId: string;
  canonicalSmiles: string;
  sourceCategory: 'external-database';
  coordinateUse: 'coordinate-measurement-approved';
  structureMatchStatus: 'verified';
  molecule3D: Molecule3DInput;
  measurements: GeometryMeasurementResult[];
}

export interface StudentComparisonObservation {
  samePoint: string;
  differentPoint: string;
  revisedExplanation: string;
}

/** UI-facing name retained as an alias of the student-owned observation draft. */
export type PhysicalReferenceObservation = StudentComparisonObservation;

export interface PhysicalReferenceComparisonInput {
  currentRevision: CurrentScannerRevision;
  physical: ConfirmedPhysicalGraphInput;
  photo: PhysicalPhotoSummaryInput;
  validation: PhysicalGraphValidationResult | null | undefined;
  reference: ConfirmedScientificReferenceEvidence | null | undefined;
  observation: StudentComparisonObservation;
}

export type StudentObservationField = keyof StudentComparisonObservation;

export type PhysicalReferenceComparisonBlockReason =
  | 'missing-validation'
  | 'validation-not-valid'
  | 'validation-not-exact'
  | 'stale-physical'
  | 'stale-photo'
  | 'stale-validation'
  | 'physical-contract-invalid'
  | 'physical-validation-mismatch'
  | 'missing-reference'
  | 'stale-reference'
  | 'reference-identity-mismatch'
  | 'reference-contract-invalid'
  | 'reference-graph-mismatch'
  | 'reference-measurement-invalid';

export interface SanitizedReferenceMeasurement {
  type: GeometryMeasurementResult['type'];
  atomIndices: number[];
  atomLabels: string[];
  value: number;
  unit: GeometryMeasurementResult['unit'];
  sourceNote: string;
  evidenceType: 'reference-coordinate';
}

export interface PhysicalReferenceComparison {
  provenance: {
    physicalGraphRevisionId: string;
    sourceAtomRevision: string;
    validationRevisionId: string;
    referenceRevisionId: string;
    identityId: string;
    canonicalSmiles: string;
  };
  sharedVerifiedGraph: {
    verification: 'n4-validated-n5-exact-match';
    atomCount: number;
    bondCount: number;
    elementCounts: Readonly<Partial<Record<SupportedElement, number>>>;
    atoms: ReadonlyArray<{ id: string; element: SupportedElement }>;
    bonds: ReadonlyArray<{
      id: string;
      atomIds: readonly [string, string];
      order: BondOrder;
    }>;
  };
  physical: {
    source: 'physical-model-photo';
    imageLabel: string;
    sourceAtomRevision: string;
    graphRevision: number;
    graphSummary: MoleculeGraphSummary;
    metricUse: 'observation-only';
  };
  reference: {
    source: 'scientific-reference';
    sourceCategory: 'external-database';
    coordinateUse: 'coordinate-measurement-approved';
    structureMatchStatus: 'verified';
    coordinateSource: string;
    sourceNote?: string;
    measurements: SanitizedReferenceMeasurement[];
  };
  automaticSpatialJudgement: 'not-performed';
}

export type ComparisonRecoveryAction =
  | 'rebuild-physical-model'
  | 'retake-photo'
  | 'recheck-atoms-and-bonds'
  | 'revise-explanation';

export interface CompletedPhysicalReferenceComparisonSnapshot {
  sourceValidationRevision: string;
  sourceAtomRevision: string;
  sourceReferenceRevision: string;
  identityId: string;
  canonicalSmiles: string;
  observation: StudentComparisonObservation;
  assessment: 'student-observation-not-auto-graded';
}

interface ReadyComparisonBase {
  comparison: PhysicalReferenceComparison;
  observation: StudentComparisonObservation;
  coachPrompts: string[];
  recoveryActions: ComparisonRecoveryAction[];
}

export type PhysicalReferenceComparisonState =
  | {
      status: 'blocked';
      canComplete: false;
      reason: PhysicalReferenceComparisonBlockReason;
      studentMessage: string;
      developerLogs: string[];
    }
  | (ReadyComparisonBase & {
      status: 'draft';
      canComplete: false;
      missingObservationFields: StudentObservationField[];
    })
  | (ReadyComparisonBase & {
      status: 'complete';
      canComplete: true;
      missingObservationFields: [];
      completedSnapshot: CompletedPhysicalReferenceComparisonSnapshot;
    });

const RECOVERY_ACTIONS: ComparisonRecoveryAction[] = [
  'rebuild-physical-model',
  'retake-photo',
  'recheck-atoms-and-bonds',
  'revise-explanation',
];

function block(
  reason: PhysicalReferenceComparisonBlockReason,
  developerMessage: string,
  studentMessage =
    '현재 모형과 과학적 Reference가 같은 확인 기록에 연결되지 않아 비교를 완료할 수 없습니다. 원자와 결합을 다시 확인해 주세요.',
): Extract<PhysicalReferenceComparisonState, { status: 'blocked' }> {
  return {
    status: 'blocked',
    canComplete: false,
    reason,
    studentMessage,
    developerLogs: [developerMessage],
  };
}

function canonicalPair(left: string, right: string): readonly [string, string] {
  return left.localeCompare(right, 'en') <= 0 ? [left, right] : [right, left];
}

function topologySignature(graph: PhysicalGraph): string {
  return JSON.stringify({
    revision: graph.revision,
    atoms: graph.atoms
      .map(({ id, element }) => ({ id, element }))
      .sort((left, right) => left.id.localeCompare(right.id, 'en')),
    bonds: graph.bonds
      .map(({ atomIds, order }) => ({ atomIds: canonicalPair(...atomIds), order }))
      .sort((left, right) => {
        const leftKey = left.atomIds.join('|');
        const rightKey = right.atomIds.join('|');
        return leftKey.localeCompare(rightKey, 'en') || left.order - right.order;
      }),
  });
}

function sameGraphSummary(
  left: MoleculeGraphSummary,
  right: MoleculeGraphSummary,
): boolean {
  return (
    left.atomCount === right.atomCount &&
    left.bondCount === right.bondCount &&
    left.componentCount === right.componentCount &&
    left.isSingleComponent === right.isSingleComponent &&
    left.isolatedAtomCount === right.isolatedAtomCount &&
    left.componentAtomCounts.join(',') === right.componentAtomCounts.join(',')
  );
}

function elementCounts(elements: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const element of elements) {
    counts[element] = (counts[element] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right, 'en')),
  );
}

function sameElementCounts(
  physicalGraph: PhysicalGraph,
  referenceElements: readonly string[],
): boolean {
  return (
    JSON.stringify(elementCounts(physicalGraph.atoms.map(({ element }) => element))) ===
    JSON.stringify(elementCounts(referenceElements))
  );
}

function referenceContractIsValid(
  reference: ConfirmedScientificReferenceEvidence,
): boolean {
  return (
    reference.revisionId.trim().length > 0 &&
    reference.sourceCategory === 'external-database' &&
    reference.coordinateUse === 'coordinate-measurement-approved' &&
    reference.structureMatchStatus === 'verified' &&
    reference.molecule3D.sourceType === 'pubchem' &&
    reference.molecule3D.coordinateDimension === '3d' &&
    reference.molecule3D.structureMatchStatus === 'verified' &&
    (reference.molecule3D.format === 'mol' || reference.molecule3D.format === 'sdf') &&
    reference.molecule3D.coordinateSource.trim().length > 0
  );
}

function sanitizeMeasurements(
  measurements: readonly GeometryMeasurementResult[],
  atomCount: number,
  bondedPairs: ReadonlyArray<readonly [number, number]>,
): SanitizedReferenceMeasurement[] | null {
  const sanitized: SanitizedReferenceMeasurement[] = [];

  for (const measurement of measurements) {
    const expectedCount = measurement.type === 'bond_length' ? 2 : 3;
    const expectedUnit = measurement.type === 'bond_length' ? 'angstrom' : 'degree';
    const indicesAreValid =
      measurement.atomIndices.length === expectedCount &&
      new Set(measurement.atomIndices).size === expectedCount &&
      measurement.atomIndices.every(
        (index) => Number.isInteger(index) && index > 0 && index <= atomCount,
      );
    const valueIsValid =
      Number.isFinite(measurement.value) &&
      measurement.value > 0 &&
      (measurement.type === 'bond_length' || measurement.value <= 180);
    const selectionMode = measurement.type === 'bond_length' ? 'bond_length' : 'bond_angle';

    if (
      !indicesAreValid ||
      measurement.atomLabels.length !== expectedCount ||
      measurement.atomLabels.some((label) => !label.trim()) ||
      measurement.unit !== expectedUnit ||
      !valueIsValid ||
      !measurement.sourceNote.trim() ||
      !isBondedMeasurementSelection(
        selectionMode,
        measurement.atomIndices,
        bondedPairs,
      )
    ) {
      return null;
    }

    sanitized.push({
      type: measurement.type,
      atomIndices: [...measurement.atomIndices],
      atomLabels: [...measurement.atomLabels],
      value: measurement.value,
      unit: measurement.unit,
      sourceNote: measurement.sourceNote.trim(),
      evidenceType: 'reference-coordinate',
    });
  }

  return sanitized;
}

function normalizeObservation(
  observation: StudentComparisonObservation,
): StudentComparisonObservation {
  return {
    samePoint: observation.samePoint.trim(),
    differentPoint: observation.differentPoint.trim(),
    revisedExplanation: observation.revisedExplanation.trim(),
  };
}

function missingObservationFields(
  observation: StudentComparisonObservation,
): StudentObservationField[] {
  const fields: StudentObservationField[] = [
    'samePoint',
    'differentPoint',
    'revisedExplanation',
  ];
  return fields.filter((field) => observation[field].length === 0);
}

function coachPrompts(identityId: string): string[] {
  if (identityId === 'methane') {
    return [
      'Reference를 두 방향 이상으로 회전해 중심 탄소 주변 네 결합을 하나씩 관찰하세요.',
      'Physical 사진에서 겹쳐 보이는 결합이 있는지 실제 모형을 돌려 확인하고, 사진의 보이는 모습과 확인한 연결 관계를 구분해 기록하세요.',
      '필요하면 Reference에서 중심 탄소와 두 수소를 선택해 각도를 측정하고, 그 값이 Reference 좌표에서 나온 값임을 함께 적으세요.',
    ];
  }
  if (identityId === 'ammonia') {
    return [
      'Reference를 두 방향 이상으로 회전해 질소와 세 수소가 앞뒤로 보이는 모습을 관찰하세요.',
      'Physical 사진에서 원자가 서로 가려질 수 있는지 실제 모형을 돌려 확인하고 같은 점과 다른 점을 기록하세요.',
      '질소를 가운데로 선택해 Reference 각도를 측정했다면 그 값의 좌표 출처를 함께 적으세요.',
    ];
  }
  if (identityId === 'water') {
    return [
      'Reference를 회전하며 산소와 두 수소가 보이는 방향이 시점에 따라 어떻게 달라지는지 관찰하세요.',
      'Physical 사진에서 수소가 겹치거나 가려졌는지 실물 모형을 다른 방향에서 다시 확인하세요.',
      '산소를 가운데로 원자 세 개를 선택해 Reference 각도를 측정하고 사진에서 보이는 간격과 섞지 말고 기록하세요.',
    ];
  }
  return [
    'Reference를 두 방향 이상으로 회전하고 Physical 사진과 번갈아 관찰하세요.',
    '원자 종류와 확인한 연결 관계를 먼저 대조한 뒤 보이는 차이를 자신의 말로 기록하세요.',
    'Reference 측정값을 사용했다면 좌표 출처를 함께 적고 사진에서 보이는 간격과 구분하세요.',
  ];
}

export function buildPhysicalReferenceComparison(
  input: PhysicalReferenceComparisonInput,
): PhysicalReferenceComparisonState {
  const { currentRevision, photo, validation, reference } = input;

  if (!validation) {
    return block(
      'missing-validation',
      'Scanner N6 comparison blocked: no N4 validation snapshot.',
    );
  }
  if (!validation.ok || validation.validationStatus !== 'valid') {
    return block(
      'validation-not-valid',
      `Scanner N6 comparison blocked: N4 revision ${validation.revisionId} is not valid.`,
    );
  }
  if (!validation.n5Ready || validation.identity.status !== 'exact') {
    return block(
      'validation-not-exact',
      `Scanner N6 comparison blocked: N4 revision ${validation.revisionId} has no exact N5-ready identity.`,
    );
  }

  if (
    input.physical.revisionId !== currentRevision.physicalGraphRevisionId ||
    input.physical.sourceRevision !== currentRevision.sourceAtomRevision
  ) {
    return block(
      'stale-physical',
      'Scanner N6 comparison blocked: Physical graph snapshot is not the current scanner revision.',
    );
  }
  if (photo.sourceAtomRevision !== currentRevision.sourceAtomRevision) {
    return block(
      'stale-photo',
      'Scanner N6 comparison blocked: photo summary is not tied to the current atom/image revision.',
    );
  }
  if (!photo.imageLabel.trim()) {
    return block(
      'physical-contract-invalid',
      'Scanner N6 comparison blocked: Physical photo summary has no image label.',
    );
  }
  if (
    validation.revisionId !== currentRevision.physicalGraphRevisionId ||
    validation.sourceRevision !== currentRevision.sourceAtomRevision
  ) {
    return block(
      'stale-validation',
      `Scanner N6 comparison blocked: N4 revision ${validation.revisionId}/${validation.sourceRevision} is stale.`,
    );
  }

  let currentGraph: PhysicalGraph;
  try {
    currentGraph = createPhysicalGraph(
      input.physical.graph.atoms,
      input.physical.graph.bonds,
      input.physical.graph.revision,
    );
  } catch (error) {
    return block(
      'physical-contract-invalid',
      `Scanner N6 comparison blocked: invalid confirmed Physical graph contract: ${
        error instanceof Error ? error.message : 'unknown error'
      }`,
    );
  }

  const currentSummary = summarizePhysicalGraph(currentGraph);
  if (
    topologySignature(currentGraph) !== topologySignature(validation.validatedGraph) ||
    !sameGraphSummary(currentSummary, validation.graphSummary)
  ) {
    return block(
      'physical-validation-mismatch',
      `Scanner N6 comparison blocked: current Physical graph differs from validated revision ${validation.revisionId}.`,
    );
  }

  if (!reference) {
    return block(
      'missing-reference',
      'Scanner N6 comparison blocked: no confirmed Scientific Reference snapshot.',
      '과학적 Reference가 준비되지 않아 비교를 완료할 수 없습니다. Reference 3D를 다시 확인해 주세요.',
    );
  }
  if (
    reference.sourceValidationRevision !== currentRevision.physicalGraphRevisionId ||
    reference.sourceAtomRevision !== currentRevision.sourceAtomRevision
  ) {
    return block(
      'stale-reference',
      `Scanner N6 comparison blocked: Reference ${reference.revisionId} is stale for the current scanner revision.`,
    );
  }

  const identity = validation.identity.candidates[0];
  if (
    reference.identityId !== identity.id ||
    reference.canonicalSmiles !== validation.canonicalSmiles ||
    !identity.canonicalSmilesVariants.includes(reference.canonicalSmiles)
  ) {
    return block(
      'reference-identity-mismatch',
      `Scanner N6 comparison blocked: Reference identity/canonical key differs from N4 revision ${validation.revisionId}.`,
    );
  }
  if (!referenceContractIsValid(reference)) {
    return block(
      'reference-contract-invalid',
      `Scanner N6 comparison blocked: Reference ${reference.revisionId} lacks verified approved 3D provenance.`,
    );
  }

  let referenceAtoms;
  let bondedPairs;
  try {
    referenceAtoms = parseAtomsFromMolecule3DInput(reference.molecule3D);
    bondedPairs = parseBondedAtomPairsFromMolecule3DInput(reference.molecule3D);
  } catch (error) {
    return block(
      'reference-contract-invalid',
      `Scanner N6 comparison blocked: Reference coordinate parsing failed: ${
        error instanceof Error ? error.message : 'unknown error'
      }`,
    );
  }

  if (
    referenceAtoms.length !== currentSummary.atomCount ||
    bondedPairs.length !== currentSummary.bondCount ||
    !sameElementCounts(currentGraph, referenceAtoms.map(({ element }) => element))
  ) {
    return block(
      'reference-graph-mismatch',
      `Scanner N6 comparison blocked: Reference atom/bond composition differs from current Physical graph ${currentSummary.atomCount}/${currentSummary.bondCount}.`,
    );
  }

  const measurements = sanitizeMeasurements(
    reference.measurements,
    referenceAtoms.length,
    bondedPairs,
  );
  if (!measurements) {
    return block(
      'reference-measurement-invalid',
      `Scanner N6 comparison blocked: Reference ${reference.revisionId} contains an invalid or nonbonded measurement.`,
      '선택한 Reference 원자와 결합 관계를 다시 확인한 뒤 측정해 주세요.',
    );
  }

  const atoms = currentGraph.atoms
    .map(({ id, element }) => ({ id, element }))
    .sort((left, right) => left.id.localeCompare(right.id, 'en'));
  const bonds = currentGraph.bonds
    .map(({ id, atomIds, order }) => ({ id, atomIds: canonicalPair(...atomIds), order }))
    .sort((left, right) => left.id.localeCompare(right.id, 'en'));
  const comparison: PhysicalReferenceComparison = {
    provenance: {
      physicalGraphRevisionId: currentRevision.physicalGraphRevisionId,
      sourceAtomRevision: currentRevision.sourceAtomRevision,
      validationRevisionId: validation.revisionId,
      referenceRevisionId: reference.revisionId,
      identityId: identity.id,
      canonicalSmiles: validation.canonicalSmiles,
    },
    sharedVerifiedGraph: {
      verification: 'n4-validated-n5-exact-match',
      atomCount: currentSummary.atomCount,
      bondCount: currentSummary.bondCount,
      elementCounts: elementCounts(currentGraph.atoms.map(({ element }) => element)),
      atoms,
      bonds,
    },
    physical: {
      source: 'physical-model-photo',
      imageLabel: photo.imageLabel.trim(),
      sourceAtomRevision: photo.sourceAtomRevision,
      graphRevision: currentGraph.revision,
      graphSummary: currentSummary,
      metricUse: 'observation-only',
    },
    reference: {
      source: 'scientific-reference',
      sourceCategory: reference.sourceCategory,
      coordinateUse: reference.coordinateUse,
      structureMatchStatus: reference.structureMatchStatus,
      coordinateSource: reference.molecule3D.coordinateSource,
      ...(reference.molecule3D.sourceNote
        ? { sourceNote: reference.molecule3D.sourceNote }
        : {}),
      measurements,
    },
    automaticSpatialJudgement: 'not-performed',
  };

  const observation = normalizeObservation(input.observation);
  const missingFields = missingObservationFields(observation);
  const readyBase: ReadyComparisonBase = {
    comparison,
    observation,
    coachPrompts: coachPrompts(identity.id),
    recoveryActions: [...RECOVERY_ACTIONS],
  };

  if (missingFields.length > 0) {
    return {
      ...readyBase,
      status: 'draft',
      canComplete: false,
      missingObservationFields: missingFields,
    };
  }

  return {
    ...readyBase,
    status: 'complete',
    canComplete: true,
    missingObservationFields: [],
    completedSnapshot: {
      sourceValidationRevision: validation.revisionId,
      sourceAtomRevision: validation.sourceRevision,
      sourceReferenceRevision: reference.revisionId,
      identityId: identity.id,
      canonicalSmiles: validation.canonicalSmiles,
      observation,
      assessment: 'student-observation-not-auto-graded',
    },
  };
}
