import { describe, expect, it } from 'vitest';
import type { GeometryMeasurementResult, Molecule3DInput } from '../types/molecule';
import {
  createPhysicalGraph,
  createStableBondId,
  summarizePhysicalGraph,
  type BondAtom,
  type ConfirmedBond,
  type PhysicalGraph,
} from './bondGraph';
import type {
  LimitedIdentityRecord,
  PhysicalGraphValidationResult,
} from './physicalGraphValidation';
import {
  buildPhysicalReferenceComparison,
  type ConfirmedScientificReferenceEvidence,
  type PhysicalReferenceComparisonInput,
} from './physicalReferenceComparison';

type ValidValidation = Extract<PhysicalGraphValidationResult, { ok: true }>;

const IDENTITY = {
  methane: {
    id: 'methane',
    nameKo: '메테인',
    molecularFormula: 'CH4',
    canonicalSmilesVariants: ['C'],
    center: 'C',
    hydrogens: 4,
  },
  ammonia: {
    id: 'ammonia',
    nameKo: '암모니아',
    molecularFormula: 'H3N',
    canonicalSmilesVariants: ['N'],
    center: 'N',
    hydrogens: 3,
  },
  water: {
    id: 'water',
    nameKo: '물',
    molecularFormula: 'H2O',
    canonicalSmilesVariants: ['O'],
    center: 'O',
    hydrogens: 2,
  },
} as const;

function makeGraph(kind: keyof typeof IDENTITY): PhysicalGraph {
  const identity = IDENTITY[kind];
  const atoms: BondAtom[] = [
    { id: `${kind}-center`, element: identity.center, x: 0.51, y: 0.46, radius: 0.08 },
    ...Array.from({ length: identity.hydrogens }, (_, index): BondAtom => ({
      id: `${kind}-h-${index + 1}`,
      element: 'H',
      x: 0.1 + index * 0.21,
      y: index % 2 === 0 ? 0.2 : 0.78,
      radius: 0.04,
    })),
  ];
  const bonds: ConfirmedBond[] = atoms.slice(1).map((atom) => ({
    id: createStableBondId(atoms[0].id, atom.id),
    atomIds: [atoms[0].id, atom.id],
    order: 1,
    reviewStatus: 'confirmed',
    source: 'manual',
  }));
  return createPhysicalGraph(atoms, bonds, 3);
}

function makeSdf(graph: PhysicalGraph): string {
  const atomIndex = new Map(graph.atoms.map((atom, index) => [atom.id, index + 1]));
  const atomLines = graph.atoms.map((atom, index) => {
    const x = index === 0 ? 0 : Math.cos(index * 1.7);
    const y = index === 0 ? 0 : Math.sin(index * 1.7);
    const z = index === 0 ? 0 : index % 2 === 0 ? 0.8 : -0.8;
    return `${x.toFixed(4).padStart(10)}${y.toFixed(4).padStart(10)}${z
      .toFixed(4)
      .padStart(10)} ${atom.element.padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0  0`;
  });
  const bondLines = graph.bonds.map((bond) => {
    const first = atomIndex.get(bond.atomIds[0]) ?? 0;
    const second = atomIndex.get(bond.atomIds[1]) ?? 0;
    return `${String(first).padStart(3)}${String(second).padStart(3)}${String(
      bond.order,
    ).padStart(3)}  0  0  0  0`;
  });

  return [
    'Scanner Reference',
    '  PubChem',
    '',
    `${String(graph.atoms.length).padStart(3)}${String(graph.bonds.length).padStart(
      3,
    )}  0  0  0  0  0  0  0  0999 V2000`,
    ...atomLines,
    ...bondLines,
    'M  END',
    '$$$$',
  ].join('\n');
}

function makeValidation(kind: keyof typeof IDENTITY): ValidValidation {
  const graph = makeGraph(kind);
  const identity = IDENTITY[kind];
  const record: LimitedIdentityRecord = {
    id: identity.id,
    nameKo: identity.nameKo,
    molecularFormula: identity.molecularFormula,
    canonicalSmilesVariants: identity.canonicalSmilesVariants,
  };

  return {
    ok: true,
    n5Ready: true,
    revisionId: `graph-atoms-7-${graph.revision}`,
    sourceRevision: 'atoms-7',
    structureIntent: 'single-molecule',
    graphSummary: summarizePhysicalGraph(graph),
    connectivityStatus: 'single-component',
    validationStatus: 'valid',
    source: 'physical-graph',
    canonicalSmiles: identity.canonicalSmilesVariants[0],
    molecularFormula: identity.molecularFormula,
    molecularWeight: 1,
    identity: { status: 'exact', candidates: [record] },
    validatedGraph: graph,
    validationRepresentation: {
      format: 'mol-v2000',
      coordinateMeaning: 'topology-only',
      molBlock: 'validation-only',
    },
    issues: [],
    warnings: [],
    errors: [],
    developerLogs: [],
  };
}

function makeReference(
  validation: ValidValidation,
  measurements: GeometryMeasurementResult[] = [{
    type: 'bond_length',
    atomIndices: [1, 2],
    atomLabels: [
      `${validation.validatedGraph.atoms[0].element}1`,
      `${validation.validatedGraph.atoms[1].element}2`,
    ],
    value: 1.09,
    unit: 'angstrom',
    sourceNote: 'Reference 좌표에서 계산한 값',
  }],
): ConfirmedScientificReferenceEvidence {
  if (validation.identity.status !== 'exact') {
    throw new Error('expected exact identity fixture');
  }
  const identity = validation.identity.candidates[0];
  const molecule3D: Molecule3DInput = {
    format: 'sdf',
    data: makeSdf(validation.validatedGraph),
    label: `${identity.nameKo} Reference 3D`,
    sourceType: 'pubchem',
    coordinateDimension: '3d',
    structureMatchStatus: 'verified',
    coordinateSource: 'PubChem calculated conformer',
    sourceNote: '외부 데이터베이스 계산 좌표',
  };

  return {
    revisionId: `reference-${validation.revisionId}`,
    sourceValidationRevision: validation.revisionId,
    sourceAtomRevision: validation.sourceRevision,
    identityId: identity.id,
    canonicalSmiles: validation.canonicalSmiles,
    sourceCategory: 'external-database',
    coordinateUse: 'coordinate-measurement-approved',
    structureMatchStatus: 'verified',
    molecule3D,
    measurements,
  };
}

function makeInput(
  kind: keyof typeof IDENTITY = 'methane',
  observation: PhysicalReferenceComparisonInput['observation'] = {
    samePoint: '',
    differentPoint: '',
    revisedExplanation: '',
  },
): PhysicalReferenceComparisonInput {
  const validation = makeValidation(kind);
  return {
    currentRevision: {
      physicalGraphRevisionId: validation.revisionId,
      sourceAtomRevision: validation.sourceRevision,
    },
    physical: {
      revisionId: validation.revisionId,
      sourceRevision: validation.sourceRevision,
      graph: validation.validatedGraph,
    },
    photo: {
      imageLabel: 'student-model.jpg',
      sourceAtomRevision: validation.sourceRevision,
    },
    validation,
    reference: makeReference(validation),
    observation,
  };
}

describe('buildPhysicalReferenceComparison', () => {
  it('returns only verified graph facts for Physical and keeps Å measurements on Reference', () => {
    const result = buildPhysicalReferenceComparison(makeInput());

    expect(result.status).toBe('draft');
    if (result.status === 'blocked') throw new Error('expected a ready comparison');

    expect(result.comparison.sharedVerifiedGraph).toMatchObject({
      atomCount: 5,
      bondCount: 4,
      verification: 'n4-validated-n5-exact-match',
      atoms: expect.arrayContaining([
        { id: 'methane-center', element: 'C' },
        { id: 'methane-h-1', element: 'H' },
      ]),
    });
    expect(result.comparison.sharedVerifiedGraph.bonds).toHaveLength(4);
    expect(result.comparison.reference.measurements[0]).toMatchObject({
      value: 1.09,
      unit: 'angstrom',
      evidenceType: 'reference-coordinate',
    });
    expect(result.comparison.physical).toEqual(expect.objectContaining({
      source: 'physical-model-photo',
      metricUse: 'observation-only',
      imageLabel: 'student-model.jpg',
    }));
    expect(Object.keys(result.comparison.physical)).not.toEqual(
      expect.arrayContaining(['x', 'y', 'radius', 'distance', 'angle', 'unit']),
    );
    expect(JSON.stringify(result.comparison.physical)).not.toMatch(
      /angstrom|ångström|pixel|픽셀|막대 길이/i,
    );
    expect(result.comparison.automaticSpatialJudgement).toBe('not-performed');
  });

  it('keeps incomplete student observations as a fail-closed draft', () => {
    const result = buildPhysicalReferenceComparison(makeInput('methane', {
      samePoint: '원자 수가 같다.',
      differentPoint: '',
      revisedExplanation: '  ',
    }));

    expect(result.status).toBe('draft');
    if (result.status !== 'draft') throw new Error('expected a draft');
    expect(result.canComplete).toBe(false);
    expect(result.missingObservationFields).toEqual([
      'differentPoint',
      'revisedExplanation',
    ]);
    expect(result).not.toHaveProperty('completedSnapshot');
  });

  it('creates a revision-bound completed snapshot only after all three observations', () => {
    const result = buildPhysicalReferenceComparison(makeInput('methane', {
      samePoint: '탄소 한 개와 수소 네 개가 연결되어 있다.',
      differentPoint: '사진과 회전한 Reference에서 겹쳐 보이는 결합이 달랐다.',
      revisedExplanation: '한 방향의 사진만으로 입체 배치를 단정하지 않고 여러 방향에서 본다.',
    }));

    expect(result.status).toBe('complete');
    if (result.status !== 'complete') throw new Error('expected completion');
    expect(result.canComplete).toBe(true);
    expect(result.completedSnapshot).toMatchObject({
      sourceValidationRevision: 'graph-atoms-7-3',
      sourceAtomRevision: 'atoms-7',
      sourceReferenceRevision: 'reference-graph-atoms-7-3',
      identityId: 'methane',
    });
    expect(result.completedSnapshot.assessment).toBe('student-observation-not-auto-graded');
  });

  it.each([
    ['methane', '중심 탄소', '네 결합'],
    ['ammonia', '질소', '세 수소'],
    ['water', '산소', '두 수소'],
  ] as const)('offers action-oriented %s prompts without revealing a shape answer', (kind, firstClue, secondClue) => {
    const result = buildPhysicalReferenceComparison(makeInput(kind));

    expect(result.status).toBe('draft');
    if (result.status === 'blocked') throw new Error('expected prompts');
    const prompts = result.coachPrompts.join(' ');
    expect(prompts).toContain(firstClue);
    expect(prompts).toContain(secondClue);
    expect(prompts).toMatch(/회전|관찰|확인|선택|기록/);
    expect(prompts).not.toMatch(/정사면체|삼각뿔|굽은형|평면형|109\.5|107(?:\.0)?|104\.5|정답|오답/);
  });

  it.each([
    ['current physical revision changed', (input: PhysicalReferenceComparisonInput) => {
      input.currentRevision.physicalGraphRevisionId = 'graph-atoms-7-4';
    }, 'stale-physical'],
    ['photo atom revision changed', (input: PhysicalReferenceComparisonInput) => {
      input.photo.sourceAtomRevision = 'atoms-8';
    }, 'stale-photo'],
    ['reference validation revision changed', (input: PhysicalReferenceComparisonInput) => {
      if (input.reference) input.reference.sourceValidationRevision = 'graph-atoms-7-2';
    }, 'stale-reference'],
    ['reference identity changed', (input: PhysicalReferenceComparisonInput) => {
      if (input.reference) input.reference.identityId = 'water';
    }, 'reference-identity-mismatch'],
    ['reference canonical changed', (input: PhysicalReferenceComparisonInput) => {
      if (input.reference) input.reference.canonicalSmiles = 'O';
    }, 'reference-identity-mismatch'],
  ] as const)('blocks when %s', (_label, mutate, reason) => {
    const input = makeInput();
    mutate(input);
    const result = buildPhysicalReferenceComparison(input);

    expect(result).toMatchObject({ status: 'blocked', canComplete: false, reason });
  });

  it('blocks an invalid, ambiguous, or not-ready N4 result', () => {
    const input = makeInput();
    if (!input.validation?.ok) throw new Error('expected valid fixture');
    input.validation = {
      ...input.validation,
      n5Ready: false,
      identity: { status: 'unknown', candidates: [] },
    };

    expect(buildPhysicalReferenceComparison(input)).toMatchObject({
      status: 'blocked',
      canComplete: false,
      reason: 'validation-not-exact',
    });
  });

  it('blocks missing or non-verified Reference evidence', () => {
    const missing = makeInput();
    missing.reference = null;
    expect(buildPhysicalReferenceComparison(missing)).toMatchObject({
      status: 'blocked',
      reason: 'missing-reference',
    });

    const unverified = makeInput();
    if (!unverified.reference) throw new Error('expected reference fixture');
    unverified.reference.molecule3D = {
      ...unverified.reference.molecule3D,
      structureMatchStatus: 'review-needed',
    };
    expect(buildPhysicalReferenceComparison(unverified)).toMatchObject({
      status: 'blocked',
      reason: 'reference-contract-invalid',
    });
  });

  it('blocks Reference graph drift instead of trusting a verified label alone', () => {
    const input = makeInput();
    if (!input.reference) throw new Error('expected reference fixture');
    input.reference.molecule3D = {
      ...input.reference.molecule3D,
      data: input.reference.molecule3D.data.replace('  5  4', '  4  3'),
    };

    expect(buildPhysicalReferenceComparison(input)).toMatchObject({
      status: 'blocked',
      reason: 'reference-graph-mismatch',
    });
  });

  it('blocks nonbonded or malformed Reference measurements', () => {
    const input = makeInput();
    if (!input.reference) throw new Error('expected reference fixture');
    input.reference.measurements = [{
      type: 'bond_length',
      atomIndices: [2, 3],
      atomLabels: ['H2', 'H3'],
      value: 1.8,
      unit: 'angstrom',
      sourceNote: 'Reference 좌표',
    }];

    expect(buildPhysicalReferenceComparison(input)).toMatchObject({
      status: 'blocked',
      reason: 'reference-measurement-invalid',
    });
  });
});
