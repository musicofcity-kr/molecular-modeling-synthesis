import { describe, expect, it } from 'vitest';
import {
  createPhysicalGraph,
  decideGraphConnectivity,
  proposeBondCandidates,
  summarizePhysicalGraph,
  type BondAtom,
  type ConfirmedBond,
} from './bondGraph';

const atom = (id: string, x = 0, y = 0, radius = 0.06): BondAtom => ({
  id,
  element: 'C',
  x,
  y,
  radius,
});

const confirmedBond = (
  atomIdA: string,
  atomIdB: string,
  order: 1 | 2 | 3 = 1,
): ConfirmedBond => ({
  id: `manual:${atomIdA}:${atomIdB}`,
  atomIds: [atomIdA, atomIdB],
  order,
  reviewStatus: 'confirmed',
  source: 'manual',
});

describe('physical graph summary', () => {
  it('reports an empty graph', () => {
    const graph = createPhysicalGraph([], []);

    expect(summarizePhysicalGraph(graph)).toEqual({
      atomCount: 0,
      bondCount: 0,
      componentCount: 0,
      componentAtomCounts: [],
      isSingleComponent: false,
      isolatedAtomCount: 0,
    });
    expect(decideGraphConnectivity(graph, 'single-molecule')).toMatchObject({
      ok: false,
      status: 'empty',
    });
  });

  it.each([
    { count: 1, expectedComponents: 1 },
    { count: 4, expectedComponents: 4 },
  ])('counts $count isolated atom(s)', ({ count, expectedComponents }) => {
    const atoms = Array.from({ length: count }, (_, index) => atom(`a${index + 1}`));
    const summary = summarizePhysicalGraph(createPhysicalGraph(atoms, []));

    expect(summary).toMatchObject({
      atomCount: count,
      bondCount: 0,
      componentCount: expectedComponents,
      isolatedAtomCount: count,
    });
    expect(summary.componentAtomCounts).toEqual(Array(count).fill(1));
    expect(decideGraphConnectivity(createPhysicalGraph(atoms, []), 'single-molecule').ok)
      .toBe(count === 1);
  });

  it.each([
    {
      name: 'linear C4',
      bonds: [confirmedBond('a', 'b'), confirmedBond('b', 'c'), confirmedBond('c', 'd')],
    },
    {
      name: 'branched C4',
      bonds: [confirmedBond('a', 'b'), confirmedBond('a', 'c'), confirmedBond('a', 'd')],
    },
    {
      name: 'four-membered ring',
      bonds: [
        confirmedBond('a', 'b'),
        confirmedBond('b', 'c'),
        confirmedBond('c', 'd'),
        confirmedBond('d', 'a'),
      ],
    },
  ])('recognizes $name as one component', ({ bonds }) => {
    const graph = createPhysicalGraph(['a', 'b', 'c', 'd'].map((id) => atom(id)), bonds);

    expect(summarizePhysicalGraph(graph)).toMatchObject({
      atomCount: 4,
      bondCount: bonds.length,
      componentCount: 1,
      componentAtomCounts: [4],
      isSingleComponent: true,
      isolatedAtomCount: 0,
    });
    expect(decideGraphConnectivity(graph, 'single-molecule')).toMatchObject({
      ok: true,
      status: 'single-component',
    });
  });

  it('blocks disconnected fragments for a single molecule', () => {
    const graph = createPhysicalGraph(
      ['a', 'b', 'c', 'd'].map((id) => atom(id)),
      [confirmedBond('a', 'b'), confirmedBond('c', 'd')],
    );

    expect(summarizePhysicalGraph(graph)).toMatchObject({
      componentCount: 2,
      componentAtomCounts: [2, 2],
    });
    expect(decideGraphConnectivity(graph, 'single-molecule')).toMatchObject({
      ok: false,
      status: 'multiple-components-blocked',
    });
  });

  it.each(['ionic-compound', 'mixture'] as const)(
    'allows disconnected components only with explicit %s intent',
    (intent) => {
      const graph = createPhysicalGraph(
        [atom('left'), atom('right')],
        [],
      );

      expect(decideGraphConnectivity(graph)).toMatchObject({
        ok: false,
        status: 'multiple-components-blocked',
        intent: 'single-molecule',
      });
      expect(decideGraphConnectivity(graph, intent)).toMatchObject({
        ok: true,
        status: 'multiple-components-allowed',
        intent,
      });
    },
  );
});

describe('geometry bond candidates', () => {
  const demoMethane: BondAtom[] = [
    { id: 'atom-003', element: 'C', x: 450 / 900, y: 350 / 700, radius: 82 / 700 },
    { id: 'atom-001', element: 'H', x: 220 / 900, y: 160 / 700, radius: 56 / 700 },
    { id: 'atom-002', element: 'H', x: 680 / 900, y: 160 / 700, radius: 56 / 700 },
    { id: 'atom-004', element: 'H', x: 225 / 900, y: 550 / 700, radius: 56 / 700 },
    { id: 'atom-005', element: 'H', x: 680 / 900, y: 545 / 700, radius: 56 / 700 },
  ];

  it('proposes exactly four unconfirmed candidates for the DEMO methane coordinates', () => {
    const candidates = proposeBondCandidates(demoMethane);

    expect(candidates).toHaveLength(4);
    expect(candidates.every(({ reviewStatus }) => reviewStatus === 'unconfirmed')).toBe(true);
    expect(candidates.every(({ order }) => order === 1)).toBe(true);
    expect(candidates.map(({ atomIds }) => atomIds)).toEqual([
      ['atom-001', 'atom-003'],
      ['atom-002', 'atom-003'],
      ['atom-003', 'atom-004'],
      ['atom-003', 'atom-005'],
    ]);
  });

  it('returns deterministic IDs independent of input order', () => {
    const imageGeometry = { imageWidth: 900, imageHeight: 700 };
    const first = proposeBondCandidates(demoMethane, imageGeometry);
    const second = proposeBondCandidates([...demoMethane].reverse(), imageGeometry);

    expect(second).toEqual(first);
    expect(new Set(first.map(({ id }) => id)).size).toBe(first.length);
  });

  it('uses optional image dimensions to correct normalized-coordinate aspect ratio', () => {
    const atoms = [
      atom('a', 0.4, 0.5, 0.05),
      atom('b', 0.6, 0.5, 0.05),
    ];

    expect(proposeBondCandidates(atoms)).toHaveLength(1);
    expect(proposeBondCandidates(atoms, { imageWidth: 200, imageHeight: 100 })).toEqual([]);
  });

  it('never creates self-bonds or duplicate bonds', () => {
    const candidates = proposeBondCandidates([
      atom('a', 0.4, 0.5),
      atom('b', 0.5, 0.5),
      atom('c', 0.6, 0.5),
    ]);
    const keys = candidates.map(({ atomIds }) => atomIds.join('|'));

    expect(keys.every((key) => key.split('|')[0] !== key.split('|')[1])).toBe(true);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('physical graph integrity', () => {
  it('does not accept an unconfirmed geometry candidate as a graph bond', () => {
    const unconfirmed = {
      id: 'candidate-a-b',
      atomIds: ['a', 'b'],
      order: 1,
      reviewStatus: 'unconfirmed',
      source: 'geometry',
    } as unknown as ConfirmedBond;

    expect(() => createPhysicalGraph([atom('a'), atom('b')], [unconfirmed]))
      .toThrow(/confirmed/i);
  });

  it('rejects self, duplicate, and unknown-atom confirmed bonds', () => {
    const atoms = [atom('a'), atom('b')];

    expect(() => createPhysicalGraph(atoms, [confirmedBond('a', 'a')])).toThrow(/self/i);
    expect(() => createPhysicalGraph(atoms, [
      confirmedBond('a', 'b'),
      confirmedBond('b', 'a'),
    ])).toThrow(/duplicate/i);
    expect(() => createPhysicalGraph(atoms, [confirmedBond('a', 'missing')])).toThrow(/unknown/i);
  });
});
