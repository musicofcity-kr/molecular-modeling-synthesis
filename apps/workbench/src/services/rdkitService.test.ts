import { describe, expect, it } from 'vitest';
import { moleculeExamples } from '../chemistry/examples';
import {
  getRDKitInitializationCountForTests,
  initializeRDKit,
  resetRDKitForTests,
  validateMoleculeInput,
} from './rdkitService';

const ethanolMolBlock = [
  '',
  '     RDKit          2D',
  '',
  '  3  2  0  0  0  0  0  0  0  0999 V2000',
  '    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0',
  '    1.2990    0.7500    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0',
  '    2.5981   -0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0',
  '  1  2  1  0',
  '  2  3  1  0',
  'M  END',
].join('\n');

const explicitHydrogenMethaneMolBlock = [
  'methane with explicit hydrogens',
  '  Ketcher 72926  9 52D 1   1.00000     0.00000     0',
  '',
  '  5  4  0  0  0  0  0  0  0  0999 V2000',
  '   16.3703   -2.8413    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0',
  '   15.3850   -2.6702    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0',
  '   16.5413   -1.8560    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0',
  '   16.1993   -3.8265    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0',
  '   17.3556   -3.0123    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0',
  '  1  2  1  0  0  0',
  '  1  3  1  0  0  0',
  '  1  4  1  0  0  0',
  '  1  5  1  0  0  0',
  'M  END',
].join('\n');

const hydrogenMolBlock = [
  'hydrogen',
  '  Workbench',
  '',
  '  2  1  0  0  0  0  0  0  0  0999 V2000',
  '    0.0000    0.0000    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0',
  '    0.7400    0.0000    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0',
  '  1  2  1  0  0  0',
  'M  END',
].join('\n');

async function createMolBlockWithHydrogens(smiles: string): Promise<string> {
  const rdkit = await initializeRDKit();
  const molecule = rdkit.get_mol(smiles);

  if (!molecule || !molecule.is_valid()) {
    molecule?.delete();
    throw new Error(`Could not create an explicit-hydrogen fixture from ${smiles}.`);
  }

  try {
    return molecule.add_hs();
  } finally {
    molecule.delete();
  }
}

function queryBondMolBlock(bondType: number): string {
  return [
    `query bond ${bondType}`,
    '  Workbench',
    '',
    '  2  1  0  0  0  0            999 V2000',
    '    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0',
    '    1.5000    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0',
    `  1  2  ${bondType}  0  0  0  0`,
    'M  END',
  ].join('\n');
}

function queryPropertyMolBlock(
  propertyLine: string,
  header: { title?: string; comment?: string } = {},
): string {
  return [
    header.title ?? 'query property',
    '  Workbench',
    header.comment ?? '',
    '  2  1  0  0  0  0            999 V2000',
    '    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0',
    '    1.5000    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0',
    '  1  2  1  0  0  0  0',
    propertyLine,
    'M  END',
  ].join('\n');
}

const documentedClassroomFixtures = [
  {
    name: 'water',
    smiles: 'O',
    expectedCanonicalSmiles: 'O',
    expectedFormula: 'H2O',
    expectedAverageMolecularWeight: 18.015,
    exactMassForComparison: 18.01056,
  },
  {
    name: 'methane',
    smiles: 'C',
    expectedCanonicalSmiles: 'C',
    expectedFormula: 'CH4',
    expectedAverageMolecularWeight: 16.043,
    exactMassForComparison: 16.0313,
  },
  {
    name: 'ethanol',
    smiles: 'CCO',
    expectedCanonicalSmiles: 'CCO',
    expectedFormula: 'C2H6O',
    expectedAverageMolecularWeight: 46.069,
    exactMassForComparison: 46.04186,
  },
  {
    name: 'benzene',
    smiles: 'c1ccccc1',
    expectedCanonicalSmiles: 'c1ccccc1',
    expectedFormula: 'C6H6',
    expectedAverageMolecularWeight: 78.11399,
    exactMassForComparison: 78.04695,
  },
  {
    name: 'acetic acid',
    smiles: 'CC(=O)O',
    expectedCanonicalSmiles: 'CC(=O)O',
    expectedFormula: 'C2H4O2',
    expectedAverageMolecularWeight: 60.052,
    exactMassForComparison: 60.02112,
  },
  {
    name: 'aspirin',
    smiles: 'CC(=O)Oc1ccccc1C(=O)O',
    expectedCanonicalSmiles: 'CC(=O)Oc1ccccc1C(=O)O',
    expectedFormula: 'C9H8O4',
    expectedAverageMolecularWeight: 180.15899,
    exactMassForComparison: 180.04225,
  },
];

describe('validateMoleculeInput', () => {
  it('fails empty input without chemistry output', async () => {
    const result = await validateMoleculeInput({
      source: 'example',
      validationStatus: 'unvalidated',
    });

    expect(result.ok).toBe(false);
    expect(result.validationStatus).toBe('invalid');
    expect(result.molecularFormula).toBeUndefined();
    expect(result.molecularWeight).toBeUndefined();
    expect(result.canonicalSmiles).toBeUndefined();
    expect(result.studentMessage).toContain(
      '현재 구조는 계산에 사용할 수 있는 분자 구조로 확인되지 않았습니다',
    );
    expect(result.studentMessage).toContain('다시 2D 구조 분석하기');
    expect(result.developerLogs[0]).toContain('empty molecule input');
    expect(result.structureIntent).toBe('single-molecule');
    expect(result.graphSummary).toEqual({
      atomCount: 0,
      bondCount: 0,
      componentCount: 0,
      componentAtomCounts: [],
      isSingleComponent: false,
      isolatedAtomCount: 0,
    });
    expect(result.connectivityDecision).toMatchObject({
      status: 'empty',
      allowed: false,
    });
  });

  it('fails invalid SMILES without chemistry output', async () => {
    const result = await validateMoleculeInput({
      source: 'example',
      validationStatus: 'unvalidated',
      smiles: 'C1CC',
    });

    expect(result.ok).toBe(false);
    expect(result.validationStatus).toBe('invalid');
    expect(result.source).toBe('smiles');
    expect(result.molecularFormula).toBeUndefined();
    expect(result.molecularWeight).toBeUndefined();
    expect(result.canonicalSmiles).toBeUndefined();
    expect(result.developerLogs.length).toBeGreaterThan(0);
  });

  it.each(moleculeExamples)(
    'validates $labelKo fixture and computes formula',
    async (example) => {
      const result = await validateMoleculeInput({
        source: 'example',
        validationStatus: 'unvalidated',
        smiles: example.smiles,
        label: example.labelKo,
      });

      expect(result.ok).toBe(true);
      expect(result.validationStatus).toBe('valid');
      expect(result.source).toBe('smiles');
      expect(result.molecularFormula).toBe(example.expectedFormula);
      expect(result.molecularWeight).toBeGreaterThan(0);
      expect(result.canonicalSmiles).toBeTruthy();
      expect(result.errors).toEqual([]);
    },
  );

  it.each(documentedClassroomFixtures)(
    'matches documented RDKit outputs for $name',
    async (fixture) => {
      const result = await validateMoleculeInput({
        source: 'example',
        validationStatus: 'unvalidated',
        smiles: fixture.smiles,
      });

      expect(result.ok).toBe(true);
      expect(result.validationStatus).toBe('valid');
      expect(result.source).toBe('smiles');
      expect(result.canonicalSmiles).toBe(fixture.expectedCanonicalSmiles);
      expect(result.molecularFormula).toBe(fixture.expectedFormula);
      expect(result.molecularFormula).toMatch(/^([A-Z][a-z]?\d*)+$/);
      expect(result.molecularWeight).toBeCloseTo(
        fixture.expectedAverageMolecularWeight,
        3,
      );
      expect(result.molecularWeight).not.toBeCloseTo(
        fixture.exactMassForComparison,
        3,
      );
    },
  );

  it('validates matching V2000 MOL and SMILES data using the MOL block as source', async () => {
    const result = await validateMoleculeInput({
      source: 'ketcher',
      validationStatus: 'unvalidated',
      smiles: 'CCO',
      molBlock: ethanolMolBlock,
    });

    expect(result.ok).toBe(true);
    expect(result.source).toBe('mol-block');
    expect(result.canonicalSmiles).toBe('CCO');
    expect(result.molecularFormula).toBe('C2H6O');
    expect(result.molecularWeight).toBeCloseTo(46.069, 3);
    expect(result.molecularWeight).not.toBeCloseTo(46.04186, 3);
  });

  it('accepts Ketcher methane when explicit hydrogens are equivalent across MOL and SMILES', async () => {
    const result = await validateMoleculeInput({
      source: 'ketcher',
      validationStatus: 'unvalidated',
      smiles: 'C([H])([H])([H])[H]',
      molBlock: explicitHydrogenMethaneMolBlock,
    });

    expect(result.ok, result.developerLogs.join('\n')).toBe(true);

    if (result.ok) {
      expect(result.canonicalSmiles).toBe('C');
      expect(result.molecularFormula).toBe('CH4');
      expect(result.graphSummary).toMatchObject({
        atomCount: 5,
        bondCount: 4,
        componentCount: 1,
      });
    }
  });

  it('keeps isotopic hydrogen differences blocked during Ketcher cross-checking', async () => {
    const result = await validateMoleculeInput({
      source: 'ketcher',
      validationStatus: 'unvalidated',
      smiles: '[2H]C([H])([H])[H]',
      molBlock: explicitHydrogenMethaneMolBlock,
    });

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.studentMessage).toContain('동위원소 또는 라디칼');
      expect(result.developerLogs.join('\n')).toContain(
        'unsupported atom annotation',
      );
    }
  });

  it('keeps atom-mapped hydrogen differences blocked during Ketcher cross-checking', async () => {
    const result = await validateMoleculeInput({
      source: 'ketcher',
      validationStatus: 'unvalidated',
      smiles: '[H:7][C:1]([H])([H])[H]',
      molBlock: explicitHydrogenMethaneMolBlock,
    });

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.studentMessage).toContain('구조 검토가 필요합니다');
      expect(result.developerLogs.join('\n')).toContain(
        'Ketcher structure mismatch',
      );
    }
  });

  it('accepts matching stereochemistry after explicit-hydrogen normalization', async () => {
    const smiles = 'C[C@H](O)C(=O)O';
    const result = await validateMoleculeInput({
      source: 'ketcher',
      validationStatus: 'unvalidated',
      smiles,
      molBlock: await createMolBlockWithHydrogens(smiles),
    });

    expect(result.ok, result.developerLogs.join('\n')).toBe(true);
  });

  it('blocks opposite stereochemistry after explicit-hydrogen normalization', async () => {
    const result = await validateMoleculeInput({
      source: 'ketcher',
      validationStatus: 'unvalidated',
      smiles: 'C[C@@H](O)C(=O)O',
      molBlock: await createMolBlockWithHydrogens('C[C@H](O)C(=O)O'),
    });

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.studentMessage).toContain('구조 검토가 필요합니다');
      expect(result.developerLogs.join('\n')).toContain(
        'Ketcher structure mismatch',
      );
    }
  });

  it('keeps an all-hydrogen molecule valid while normalizing canonical structure keys', async () => {
    const result = await validateMoleculeInput({
      source: 'ketcher',
      validationStatus: 'unvalidated',
      smiles: '[H][H]',
      molBlock: hydrogenMolBlock,
    });

    expect(result.ok, result.developerLogs.join('\n')).toBe(true);

    if (result.ok) {
      expect(result.canonicalSmiles).toBe('[H][H]');
      expect(result.molecularFormula).toBe('H2');
      expect(result.graphSummary).toMatchObject({
        atomCount: 2,
        bondCount: 1,
        componentCount: 1,
      });
    }
  });

  it('validates beryllium chloride and displays its molecular formula', async () => {
    const result = await validateMoleculeInput({
      source: 'example',
      validationStatus: 'unvalidated',
      smiles: 'Cl[Be]Cl',
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.molecularFormula).toBe('BeCl2');
      expect(result.canonicalSmiles).toBe('[Cl][Be][Cl]');
    }
  });

  it('blocks mismatched Ketcher SMILES and MOL data for human review', async () => {
    const result = await validateMoleculeInput({
      source: 'ketcher',
      validationStatus: 'unvalidated',
      smiles: 'C',
      molBlock: ethanolMolBlock,
    });

    expect(result.ok).toBe(false);
    expect(result.validationStatus).toBe('invalid');

    if (!result.ok) {
      expect(result.studentMessage).toContain('구조 검토가 필요합니다');
      expect(result.developerLogs.join('\n')).toContain(
        'Ketcher structure mismatch',
      );
    }
  });

  it.each([
    {
      label: 'ozone',
      smiles: '[O-][O+]=O',
      expectedFormula: 'O3',
      expectedCanonicalSmiles: 'O=[O+][O-]',
    },
    {
      label: 'nitromethane',
      smiles: 'C[N+](=O)[O-]',
      expectedFormula: 'CH3NO2',
      expectedCanonicalSmiles: 'C[N+](=O)[O-]',
    },
  ])(
    'allows neutral charge-separated $label with an explicit warning',
    async ({ smiles, expectedFormula, expectedCanonicalSmiles }) => {
      const result = await validateMoleculeInput({
        source: 'example',
        validationStatus: 'unvalidated',
        smiles,
      });

      expect(result.ok).toBe(true);
      expect(result.molecularFormula).toBe(expectedFormula);
      expect(result.canonicalSmiles).toBe(expectedCanonicalSmiles);
      expect(result.warnings.join('\n')).toContain('전체 형식전하가 0');
      expect(result.warnings.join('\n')).toContain('전하 분리');
      expect(result.developerLogs.join('\n')).toContain(
        'neutral charge-separated structure',
      );
    },
  );

  it.each([
    { label: 'positive ammonium ion', smiles: '[NH4+]', netCharge: 1 },
    { label: 'negative chloride ion', smiles: '[Cl-]', netCharge: -1 },
  ])('fails closed for $label with nonzero net charge', async ({
    smiles,
    netCharge,
  }) => {
    const result = await validateMoleculeInput({
      source: 'example',
      validationStatus: 'unvalidated',
      smiles,
    });

    expect(result.ok).toBe(false);
    expect(result.validationStatus).toBe('invalid');
    expect(result.canonicalSmiles).toBeUndefined();
    expect(result.molecularFormula).toBeUndefined();
    expect(result.molecularWeight).toBeUndefined();
    expect(result.studentMessage).toContain('현재 교육용 계산 범위');
    expect(result.developerLogs.join('\n')).toContain(
      `net formal charge ${netCharge}`,
    );
  });

  it.each([
    { label: 'isotopic water', smiles: '[2H]O[2H]' },
    { label: 'carbon-13 methane', smiles: '[13CH4]' },
    { label: 'radical oxygen', smiles: '[O]' },
  ])('continues to fail closed for $label', async ({ smiles }) => {
    const result = await validateMoleculeInput({
      source: 'example',
      validationStatus: 'unvalidated',
      smiles,
    });

    expect(result.ok).toBe(false);
    expect(result.validationStatus).toBe('invalid');
    expect(result.canonicalSmiles).toBeUndefined();
    expect(result.molecularFormula).toBeUndefined();
    expect(result.molecularWeight).toBeUndefined();
    expect(result.studentMessage).toContain('현재 교육용 계산 범위');
    expect(result.developerLogs.join('\n')).toContain(
      'unsupported atom annotation',
    );
  });

  it.each([5, 6, 7, 8])(
    'blocks V2000 query or ambiguous bond type %s',
    async (bondType) => {
      const result = await validateMoleculeInput({
        source: 'import',
        validationStatus: 'unvalidated',
        molBlock: queryBondMolBlock(bondType),
      });

      expect(result.ok).toBe(false);
      expect(result.canonicalSmiles).toBeUndefined();
      expect(result.molecularFormula).toBeUndefined();
      expect(result.studentMessage).toContain('질의 또는 모호한 구조');
      expect(result.developerLogs.join('\n')).toContain(
        `V2000 query bond type ${bondType}`,
      );
    },
  );

  it.each([
    ['SUB', 'M  SUB  1   1   2'],
    ['UNS', 'M  UNS  1   1   1'],
    ['RBC', 'M  RBC  1   1   2'],
  ])(
    'blocks V2000 M %s query properties before calculating chemistry results',
    async (propertyTag, propertyLine) => {
      const result = await validateMoleculeInput({
        source: 'import',
        validationStatus: 'unvalidated',
        molBlock: queryPropertyMolBlock(propertyLine),
      });

      expect(result.ok).toBe(false);
      expect(result.canonicalSmiles).toBeUndefined();
      expect(result.molecularFormula).toBeUndefined();
      expect(result.molecularWeight).toBeUndefined();
      expect(result.studentMessage).toContain('질의 또는 모호한 구조');
      expect(result.developerLogs.join('\n')).toContain(
        `V2000 query property M ${propertyTag}`,
      );
    },
  );

  it.each([
    ['title text', { title: 'V2000 bypass title' }],
    [
      'counts-shaped comment',
      { comment: ' 99 99  0  0  0  0            999 V2000' },
    ],
  ])(
    'uses only the standard counts-line position when %s also contains V2000',
    async (_headerCase, header) => {
      const result = await validateMoleculeInput({
        source: 'import',
        validationStatus: 'unvalidated',
        molBlock: queryPropertyMolBlock('M  SUB  1   1   2', header),
      });

      expect(result.ok).toBe(false);
      expect(result.canonicalSmiles).toBeUndefined();
      expect(result.molecularFormula).toBeUndefined();
      expect(result.molecularWeight).toBeUndefined();
      expect(result.studentMessage).toContain('질의 또는 모호한 구조');
      expect(result.developerLogs.join('\n')).toContain(
        'V2000 query property M SUB',
      );
    },
  );

  it('blocks canonical query/dummy atoms instead of calculating a formula', async () => {
    const result = await validateMoleculeInput({
      source: 'example',
      validationStatus: 'unvalidated',
      smiles: '*',
    });

    expect(result.ok).toBe(false);
    expect(result.canonicalSmiles).toBeUndefined();
    expect(result.molecularFormula).toBeUndefined();
    expect(result.studentMessage).toContain('질의 또는 모호한 구조');
    expect(result.developerLogs.join('\n')).toContain(
      'unsupported canonical query feature',
    );
  });

  it('blocks a canonical any-bond marker even without a V2000 source', async () => {
    const result = await validateMoleculeInput({
      source: 'example',
      validationStatus: 'unvalidated',
      smiles: 'C~O',
    });

    expect(result.ok).toBe(false);
    expect(result.canonicalSmiles).toBeUndefined();
    expect(result.molecularFormula).toBeUndefined();
    expect(result.studentMessage).toContain('질의 또는 모호한 구조');
    expect(result.developerLogs.join('\n')).toContain(
      'unsupported canonical query feature: C~O',
    );
  });

  it('blocks disconnected fragments instead of presenting one combined formula', async () => {
    const result = await validateMoleculeInput({
      source: 'example',
      validationStatus: 'unvalidated',
      smiles: 'O.O',
    });

    expect(result.ok).toBe(false);
    expect(result.canonicalSmiles).toBeUndefined();
    expect(result.molecularFormula).toBeUndefined();
    expect(result.studentMessage).toContain('여러 조각');
    expect(result.developerLogs.join('\n')).toContain(
      'disconnected molecular fragments',
    );
  });

  it('reports four isolated carbon components and blocks single-molecule output', async () => {
    const result = await validateMoleculeInput({
      source: 'example',
      validationStatus: 'unvalidated',
      smiles: 'C.C.C.C',
      structureIntent: 'single-molecule',
    });

    expect(result.ok).toBe(false);
    expect(result.graphSummary).toEqual({
      atomCount: 4,
      bondCount: 0,
      componentCount: 4,
      componentAtomCounts: [1, 1, 1, 1],
      isSingleComponent: false,
      isolatedAtomCount: 4,
    });
    expect(result.connectivityDecision).toMatchObject({
      intent: 'single-molecule',
      status: 'multiple-components-blocked',
      allowed: false,
    });
    expect(result.molecularFormula).toBeUndefined();
    expect(result.molecularWeight).toBeUndefined();
    expect(result.studentMessage).toContain('원자 사이를 결합으로 연결');
  });

  it('reports one connected component for a linear four-carbon chain', async () => {
    const result = await validateMoleculeInput({
      source: 'example',
      validationStatus: 'unvalidated',
      smiles: 'CCCC',
      structureIntent: 'single-molecule',
    });

    expect(result.ok).toBe(true);
    expect(result.graphSummary).toEqual({
      atomCount: 4,
      bondCount: 3,
      componentCount: 1,
      componentAtomCounts: [4],
      isSingleComponent: true,
      isolatedAtomCount: 0,
    });
    expect(result.connectivityDecision).toMatchObject({
      intent: 'single-molecule',
      status: 'single-component',
      allowed: true,
    });
    expect(result.molecularFormula).toBe('C4H10');
  });

  it('allows ionic connectivity explicitly but blocks misleading combined calculation output', async () => {
    const result = await validateMoleculeInput({
      source: 'example',
      validationStatus: 'unvalidated',
      smiles: '[Na+].[Cl-]',
      structureIntent: 'ionic-compound',
    });

    expect(result.ok).toBe(false);
    expect(result.graphSummary).toEqual({
      atomCount: 2,
      bondCount: 0,
      componentCount: 2,
      componentAtomCounts: [1, 1],
      isSingleComponent: false,
      isolatedAtomCount: 2,
    });
    expect(result.connectivityDecision).toMatchObject({
      intent: 'ionic-compound',
      status: 'multiple-components-allowed',
      allowed: true,
    });
    expect(result.molecularFormula).toBeUndefined();
    expect(result.molecularWeight).toBeUndefined();
    expect(result.studentMessage).toContain('하나의 분자식과 분자량으로 계산하지 않습니다');
  });

  it('reuses a single RDKit initialization for repeated validation', async () => {
    resetRDKitForTests();

    await validateMoleculeInput({
      source: 'example',
      validationStatus: 'unvalidated',
      smiles: 'O',
    });
    await validateMoleculeInput({
      source: 'example',
      validationStatus: 'unvalidated',
      smiles: 'C',
    });

    expect(getRDKitInitializationCountForTests()).toBe(1);
  });
});
