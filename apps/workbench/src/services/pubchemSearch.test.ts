import { describe, expect, it, vi } from 'vitest';
import {
  evaluatePubChemCandidateForCurrentStructure,
  evaluatePubChemCandidateWithRdkitForCurrentStructure,
  searchPubChemCandidatesByCanonicalSmiles,
} from './pubchemSearch';

function createResponse(
  body: string,
  init: { ok: boolean; status: number; statusText?: string },
): Response {
  return {
    ok: init.ok,
    status: init.status,
    statusText: init.statusText ?? '',
    text: () => Promise.resolve(body),
  } as Response;
}

describe('searchPubChemCandidatesByCanonicalSmiles', () => {
  it('maps PubChem property records into external data candidates', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      createResponse(
        JSON.stringify({
          PropertyTable: {
            Properties: [
              {
                CID: 702,
                Title: 'Ethanol',
                MolecularFormula: 'C2H6O',
                MolecularWeight: '46.069',
                CanonicalSMILES: 'CCO',
                IsomericSMILES: 'CCO',
              },
            ],
          },
        }),
        { ok: true, status: 200 },
      ),
    );

    const result = await searchPubChemCandidatesByCanonicalSmiles('CCO', fetchImpl);

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles/property/Title,MolecularFormula,MolecularWeight,CanonicalSMILES,IsomericSMILES/JSON',
      expect.objectContaining({
        method: 'POST',
        body: 'smiles=CCO',
      }),
    );
    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.status).toBe('single_candidate');
      expect(result.candidates).toEqual([
        {
          cid: 702,
          title: 'Ethanol',
          molecularFormula: 'C2H6O',
          molecularWeight: '46.069',
          canonicalSmiles: 'CCO',
          isomericSmiles: 'CCO',
          source: 'pubchem',
        },
      ]);
      expect(result.studentMessage).toContain('외부 데이터 후보');
      expect(result.developerLogs).toContain('PubChem candidate search succeeded.');
      expect(result.developerLogs).toContain('candidate CIDs: 702');
    }
  });

  it('returns no_match when PubChem responds with an empty property table', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        createResponse(JSON.stringify({ PropertyTable: { Properties: [] } }), {
          ok: true,
          status: 200,
        }),
      );

    const result = await searchPubChemCandidatesByCanonicalSmiles('C1CC1', fetchImpl);

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.status).toBe('no_match');
      expect(result.candidates).toEqual([]);
      expect(result.studentMessage).toBe('PubChem에서 일치 후보를 찾지 못했습니다.');
      expect(result.developerLogs).toContain('candidate CIDs: none');
    }
  });

  it('treats PubChem 404 as no_match instead of a search crash', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        createResponse('PUGREST.NotFound: no compounds found', {
          ok: false,
          status: 404,
          statusText: 'Not Found',
        }),
      );

    const result = await searchPubChemCandidatesByCanonicalSmiles('C1CC1', fetchImpl);

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.status).toBe('no_match');
      expect(result.candidates).toEqual([]);
      expect(result.studentMessage).toBe('PubChem에서 일치 후보를 찾지 못했습니다.');
      expect(result.developerLogs.join('\n')).toContain('HTTP status: 404 Not Found');
    }
  });

  it('separates student and developer messages for HTTP failures', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        createResponse('PUGREST.BadRequest: invalid smiles', {
          ok: false,
          status: 400,
          statusText: 'Bad Request',
        }),
      );

    const result = await searchPubChemCandidatesByCanonicalSmiles('bad smiles', fetchImpl);

    expect(result.ok).toBe(false);
    expect(result.status).toBe('error');
    expect(result.studentMessage).toBe(
      'PubChem 후보 검색 중 오류가 발생했습니다. RDKit.js 검증 결과는 계속 사용할 수 있습니다.',
    );
    expect(result.developerLogs.join('\n')).toContain('HTTP status: 400 Bad Request');
    expect(result.developerLogs.join('\n')).toContain('PUGREST.BadRequest');
  });

  it('returns error without requesting PubChem when canonicalSmiles is empty', async () => {
    const fetchImpl = vi.fn();

    const result = await searchPubChemCandidatesByCanonicalSmiles('   ', fetchImpl);

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.status).toBe('error');
    expect(result.developerLogs).toContain(
      'PubChem candidate search failed before request: empty canonicalSmiles.',
    );
  });

  it('aborts a candidate search that exceeds the configured timeout', async () => {
    vi.useFakeTimers();

    try {
      const fetchImpl = vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener(
              'abort',
              () => {
                const abortError = new Error('request aborted by signal');
                abortError.name = 'AbortError';
                reject(abortError);
              },
              { once: true },
            );
          }),
      );

      const resultPromise = searchPubChemCandidatesByCanonicalSmiles(
        'CCO',
        fetchImpl,
        { timeoutMs: 25 },
      );

      await vi.advanceTimersByTimeAsync(25);
      const result = await resultPromise;

      expect(fetchImpl).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        }),
      );
      expect(result.ok).toBe(false);
      expect(result.status).toBe('error');
      expect(result.developerLogs).toContain(
        'request timeout: aborted after 25 ms.',
      );
      expect(result.developerLogs.join('\n')).toContain(
        'error message: request aborted by signal',
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('evaluatePubChemCandidateForCurrentStructure', () => {
  it('allows formula-compatible candidates even when formula order differs', () => {
    const result = evaluatePubChemCandidateForCurrentStructure(
      {
        cid: 222,
        title: 'Ammonia',
        molecularFormula: 'NH3',
        molecularWeight: '17.031',
        canonicalSmiles: 'N',
        source: 'pubchem',
      },
      {
        ok: true,
        validationStatus: 'valid',
        source: 'smiles',
        smiles: 'N',
        canonicalSmiles: 'N',
        molecularFormula: 'H3N',
        molecularWeight: 17.031,
        warnings: [],
        errors: [],
        developerLogs: [],
      },
    );

    expect(result.canLoad3D).toBe(true);
    expect(result.structureMatchStatus).toBe('verified');
    expect(result.developerLogs).toContain('candidate allowed: verified.');
  });

  it('blocks formula-compatible candidates with different canonical SMILES', () => {
    const result = evaluatePubChemCandidateForCurrentStructure(
      {
        cid: 999,
        title: 'Formula-compatible candidate',
        molecularFormula: 'C2H6O',
        molecularWeight: '46.069',
        canonicalSmiles: 'COC',
        source: 'pubchem',
      },
      {
        ok: true,
        validationStatus: 'valid',
        source: 'smiles',
        smiles: 'CCO',
        canonicalSmiles: 'CCO',
        molecularFormula: 'C2H6O',
        molecularWeight: 46.069,
        warnings: [],
        errors: [],
        developerLogs: [],
      },
    );

    expect(result.canLoad3D).toBe(false);
    expect(result.structureMatchStatus).toBeUndefined();
    expect(result.studentMessage).toContain('현재 구조와 일치하지 않아');
    expect(result.warnings.join('\n')).toContain('PubChem SMILES 표기');
    expect(result.developerLogs).toContain(
      'candidate blocked: canonical SMILES mismatch.',
    );
  });

  it('blocks a canonical SMILES mismatch even when the candidate formula is missing', () => {
    const result = evaluatePubChemCandidateForCurrentStructure(
      {
        cid: 998,
        title: 'Formula-missing mismatch',
        canonicalSmiles: 'COC',
        source: 'pubchem',
      },
      {
        ok: true,
        validationStatus: 'valid',
        source: 'smiles',
        smiles: 'CCO',
        canonicalSmiles: 'CCO',
        molecularFormula: 'C2H6O',
        molecularWeight: 46.069,
        warnings: [],
        errors: [],
        developerLogs: [],
      },
    );

    expect(result.canLoad3D).toBe(false);
    expect(result.structureMatchStatus).toBeUndefined();
    expect(result.studentMessage).toContain('현재 구조와 일치하지 않아');
    expect(result.developerLogs).toContain(
      'candidate blocked: canonical SMILES mismatch.',
    );
  });

  it('blocks candidates without formula or canonical SMILES verification evidence', () => {
    const result = evaluatePubChemCandidateForCurrentStructure(
      {
        cid: 997,
        title: 'Unverifiable candidate',
        source: 'pubchem',
      },
      {
        ok: true,
        validationStatus: 'valid',
        source: 'smiles',
        smiles: 'CCO',
        canonicalSmiles: 'CCO',
        molecularFormula: 'C2H6O',
        molecularWeight: 46.069,
        warnings: [],
        errors: [],
        developerLogs: [],
      },
    );

    expect(result.canLoad3D).toBe(false);
    expect(result.structureMatchStatus).toBeUndefined();
    expect(result.studentMessage).toContain('일치 여부를 확인할 근거가 없어');
    expect(result.developerLogs).toContain(
      'candidate blocked: formula and canonical SMILES not provided.',
    );
  });

  it('blocks formula-only candidates without canonical or isomeric identifiers', () => {
    const result = evaluatePubChemCandidateForCurrentStructure(
      {
        cid: 995,
        title: 'Formula-only candidate',
        molecularFormula: 'C2H6O',
        molecularWeight: '46.069',
        source: 'pubchem',
      },
      {
        ok: true,
        validationStatus: 'valid',
        source: 'smiles',
        smiles: 'CCO',
        canonicalSmiles: 'CCO',
        molecularFormula: 'C2H6O',
        molecularWeight: 46.069,
        warnings: [],
        errors: [],
        developerLogs: [],
      },
    );

    expect(result.canLoad3D).toBe(false);
    expect(result.structureMatchStatus).toBeUndefined();
    expect(result.studentMessage).toContain('구조 식별값');
    expect(result.developerLogs).toContain(
      'candidate blocked: canonical and isomeric SMILES not provided.',
    );
  });

  it('blocks an isomeric-only identifier that does not match the current structure', () => {
    const result = evaluatePubChemCandidateForCurrentStructure(
      {
        cid: 994,
        title: 'Isomeric-only mismatch',
        molecularFormula: 'C2H6O',
        molecularWeight: '46.069',
        isomericSmiles: 'COC',
        source: 'pubchem',
      },
      {
        ok: true,
        validationStatus: 'valid',
        source: 'smiles',
        smiles: 'CCO',
        canonicalSmiles: 'CCO',
        molecularFormula: 'C2H6O',
        molecularWeight: 46.069,
        warnings: [],
        errors: [],
        developerLogs: [],
      },
    );

    expect(result.canLoad3D).toBe(false);
    expect(result.structureMatchStatus).toBeUndefined();
    expect(result.studentMessage).toContain('구조 식별값이 현재 구조와 일치하지 않아');
    expect(result.developerLogs).toContain(
      'candidate blocked: structure identifiers did not verify current structure.',
    );
  });

  it('allows a canonical-only exact match as verified while warning that formula is missing', () => {
    const result = evaluatePubChemCandidateForCurrentStructure(
      {
        cid: 996,
        title: 'Canonical-only match',
        canonicalSmiles: 'CCO',
        source: 'pubchem',
      },
      {
        ok: true,
        validationStatus: 'valid',
        source: 'smiles',
        smiles: 'CCO',
        canonicalSmiles: 'CCO',
        molecularFormula: 'C2H6O',
        molecularWeight: 46.069,
        warnings: [],
        errors: [],
        developerLogs: [],
      },
    );

    expect(result.canLoad3D).toBe(true);
    expect(result.structureMatchStatus).toBe('verified');
    expect(result.warnings.join('\n')).toContain('분자식이 제공되지 않았습니다');
    expect(result.developerLogs).toContain(
      'candidate allowed: canonical SMILES verified without formula.',
    );
  });

  it('blocks an explicitly stereochemical PubChem candidate for an unspecified current structure', () => {
    const result = evaluatePubChemCandidateForCurrentStructure(
      {
        cid: 612,
        title: 'Lactic acid stereoisomer',
        molecularFormula: 'C3H6O3',
        canonicalSmiles: 'CC(O)C(=O)O',
        isomericSmiles: 'C[C@@H](O)C(=O)O',
        source: 'pubchem',
      },
      {
        ok: true,
        validationStatus: 'valid',
        source: 'smiles',
        smiles: 'CC(O)C(=O)O',
        canonicalSmiles: 'CC(O)C(=O)O',
        molecularFormula: 'C3H6O3',
        molecularWeight: 90.078,
        warnings: [],
        errors: [],
        developerLogs: [],
      },
    );

    expect(result.canLoad3D).toBe(false);
    expect(result.structureMatchStatus).toBeUndefined();
    expect(result.studentMessage).toContain('입체화학');
    expect(result.developerLogs).toContain(
      'candidate blocked: stereochemistry mismatch.',
    );
  });

  it('allows a candidate whose isomeric SMILES exactly matches the current stereochemistry', () => {
    const stereochemicalSmiles = 'C[C@@H](O)C(=O)O';
    const result = evaluatePubChemCandidateForCurrentStructure(
      {
        cid: 107689,
        title: 'L-lactic acid',
        molecularFormula: 'C3H6O3',
        canonicalSmiles: 'CC(O)C(=O)O',
        isomericSmiles: stereochemicalSmiles,
        source: 'pubchem',
      },
      {
        ok: true,
        validationStatus: 'valid',
        source: 'smiles',
        smiles: stereochemicalSmiles,
        canonicalSmiles: stereochemicalSmiles,
        molecularFormula: 'C3H6O3',
        molecularWeight: 90.078,
        warnings: [],
        errors: [],
        developerLogs: [],
      },
    );

    expect(result.canLoad3D).toBe(true);
    expect(result.structureMatchStatus).toBe('verified');
    expect(result.developerLogs).toContain('candidate allowed: verified.');
  });

  it('blocks different explicit stereochemical strings even when both specify stereo', () => {
    const result = evaluatePubChemCandidateForCurrentStructure(
      {
        cid: 107689,
        title: 'Opposite lactic acid stereoisomer',
        molecularFormula: 'C3H6O3',
        canonicalSmiles: 'CC(O)C(=O)O',
        isomericSmiles: 'C[C@@H](O)C(=O)O',
        source: 'pubchem',
      },
      {
        ok: true,
        validationStatus: 'valid',
        source: 'smiles',
        smiles: 'C[C@H](O)C(=O)O',
        canonicalSmiles: 'C[C@H](O)C(=O)O',
        molecularFormula: 'C3H6O3',
        molecularWeight: 90.078,
        warnings: [],
        errors: [],
        developerLogs: [],
      },
    );

    expect(result.canLoad3D).toBe(false);
    expect(result.structureMatchStatus).toBeUndefined();
    expect(result.studentMessage).toContain('입체화학');
    expect(result.developerLogs).toContain(
      'candidate blocked: stereochemistry mismatch.',
    );
  });

  it('blocks PubChem 3D loading when the candidate formula conflicts with RDKit', () => {
    const result = evaluatePubChemCandidateForCurrentStructure(
      {
        cid: 123,
        title: 'Wrong candidate',
        molecularFormula: 'C2H6O',
        molecularWeight: '46.069',
        canonicalSmiles: 'O',
        source: 'pubchem',
      },
      {
        ok: true,
        validationStatus: 'valid',
        source: 'smiles',
        smiles: 'O',
        canonicalSmiles: 'O',
        molecularFormula: 'H2O',
        molecularWeight: 18.015,
        warnings: [],
        errors: [],
        developerLogs: [],
      },
    );

    expect(result.canLoad3D).toBe(false);
    expect(result.studentMessage).toContain('분자식이 현재 RDKit.js 검증 결과와 달라');
    expect(result.warnings).toContain('RDKit.js 분자식: H2O');
    expect(result.warnings).toContain('PubChem 후보 분자식: C2H6O');
    expect(result.developerLogs).toContain('candidate blocked: formula mismatch.');
  });

  it('blocks candidate loading without a valid RDKit result', () => {
    const result = evaluatePubChemCandidateForCurrentStructure(
      {
        cid: 702,
        title: 'Ethanol',
        molecularFormula: 'C2H6O',
        source: 'pubchem',
      },
      null,
    );

    expect(result.canLoad3D).toBe(false);
    expect(result.studentMessage).toContain('RDKit.js 검증을 통과해야 합니다');
  });
});

describe('evaluatePubChemCandidateWithRdkitForCurrentStructure', () => {
  it('allows Kekule benzene metadata for an aromatic RDKit canonical structure', async () => {
    const result =
      await evaluatePubChemCandidateWithRdkitForCurrentStructure(
        {
          cid: 241,
          title: 'Benzene',
          molecularFormula: 'C6H6',
          canonicalSmiles: 'C1=CC=CC=C1',
          source: 'pubchem',
        },
        {
          ok: true,
          validationStatus: 'valid',
          source: 'smiles',
          smiles: 'c1ccccc1',
          canonicalSmiles: 'c1ccccc1',
          molecularFormula: 'C6H6',
          molecularWeight: 78.114,
          warnings: [],
          errors: [],
          developerLogs: [],
        },
      );

    expect(result.canLoad3D).toBe(true);
    expect(result.structureMatchStatus).toBe('verified');
    expect(result.developerLogs).toContain(
      'candidate allowed: shared RDKit normalization verified the structure.',
    );
  });

  it('allows an atom-order-equivalent candidate after shared RDKit normalization', async () => {
    const result =
      await evaluatePubChemCandidateWithRdkitForCurrentStructure(
        {
          cid: 702,
          title: 'Ethanol',
          molecularFormula: 'C2H6O',
          canonicalSmiles: 'OCC',
          source: 'pubchem',
        },
        {
          ok: true,
          validationStatus: 'valid',
          source: 'smiles',
          smiles: 'CCO',
          canonicalSmiles: 'CCO',
          molecularFormula: 'C2H6O',
          molecularWeight: 46.069,
          warnings: [],
          errors: [],
          developerLogs: [],
        },
      );

    expect(result.canLoad3D).toBe(true);
    expect(result.structureMatchStatus).toBe('verified');
  });

  it('still blocks a constitutional isomer after shared RDKit normalization', async () => {
    const result =
      await evaluatePubChemCandidateWithRdkitForCurrentStructure(
        {
          cid: 8254,
          title: 'Dimethyl ether',
          molecularFormula: 'C2H6O',
          canonicalSmiles: 'COC',
          source: 'pubchem',
        },
        {
          ok: true,
          validationStatus: 'valid',
          source: 'smiles',
          smiles: 'CCO',
          canonicalSmiles: 'CCO',
          molecularFormula: 'C2H6O',
          molecularWeight: 46.069,
          warnings: [],
          errors: [],
          developerLogs: [],
        },
      );

    expect(result.canLoad3D).toBe(false);
    expect(result.developerLogs).toContain(
      'candidate blocked: RDKit-normalized canonical SMILES mismatch.',
    );
  });

  it('keeps an opposite explicit stereoisomer blocked', async () => {
    const result =
      await evaluatePubChemCandidateWithRdkitForCurrentStructure(
        {
          cid: 107689,
          title: 'Opposite lactic acid stereoisomer',
          molecularFormula: 'C3H6O3',
          canonicalSmiles: 'CC(O)C(=O)O',
          isomericSmiles: 'C[C@@H](O)C(=O)O',
          source: 'pubchem',
        },
        {
          ok: true,
          validationStatus: 'valid',
          source: 'smiles',
          smiles: 'C[C@H](O)C(=O)O',
          canonicalSmiles: 'C[C@H](O)C(=O)O',
          molecularFormula: 'C3H6O3',
          molecularWeight: 90.078,
          warnings: [],
          errors: [],
          developerLogs: [],
        },
      );

    expect(result.canLoad3D).toBe(false);
    expect(result.developerLogs).toContain(
      'candidate blocked: stereochemistry mismatch.',
    );
  });

  it('blocks an invalid candidate structure string', async () => {
    const result =
      await evaluatePubChemCandidateWithRdkitForCurrentStructure(
        {
          cid: 999999,
          title: 'Invalid structure metadata',
          molecularFormula: 'C2H6O',
          canonicalSmiles: 'not-a-smiles',
          source: 'pubchem',
        },
        {
          ok: true,
          validationStatus: 'valid',
          source: 'smiles',
          smiles: 'CCO',
          canonicalSmiles: 'CCO',
          molecularFormula: 'C2H6O',
          molecularWeight: 46.069,
          warnings: [],
          errors: [],
          developerLogs: [],
        },
      );

    expect(result.canLoad3D).toBe(false);
    expect(result.developerLogs).toContain(
      'candidate blocked: candidate SMILES failed shared RDKit validation.',
    );
  });
});
