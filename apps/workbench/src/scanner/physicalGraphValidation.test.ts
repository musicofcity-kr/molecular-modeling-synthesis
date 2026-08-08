import { describe, expect, it } from 'vitest';
import { parseStrictV2000Layout } from '../chemistry/v2000MolBlock';
import {
  getRDKitInitializationCountForTests,
  resetRDKitForTests,
} from '../services/rdkitService';
import {
  createPhysicalGraph,
  createStableBondId,
  type BondAtom,
  type ConfirmedBond,
  type PhysicalGraph,
} from './bondGraph';
import {
  physicalGraphToV2000MolBlock,
  resolveLimitedIdentity,
  validateConfirmedPhysicalGraph,
  type ConfirmedPhysicalGraphInput,
  type LimitedIdentityRecord,
} from './physicalGraphValidation';

const atom = (
  id: string,
  element: BondAtom['element'],
  x = 0.5,
  y = 0.5,
): BondAtom => ({ id, element, x, y, radius: 0.05 });

const bond = (
  atomIdA: string,
  atomIdB: string,
  order: ConfirmedBond['order'] = 1,
): ConfirmedBond => ({
  id: createStableBondId(atomIdA, atomIdB),
  atomIds: [atomIdA, atomIdB],
  order,
  reviewStatus: 'confirmed',
  source: 'manual',
});

function snapshot(graph: PhysicalGraph, sourceRevision = 'atoms-image-7'):
  ConfirmedPhysicalGraphInput {
  return {
    revisionId: `physical-${sourceRevision}-${graph.revision}`,
    sourceRevision,
    graph,
  };
}

function methaneGraph(revision = 3): PhysicalGraph {
  const atoms = [
    atom('c', 'C'),
    atom('h1', 'H', 0.2, 0.2),
    atom('h2', 'H', 0.8, 0.2),
    atom('h3', 'H', 0.2, 0.8),
    atom('h4', 'H', 0.8, 0.8),
  ];
  return createPhysicalGraph(
    atoms,
    ['h1', 'h2', 'h3', 'h4'].map((hydrogenId) => bond('c', hydrogenId)),
    revision,
  );
}

function ethaneGraph(revision = 4): PhysicalGraph {
  const atoms = [
    atom('c1', 'C'),
    atom('c2', 'C'),
    ...Array.from({ length: 6 }, (_, index) => atom(`h${index + 1}`, 'H')),
  ];
  return createPhysicalGraph(
    atoms,
    [
      bond('c1', 'c2'),
      ...['h1', 'h2', 'h3'].map((id) => bond('c1', id)),
      ...['h4', 'h5', 'h6'].map((id) => bond('c2', id)),
    ],
    revision,
  );
}

function graphFixture(
  atomSpecs: ReadonlyArray<readonly [string, BondAtom['element']]>,
  bondSpecs: ReadonlyArray<readonly [string, string, ConfirmedBond['order']?]>,
  revision = 2,
): PhysicalGraph {
  return createPhysicalGraph(
    atomSpecs.map(([id, element]) => atom(id, element)),
    bondSpecs.map(([left, right, order]) => bond(left, right, order ?? 1)),
    revision,
  );
}

describe('physicalGraphToV2000MolBlock', () => {
  it('creates a deterministic topology-only V2000 block with explicit hydrogens', () => {
    const graph = methaneGraph();
    const first = physicalGraphToV2000MolBlock(graph);
    const second = physicalGraphToV2000MolBlock(graph);
    const layout = parseStrictV2000Layout(first);

    expect(first).toBe(second);
    expect(layout).toMatchObject({ atomCount: 5, bondCount: 4 });
    expect(first.match(/ H\s/g)).toHaveLength(4);
    expect(first).toContain('topology-only coordinates; not physical measurements');
  });
});

describe('validateConfirmedPhysicalGraph', () => {
  it('blocks disconnected single-molecule input before RDKit initialization', async () => {
    resetRDKitForTests();
    const graph = createPhysicalGraph(
      ['a', 'b', 'c', 'd'].map((id) => atom(id, 'C')),
      [],
    );

    const result = await validateConfirmedPhysicalGraph(snapshot(graph));

    expect(result).toMatchObject({
      ok: false,
      validationStatus: 'invalid',
      n5Ready: false,
      connectivityStatus: 'multiple-components-blocked',
      revisionId: 'physical-atoms-image-7-1',
      sourceRevision: 'atoms-image-7',
    });
    expect(result.errors.join('\n')).toContain('연결');
    expect('molecularFormula' in result).toBe(false);
    expect('molecularWeight' in result).toBe(false);
    expect('canonicalSmiles' in result).toBe(false);
    expect(getRDKitInitializationCountForTests()).toBe(0);
  });

  it('validates explicit-H methane with real RDKit and returns exact limited identity', async () => {
    const input = snapshot(methaneGraph(), 'atoms-image-12');

    const result = await validateConfirmedPhysicalGraph(input);

    expect(result.ok, result.developerLogs.join('\n')).toBe(true);
    if (!result.ok) return;
    expect(result).toMatchObject({
      validationStatus: 'valid',
      revisionId: input.revisionId,
      sourceRevision: input.sourceRevision,
      molecularFormula: 'CH4',
      canonicalSmiles: 'C',
      n5Ready: true,
      connectivityStatus: 'single-component',
      graphSummary: { atomCount: 5, bondCount: 4, componentCount: 1 },
      identity: { status: 'exact' },
    });
    expect(result.molecularWeight).toBeCloseTo(16.043, 3);
    expect(result.canonicalSmiles).toBeTruthy();
    expect(result.identity.candidates.map(({ id }) => id)).toEqual(['methane']);
    expect(result.validatedGraph).toEqual(input.graph);
  });

  it('keeps formula, mass, and canonical output hidden for RDKit-invalid valence', async () => {
    const graph = createPhysicalGraph(
      [
        atom('c', 'C'),
        ...Array.from({ length: 5 }, (_, index) => atom(`h${index + 1}`, 'H')),
      ],
      Array.from({ length: 5 }, (_, index) => bond('c', `h${index + 1}`)),
    );

    const result = await validateConfirmedPhysicalGraph(snapshot(graph));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.validationStatus).toBe('invalid');
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'invalid-valence', atomIds: ['c'] }),
    ]));
    expect(result.errors.join('\n')).toMatch(/C\(c\)|결합차수|원자가/i);
    expect('molecularFormula' in result).toBe(false);
    expect('molecularWeight' in result).toBe(false);
    expect('canonicalSmiles' in result).toBe(false);
    expect(result.identity.status).toBe('not-evaluated');
    expect(result.n5Ready).toBe(false);
  });

  it('fails closed when RDKit adds implicit H to a lone physical carbon', async () => {
    const graph = createPhysicalGraph([atom('c-only', 'C')], []);

    const result = await validateConfirmedPhysicalGraph(snapshot(graph));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'implicit-hydrogen-drift',
        atomIds: ['c-only'],
      }),
    ]));
    expect(result.errors.join('\n')).toContain('현재 모형에서 확인하지 않은 수소');
    expect(result.identity.status).toBe('not-evaluated');
    expect(result.n5Ready).toBe(false);
    expect('molecularFormula' in result).toBe(false);
    expect('molecularWeight' in result).toBe(false);
    expect('canonicalSmiles' in result).toBe(false);
  });

  it('returns unknown and n5Ready=false for valid ClF outside the limited identity catalog', async () => {
    const result = await validateConfirmedPhysicalGraph(snapshot(graphFixture(
      [['cl', 'Cl'], ['f', 'F']],
      [['cl', 'f']],
    )));

    expect(result.ok, result.developerLogs.join('\n')).toBe(true);
    if (!result.ok) return;
    expect(result.molecularFormula).toBe('ClF');
    expect(result.identity).toEqual({ status: 'unknown', candidates: [] });
    expect(result.n5Ready).toBe(false);
  });

  it.each([
    {
      id: 'hydrogen', formula: 'H2', canonical: '[H][H]',
      graph: () => graphFixture([['h1', 'H'], ['h2', 'H']], [['h1', 'h2']]),
    },
    {
      id: 'oxygen', formula: 'O2', canonical: 'O=O',
      graph: () => graphFixture([['o1', 'O'], ['o2', 'O']], [['o1', 'o2', 2]]),
    },
    {
      id: 'nitrogen', formula: 'N2', canonical: 'N#N',
      graph: () => graphFixture([['n1', 'N'], ['n2', 'N']], [['n1', 'n2', 3]]),
    },
    {
      id: 'water', formula: 'H2O', canonical: 'O',
      graph: () => graphFixture(
        [['o', 'O'], ['h1', 'H'], ['h2', 'H']],
        [['o', 'h1'], ['o', 'h2']],
      ),
    },
    {
      id: 'ammonia', formula: 'H3N', canonical: 'N',
      graph: () => graphFixture(
        [['n', 'N'], ['h1', 'H'], ['h2', 'H'], ['h3', 'H']],
        [['n', 'h1'], ['n', 'h2'], ['n', 'h3']],
      ),
    },
    {
      id: 'carbon-dioxide', formula: 'CO2', canonical: 'O=C=O',
      graph: () => graphFixture(
        [['c', 'C'], ['o1', 'O'], ['o2', 'O']],
        [['c', 'o1', 2], ['c', 'o2', 2]],
      ),
    },
    {
      id: 'ethane', formula: 'C2H6', canonical: 'CC',
      graph: () => ethaneGraph(),
    },
    {
      id: 'ethene', formula: 'C2H4', canonical: 'C=C',
      graph: () => graphFixture(
        [
          ['c1', 'C'], ['c2', 'C'],
          ['h1', 'H'], ['h2', 'H'], ['h3', 'H'], ['h4', 'H'],
        ],
        [
          ['c1', 'c2', 2],
          ['c1', 'h1'], ['c1', 'h2'], ['c2', 'h3'], ['c2', 'h4'],
        ],
      ),
    },
    {
      id: 'methanol', formula: 'CH4O', canonical: 'CO',
      graph: () => graphFixture(
        [
          ['c', 'C'], ['o', 'O'],
          ['h1', 'H'], ['h2', 'H'], ['h3', 'H'], ['h4', 'H'],
        ],
        [
          ['c', 'o'],
          ['c', 'h1'], ['c', 'h2'], ['c', 'h3'], ['o', 'h4'],
        ],
      ),
    },
  ])('validates representative exact identity $id with real RDKit', async (fixture) => {
    const result = await validateConfirmedPhysicalGraph(snapshot(fixture.graph()));

    expect(result.ok, result.developerLogs.join('\n')).toBe(true);
    if (!result.ok) return;
    expect(result).toMatchObject({
      n5Ready: true,
      molecularFormula: fixture.formula,
      canonicalSmiles: fixture.canonical,
      identity: { status: 'exact' },
    });
    expect(result.identity.candidates.map(({ id }) => id)).toEqual([fixture.id]);
  });

  it('reuses one RDKit initialization across repeated graph validation', async () => {
    resetRDKitForTests();

    await validateConfirmedPhysicalGraph(snapshot(methaneGraph()));
    await validateConfirmedPhysicalGraph(snapshot(ethaneGraph()));

    expect(getRDKitInitializationCountForTests()).toBe(1);
  });
});

describe('resolveLimitedIdentity', () => {
  it('does not arbitrarily choose when exact evidence maps to multiple records', () => {
    const records: LimitedIdentityRecord[] = [
      {
        id: 'candidate-a',
        nameKo: '후보 A',
        molecularFormula: 'CH4',
        canonicalSmilesVariants: ['C'],
      },
      {
        id: 'candidate-b',
        nameKo: '후보 B',
        molecularFormula: 'CH4',
        canonicalSmilesVariants: ['C'],
      },
    ];

    expect(resolveLimitedIdentity('C', records)).toEqual({
      status: 'multiple',
      candidates: records,
    });
  });
});
