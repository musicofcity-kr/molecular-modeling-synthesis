import { describe, expect, it, vi } from 'vitest';
import type {
  MoleculeValidationResult,
  PubChemCandidate,
  PubChemCandidateSearchResult,
} from '../types/molecule';
import type { PubChem3DLookupResult } from '../services/pubchem3d';
import {
  createSimpleExternal3DFlow,
  type SimpleExternal3DFlowDependencies,
} from './simpleExternal3DFlow';

const validEthanolResult = {
  ok: true,
  validationStatus: 'valid',
  source: 'smiles',
  canonicalSmiles: 'CCO',
  molecularFormula: 'C2H6O',
  molecularWeight: 46.069,
  warnings: [],
  errors: [],
  developerLogs: [],
} satisfies MoleculeValidationResult;

const ethanolCandidate = {
  cid: 702,
  title: 'Ethanol',
  molecularFormula: 'C2H6O',
  molecularWeight: '46.07',
  canonicalSmiles: 'CCO',
  isomericSmiles: 'CCO',
  source: 'pubchem',
} satisfies PubChemCandidate;

const dimethylEtherCandidate = {
  cid: 8254,
  title: 'Dimethyl ether',
  molecularFormula: 'C2H6O',
  molecularWeight: '46.07',
  canonicalSmiles: 'COC',
  isomericSmiles: 'COC',
  source: 'pubchem',
} satisfies PubChemCandidate;

const singleCandidateSearch = {
  ok: true,
  status: 'single_candidate',
  candidates: [ethanolCandidate],
  studentMessage:
    '외부 데이터 후보 1개를 찾았습니다. 자동 선택하지 않고 직접 확인해야 합니다.',
  warnings: [],
  developerLogs: ['test search succeeded'],
} satisfies PubChemCandidateSearchResult;

const ethanol3DSuccess = {
  ok: true,
  status: 'success',
  molecule3D: {
    format: 'sdf',
    data: 'ethanol 3D\nM  END\n$$$$',
    label: '직접 그린 에탄올',
    sourceType: 'pubchem',
    coordinateDimension: '3d',
    structureMatchStatus: 'verified',
    coordinateSource: 'PubChem CID 702',
    sourceNote: 'RDKit 구조 일치가 확인된 외부 3D 좌표',
  },
  studentMessage: '검증된 외부 3D 구조를 불러왔습니다.',
  warnings: [],
  developerLogs: ['test 3D fetch succeeded'],
} satisfies PubChem3DLookupResult;

function createDependencies() {
  const searchCandidates =
    vi.fn<SimpleExternal3DFlowDependencies['searchCandidates']>();
  const evaluateCandidate =
    vi.fn<SimpleExternal3DFlowDependencies['evaluateCandidate']>();
  const fetch3DSdf =
    vi.fn<SimpleExternal3DFlowDependencies['fetch3DSdf']>();

  searchCandidates.mockResolvedValue(singleCandidateSearch);
  evaluateCandidate.mockReturnValue({
    canLoad3D: true,
    structureMatchStatus: 'verified',
    warnings: [],
    developerLogs: ['exact canonical SMILES match'],
  });
  fetch3DSdf.mockResolvedValue(ethanol3DSuccess);

  return {
    searchCandidates,
    evaluateCandidate,
    fetch3DSdf,
  };
}

describe('simple external 3D candidate flow', () => {
  it('exposes candidates returned for a validated complex drawing', async () => {
    const dependencies = createDependencies();
    const flow = createSimpleExternal3DFlow(dependencies);

    const result = await flow.searchCandidatesForValidatedStructure({
      validationResult: validEthanolResult,
      requestId: 4,
      getCurrentRequestId: () => 4,
    });

    expect(dependencies.searchCandidates).toHaveBeenCalledOnce();
    expect(dependencies.searchCandidates).toHaveBeenCalledWith('CCO');
    expect(result).toEqual(singleCandidateSearch);
    expect(result?.candidates).toEqual([ethanolCandidate]);
  });

  it('does not automatically fetch 3D data even when search returns one candidate', async () => {
    const dependencies = createDependencies();
    const flow = createSimpleExternal3DFlow(dependencies);

    const result = await flow.searchCandidatesForValidatedStructure({
      validationResult: validEthanolResult,
      requestId: 5,
      getCurrentRequestId: () => 5,
    });

    expect(result?.status).toBe('single_candidate');
    expect(dependencies.evaluateCandidate).not.toHaveBeenCalled();
    expect(dependencies.fetch3DSdf).not.toHaveBeenCalled();
  });

  it('fetches SDF only after the user selects an exact structure candidate', async () => {
    const dependencies = createDependencies();
    const flow = createSimpleExternal3DFlow(dependencies);

    const result = await flow.loadSelectedCandidate({
      candidate: ethanolCandidate,
      validationResult: validEthanolResult,
      label: '직접 그린 에탄올',
      requestId: 6,
      getCurrentRequestId: () => 6,
    });

    expect(dependencies.evaluateCandidate).toHaveBeenCalledOnce();
    expect(dependencies.evaluateCandidate).toHaveBeenCalledWith(
      ethanolCandidate,
      validEthanolResult,
    );
    expect(dependencies.fetch3DSdf).toHaveBeenCalledOnce();
    expect(dependencies.fetch3DSdf).toHaveBeenCalledWith({
      cid: 702,
      label: '직접 그린 에탄올',
      pubchemName: 'Ethanol',
      structureMatchStatus: 'verified',
      expectedCanonicalSmiles: 'CCO',
    });
    expect(result).toEqual({
      kind: 'loaded',
      lookup: ethanol3DSuccess,
    });
  });

  it('accepts an asynchronous candidate evaluator without changing the injected contract', async () => {
    const dependencies = createDependencies();
    dependencies.evaluateCandidate.mockImplementationOnce(async () => ({
      canLoad3D: true,
      structureMatchStatus: 'verified',
      warnings: [],
      developerLogs: ['async shared RDKit comparison succeeded'],
    }));
    const flow = createSimpleExternal3DFlow(dependencies);

    const result = await flow.loadSelectedCandidate({
      candidate: ethanolCandidate,
      validationResult: validEthanolResult,
      label: '직접 그린 에탄올',
      requestId: 61,
      getCurrentRequestId: () => 61,
    });

    expect(result).toEqual({
      kind: 'loaded',
      lookup: ethanol3DSuccess,
    });
    expect(dependencies.fetch3DSdf).toHaveBeenCalledOnce();
  });

  it('blocks a mismatched candidate before requesting its SDF', async () => {
    const dependencies = createDependencies();
    const mismatch = {
      canLoad3D: false,
      studentMessage:
        '선택한 후보가 현재 RDKit 검증 구조와 일치하지 않습니다.',
      warnings: ['분자식이 같아도 구조 이성질체일 수 있습니다.'],
      developerLogs: ['candidate blocked: canonical SMILES mismatch'],
    };
    dependencies.evaluateCandidate.mockReturnValueOnce(mismatch);
    const flow = createSimpleExternal3DFlow(dependencies);

    const result = await flow.loadSelectedCandidate({
      candidate: dimethylEtherCandidate,
      validationResult: validEthanolResult,
      label: '직접 그린 에탄올',
      requestId: 7,
      getCurrentRequestId: () => 7,
    });

    expect(result).toEqual({
      kind: 'blocked',
      compatibility: mismatch,
    });
    expect(dependencies.fetch3DSdf).not.toHaveBeenCalled();
  });

  it('returns null when a candidate-search response becomes stale', async () => {
    let resolveSearch!: (result: PubChemCandidateSearchResult) => void;
    let currentRequestId = 8;
    const deferredSearch = new Promise<PubChemCandidateSearchResult>(
      (resolve) => {
        resolveSearch = resolve;
      },
    );
    const dependencies = createDependencies();
    dependencies.searchCandidates.mockReturnValueOnce(deferredSearch);
    const flow = createSimpleExternal3DFlow(dependencies);

    const pending = flow.searchCandidatesForValidatedStructure({
      validationResult: validEthanolResult,
      requestId: 8,
      getCurrentRequestId: () => currentRequestId,
    });

    currentRequestId = 9;
    resolveSearch(singleCandidateSearch);

    await expect(pending).resolves.toBeNull();
    expect(dependencies.fetch3DSdf).not.toHaveBeenCalled();
  });

  it('returns null when a selected-candidate SDF response becomes stale', async () => {
    let resolveFetch!: (result: PubChem3DLookupResult) => void;
    let currentRequestId = 10;
    const deferredFetch = new Promise<PubChem3DLookupResult>((resolve) => {
      resolveFetch = resolve;
    });
    const dependencies = createDependencies();
    dependencies.fetch3DSdf.mockReturnValueOnce(deferredFetch);
    const flow = createSimpleExternal3DFlow(dependencies);

    const pending = flow.loadSelectedCandidate({
      candidate: ethanolCandidate,
      validationResult: validEthanolResult,
      label: '직접 그린 에탄올',
      requestId: 10,
      getCurrentRequestId: () => currentRequestId,
    });

    currentRequestId = 11;
    resolveFetch(ethanol3DSuccess);

    await expect(pending).resolves.toBeNull();
  });
});
