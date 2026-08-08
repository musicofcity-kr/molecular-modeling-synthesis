import { forwardRef, useImperativeHandle } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { ChemicalEditorHandle } from '../editor/chemical-editor-handle';
import type { MoleculeValidationResult } from '../types/molecule';
import type { PubChem3DLookupResult } from '../services/pubchem3d';
import {
  buildSimple3DInput,
  createInitialSimpleDerivedState,
  getSimple3DOutputButtonLabel,
  getSimpleExampleMolecules,
  invalidateSimpleDerivedState,
  isSimple3DOutputDisabled,
  isSimpleAnalysisRequestCurrent,
  loadSimpleExternal3DForValidatedExample,
  resolveSimpleExampleForValidatedStructure,
  SimpleMoleculeModeler,
} from './SimpleMoleculeModeler';

const mockFetchPubChem3DSdf = vi.hoisted(() => vi.fn());

vi.mock('../services/pubchem3d', () => ({
  fetchPubChem3DSdf: mockFetchPubChem3DSdf,
}));

vi.mock('../components/editor/KetcherEditor', () => ({
  KetcherEditor: forwardRef<ChemicalEditorHandle>(function MockKetcherEditor(
    _props,
    ref,
  ) {
    useImperativeHandle(ref, () => ({
      async getSmiles() {
        return 'O';
      },
      async getMolfile() {
        return '';
      },
      async extractStructure() {
        return {
          source: 'ketcher',
          validationStatus: 'unvalidated',
          smiles: 'O',
          molBlock: '',
          extractedAt: '2026-07-30T00:00:00.000Z',
        };
      },
      async setMolecule() {},
      async clear() {},
    }));

    return (
      <section data-testid="chemical-editor">
        <span data-testid="chemical-editor-status">그리기 도구 준비됨</span>
      </section>
    );
  }),
  normalizeKetcherError: (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback,
}));

vi.mock('../components/Vsepr3DModelViewer', () => ({
  Vsepr3DModelViewer: () => <div data-testid="vsepr-3d-model-viewer" />,
}));

vi.mock('../components/Molecule3DViewer', () => ({
  Molecule3DViewer: () => <div data-testid="molecule-3d-viewer" />,
}));

const validAmmoniaResult = {
  ok: true,
  validationStatus: 'valid',
  source: 'smiles',
  canonicalSmiles: 'N',
  molecularFormula: 'H3N',
  molecularWeight: 17.031,
  warnings: [],
  errors: [],
  developerLogs: [],
} satisfies MoleculeValidationResult;

const ammonia3DSuccess = {
  ok: true,
  status: 'success',
  molecule3D: {
    format: 'sdf',
    data: 'ammonia external 3D\nM  END\n$$$$',
    label: '암모니아',
    sourceType: 'pubchem',
    coordinateDimension: '3d',
    structureMatchStatus: 'verified',
    coordinateSource: 'PubChem CID 222',
    sourceNote: '검증된 외부 교육용 3D 좌표',
    sourceUrl:
      'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/222/record/SDF?record_type=3d',
  },
  studentMessage: '암모니아의 외부 3D 구조 데이터를 불러왔습니다.',
  warnings: [],
  developerLogs: ['test fixture'],
} satisfies PubChem3DLookupResult;

describe('SimpleMoleculeModeler', () => {
  it('limits the prototype picker to the four requested classroom molecules', () => {
    expect(
      getSimpleExampleMolecules().map((example) => example.id),
    ).toEqual(['water', 'methane', 'ammonia', 'carbon-dioxide']);
  });

  it('renders three accessible tool tabs and their labelled panels', () => {
    const markup = renderToStaticMarkup(<SimpleMoleculeModeler />);

    expect(markup).toContain('data-testid="simple-modeler-shell"');
    expect(markup).toContain('role="tablist"');
    expect(markup).toContain('data-testid="simple-tool-2d"');
    expect(markup).toContain('data-testid="simple-tool-vsepr"');
    expect(markup).toContain('data-testid="simple-tool-3d"');
    expect(markup).toContain('data-testid="simple-tool-panel-2d"');
    expect(markup).toContain('data-testid="simple-tool-panel-vsepr"');
    expect(markup).toContain('data-testid="simple-tool-panel-3d"');
    expect(markup).toContain('aria-controls="simple-tool-panel-2d"');
    expect(markup).toContain('id="simple-tool-panel-2d"');
  });

  it('offers loading, validation, and clearing without exposing advanced workflow', () => {
    const markup = renderToStaticMarkup(<SimpleMoleculeModeler />);

    expect(markup).toContain('data-testid="simple-example-select"');
    expect(markup).toContain('data-testid="simple-load-example-button"');
    expect(markup).toContain('data-testid="simple-analyze-button"');
    expect(markup).toContain('data-testid="simple-clear-button"');
    expect(markup).toContain('연결 상태');
    expect(markup).toContain('분자식');
    expect(markup).toContain('분자량');
    expect(markup).not.toContain('PubChem');
    expect(markup).not.toContain('교사용 대시보드');
  });

  it('explains that complex-structure output explicitly searches with structure data only', () => {
    const markup = renderToStaticMarkup(<SimpleMoleculeModeler />);

    expect(markup).toContain(
      'aria-describedby="simple-external-search-consent"',
    );
    expect(markup).toContain(
      '이 버튼을 누르는 것이 외부 3D 자료 후보 검색에 대한 동의입니다.',
    );
    expect(markup).toContain(
      '학생 이름·학급·활동 기록은 전송하지 않습니다.',
    );
    expect(markup).not.toContain('data-testid="pubchem-candidate-panel"');
  });

  it('leaves a validated complex non-example structure for external candidate search', () => {
    const butaneResult = {
      ok: true,
      validationStatus: 'valid',
      source: 'mol-block',
      canonicalSmiles: 'CCCC',
      molecularFormula: 'C4H10',
      molecularWeight: 58.124,
      warnings: [],
      errors: [],
      developerLogs: [],
    } satisfies MoleculeValidationResult;

    expect(resolveSimpleExampleForValidatedStructure(butaneResult)).toBeNull();
  });

  it('attaches static coordinate measurements only to water and methane', () => {
    const examples = getSimpleExampleMolecules();
    const water = examples.find((example) => example.id === 'water');
    const methane = examples.find((example) => example.id === 'methane');
    const ammonia = examples.find((example) => example.id === 'ammonia');
    const carbonDioxide = examples.find(
      (example) => example.id === 'carbon-dioxide',
    );

    expect(water && buildSimple3DInput(water)).toMatchObject({
      sourceType: 'static-example',
      coordinateDimension: '3d',
      coordinateSource: '앱 내장 교육용 정적 좌표',
    });
    expect(methane && buildSimple3DInput(methane)).toMatchObject({
      sourceType: 'static-example',
      coordinateDimension: '3d',
    });
    expect(ammonia && buildSimple3DInput(ammonia)).toBeNull();
    expect(carbonDioxide && buildSimple3DInput(carbonDioxide)).toBeNull();
  });

  it('invalidates every derived result after the editor structure changes', () => {
    const validResult = {
      ok: true,
      validationStatus: 'valid',
      source: 'smiles',
      canonicalSmiles: 'O',
      molecularFormula: 'H2O',
      molecularWeight: 18.015,
      warnings: [],
      errors: [],
      developerLogs: [],
    } satisfies MoleculeValidationResult;
    const state = {
      ...createInitialSimpleDerivedState(),
      validationResult: validResult,
      selectedCentralAtomId: '1',
      vseprAnalysis: {
        status: 'supported' as const,
        scope: 'local-center' as const,
        centralAtomId: '1',
        axeNotation: 'AX2E2',
        confidence: 'high' as const,
        warnings: [],
      },
      vseprModelStatus: 'rendered' as const,
      coordinateData: {
        format: 'sdf' as const,
        data: 'coordinates',
        label: '물',
        sourceType: 'static-example' as const,
        coordinateDimension: '3d' as const,
        coordinateSource: 'test',
      },
      validatedExampleId: 'water',
    };

    expect(invalidateSimpleDerivedState(state)).toEqual(
      createInitialSimpleDerivedState(),
    );
  });

  it('rejects stale async validation completions by request id', () => {
    expect(isSimpleAnalysisRequestCurrent(4, 4)).toBe(true);
    expect(isSimpleAnalysisRequestCurrent(3, 4)).toBe(false);
  });

  it('keeps 3D output clickable before validation once the editor is ready', () => {
    expect(
      isSimple3DOutputDisabled({
        editorReady: false,
        isStructureAnalysisPending: false,
        external3DStatus: 'idle',
        candidateSearchStatus: 'not_requested',
      }),
    ).toBe(true);
    expect(
      isSimple3DOutputDisabled({
        editorReady: true,
        isStructureAnalysisPending: false,
        external3DStatus: 'idle',
        candidateSearchStatus: 'not_requested',
      }),
    ).toBe(false);
    expect(
      isSimple3DOutputDisabled({
        editorReady: true,
        isStructureAnalysisPending: true,
        external3DStatus: 'idle',
        candidateSearchStatus: 'not_requested',
      }),
    ).toBe(true);
    expect(
      isSimple3DOutputDisabled({
        editorReady: true,
        isStructureAnalysisPending: false,
        external3DStatus: 'loading',
        candidateSearchStatus: 'not_requested',
      }),
    ).toBe(true);
    expect(
      isSimple3DOutputDisabled({
        editorReady: true,
        isStructureAnalysisPending: false,
        external3DStatus: 'idle',
        candidateSearchStatus: 'searching',
      }),
    ).toBe(true);
  });

  it('labels and locks the output control while an external candidate search is pending', () => {
    expect(
      getSimple3DOutputButtonLabel({
        isStructureAnalysisPending: false,
        external3DStatus: 'idle',
        candidateSearchStatus: 'searching',
      }),
    ).toBe('후보 검색 중…');
    expect(
      getSimple3DOutputButtonLabel({
        isStructureAnalysisPending: false,
        external3DStatus: 'idle',
        candidateSearchStatus: 'single_candidate',
      }),
    ).toBe('분석하고 3D 구조 출력');
  });

  it.each([
    ['O', 'H2O', 'water'],
    ['C', 'CH4', 'methane'],
    ['N', 'H3N', 'ammonia'],
    ['O=C=O', 'CO2', 'carbon-dioxide'],
  ])(
    'resolves directly drawn canonical %s with formula %s to simple example %s',
    (canonicalSmiles, molecularFormula, expectedExampleId) => {
      const directDrawingResult = {
        ok: true,
        validationStatus: 'valid',
        source: 'mol-block',
        canonicalSmiles,
        molecularFormula,
        molecularWeight: 1,
        warnings: [],
        errors: [],
        developerLogs: [],
      } satisfies MoleculeValidationResult;

      expect(
        resolveSimpleExampleForValidatedStructure(directDrawingResult),
      ).toMatchObject({
        id: expectedExampleId,
      });
    },
  );

  it('routes a directly drawn validated ammonia structure to verified external 3D lookup', async () => {
    const directDrawingResult = {
      ...validAmmoniaResult,
      source: 'mol-block',
    } satisfies MoleculeValidationResult;
    const resolvedExample =
      resolveSimpleExampleForValidatedStructure(directDrawingResult);
    mockFetchPubChem3DSdf.mockResolvedValueOnce(ammonia3DSuccess);

    const result = await loadSimpleExternal3DForValidatedExample({
      example: resolvedExample!,
      validationResult: directDrawingResult,
      requestId: 21,
      getCurrentRequestId: () => 21,
      onStatusChange: () => {},
    });

    expect(resolvedExample).toMatchObject({
      id: 'ammonia',
      pubchemCid: 222,
    });
    expect(result).toMatchObject({
      ok: true,
      molecule3D: {
        sourceType: 'pubchem',
        structureMatchStatus: 'verified',
      },
    });
  });

  it('loads verified external 3D coordinates for an example without built-in coordinates', async () => {
    const ammonia = getSimpleExampleMolecules().find(
      (example) => example.id === 'ammonia',
    );
    const statusHistory: string[] = [];
    mockFetchPubChem3DSdf.mockResolvedValueOnce(ammonia3DSuccess);

    const result = await loadSimpleExternal3DForValidatedExample({
      example: ammonia!,
      validationResult: validAmmoniaResult,
      requestId: 8,
      getCurrentRequestId: () => 8,
      onStatusChange: (status) => {
        statusHistory.push(status);
      },
    });

    expect(statusHistory).toEqual(['loading', 'success']);
    expect(mockFetchPubChem3DSdf).toHaveBeenCalledWith(
      expect.objectContaining({
        cid: 222,
        label: '암모니아',
        pubchemName: 'Ammonia',
        expectedCanonicalSmiles: 'N',
      }),
    );
    expect(result).toMatchObject({
      ok: true,
      status: 'success',
      molecule3D: {
        sourceType: 'pubchem',
        coordinateDimension: '3d',
        structureMatchStatus: 'verified',
        coordinateSource: 'PubChem CID 222',
      },
    });
  });

  it('ignores a completed external 3D lookup after the 2D structure request becomes stale', async () => {
    const ammonia = getSimpleExampleMolecules().find(
      (example) => example.id === 'ammonia',
    );
    let currentRequestId = 12;
    let resolveLookup!: (result: PubChem3DLookupResult) => void;
    const deferredLookup = new Promise<PubChem3DLookupResult>((resolve) => {
      resolveLookup = resolve;
    });
    const statusHistory: string[] = [];
    mockFetchPubChem3DSdf.mockReturnValueOnce(deferredLookup);

    const lookupPromise = loadSimpleExternal3DForValidatedExample({
      example: ammonia!,
      validationResult: validAmmoniaResult,
      requestId: 12,
      getCurrentRequestId: () => currentRequestId,
      onStatusChange: (status) => {
        statusHistory.push(status);
      },
    });

    expect(statusHistory).toEqual(['loading']);
    currentRequestId = 13;
    resolveLookup(ammonia3DSuccess);

    await expect(lookupPromise).resolves.toBeNull();
    expect(statusHistory).toEqual(['loading']);
  });
});
