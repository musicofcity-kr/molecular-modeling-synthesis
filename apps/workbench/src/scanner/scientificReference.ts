import {
  fetchPubChem3DSdf,
  type PubChem3DLookupInput,
  type PubChem3DLookupResult,
} from '../services/pubchem3d';
import type { PhysicalGraphValidationResult } from './physicalGraphValidation';

export interface CuratedScannerPubChemReference {
  cid: number;
  label: string;
  pubchemName: string;
  expectedCanonicalSmiles: string;
  requestPolicy: 'supported' | 'blocked';
  measurementPolicy: ScannerReferenceMeasurementPolicy;
}

export type ScannerReferenceMeasurementPolicy =
  | {
      status: 'approved';
      coordinateMethod: 'pubchem-computed-conformer';
      distanceUnit: 'angstrom';
      angleUnit: 'degree';
      distanceSelection: 'sdf-bonded-pair';
      angleSelection: 'sdf-bonded-neighbor-center-neighbor';
      evidenceType: 'reference-coordinate';
    }
  | {
      status: 'blocked';
      reason: string;
    };

const APPROVED_PUBCHEM_COORDINATE_MEASUREMENT = {
  status: 'approved',
  coordinateMethod: 'pubchem-computed-conformer',
  distanceUnit: 'angstrom',
  angleUnit: 'degree',
  distanceSelection: 'sdf-bonded-pair',
  angleSelection: 'sdf-bonded-neighbor-center-neighbor',
  evidenceType: 'reference-coordinate',
} as const satisfies ScannerReferenceMeasurementPolicy;

const BLOCKED_COORDINATE_MEASUREMENT = {
  status: 'blocked',
  reason: 'The current exact-structure handoff is not supported.',
} as const satisfies ScannerReferenceMeasurementPolicy;

/**
 * Curated identifiers only. This registry never performs name-to-structure
 * matching and never supplies coordinates of its own.
 */
export const SCANNER_PUBCHEM_REFERENCE_REGISTRY = {
  hydrogen: {
    cid: 783,
    label: '수소 분자',
    pubchemName: 'Hydrogen',
    expectedCanonicalSmiles: '[H][H]',
    requestPolicy: 'blocked',
    measurementPolicy: BLOCKED_COORDINATE_MEASUREMENT,
  },
  oxygen: {
    cid: 977,
    label: '산소 분자',
    pubchemName: 'Oxygen',
    expectedCanonicalSmiles: 'O=O',
    requestPolicy: 'supported',
    measurementPolicy: APPROVED_PUBCHEM_COORDINATE_MEASUREMENT,
  },
  nitrogen: {
    cid: 947,
    label: '질소 분자',
    pubchemName: 'Nitrogen',
    expectedCanonicalSmiles: 'N#N',
    requestPolicy: 'supported',
    measurementPolicy: APPROVED_PUBCHEM_COORDINATE_MEASUREMENT,
  },
  methane: {
    cid: 297,
    label: '메테인',
    pubchemName: 'Methane',
    expectedCanonicalSmiles: 'C',
    requestPolicy: 'supported',
    measurementPolicy: APPROVED_PUBCHEM_COORDINATE_MEASUREMENT,
  },
  water: {
    cid: 962,
    label: '물',
    pubchemName: 'Water',
    expectedCanonicalSmiles: 'O',
    requestPolicy: 'supported',
    measurementPolicy: APPROVED_PUBCHEM_COORDINATE_MEASUREMENT,
  },
  ammonia: {
    cid: 222,
    label: '암모니아',
    pubchemName: 'Ammonia',
    expectedCanonicalSmiles: 'N',
    requestPolicy: 'supported',
    measurementPolicy: APPROVED_PUBCHEM_COORDINATE_MEASUREMENT,
  },
  'carbon-dioxide': {
    cid: 280,
    label: '이산화 탄소',
    pubchemName: 'Carbon dioxide',
    expectedCanonicalSmiles: 'O=C=O',
    requestPolicy: 'supported',
    measurementPolicy: APPROVED_PUBCHEM_COORDINATE_MEASUREMENT,
  },
  ethane: {
    cid: 6324,
    label: '에테인',
    pubchemName: 'Ethane',
    expectedCanonicalSmiles: 'CC',
    requestPolicy: 'supported',
    measurementPolicy: APPROVED_PUBCHEM_COORDINATE_MEASUREMENT,
  },
  ethene: {
    cid: 6325,
    label: '에텐',
    pubchemName: 'Ethylene',
    expectedCanonicalSmiles: 'C=C',
    requestPolicy: 'supported',
    measurementPolicy: APPROVED_PUBCHEM_COORDINATE_MEASUREMENT,
  },
  methanol: {
    cid: 887,
    label: '메탄올',
    pubchemName: 'Methanol',
    expectedCanonicalSmiles: 'CO',
    requestPolicy: 'supported',
    measurementPolicy: APPROVED_PUBCHEM_COORDINATE_MEASUREMENT,
  },
} as const satisfies Readonly<Record<string, CuratedScannerPubChemReference>>;

export interface ScannerN5ReferenceProvenance {
  revisionId: string;
  sourceRevision: string;
  expectedCanonicalSmiles: string;
  identityId: string;
}

export interface ScannerN5ReferenceRequestDescriptor {
  source: 'pubchem';
  identityId: string;
  lookup: PubChem3DLookupInput;
  provenance: ScannerN5ReferenceProvenance;
  measurementPolicy: Extract<ScannerReferenceMeasurementPolicy, { status: 'approved' }>;
}

export type ScannerN5ReferenceBlockReason =
  | 'missing-validation'
  | 'validation-not-valid'
  | 'validation-not-ready'
  | 'identity-unknown'
  | 'identity-ambiguous'
  | 'identity-unsupported'
  | 'canonical-mismatch'
  | 'stale-validation';

export type ScannerN5ReferenceState =
  | {
      status: 'blocked';
      reason: ScannerN5ReferenceBlockReason;
      studentMessage: string;
      developerLogs: string[];
    }
  | {
      status: 'ready';
      request: ScannerN5ReferenceRequestDescriptor;
    }
  | {
      status: 'success';
      request: ScannerN5ReferenceRequestDescriptor;
      result: Extract<PubChem3DLookupResult, { ok: true }>;
    }
  | {
      status: 'noData' | 'error';
      request: ScannerN5ReferenceRequestDescriptor;
      result: Extract<PubChem3DLookupResult, { ok: false }>;
    };

const BLOCKED_STUDENT_MESSAGE =
  '현재 검증된 분자와 정확히 연결되는 참고 3D 자료를 준비할 수 없습니다.';
const STALE_STUDENT_MESSAGE =
  '분자 구조가 바뀌어 이전 참고 3D 요청 결과를 사용하지 않았습니다.';

function blocked(
  reason: ScannerN5ReferenceBlockReason,
  developerMessage: string,
  studentMessage = BLOCKED_STUDENT_MESSAGE,
): Extract<ScannerN5ReferenceState, { status: 'blocked' }> {
  return {
    status: 'blocked',
    reason,
    studentMessage,
    developerLogs: [developerMessage],
  };
}

export function prepareScannerN5Reference(
  validation: PhysicalGraphValidationResult | null | undefined,
): Extract<ScannerN5ReferenceState, { status: 'blocked' | 'ready' }> {
  if (!validation) {
    return blocked(
      'missing-validation',
      'Scanner N5 reference blocked: no N4 validation snapshot.',
    );
  }

  if (validation.ok === false) {
    return blocked(
      'validation-not-valid',
      `Scanner N5 reference blocked: N4 revision ${validation.revisionId} is ${validation.validationStatus}.`,
    );
  }

  if (validation.identity.status === 'unknown') {
    return blocked(
      'identity-unknown',
      `Scanner N5 reference blocked: revision ${validation.revisionId} has no exact limited identity.`,
    );
  }

  if (validation.identity.status === 'multiple') {
    return blocked(
      'identity-ambiguous',
      `Scanner N5 reference blocked: revision ${validation.revisionId} has multiple identity candidates.`,
    );
  }

  if (!validation.n5Ready) {
    return blocked(
      'validation-not-ready',
      `Scanner N5 reference blocked: exact revision ${validation.revisionId} is not marked n5Ready.`,
    );
  }

  const identity = validation.identity.candidates[0];
  const reference = (
    SCANNER_PUBCHEM_REFERENCE_REGISTRY as Readonly<
      Record<string, CuratedScannerPubChemReference | undefined>
    >
  )[identity.id];

  if (!reference) {
    return blocked(
      'identity-unsupported',
      `Scanner N5 reference blocked: identity ${identity.id} is not in the curated PubChem CID registry.`,
    );
  }

  if (reference.requestPolicy === 'blocked') {
    return blocked(
      'identity-unsupported',
      `Scanner N5 reference blocked: identity ${identity.id} has a curated CID but is not supported by the current exact-match handoff.`,
    );
  }

  if (reference.measurementPolicy.status !== 'approved') {
    return blocked(
      'identity-unsupported',
      `Scanner N5 reference blocked: identity ${identity.id} has no approved coordinate measurement policy.`,
    );
  }

  if (
    validation.canonicalSmiles !== reference.expectedCanonicalSmiles ||
    !identity.canonicalSmilesVariants.includes(validation.canonicalSmiles)
  ) {
    return blocked(
      'canonical-mismatch',
      `Scanner N5 reference blocked: identity ${identity.id} canonical key does not match the curated registry for revision ${validation.revisionId}.`,
    );
  }

  return {
    status: 'ready',
    request: {
      source: 'pubchem',
      identityId: identity.id,
      lookup: {
        cid: reference.cid,
        label: reference.label,
        pubchemName: reference.pubchemName,
        expectedCanonicalSmiles: validation.canonicalSmiles,
      },
      provenance: {
        revisionId: validation.revisionId,
        sourceRevision: validation.sourceRevision,
        expectedCanonicalSmiles: validation.canonicalSmiles,
        identityId: identity.id,
      },
      measurementPolicy: reference.measurementPolicy,
    },
  };
}

function isRequestCurrent(
  request: ScannerN5ReferenceRequestDescriptor,
  currentValidation: PhysicalGraphValidationResult | null | undefined,
): boolean {
  const current = prepareScannerN5Reference(currentValidation);
  if (current.status !== 'ready') return false;

  return (
    current.request.identityId === request.identityId &&
    current.request.lookup.cid === request.lookup.cid &&
    current.request.provenance.revisionId === request.provenance.revisionId &&
    current.request.provenance.sourceRevision === request.provenance.sourceRevision &&
    current.request.provenance.expectedCanonicalSmiles ===
      request.provenance.expectedCanonicalSmiles &&
    current.request.measurementPolicy.coordinateMethod ===
      request.measurementPolicy.coordinateMethod &&
    current.request.measurementPolicy.distanceUnit ===
      request.measurementPolicy.distanceUnit &&
    current.request.measurementPolicy.angleUnit ===
      request.measurementPolicy.angleUnit &&
    current.request.measurementPolicy.distanceSelection ===
      request.measurementPolicy.distanceSelection &&
    current.request.measurementPolicy.angleSelection ===
      request.measurementPolicy.angleSelection &&
    current.request.measurementPolicy.evidenceType ===
      request.measurementPolicy.evidenceType
  );
}

function staleRequest(
  request: ScannerN5ReferenceRequestDescriptor,
): Extract<ScannerN5ReferenceState, { status: 'blocked' }> {
  return blocked(
    'stale-validation',
    `Scanner N5 PubChem response blocked as stale for revision ${request.provenance.revisionId}.`,
    STALE_STUDENT_MESSAGE,
  );
}

/**
 * Fetches only a curated PubChem CID and delegates SDF validation plus the
 * hydrogen-normalized exact structure match to fetchPubChem3DSdf.
 */
export async function loadScannerN5Reference(
  request: ScannerN5ReferenceRequestDescriptor,
  getCurrentValidation: () => PhysicalGraphValidationResult | null | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<ScannerN5ReferenceState> {
  if (!isRequestCurrent(request, getCurrentValidation())) {
    return staleRequest(request);
  }

  let result: PubChem3DLookupResult;

  try {
    result = await fetchPubChem3DSdf(request.lookup, fetchImpl);
  } catch (error) {
    if (!isRequestCurrent(request, getCurrentValidation())) {
      return staleRequest(request);
    }

    return {
      status: 'error',
      request,
      result: {
        ok: false,
        status: 'error',
        studentMessage: '외부 참고 3D 자료를 불러오지 못했습니다.',
        warnings: [],
        developerLogs: [
          `Scanner N5 PubChem fetch unexpectedly rejected: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        ],
      },
    };
  }

  if (!isRequestCurrent(request, getCurrentValidation())) {
    return staleRequest(request);
  }

  if (result.ok === false) {
    return {
      status: result.status,
      request,
      result,
    };
  }

  return {
    status: 'success',
    request,
    result,
  };
}
