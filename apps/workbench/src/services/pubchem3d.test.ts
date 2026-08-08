import { describe, expect, it, vi } from 'vitest';
import { fetchPubChem3DSdf } from './pubchem3d';
import { initializeRDKit } from './rdkitService';

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

async function createSdfFromSmiles(smiles: string): Promise<string> {
  const rdkit = await initializeRDKit();
  const molecule = rdkit.get_mol(smiles);

  if (!molecule || !molecule.is_valid()) {
    molecule?.delete();
    throw new Error(`Could not create SDF test fixture from ${smiles}.`);
  }

  try {
    return `${molecule.add_hs()}\n$$$$`;
  } finally {
    molecule.delete();
  }
}

describe('fetchPubChem3DSdf', () => {
  it('fails before requesting PubChem when the current RDKit canonical key is missing', async () => {
    const fetchImpl = vi.fn();

    const result = await fetchPubChem3DSdf(
      {
        cid: 702,
        label: '에탄올',
        expectedCanonicalSmiles: '   ',
      },
      fetchImpl,
    );

    expect(result.ok).toBe(false);
    expect(result.status).toBe('error');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.developerLogs).toContain(
      'current RDKit canonical SMILES was missing before PubChem request.',
    );
  });

  it('returns a PubChem-labeled Molecule3DInput for a successful 3D SDF response', async () => {
    const sdf = `water PubChem 3D
  PubChem

  3  2  0  0  0  0  0  0  0  0999 V2000
    0.0000    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
    0.9572    0.0000    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
   -0.2390    0.9270    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0
  1  3  1  0
M  END
$$$$`;
    const fetchImpl = vi.fn().mockResolvedValue(createResponse(sdf, { ok: true, status: 200 }));

    const result = await fetchPubChem3DSdf(
      {
        cid: 962,
        label: '물',
        pubchemName: 'Water',
        expectedCanonicalSmiles: 'O',
      },
      fetchImpl,
    );

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/962/record/SDF?record_type=3d',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.status).toBe('success');
      expect(result.molecule3D).toMatchObject({
        format: 'sdf',
        data: sdf,
        label: '물',
        sourceType: 'pubchem',
        coordinateDimension: '3d',
        structureMatchStatus: 'verified',
        coordinateSource: 'PubChem CID 962',
        sourceUrl:
          'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/962/record/SDF?record_type=3d',
      });
      expect(result.molecule3D.sourceNote).toContain('계산 3D conformer SDF 좌표');
      expect(result.molecule3D.sourceNote).toContain('실험값·문헌 기준값');
      expect(result.developerLogs).toContain('PubChem 3D SDF fetch succeeded: CID 962.');
    }
  });

  it('returns noData with separated student and developer messages when PubChem has no 3D SDF', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        createResponse('PUGREST.NotFound: No 3D conformer available', {
          ok: false,
          status: 404,
          statusText: 'Not Found',
        }),
      );

    const result = await fetchPubChem3DSdf(
      {
        cid: 123,
        label: '테스트',
        expectedCanonicalSmiles: 'CCO',
      },
      fetchImpl,
    );

    expect(result.ok).toBe(false);
    expect(result.status).toBe('noData');
    expect(result.studentMessage).toContain('PubChem에 후보는 있지만 3D 좌표 데이터');
    expect(result.studentMessage).toContain(
      '2D 구조와 분자식 검증 결과는 계속 사용할 수 있습니다.',
    );
    expect(result.developerLogs.join('\n')).toContain('HTTP status: 404');
    expect(result.developerLogs.join('\n')).toContain('No 3D conformer available');
  });

  it('returns error when the network request fails', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network unavailable'));

    const result = await fetchPubChem3DSdf(
      {
        cid: 702,
        label: '에탄올',
        expectedCanonicalSmiles: 'CCO',
      },
      fetchImpl,
    );

    expect(result.ok).toBe(false);
    expect(result.status).toBe('error');
    expect(result.studentMessage).toContain('외부 3D 구조 데이터를 불러오지 못했습니다.');
    expect(result.developerLogs).toEqual([
      'PubChem 3D SDF fetch failed.',
      'CID: 702',
      'fetch error message: network unavailable',
    ]);
  });

  it('aborts an SDF request that exceeds the configured timeout', async () => {
    vi.useFakeTimers();

    try {
      const fetchImpl = vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener(
              'abort',
              () => {
                const abortError = new Error('SDF request aborted by signal');
                abortError.name = 'AbortError';
                reject(abortError);
              },
              { once: true },
            );
          }),
      );

      const resultPromise = fetchPubChem3DSdf(
        {
          cid: 702,
          label: 'Ethanol',
          expectedCanonicalSmiles: 'CCO',
        },
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
        'fetch error message: SDF request aborted by signal',
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('blocks a valid SDF whose RDKit canonical structure differs from the current structure', async () => {
    const dimethylEtherSdf = `dimethyl ether
  PubChem

  3  2  0  0  0  0  0  0  0  0999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.4000    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
    2.8000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0
  2  3  1  0
M  END
$$$$`;
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(createResponse(dimethylEtherSdf, { ok: true, status: 200 }));

    const result = await fetchPubChem3DSdf(
      {
        cid: 999,
        label: '에탄올 후보',
        expectedCanonicalSmiles: 'CCO',
      },
      fetchImpl,
    );

    expect(result.ok).toBe(false);
    expect(result.status).toBe('error');
    expect(result.studentMessage).toContain('현재 확인한 2D 구조와 일치하지 않아');
    expect(result.developerLogs).toContain(
      'PubChem 3D SDF structure verification failed: canonical mismatch.',
    );
    expect(result.developerLogs).toContain('expected canonical SMILES: CCO');
    expect(result.developerLogs).toContain('SDF canonical SMILES: COC');
  });

  it('preserves stereochemistry by blocking the opposite SDF stereoisomer', async () => {
    const oppositeStereoisomerSdf = await createSdfFromSmiles(
      'C[C@H](O)C(=O)O',
    );
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        createResponse(oppositeStereoisomerSdf, { ok: true, status: 200 }),
      );

    const result = await fetchPubChem3DSdf(
      {
        cid: 107689,
        label: '젖산 입체 이성질체',
        expectedCanonicalSmiles: 'C[C@@H](O)C(=O)O',
      },
      fetchImpl,
    );

    expect(result.ok).toBe(false);
    expect(result.status).toBe('error');
    expect(result.studentMessage).toContain('현재 확인한 2D 구조와 일치하지 않아');
    expect(result.developerLogs).toContain(
      'PubChem 3D SDF structure verification failed: canonical mismatch.',
    );
    expect(result.developerLogs).toContain(
      'expected canonical SMILES: C[C@@H](O)C(=O)O',
    );
    expect(result.developerLogs).toContain(
      'SDF canonical SMILES: C[C@H](O)C(=O)O',
    );
  });

  it('blocks a fake SDF that contains M END but cannot be parsed by RDKit', async () => {
    const fakeSdf = `not a molecule
M  END
$$$$`;
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(createResponse(fakeSdf, { ok: true, status: 200 }));

    const result = await fetchPubChem3DSdf(
      {
        cid: 1000,
        label: '가짜 후보',
        expectedCanonicalSmiles: 'CCO',
      },
      fetchImpl,
    );

    expect(result.ok).toBe(false);
    expect(result.status).toBe('error');
    expect(result.studentMessage).toContain('구조 검증을 통과하지 못해');
    expect(result.developerLogs).toContain(
      'PubChem 3D SDF structure verification failed.',
    );
  });

  it('blocks an otherwise matching SDF that contains an untrusted V2000 query property', async () => {
    const querySdf = `water query
  PubChem

  3  2  0  0  0  0  0  0  0  0999 V2000
    0.0000    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
    0.9572    0.0000    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
   -0.2390    0.9270    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0
  1  3  1  0
M  SUB  1   1   2
M  END
$$$$`;
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(createResponse(querySdf, { ok: true, status: 200 }));

    const result = await fetchPubChem3DSdf(
      {
        cid: 1001,
        label: '질의 구조 후보',
        expectedCanonicalSmiles: 'O',
      },
      fetchImpl,
    );

    expect(result.ok).toBe(false);
    expect(result.status).toBe('error');
    expect(result.studentMessage).toContain('구조 검증을 통과하지 못해');
    expect(result.developerLogs.join('\n')).toContain(
      'RDKit validation blocked V2000 query property M SUB.',
    );
  });
});
