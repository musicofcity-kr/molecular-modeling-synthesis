import { describe, expect, it, vi } from 'vitest';
import { createPhysicalGraph, type MoleculeGraphSummary } from './bondGraph';
import {
  LIMITED_MVP_IDENTITIES,
  type LimitedIdentityResolution,
  type PhysicalGraphValidationResult,
} from './physicalGraphValidation';
import {
  SCANNER_PUBCHEM_REFERENCE_REGISTRY,
  loadScannerN5Reference,
  prepareScannerN5Reference,
} from './scientificReference';

const graph = createPhysicalGraph([
  { id: 'atom-1', element: 'C', x: 0.5, y: 0.5, radius: 0.1 },
], []);

const graphSummary: MoleculeGraphSummary = {
  atomCount: 1,
  bondCount: 0,
  componentCount: 1,
  componentAtomCounts: [1],
  isSingleComponent: true,
  isolatedAtomCount: 1,
};

function validResult(
  identity: Exclude<LimitedIdentityResolution, { status: 'not-evaluated' }>,
  overrides: Partial<Extract<PhysicalGraphValidationResult, { ok: true }>> = {},
): Extract<PhysicalGraphValidationResult, { ok: true }> {
  return {
    ok: true,
    n5Ready: identity.status === 'exact',
    validationStatus: 'valid',
    revisionId: 'physical-atoms-9-3',
    sourceRevision: 'atoms-9',
    structureIntent: 'single-molecule',
    graphSummary,
    connectivityStatus: 'single-component',
    source: 'physical-graph',
    canonicalSmiles: identity.status === 'exact'
      ? identity.candidates[0].canonicalSmilesVariants[0]
      : 'C',
    molecularFormula: identity.status === 'exact'
      ? identity.candidates[0].molecularFormula
      : 'CH4',
    molecularWeight: 16.043,
    identity,
    validatedGraph: graph,
    validationRepresentation: {
      format: 'mol-v2000',
      coordinateMeaning: 'topology-only',
      molBlock: 'validation-only mol block',
    },
    issues: [],
    warnings: [],
    errors: [],
    developerLogs: [],
    ...overrides,
  };
}

function exact(identityId: string) {
  const identity = LIMITED_MVP_IDENTITIES.find(({ id }) => id === identityId);
  if (!identity) throw new Error(`Missing identity fixture: ${identityId}`);
  return validResult({ status: 'exact', candidates: [identity] });
}

const methaneSdf = `methane PubChem 3D
  PubChem

  5  4  0  0  0  0  0  0  0  0999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.6291    0.6291    0.6291 H   0  0  0  0  0  0  0  0  0  0  0  0
   -0.6291   -0.6291    0.6291 H   0  0  0  0  0  0  0  0  0  0  0  0
   -0.6291    0.6291   -0.6291 H   0  0  0  0  0  0  0  0  0  0  0  0
    0.6291   -0.6291   -0.6291 H   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0
  1  3  1  0
  1  4  1  0
  1  5  1  0
M  END
$$$$`;

function response(body: string, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    text: () => Promise.resolve(body),
  } as Response;
}

describe('scanner Scientific Reference handoff', () => {
  it('keeps a fixed identity-to-CID registry for the ten exact MVP identities', () => {
    expect(SCANNER_PUBCHEM_REFERENCE_REGISTRY).toMatchObject({
      hydrogen: {
        cid: 783,
        expectedCanonicalSmiles: '[H][H]',
        requestPolicy: 'blocked',
        measurementPolicy: { status: 'blocked' },
      },
      oxygen: { cid: 977, expectedCanonicalSmiles: 'O=O', measurementPolicy: { status: 'approved' } },
      nitrogen: { cid: 947, expectedCanonicalSmiles: 'N#N' },
      methane: { cid: 297, expectedCanonicalSmiles: 'C' },
      water: { cid: 962, expectedCanonicalSmiles: 'O' },
      ammonia: { cid: 222, expectedCanonicalSmiles: 'N' },
      'carbon-dioxide': { cid: 280, expectedCanonicalSmiles: 'O=C=O' },
      ethane: { cid: 6324, expectedCanonicalSmiles: 'CC' },
      ethene: { cid: 6325, expectedCanonicalSmiles: 'C=C' },
      methanol: { cid: 887, expectedCanonicalSmiles: 'CO' },
    });
  });

  it('creates a PubChem request descriptor only from an exact N5-ready snapshot', () => {
    const state = prepareScannerN5Reference(exact('methane'));

    expect(state.status).toBe('ready');
    if (state.status !== 'ready') throw new Error('Expected ready fixture.');
    expect(state).toEqual({
      status: 'ready',
      request: {
        source: 'pubchem',
        identityId: 'methane',
        lookup: {
          cid: 297,
          label: '메테인',
          pubchemName: 'Methane',
          expectedCanonicalSmiles: 'C',
        },
        provenance: {
          revisionId: 'physical-atoms-9-3',
          sourceRevision: 'atoms-9',
          expectedCanonicalSmiles: 'C',
          identityId: 'methane',
        },
        measurementPolicy: {
          status: 'approved',
          coordinateMethod: 'pubchem-computed-conformer',
          distanceUnit: 'angstrom',
          angleUnit: 'degree',
          distanceSelection: 'sdf-bonded-pair',
          angleSelection: 'sdf-bonded-neighbor-center-neighbor',
          evidenceType: 'reference-coordinate',
        },
      },
    });
    expect('data' in state.request).toBe(false);
    expect(JSON.stringify(state.request)).not.toMatch(/coordinateData|molBlock|sdfData/i);
  });

  it('requires every fetch-supported CID to carry an explicit method, unit, and graph-selection measurement approval', () => {
    const supported = Object.values(SCANNER_PUBCHEM_REFERENCE_REGISTRY).filter(
      ({ requestPolicy }) => requestPolicy === 'supported',
    );

    expect(supported).toHaveLength(9);
    for (const reference of supported) {
      expect(reference.measurementPolicy).toEqual({
        status: 'approved',
        coordinateMethod: 'pubchem-computed-conformer',
        distanceUnit: 'angstrom',
        angleUnit: 'degree',
        distanceSelection: 'sdf-bonded-pair',
        angleSelection: 'sdf-bonded-neighbor-center-neighbor',
        evidenceType: 'reference-coordinate',
      });
    }
  });

  it.each([
    {
      label: 'unknown',
      result: validResult({ status: 'unknown', candidates: [] }),
      reason: 'identity-unknown',
    },
    {
      label: 'multiple',
      result: validResult({
        status: 'multiple',
        candidates: [LIMITED_MVP_IDENTITIES[3], LIMITED_MVP_IDENTITIES[4]],
      }),
      reason: 'identity-ambiguous',
    },
    {
      label: 'not N5-ready',
      result: validResult(
        { status: 'exact', candidates: [LIMITED_MVP_IDENTITIES[3]] },
        { n5Ready: false },
      ),
      reason: 'validation-not-ready',
    },
  ])('blocks a $label identity snapshot', ({ result, reason }) => {
    expect(prepareScannerN5Reference(result)).toMatchObject({
      status: 'blocked',
      reason,
    });
  });

  it('blocks exact identities that are not in the curated CID registry', () => {
    const unsupported = {
      id: 'unsupported-exact',
      nameKo: '지원 밖 분자',
      molecularFormula: 'ClF',
      canonicalSmilesVariants: ['FCl'],
    };

    expect(prepareScannerN5Reference(validResult({
      status: 'exact',
      candidates: [unsupported],
    }))).toMatchObject({
      status: 'blocked',
      reason: 'identity-unsupported',
    });
  });

  it('blocks a forged identity whose canonical key does not match the fixed registry', () => {
    expect(prepareScannerN5Reference(validResult(
      { status: 'exact', candidates: [LIMITED_MVP_IDENTITIES[3]] },
      { canonicalSmiles: 'O' },
    ))).toMatchObject({
      status: 'blocked',
      reason: 'canonical-mismatch',
    });
  });

  it('delegates response exact-match to the real fetchPubChem3DSdf/RDKit path', async () => {
    const prepared = prepareScannerN5Reference(exact('methane'));
    if (prepared.status !== 'ready') throw new Error('Expected ready fixture.');
    const current = exact('methane');
    const fetchImpl = vi.fn().mockResolvedValue(response(methaneSdf));

    const state = await loadScannerN5Reference(
      prepared.request,
      () => current,
      fetchImpl,
    );

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/297/record/SDF?record_type=3d',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(state).toMatchObject({
      status: 'success',
      request: prepared.request,
      result: {
        ok: true,
        molecule3D: {
          sourceType: 'pubchem',
          coordinateDimension: '3d',
          structureMatchStatus: 'verified',
        },
      },
    });
  });

  it('blocks explicit H2 before a request because the current exact-match authority cannot normalize it safely', () => {
    const validation = exact('hydrogen');
    const prepared = prepareScannerN5Reference(validation);

    expect(prepared).toMatchObject({
      status: 'blocked',
      reason: 'identity-unsupported',
    });
  });

  it('does not request coordinates when the prepared revision is already stale', async () => {
    const prepared = prepareScannerN5Reference(exact('methane'));
    if (prepared.status !== 'ready') throw new Error('Expected ready fixture.');
    const fetchImpl = vi.fn().mockResolvedValue(response(methaneSdf));
    const changed = exact('methane');
    changed.revisionId = 'physical-atoms-9-4';

    const state = await loadScannerN5Reference(
      prepared.request,
      () => changed,
      fetchImpl,
    );

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(state).toMatchObject({ status: 'blocked', reason: 'stale-validation' });
  });

  it('discards a late exact-matched response after the active revision changes', async () => {
    const prepared = prepareScannerN5Reference(exact('methane'));
    if (prepared.status !== 'ready') throw new Error('Expected ready fixture.');
    let current = exact('methane');
    let resolveFetch: ((result: Response) => void) | undefined;
    const fetchImpl = vi.fn(() => new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    }));

    const pending = loadScannerN5Reference(
      prepared.request,
      () => current,
      fetchImpl,
    );
    current = { ...current, revisionId: 'physical-atoms-10-1' };
    resolveFetch?.(response(methaneSdf));

    await expect(pending).resolves.toMatchObject({
      status: 'blocked',
      reason: 'stale-validation',
    });
  });
});
