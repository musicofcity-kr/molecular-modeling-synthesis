import {
  evaluatePubChemCandidateForCurrentStructure,
  evaluatePubChemCandidateWithRdkitForCurrentStructure,
  searchPubChemCandidatesByCanonicalSmiles,
} from '../services/pubchemSearch';
import {
  fetchPubChem3DSdf,
  type PubChem3DLookupResult,
} from '../services/pubchem3d';
import type {
  MoleculeValidationResult,
  PubChemCandidate,
  PubChemCandidateSearchResult,
} from '../types/molecule';

type CandidateCompatibility = ReturnType<
  typeof evaluatePubChemCandidateForCurrentStructure
>;
type CandidateCompatibilityResult =
  | CandidateCompatibility
  | Promise<CandidateCompatibility>;

export type SimpleExternal3DFlowDependencies = {
  searchCandidates: (
    canonicalSmiles: string,
  ) => Promise<PubChemCandidateSearchResult>;
  evaluateCandidate: (
    candidate: PubChemCandidate,
    validationResult: MoleculeValidationResult | null,
  ) => CandidateCompatibilityResult;
  fetch3DSdf: typeof fetchPubChem3DSdf;
};

export type SearchCandidatesForValidatedStructureInput = {
  validationResult: MoleculeValidationResult | null;
  requestId: number;
  getCurrentRequestId: () => number;
};

export type LoadSelectedCandidateInput = {
  candidate: PubChemCandidate;
  validationResult: MoleculeValidationResult | null;
  label: string;
  requestId: number;
  getCurrentRequestId: () => number;
};

export type LoadSelectedCandidateResult =
  | {
      kind: 'blocked';
      compatibility: CandidateCompatibility;
    }
  | {
      kind: 'loaded';
      lookup: PubChem3DLookupResult;
    };

const defaultDependencies: SimpleExternal3DFlowDependencies = {
  searchCandidates: searchPubChemCandidatesByCanonicalSmiles,
  evaluateCandidate: evaluatePubChemCandidateWithRdkitForCurrentStructure,
  fetch3DSdf: fetchPubChem3DSdf,
};

function getValidatedCanonicalSmiles(
  validationResult: MoleculeValidationResult | null,
): string | null {
  if (validationResult?.ok !== true) {
    return null;
  }

  const canonicalSmiles = validationResult.canonicalSmiles.trim();
  return canonicalSmiles || null;
}

function isCurrentRequest(
  requestId: number,
  getCurrentRequestId: () => number,
): boolean {
  return getCurrentRequestId() === requestId;
}

export function createSimpleExternal3DFlow(
  dependencies: Partial<SimpleExternal3DFlowDependencies> = {},
) {
  const {
    searchCandidates,
    evaluateCandidate,
    fetch3DSdf,
  }: SimpleExternal3DFlowDependencies = {
    ...defaultDependencies,
    ...dependencies,
  };

  async function searchCandidatesForValidatedStructure({
    validationResult,
    requestId,
    getCurrentRequestId,
  }: SearchCandidatesForValidatedStructureInput): Promise<PubChemCandidateSearchResult | null> {
    const canonicalSmiles = getValidatedCanonicalSmiles(validationResult);

    if (
      !canonicalSmiles ||
      !isCurrentRequest(requestId, getCurrentRequestId)
    ) {
      return null;
    }

    const result = await searchCandidates(canonicalSmiles);

    return isCurrentRequest(requestId, getCurrentRequestId) ? result : null;
  }

  async function loadSelectedCandidate({
    candidate,
    validationResult,
    label,
    requestId,
    getCurrentRequestId,
  }: LoadSelectedCandidateInput): Promise<LoadSelectedCandidateResult | null> {
    const canonicalSmiles = getValidatedCanonicalSmiles(validationResult);

    if (
      !canonicalSmiles ||
      !isCurrentRequest(requestId, getCurrentRequestId)
    ) {
      return null;
    }

    const compatibility = await Promise.resolve(
      evaluateCandidate(candidate, validationResult),
    );

    if (!isCurrentRequest(requestId, getCurrentRequestId)) {
      return null;
    }

    if (!compatibility.canLoad3D) {
      return {
        kind: 'blocked',
        compatibility,
      };
    }

    if (!isCurrentRequest(requestId, getCurrentRequestId)) {
      return null;
    }

    const lookup = await fetch3DSdf({
      cid: candidate.cid,
      label,
      pubchemName: candidate.title,
      structureMatchStatus: compatibility.structureMatchStatus,
      expectedCanonicalSmiles: canonicalSmiles,
    });

    if (!isCurrentRequest(requestId, getCurrentRequestId)) {
      return null;
    }

    return {
      kind: 'loaded',
      lookup,
    };
  }

  return {
    searchCandidatesForValidatedStructure,
    loadSelectedCandidate,
  };
}
