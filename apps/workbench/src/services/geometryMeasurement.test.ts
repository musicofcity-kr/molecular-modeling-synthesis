import { describe, expect, it } from 'vitest';
import {
  buildGeometryMeasurementResult,
  calculateAngleDegree,
  calculateDistanceAngstrom,
  getRequiredAtomCount,
  isBondedMeasurementSelection,
  parseAtomsFromMolecule3DInput,
  parseBondedAtomPairsFromMolecule3DInput,
} from './geometryMeasurement';
import type { SelectedAtom3D } from '../types/molecule';

const waterSdf = `water static 3D example
  Workbench

  3  2  0  0  0  0  0  0  0  0999 V2000
    0.0000    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
    0.9572    0.0000    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
   -0.2390    0.9270    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0
  1  3  1  0
M  END
$$$$`;

const atom = (
  atomIndex: number,
  element: string,
  x: number,
  y: number,
  z: number,
): SelectedAtom3D => ({ atomIndex, element, x, y, z });

describe('geometryMeasurement', () => {
  it('parses V2000 SDF atom coordinates with stable 1-based indices', () => {
    const atoms = parseAtomsFromMolecule3DInput({
      format: 'sdf',
      data: waterSdf,
      label: '물',
      sourceType: 'static-example',
      coordinateDimension: '3d',
      coordinateSource: '예제 내장 3D 구조',
    });

    expect(atoms).toEqual([
      { atomIndex: 1, element: 'O', x: 0, y: 0, z: 0 },
      { atomIndex: 2, element: 'H', x: 0.9572, y: 0, z: 0 },
      { atomIndex: 3, element: 'H', x: -0.239, y: 0.927, z: 0 },
    ]);
  });

  it('parses the SDF bond table and permits only bonded distance and centered angle selections', () => {
    const input = {
      format: 'sdf' as const,
      data: waterSdf,
      label: '물',
      sourceType: 'pubchem' as const,
      coordinateDimension: '3d' as const,
      structureMatchStatus: 'verified' as const,
      coordinateSource: 'PubChem CID 962',
    };
    const pairs = parseBondedAtomPairsFromMolecule3DInput(input);

    expect(pairs).toEqual([
      [1, 2],
      [1, 3],
    ]);
    expect(isBondedMeasurementSelection('bond_length', [1, 2], pairs)).toBe(true);
    expect(isBondedMeasurementSelection('bond_length', [2, 3], pairs)).toBe(false);
    expect(isBondedMeasurementSelection('bond_angle', [2, 1, 3], pairs)).toBe(true);
    expect(isBondedMeasurementSelection('bond_angle', [1, 2, 3], pairs)).toBe(false);
    expect(isBondedMeasurementSelection('bond_angle', [2, 1, 2], pairs)).toBe(false);
  });

  it('ignores V2000 text in the title and reads coordinates from the standard counts line', () => {
    const atoms = parseAtomsFromMolecule3DInput({
      format: 'sdf',
      data: waterSdf.replace(
        'water static 3D example',
        'V2000 title is not a counts line',
      ),
      label: '물',
      sourceType: 'static-example',
      coordinateDimension: '3d',
      coordinateSource: '예제 내장 3D 구조',
    });

    expect(atoms).toHaveLength(3);
    expect(atoms.map((item) => item.element)).toEqual(['O', 'H', 'H']);
  });

  it('parses XYZ atom coordinates', () => {
    const atoms = parseAtomsFromMolecule3DInput({
      format: 'xyz',
      data: '3\nwater\nO 0 0 0\nH 0 0 1\nH 1 0 0',
      label: '물',
      sourceType: 'static-example',
      coordinateDimension: '3d',
      coordinateSource: '예제 내장 3D 구조',
    });

    expect(atoms.map((item) => `${item.element}${item.atomIndex}`)).toEqual([
      'O1',
      'H2',
      'H3',
    ]);
  });

  it('does not parse measurement atoms from 2D or unclassified coordinate data', () => {
    expect(
      parseAtomsFromMolecule3DInput({
        format: 'sdf',
        data: waterSdf,
        label: '물',
        sourceType: 'review-needed',
        coordinateDimension: '2d',
        coordinateSource: 'Ketcher 2D MOL block',
      }),
    ).toEqual([]);

    expect(
      parseAtomsFromMolecule3DInput({
        format: 'sdf',
        data: waterSdf,
        label: '물',
        sourceType: 'review-needed',
        coordinateDimension: 'unknown',
        coordinateSource: '분류되지 않은 가져오기',
      }),
    ).toEqual([]);
  });

  it('rejects partial V2000 atom parsing to avoid mismatched atom indices', () => {
    const malformedSdf = waterSdf.replace(
      '    0.9572    0.0000    0.0000 H',
      '    not-a-number    0.0000    0.0000 H',
    );

    const atoms = parseAtomsFromMolecule3DInput({
      format: 'sdf',
      data: malformedSdf,
      label: '물',
      sourceType: 'static-example',
      coordinateDimension: '3d',
      coordinateSource: '예제 내장 3D 구조',
    });

    expect(atoms).toEqual([]);
  });

  it('calculates atom distance in angstrom-like coordinate units', () => {
    const distance = calculateDistanceAngstrom(
      atom(1, 'C', 0, 0, 0),
      atom(2, 'H', 0, 0, 1.09),
    );

    expect(distance).toBeCloseTo(1.09, 4);
  });

  it('calculates bond angle using the second selected atom as the center', () => {
    const angle = calculateAngleDegree(
      atom(2, 'H', 1, 0, 0),
      atom(1, 'C', 0, 0, 0),
      atom(3, 'H', 0, 1, 0),
    );

    expect(angle).toBeCloseTo(90, 4);
  });

  it('builds classroom-labeled distance and angle results', () => {
    const sourceNote =
      '현재 로드된 3D 좌표 기준 측정값입니다. 정밀 실험값으로 사용하지 마세요.';

    expect(
      buildGeometryMeasurementResult({
        mode: 'bond_length',
        atoms: [atom(1, 'C', 0, 0, 0), atom(2, 'H', 0, 0, 1)],
        sourceNote,
      }),
    ).toMatchObject({
      type: 'bond_length',
      atomIndices: [1, 2],
      atomLabels: ['C1', 'H2'],
      unit: 'angstrom',
      sourceNote,
    });

    expect(
      buildGeometryMeasurementResult({
        mode: 'bond_angle',
        atoms: [
          atom(2, 'H', 1, 0, 0),
          atom(1, 'C', 0, 0, 0),
          atom(3, 'H', 0, 1, 0),
        ],
        sourceNote,
      }),
    ).toMatchObject({
      type: 'bond_angle',
      atomIndices: [2, 1, 3],
      atomLabels: ['H2', 'C1', 'H3'],
      unit: 'degree',
      sourceNote,
    });
  });

  it('reports required atom counts for measurement modes', () => {
    expect(getRequiredAtomCount('none')).toBe(0);
    expect(getRequiredAtomCount('bond_length')).toBe(2);
    expect(getRequiredAtomCount('bond_angle')).toBe(3);
  });
});
