import type {
  AtomSelectionMode,
  GeometryMeasurementResult,
  Molecule3DInput,
  SelectedAtom3D,
} from '../types/molecule';
import { parseStrictV2000Layout } from '../chemistry/v2000MolBlock';

const FLOAT_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?$/;

export type BondedAtomPair = readonly [number, number];

export function formatAtom3DLabel(atom: SelectedAtom3D, includeIndex = true): string {
  return includeIndex ? `${atom.element}${atom.atomIndex}` : atom.element;
}

export function getRequiredAtomCount(mode: AtomSelectionMode): number {
  if (mode === 'bond_length') {
    return 2;
  }

  if (mode === 'bond_angle') {
    return 3;
  }

  return 0;
}

export function parseAtomsFromMolecule3DInput(
  input: Molecule3DInput | null | undefined,
): SelectedAtom3D[] {
  if (!input?.data.trim()) {
    return [];
  }

  if (input.coordinateDimension !== '3d') {
    return [];
  }

  switch (input.format) {
    case 'xyz':
      return parseXyzAtoms(input.data);
    case 'mol':
    case 'sdf':
      return parseV2000MolAtoms(input.data);
    case 'pdb':
      return parsePdbAtoms(input.data);
  }
}

export function parseBondedAtomPairsFromMolecule3DInput(
  input: Molecule3DInput | null | undefined,
): BondedAtomPair[] {
  if (
    !input?.data.trim() ||
    input.coordinateDimension !== '3d' ||
    (input.format !== 'mol' && input.format !== 'sdf')
  ) {
    return [];
  }

  const layout = parseStrictV2000Layout(input.data);
  if (!layout || layout.atomCount <= 0 || layout.bondCount <= 0) {
    return [];
  }

  const firstBondLineIndex = layout.countsLineIndex + 1 + layout.atomCount;
  const pairs: BondedAtomPair[] = [];
  const seen = new Set<string>();

  for (let offset = 0; offset < layout.bondCount; offset += 1) {
    const line = layout.lines[firstBondLineIndex + offset];
    const first = Number(line?.slice(0, 3));
    const second = Number(line?.slice(3, 6));
    const order = Number(line?.slice(6, 9));

    if (
      !line ||
      !Number.isInteger(first) ||
      !Number.isInteger(second) ||
      !Number.isInteger(order) ||
      first <= 0 ||
      second <= 0 ||
      first > layout.atomCount ||
      second > layout.atomCount ||
      first === second ||
      order <= 0
    ) {
      return [];
    }

    const pair: BondedAtomPair = first < second ? [first, second] : [second, first];
    const key = `${pair[0]}:${pair[1]}`;
    if (!seen.has(key)) {
      seen.add(key);
      pairs.push(pair);
    }
  }

  return pairs.sort((left, right) => left[0] - right[0] || left[1] - right[1]);
}

export function isBondedMeasurementSelection(
  mode: Exclude<AtomSelectionMode, 'none'>,
  atomIndices: number[],
  bondedPairs: readonly BondedAtomPair[],
): boolean {
  const distinctIndices = new Set(atomIndices);
  if (distinctIndices.size !== atomIndices.length) {
    return false;
  }

  const hasPair = (first: number, second: number) => {
    const low = Math.min(first, second);
    const high = Math.max(first, second);
    return bondedPairs.some(([left, right]) => left === low && right === high);
  };

  if (mode === 'bond_length') {
    return atomIndices.length === 2 && hasPair(atomIndices[0], atomIndices[1]);
  }

  return (
    atomIndices.length === 3 &&
    hasPair(atomIndices[0], atomIndices[1]) &&
    hasPair(atomIndices[1], atomIndices[2])
  );
}

export function calculateDistanceAngstrom(
  first: SelectedAtom3D,
  second: SelectedAtom3D,
): number {
  const dx = second.x - first.x;
  const dy = second.y - first.y;
  const dz = second.z - first.z;

  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function calculateAngleDegree(
  first: SelectedAtom3D,
  center: SelectedAtom3D,
  third: SelectedAtom3D,
): number {
  const ba = {
    x: first.x - center.x,
    y: first.y - center.y,
    z: first.z - center.z,
  };
  const bc = {
    x: third.x - center.x,
    y: third.y - center.y,
    z: third.z - center.z,
  };
  const baLength = Math.sqrt(ba.x * ba.x + ba.y * ba.y + ba.z * ba.z);
  const bcLength = Math.sqrt(bc.x * bc.x + bc.y * bc.y + bc.z * bc.z);

  if (baLength === 0 || bcLength === 0) {
    throw new Error('Cannot calculate an angle with overlapping atom coordinates.');
  }

  const cosine =
    (ba.x * bc.x + ba.y * bc.y + ba.z * bc.z) / (baLength * bcLength);
  const clampedCosine = Math.min(1, Math.max(-1, cosine));

  return (Math.acos(clampedCosine) * 180) / Math.PI;
}

export function buildGeometryMeasurementResult(input: {
  mode: Exclude<AtomSelectionMode, 'none'>;
  atoms: SelectedAtom3D[];
  sourceNote: string;
}): GeometryMeasurementResult {
  if (input.mode === 'bond_length') {
    const [first, second] = input.atoms;

    if (!first || !second) {
      throw new Error('Bond length measurement requires exactly two atoms.');
    }

    return {
      type: 'bond_length',
      atomIndices: [first.atomIndex, second.atomIndex],
      atomLabels: [formatAtom3DLabel(first), formatAtom3DLabel(second)],
      value: calculateDistanceAngstrom(first, second),
      unit: 'angstrom',
      sourceNote: input.sourceNote,
    };
  }

  const [first, center, third] = input.atoms;

  if (!first || !center || !third) {
    throw new Error('Bond angle measurement requires exactly three atoms.');
  }

  return {
    type: 'bond_angle',
    atomIndices: [first.atomIndex, center.atomIndex, third.atomIndex],
    atomLabels: [
      formatAtom3DLabel(first),
      formatAtom3DLabel(center),
      formatAtom3DLabel(third),
    ],
    value: calculateAngleDegree(first, center, third),
    unit: 'degree',
    sourceNote: input.sourceNote,
  };
}

function parseXyzAtoms(data: string): SelectedAtom3D[] {
  const lines = data.split(/\r?\n/);
  const atomCount = Number(lines[0]?.trim());

  if (!Number.isInteger(atomCount) || atomCount <= 0) {
    return [];
  }

  const parsedAtoms = lines
    .slice(2, 2 + atomCount)
    .map((line, index) => {
      const atom = parseCoordinateTokens(line);

      return atom ? { ...atom, atomIndex: index + 1 } : null;
    });

  if (parsedAtoms.length !== atomCount || parsedAtoms.some((atom) => atom === null)) {
    return [];
  }

  return parsedAtoms as SelectedAtom3D[];
}

function parseV2000MolAtoms(data: string): SelectedAtom3D[] {
  const layout = parseStrictV2000Layout(data);

  if (!layout) {
    return [];
  }

  const { lines, countsLineIndex, atomCount } = layout;

  if (atomCount <= 0) {
    return [];
  }

  const parsedAtoms = lines
    .slice(countsLineIndex + 1, countsLineIndex + 1 + atomCount)
    .map((line, index) => {
      const atom = parseCoordinateTokens(line);

      return atom ? { ...atom, atomIndex: index + 1 } : null;
    });

  if (parsedAtoms.length !== atomCount || parsedAtoms.some((atom) => atom === null)) {
    return [];
  }

  return parsedAtoms as SelectedAtom3D[];
}

function parsePdbAtoms(data: string): SelectedAtom3D[] {
  const atomLines = data
    .split(/\r?\n/)
    .filter((line) => line.startsWith('ATOM') || line.startsWith('HETATM'));
  const parsedAtoms = atomLines
    .map((line) => {
      const serial = Number(line.slice(6, 11).trim());
      const x = Number(line.slice(30, 38).trim());
      const y = Number(line.slice(38, 46).trim());
      const z = Number(line.slice(46, 54).trim());
      const rawElement =
        line.slice(76, 78).trim() || line.slice(12, 16).replace(/[^A-Za-z]/g, '');
      const element = normalizeElement(rawElement);

      if (!element || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        return null;
      }

      return {
        atomIndex: Number.isInteger(serial) && serial > 0 ? serial : null,
        element,
        x,
        y,
        z,
      };
    })
    .map((atom, index) =>
      atom ? { ...atom, atomIndex: atom.atomIndex ?? index + 1 } : null,
    );

  if (atomLines.length === 0 || parsedAtoms.some((atom) => atom === null)) {
    return [];
  }

  return parsedAtoms as SelectedAtom3D[];
}

function parseCoordinateTokens(line: string): Omit<SelectedAtom3D, 'atomIndex'> | null {
  const tokens = line.trim().split(/\s+/);

  if (tokens.length < 4) {
    return null;
  }

  let element: string | null = null;
  let x: number;
  let y: number;
  let z: number;

  if (isNumeric(tokens[0]) && isNumeric(tokens[1]) && isNumeric(tokens[2])) {
    x = Number(tokens[0]);
    y = Number(tokens[1]);
    z = Number(tokens[2]);
    element = normalizeElement(tokens[3]);
  } else {
    element = normalizeElement(tokens[0]);
    x = Number(tokens[1]);
    y = Number(tokens[2]);
    z = Number(tokens[3]);
  }

  if (!element || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    return null;
  }

  return { element, x, y, z };
}

function normalizeElement(value: string): string | null {
  const letters = value.trim().replace(/[^A-Za-z]/g, '');

  if (!letters) {
    return null;
  }

  return `${letters[0].toUpperCase()}${letters.slice(1, 2).toLowerCase()}`;
}

function isNumeric(value: string): boolean {
  return FLOAT_PATTERN.test(value);
}
