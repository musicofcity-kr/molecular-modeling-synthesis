import type { SupportedElement } from './atomDetection';

export type BondOrder = 1 | 2 | 3;
export type StructureIntent = 'single-molecule' | 'ionic-compound' | 'mixture';

export interface BondAtom {
  id: string;
  element: SupportedElement;
  /** Horizontal position normalized to the original image width. */
  x: number;
  /** Vertical position normalized to the original image height. */
  y: number;
  /** Approximate sphere radius normalized to the shorter image side. */
  radius: number;
}

export interface BondCandidate {
  id: string;
  atomIds: readonly [string, string];
  order: BondOrder;
  reviewStatus: 'unconfirmed';
  source: 'geometry';
  /** Image-relative center distance. This is not a physical bond length. */
  normalizedDistance: number;
}

export interface ConfirmedBond {
  id: string;
  atomIds: readonly [string, string];
  order: BondOrder;
  reviewStatus: 'confirmed';
  source: 'geometry' | 'manual';
}

export interface PhysicalGraph {
  source: 'physical-model';
  revision: number;
  atoms: readonly BondAtom[];
  /** Only bonds explicitly confirmed by a student belong in this list. */
  bonds: readonly ConfirmedBond[];
}

export interface MoleculeGraphSummary {
  atomCount: number;
  bondCount: number;
  componentCount: number;
  componentAtomCounts: number[];
  isSingleComponent: boolean;
  isolatedAtomCount: number;
}

export interface ConnectivityDecision {
  ok: boolean;
  status:
    | 'empty'
    | 'single-component'
    | 'multiple-components-allowed'
    | 'multiple-components-blocked';
  intent: StructureIntent;
  summary: MoleculeGraphSummary;
  warnings: string[];
  errors: string[];
}

export interface BondCandidateOptions {
  /** Maximum center distance divided by the sum of the two sphere radii. */
  maximumRadiusRatio?: number;
  /** Original image dimensions, used together to correct normalized x/y aspect ratio. */
  imageWidth?: number;
  imageHeight?: number;
}

const compareIds = (left: string, right: string) =>
  left === right ? 0 : left < right ? -1 : 1;

function canonicalAtomPair(
  atomIdA: string,
  atomIdB: string,
): readonly [string, string] {
  return compareIds(atomIdA, atomIdB) <= 0
    ? [atomIdA, atomIdB]
    : [atomIdB, atomIdA];
}

function pairKey(atomIdA: string, atomIdB: string): string {
  const [left, right] = canonicalAtomPair(atomIdA, atomIdB);
  return `${left.length}:${left}|${right.length}:${right}`;
}

/** Produces an unambiguous ID from stable atom IDs, independent of pair order. */
export function createStableBondId(atomIdA: string, atomIdB: string): string {
  return `bond-${pairKey(atomIdA, atomIdB)}`;
}

function assertUniqueAtoms(atoms: readonly BondAtom[]): void {
  const ids = new Set<string>();
  for (const atom of atoms) {
    if (!atom.id) throw new Error('Atom IDs must be non-empty.');
    if (ids.has(atom.id)) throw new Error(`Duplicate atom ID: ${atom.id}`);
    if (![atom.x, atom.y, atom.radius].every(Number.isFinite) || atom.radius <= 0) {
      throw new Error(`Invalid geometry for atom: ${atom.id}`);
    }
    ids.add(atom.id);
  }
}

/**
 * Suggests image-geometry candidates only. No element valence or chemistry
 * validity is inferred here, and every result requires student confirmation.
 */
export function proposeBondCandidates(
  atoms: readonly BondAtom[],
  options: BondCandidateOptions = {},
): BondCandidate[] {
  assertUniqueAtoms(atoms);
  const maximumRadiusRatio = options.maximumRadiusRatio ?? 2.25;
  if (!Number.isFinite(maximumRadiusRatio) || maximumRadiusRatio <= 0) {
    throw new Error('maximumRadiusRatio must be a positive finite number.');
  }
  const hasImageWidth = options.imageWidth !== undefined;
  const hasImageHeight = options.imageHeight !== undefined;
  if (hasImageWidth !== hasImageHeight) {
    throw new Error('imageWidth and imageHeight must be provided together.');
  }
  if (
    hasImageWidth &&
    (!Number.isFinite(options.imageWidth) ||
      !Number.isFinite(options.imageHeight) ||
      (options.imageWidth ?? 0) <= 0 ||
      (options.imageHeight ?? 0) <= 0)
  ) {
    throw new Error('Image dimensions must be positive finite numbers.');
  }
  const shorterImageSide = hasImageWidth
    ? Math.min(options.imageWidth ?? 1, options.imageHeight ?? 1)
    : 1;
  const horizontalScale = hasImageWidth ? (options.imageWidth ?? 1) / shorterImageSide : 1;
  const verticalScale = hasImageHeight ? (options.imageHeight ?? 1) / shorterImageSide : 1;

  const orderedAtoms = [...atoms].sort((left, right) => compareIds(left.id, right.id));
  const candidates: BondCandidate[] = [];

  for (let leftIndex = 0; leftIndex < orderedAtoms.length; leftIndex += 1) {
    const left = orderedAtoms[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < orderedAtoms.length; rightIndex += 1) {
      const right = orderedAtoms[rightIndex];
      const normalizedDistance = Math.hypot(
        (left.x - right.x) * horizontalScale,
        (left.y - right.y) * verticalScale,
      );
      const candidateLimit = (left.radius + right.radius) * maximumRadiusRatio;
      if (normalizedDistance > candidateLimit) continue;

      const atomIds = canonicalAtomPair(left.id, right.id);
      candidates.push({
        id: createStableBondId(atomIds[0], atomIds[1]),
        atomIds,
        order: 1,
        reviewStatus: 'unconfirmed',
        source: 'geometry',
        normalizedDistance: Number(normalizedDistance.toFixed(6)),
      });
    }
  }

  return candidates;
}

export function createPhysicalGraph(
  atoms: readonly BondAtom[],
  bonds: readonly ConfirmedBond[],
  revision = 1,
): PhysicalGraph {
  assertUniqueAtoms(atoms);
  if (!Number.isInteger(revision) || revision < 1) {
    throw new Error('Physical graph revision must be a positive integer.');
  }

  const atomIds = new Set(atoms.map(({ id }) => id));
  const bondIds = new Set<string>();
  const endpointPairs = new Set<string>();
  const normalizedBonds = bonds.map((bond): ConfirmedBond => {
    const [atomIdA, atomIdB] = bond.atomIds;
    if (bond.reviewStatus !== 'confirmed') {
      throw new Error(`Only confirmed bonds can enter a Physical graph: ${bond.id}`);
    }
    if (atomIdA === atomIdB) throw new Error(`Self bond is not allowed: ${atomIdA}`);
    if (!atomIds.has(atomIdA) || !atomIds.has(atomIdB)) {
      throw new Error(`Bond references an unknown atom: ${atomIdA}, ${atomIdB}`);
    }
    if (bondIds.has(bond.id)) throw new Error(`Duplicate bond ID: ${bond.id}`);

    const endpoints = pairKey(atomIdA, atomIdB);
    if (endpointPairs.has(endpoints)) {
      throw new Error(`Duplicate bond endpoints: ${atomIdA}, ${atomIdB}`);
    }
    if (bond.order !== 1 && bond.order !== 2 && bond.order !== 3) {
      throw new Error(`Unsupported bond order: ${String(bond.order)}`);
    }

    bondIds.add(bond.id);
    endpointPairs.add(endpoints);
    return { ...bond, atomIds: canonicalAtomPair(atomIdA, atomIdB) };
  });

  return {
    source: 'physical-model',
    revision,
    atoms: atoms
      .map((atom) => ({ ...atom }))
      .sort((left, right) => compareIds(left.id, right.id)),
    bonds: normalizedBonds.sort((left, right) => compareIds(left.id, right.id)),
  };
}

/** Counts connected components with an iterative depth-first traversal. */
export function summarizePhysicalGraph(graph: PhysicalGraph): MoleculeGraphSummary {
  const adjacency = new Map(graph.atoms.map(({ id }) => [id, new Set<string>()]));
  for (const { atomIds: [atomIdA, atomIdB] } of graph.bonds) {
    adjacency.get(atomIdA)?.add(atomIdB);
    adjacency.get(atomIdB)?.add(atomIdA);
  }

  const isolatedAtomCount = [...adjacency.values()].filter((neighbors) => neighbors.size === 0).length;
  const visited = new Set<string>();
  const componentAtomCounts: number[] = [];

  for (const atomId of [...adjacency.keys()].sort(compareIds)) {
    if (visited.has(atomId)) continue;
    let componentSize = 0;
    const stack = [atomId];
    visited.add(atomId);

    while (stack.length > 0) {
      const current = stack.pop();
      if (current === undefined) break;
      componentSize += 1;
      for (const neighbor of adjacency.get(current) ?? []) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        stack.push(neighbor);
      }
    }
    componentAtomCounts.push(componentSize);
  }

  componentAtomCounts.sort((left, right) => right - left);
  return {
    atomCount: graph.atoms.length,
    bondCount: graph.bonds.length,
    componentCount: componentAtomCounts.length,
    componentAtomCounts,
    isSingleComponent: graph.atoms.length > 0 && componentAtomCounts.length === 1,
    isolatedAtomCount,
  };
}

export function decideGraphConnectivity(
  graph: PhysicalGraph,
  intent: StructureIntent = 'single-molecule',
): ConnectivityDecision {
  const summary = summarizePhysicalGraph(graph);
  if (summary.atomCount === 0) {
    return {
      ok: false,
      status: 'empty',
      intent,
      summary,
      warnings: [],
      errors: ['원자가 없어 Physical Model graph를 완료할 수 없습니다.'],
    };
  }

  if (summary.isSingleComponent) {
    return {
      ok: true,
      status: 'single-component',
      intent,
      summary,
      warnings: [],
      errors: [],
    };
  }

  if (intent === 'ionic-compound' || intent === 'mixture') {
    return {
      ok: true,
      status: 'multiple-components-allowed',
      intent,
      summary,
      warnings: [
        intent === 'ionic-compound'
          ? '여러 연결 조각을 이온/화학식 단위 표현으로 허용했습니다.'
          : '여러 연결 조각을 혼합물 표현으로 허용했습니다.',
      ],
      errors: [],
    };
  }

  return {
    ok: false,
    status: 'multiple-components-blocked',
    intent,
    summary,
    warnings: [],
    errors: [
      `하나의 분자에는 연결 조각이 1개여야 합니다. 현재 ${summary.componentCount}개입니다.`,
    ],
  };
}
