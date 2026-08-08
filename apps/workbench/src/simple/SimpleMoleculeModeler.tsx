import {
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import { KetcherEditor, normalizeKetcherError } from '../components/editor/KetcherEditor';
import { Molecule3DViewer } from '../components/Molecule3DViewer';
import { PubChemCandidatePanel } from '../components/pubchem/PubChemCandidatePanel';
import { Vsepr3DModelViewer } from '../components/Vsepr3DModelViewer';
import { VseprPanel } from '../components/vsepr/VseprPanel';
import {
  exampleMolecules,
  type ExampleMolecule,
} from '../data/exampleMolecules';
import type {
  ChemicalEditorHandle,
  ExtractedStructureData,
} from '../editor/chemical-editor-handle';
import {
  fetchPubChem3DSdf,
  type PubChem3DLoadStatus,
  type PubChem3DLookupResult,
} from '../services/pubchem3d';
import { validateMoleculeInput } from '../services/rdkitService';
import { analyzeVseprFromMolBlock } from '../services/vseprEngine';
import { hasVseprGeometryTemplate } from '../services/vseprGeometryTemplates';
import type {
  Molecule3DInput,
  MoleculeValidationResult,
  PubChemCandidate,
  PubChemMatchStatus,
} from '../types/molecule';
import type {
  VseprAnalysis,
  VseprModelViewStatus,
} from '../types/vsepr';
import { createSimpleExternal3DFlow } from './simpleExternal3DFlow';
import './SimpleMoleculeModeler.css';

type SimpleTool = '2d' | 'vsepr' | '3d';
type ValidMoleculeValidationResult = Extract<
  MoleculeValidationResult,
  { ok: true }
>;

type SimpleAnalysisSuccess = {
  validationResult: ValidMoleculeValidationResult;
  matchedExample: ExampleMolecule | null;
};

type SimplePubChemCandidateState = {
  status: PubChemMatchStatus;
  candidates: PubChemCandidate[];
  warnings: string[];
  studentMessage?: string;
  selectedCandidateCid?: number;
};

export type SimpleDerivedState = {
  extractedStructure: ExtractedStructureData | null;
  validationResult: MoleculeValidationResult | null;
  selectedCentralAtomId: string;
  vseprAnalysis: VseprAnalysis;
  vseprModelStatus: VseprModelViewStatus;
  coordinateData: Molecule3DInput | null;
  validatedExampleId: string | null;
  external3DStatus: PubChem3DLoadStatus;
  external3DMessage: string;
  statusMessage: string;
};

const SIMPLE_EXAMPLE_IDS = new Set([
  'water',
  'methane',
  'ammonia',
  'carbon-dioxide',
]);
const SIMPLE_STATIC_3D_IDS = new Set(['water', 'methane']);
const SIMPLE_TOOLS: SimpleTool[] = ['2d', 'vsepr', '3d'];
const SIMPLE_EXTERNAL_3D_FLOW = createSimpleExternal3DFlow();
const INITIAL_PUBCHEM_CANDIDATE_STATE: SimplePubChemCandidateState = {
  status: 'not_requested',
  candidates: [],
  warnings: [],
};

const INITIAL_VSEPR_ANALYSIS: VseprAnalysis = {
  status: 'not_requested',
  confidence: 'low',
  warnings: [],
  studentMessage: '2D 구조를 확인하면 중심 원자 주변의 모양을 예상할 수 있습니다.',
};

export function getSimpleExampleMolecules(): ExampleMolecule[] {
  return exampleMolecules.filter((example) =>
    SIMPLE_EXAMPLE_IDS.has(example.id),
  );
}

export function isSimple3DOutputDisabled(input: {
  editorReady: boolean;
  isStructureAnalysisPending: boolean;
  external3DStatus: PubChem3DLoadStatus;
  candidateSearchStatus: PubChemMatchStatus;
}): boolean {
  return (
    !input.editorReady ||
    input.isStructureAnalysisPending ||
    input.external3DStatus === 'loading' ||
    input.candidateSearchStatus === 'searching'
  );
}

export function getSimple3DOutputButtonLabel(input: {
  isStructureAnalysisPending: boolean;
  external3DStatus: PubChem3DLoadStatus;
  candidateSearchStatus: PubChemMatchStatus;
}): string {
  if (input.candidateSearchStatus === 'searching') {
    return '후보 검색 중…';
  }

  if (
    input.isStructureAnalysisPending ||
    input.external3DStatus === 'loading'
  ) {
    return '분석하고 3D 구조 출력 중';
  }

  return '분석하고 3D 구조 출력';
}

export function resolveSimpleExampleForValidatedStructure(
  result: MoleculeValidationResult,
): ExampleMolecule | null {
  if (result.ok !== true) {
    return null;
  }

  const canonicalSmiles = result.canonicalSmiles.trim();

  return (
    getSimpleExampleMolecules().find(
      (example) => example.smiles === canonicalSmiles,
    ) ?? null
  );
}

export function buildSimple3DInput(
  example: ExampleMolecule,
): Molecule3DInput | null {
  if (!SIMPLE_STATIC_3D_IDS.has(example.id) || !example.structure3D) {
    return null;
  }

  return {
    format: example.structure3D.format,
    data: example.structure3D.data,
    label: example.nameKo,
    sourceType: example.structure3D.sourceType,
    coordinateDimension: example.structure3D.coordinateDimension,
    structureMatchStatus: example.structure3D.structureMatchStatus,
    coordinateSource: '앱 내장 교육용 정적 좌표',
    sourceNote: example.structure3D.sourceNote,
    sourceUrl: example.structure3D.sourceUrl,
  };
}

export async function loadSimpleExternal3DForValidatedExample(input: {
  example: ExampleMolecule;
  validationResult: MoleculeValidationResult;
  requestId: number;
  getCurrentRequestId: () => number;
  onStatusChange: (status: PubChem3DLoadStatus) => void;
}): Promise<PubChem3DLookupResult | null> {
  if (
    input.validationResult.ok !== true ||
    typeof input.example.pubchemCid !== 'number' ||
    input.requestId !== input.getCurrentRequestId()
  ) {
    return null;
  }

  input.onStatusChange('loading');

  const result = await fetchPubChem3DSdf({
    cid: input.example.pubchemCid,
    label: input.example.nameKo,
    pubchemName: input.example.pubchemName,
    expectedCanonicalSmiles: input.validationResult.canonicalSmiles,
  });

  if (input.requestId !== input.getCurrentRequestId()) {
    return null;
  }

  input.onStatusChange(result.status);
  return result;
}

export function createInitialSimpleDerivedState(): SimpleDerivedState {
  return {
    extractedStructure: null,
    validationResult: null,
    selectedCentralAtomId: '',
    vseprAnalysis: INITIAL_VSEPR_ANALYSIS,
    vseprModelStatus: 'not_requested',
    coordinateData: null,
    validatedExampleId: null,
    external3DStatus: 'idle',
    external3DMessage:
      '구조를 확인한 뒤 3D 구조 출력 버튼을 누르면 좌표 자료를 확인할 수 있습니다.',
    statusMessage: '분자를 그리거나 예시를 불러온 뒤 구조 확인을 눌러 주세요.',
  };
}

export function invalidateSimpleDerivedState(
  _state: SimpleDerivedState,
): SimpleDerivedState {
  return createInitialSimpleDerivedState();
}

export function isSimpleAnalysisRequestCurrent(
  requestId: number,
  currentRequestId: number,
): boolean {
  return requestId === currentRequestId;
}

function getVseprModelStatus(
  analysis: VseprAnalysis,
): VseprModelViewStatus {
  if (
    analysis.status === 'supported' &&
    hasVseprGeometryTemplate(analysis.axeNotation)
  ) {
    return 'ready';
  }

  return analysis.status === 'not_requested' ? 'not_requested' : 'unsupported';
}

function formatConnectivity(result: MoleculeValidationResult | null): string {
  if (!result?.graphSummary) {
    return '아직 확인하지 않음';
  }

  const graph = result.graphSummary;
  const connection =
    graph.componentCount === 1
      ? '하나의 구조로 연결됨'
      : `${graph.componentCount}개의 조각으로 나뉨`;

  return `원자 ${graph.atomCount}개 · 결합 ${graph.bondCount}개 · ${connection}`;
}

function getStudentError(error: unknown): string {
  const message = normalizeKetcherError(error, '');

  if (/준비|ready/i.test(message)) {
    return '분자 그리기 도구가 준비된 뒤 다시 시도해 주세요.';
  }

  if (/비어|empty|먼저 그/i.test(message)) {
    return '분자 구조가 비어 있습니다. 원자와 결합을 먼저 그려 주세요.';
  }

  return '구조를 확인하지 못했습니다. 원자와 결합을 살펴본 뒤 다시 시도해 주세요.';
}

export function SimpleMoleculeModeler() {
  const editorRef = useRef<ChemicalEditorHandle | null>(null);
  const analysisRequestIdRef = useRef(0);
  const external3DFlowRequestIdRef = useRef(0);
  const [activeTool, setActiveTool] = useState<SimpleTool>('2d');
  const [selectedExampleId, setSelectedExampleId] = useState('water');
  const [editorReady, setEditorReady] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [derivedState, setDerivedState] = useState<SimpleDerivedState>(
    createInitialSimpleDerivedState,
  );
  const [candidateState, setCandidateState] =
    useState<SimplePubChemCandidateState>(
      INITIAL_PUBCHEM_CANDIDATE_STATE,
    );
  const simpleExamples = getSimpleExampleMolecules();

  useEffect(
    () => () => {
      analysisRequestIdRef.current += 1;
      external3DFlowRequestIdRef.current += 1;
    },
    [],
  );

  const beginRequest = () => {
    const requestId = analysisRequestIdRef.current + 1;
    analysisRequestIdRef.current = requestId;
    return requestId;
  };

  const isCurrentRequest = (requestId: number) =>
    isSimpleAnalysisRequestCurrent(
      requestId,
      analysisRequestIdRef.current,
    );

  const resetDerivedState = (statusMessage?: string) => {
    external3DFlowRequestIdRef.current += 1;
    setCandidateState(INITIAL_PUBCHEM_CANDIDATE_STATE);
    const next = createInitialSimpleDerivedState();
    setDerivedState(
      statusMessage ? { ...next, statusMessage } : next,
    );
  };

  const activate3DTool = () => {
    setActiveTool('3d');
    window.requestAnimationFrame(() => {
      document.getElementById('simple-tool-3d')?.focus();
    });
  };

  const analyzeWithRequest = async (
    requestId: number,
    example?: ExampleMolecule,
  ): Promise<SimpleAnalysisSuccess | null> => {
    const editor = editorRef.current;

    if (!editor) {
      throw new Error('분자 그리기 도구가 아직 준비되지 않았습니다.');
    }

    const structure = await editor.extractStructure();

    if (!isCurrentRequest(requestId)) {
      return null;
    }

    const labeledStructure = {
      ...structure,
      label: example?.nameKo,
      structureIntent: 'single-molecule' as const,
    };
    const validationResult = await validateMoleculeInput(labeledStructure);

    if (!isCurrentRequest(requestId)) {
      return null;
    }

    if (!validationResult.ok) {
      setDerivedState({
        ...createInitialSimpleDerivedState(),
        extractedStructure: structure,
        validationResult,
        external3DStatus: 'error',
        external3DMessage: validationResult.studentMessage,
        statusMessage: validationResult.studentMessage,
      });
      return null;
    }

    const rawVseprAnalysis = analyzeVseprFromMolBlock({
      molBlock: structure.molBlock,
    });
    const vseprAnalysis =
      rawVseprAnalysis.status === 'supported'
        ? {
            ...rawVseprAnalysis,
            studentMessage: `VSEPR 분석 가능: ${
              rawVseprAnalysis.studentMessage ??
              '선택한 중심 원자 주변의 이상적인 모양을 확인해 보세요.'
            }`,
          }
        : rawVseprAnalysis;
    const matchedExample =
      resolveSimpleExampleForValidatedStructure(validationResult);
    const coordinateData = matchedExample
      ? buildSimple3DInput(matchedExample)
      : null;

    setDerivedState({
      extractedStructure: structure,
      validationResult,
      selectedCentralAtomId: vseprAnalysis.centralAtomId ?? '',
      vseprAnalysis,
      vseprModelStatus: getVseprModelStatus(vseprAnalysis),
      coordinateData,
      validatedExampleId: matchedExample?.id ?? null,
      external3DStatus: coordinateData ? 'success' : 'idle',
      external3DMessage: coordinateData
        ? `${matchedExample?.nameKo}의 앱 내장 교육용 3D 좌표가 준비되었습니다.`
        : matchedExample?.pubchemCid
          ? `${matchedExample.nameKo}은 3D 구조 출력 버튼을 누르면 검증된 외부 좌표를 불러옵니다.`
          : '직접 그린 구조의 외부 3D 출력은 이번 기본형에서 지원하지 않습니다.',
      statusMessage: `${validationResult.molecularFormula} 구조 검증을 완료했습니다.`,
    });

    return {
      validationResult,
      matchedExample,
    };
  };

  const handleLoadExample = async () => {
    if (isPending) {
      return;
    }

    const example = simpleExamples.find(
      (item) => item.id === selectedExampleId,
    );

    if (!example) {
      resetDerivedState('불러올 예시 분자를 선택해 주세요.');
      return;
    }

    const requestId = beginRequest();
    setIsPending(true);
    resetDerivedState(`${example.nameKo} 예시를 불러오는 중입니다.`);

    try {
      if (!editorRef.current) {
        throw new Error('분자 그리기 도구가 아직 준비되지 않았습니다.');
      }

      await editorRef.current.setMolecule({ smiles: example.smiles });

      if (!isCurrentRequest(requestId)) {
        return;
      }

      await analyzeWithRequest(requestId, example);
    } catch (error) {
      if (isCurrentRequest(requestId)) {
        resetDerivedState(getStudentError(error));
      }
    } finally {
      if (isCurrentRequest(requestId)) {
        setIsPending(false);
      }
    }
  };

  const handleAnalyze = async () => {
    if (isPending) {
      return;
    }

    const requestId = beginRequest();
    const retainedExample = simpleExamples.find(
      (example) => example.id === derivedState.validatedExampleId,
    );
    setIsPending(true);
    resetDerivedState('2D 연결 관계와 분자 정보를 확인하는 중입니다.');

    try {
      await analyzeWithRequest(requestId, retainedExample);
    } catch (error) {
      if (isCurrentRequest(requestId)) {
        resetDerivedState(getStudentError(error));
      }
    } finally {
      if (isCurrentRequest(requestId)) {
        setIsPending(false);
      }
    }
  };

  const handleClear = async () => {
    const requestId = beginRequest();
    setIsPending(true);
    resetDerivedState('편집 영역을 비우는 중입니다.');

    try {
      await editorRef.current?.clear();

      if (isCurrentRequest(requestId)) {
        resetDerivedState('분자 구조를 비웠습니다. 새 구조를 그려 주세요.');
        setActiveTool('2d');
      }
    } catch (error) {
      if (isCurrentRequest(requestId)) {
        resetDerivedState(getStudentError(error));
      }
    } finally {
      if (isCurrentRequest(requestId)) {
        setIsPending(false);
      }
    }
  };

  const handleEditorStructureChange = () => {
    analysisRequestIdRef.current += 1;
    setIsPending(false);
    resetDerivedState(
      '2D 구조가 바뀌어 이전 검증·VSEPR·3D 결과를 지웠습니다. 다시 구조를 확인해 주세요.',
    );
  };

  const handleSelectCentralAtom = (atomId: string) => {
    const molBlock = derivedState.extractedStructure?.molBlock;

    if (!molBlock) {
      return;
    }

    const analysis = analyzeVseprFromMolBlock({
      molBlock,
      selectedCentralAtomId: atomId,
    });

    setDerivedState((current) => ({
      ...current,
      selectedCentralAtomId: atomId,
      vseprAnalysis: analysis,
      vseprModelStatus: getVseprModelStatus(analysis),
      statusMessage:
        analysis.status === 'supported'
          ? `${analysis.centralAtomLabel ?? '선택한 중심 원자'} 주변의 VSEPR 모형을 준비했습니다.`
          : analysis.studentMessage ?? '이 중심 원자의 모양을 예상하지 못했습니다.',
    }));
  };

  const handleSearchExternal3DCandidates = async (
    currentValidation: ValidMoleculeValidationResult,
  ) => {
    const requestId = external3DFlowRequestIdRef.current + 1;
    external3DFlowRequestIdRef.current = requestId;

    setCandidateState((current) => ({
      ...current,
      status: 'searching',
      warnings: [],
      selectedCandidateCid: undefined,
      studentMessage: '외부 3D 자료 후보를 검색하는 중입니다.',
    }));
    setDerivedState((current) => ({
      ...current,
      coordinateData: null,
      validatedExampleId: null,
      external3DStatus: 'idle',
      external3DMessage:
        '현재 2D 구조의 표준 구조 표현으로 외부 3D 자료 후보를 검색하는 중입니다.',
    }));
    activate3DTool();

    try {
      const result =
        await SIMPLE_EXTERNAL_3D_FLOW.searchCandidatesForValidatedStructure({
          validationResult: currentValidation,
          requestId,
          getCurrentRequestId: () => external3DFlowRequestIdRef.current,
        });

      if (!result) {
        return;
      }

      setCandidateState((current) => ({
        status: result.status,
        candidates: result.ok ? result.candidates : current.candidates,
        warnings: result.warnings,
        studentMessage: result.studentMessage,
        selectedCandidateCid: undefined,
      }));
      setDerivedState((current) => ({
        ...current,
        coordinateData: null,
        external3DStatus:
          result.status === 'error'
            ? 'error'
            : result.status === 'no_match'
              ? 'noData'
              : 'idle',
        external3DMessage:
          result.status === 'error'
            ? '외부 3D 자료 후보를 검색하지 못했습니다. 2D 구조 확인 결과는 유지되며 다시 시도할 수 있습니다.'
            : result.status === 'no_match'
              ? '현재 구조와 일치하는 외부 3D 자료 후보를 찾지 못했습니다.'
              : `외부 3D 자료 후보 ${result.candidates.length}개를 찾았습니다. 후보를 직접 선택해 주세요.`,
      }));
    } catch {
      if (requestId !== external3DFlowRequestIdRef.current) {
        return;
      }

      setCandidateState((current) => ({
        ...current,
        status: 'error',
        selectedCandidateCid: undefined,
        studentMessage:
          '외부 3D 자료 후보를 검색하지 못했습니다. 다시 시도할 수 있습니다.',
      }));
      setDerivedState((current) => ({
        ...current,
        coordinateData: null,
        external3DStatus: 'error',
        external3DMessage:
          '외부 3D 자료 후보를 검색하지 못했습니다. 2D 구조 확인 결과는 유지되며 다시 시도할 수 있습니다.',
      }));
    }
  };

  const handleSelectExternal3DCandidate = async (
    candidate: PubChemCandidate,
  ) => {
    const currentValidation =
      derivedState.validationResult?.ok === true
        ? derivedState.validationResult
        : null;

    if (!currentValidation) {
      setDerivedState((current) => ({
        ...current,
        external3DStatus: 'error',
        external3DMessage:
          '현재 2D 구조 확인 결과가 없습니다. 구조를 다시 확인해 주세요.',
      }));
      return;
    }

    const requestId = external3DFlowRequestIdRef.current + 1;
    external3DFlowRequestIdRef.current = requestId;
    setCandidateState((current) => ({
      ...current,
      selectedCandidateCid: candidate.cid,
    }));
    setDerivedState((current) => ({
      ...current,
      coordinateData: null,
      external3DStatus: 'loading',
      external3DMessage:
        '선택한 외부 3D 자료가 현재 2D 구조와 일치하는지 확인하는 중입니다.',
    }));

    try {
      const result = await SIMPLE_EXTERNAL_3D_FLOW.loadSelectedCandidate({
        candidate,
        validationResult: currentValidation,
        label:
          candidate.title ??
          `${currentValidation.molecularFormula} 3D 자료 후보`,
        requestId,
        getCurrentRequestId: () => external3DFlowRequestIdRef.current,
      });

      if (!result) {
        return;
      }

      if (result.kind === 'blocked') {
        setCandidateState((current) => ({
          ...current,
          selectedCandidateCid: undefined,
          warnings: [
            ...new Set([
              ...current.warnings,
              ...result.compatibility.warnings,
            ]),
          ],
          studentMessage:
            result.compatibility.studentMessage ?? current.studentMessage,
        }));
        setDerivedState((current) => ({
          ...current,
          coordinateData: null,
          external3DStatus: 'error',
          external3DMessage:
            '선택한 후보가 현재 2D 연결 구조와 일치하지 않습니다. 다른 후보를 선택해 주세요.',
        }));
        return;
      }

      const lookup = result.lookup;

      if (lookup.ok) {
        setCandidateState((current) => ({
          ...current,
          warnings: [
            ...new Set([
              ...current.warnings,
              ...lookup.warnings,
            ]),
          ],
        }));
        setDerivedState((current) => ({
          ...current,
          coordinateData: lookup.molecule3D,
          validatedExampleId: null,
          external3DStatus: 'success',
          external3DMessage:
            '현재 2D 구조와 일치하는 외부 교육용 3D 좌표를 출력했습니다.',
        }));
        activate3DTool();
        return;
      }

      setCandidateState((current) => ({
        ...current,
        selectedCandidateCid: undefined,
        warnings: [
          ...new Set([...current.warnings, ...lookup.warnings]),
        ],
      }));
      setDerivedState((current) => ({
        ...current,
        coordinateData: null,
        external3DStatus: lookup.status,
        external3DMessage:
          lookup.status === 'noData'
            ? '선택한 후보에는 출력 가능한 3D 좌표가 없습니다. 다른 후보를 선택할 수 있습니다.'
            : '선택한 외부 3D 자료를 불러오지 못했습니다. 2D 구조와 후보 목록은 유지되며 다시 시도할 수 있습니다.',
      }));
    } catch {
      if (requestId !== external3DFlowRequestIdRef.current) {
        return;
      }

      setCandidateState((current) => ({
        ...current,
        selectedCandidateCid: undefined,
      }));
      setDerivedState((current) => ({
        ...current,
        coordinateData: null,
        external3DStatus: 'error',
        external3DMessage:
          '선택한 외부 3D 자료를 불러오지 못했습니다. 2D 구조와 후보 목록은 유지되며 다시 시도할 수 있습니다.',
      }));
    }
  };

  const output3DForValidatedStructure = async (
    currentValidation: ValidMoleculeValidationResult,
    matchedExample: ExampleMolecule | null,
  ) => {
    if (!matchedExample) {
      await handleSearchExternal3DCandidates(currentValidation);
      return;
    }

    if (
      derivedState.coordinateData &&
      derivedState.validatedExampleId === matchedExample.id
    ) {
      activate3DTool();
      return;
    }

    const staticCoordinates = buildSimple3DInput(matchedExample);

    if (staticCoordinates) {
      setDerivedState((current) => ({
        ...current,
        coordinateData: staticCoordinates,
        validatedExampleId: matchedExample.id,
        external3DStatus: 'success',
        external3DMessage: `${matchedExample.nameKo}의 앱 내장 교육용 3D 좌표를 출력했습니다.`,
      }));
      activate3DTool();
      return;
    }

    if (typeof matchedExample.pubchemCid !== 'number') {
      setDerivedState((current) => ({
        ...current,
        coordinateData: null,
        validatedExampleId: matchedExample.id,
        external3DStatus: 'noData',
        external3DMessage:
          '이 구조에는 현재 출력할 수 있는 3D 좌표 자료가 없습니다.',
      }));
      return;
    }

    const requestId = beginRequest();
    setDerivedState((current) => ({
      ...current,
      coordinateData: null,
      validatedExampleId: matchedExample.id,
      external3DStatus: 'loading',
      external3DMessage: `${matchedExample.nameKo}의 외부 3D 좌표를 불러오고 구조 일치를 확인하는 중입니다.`,
    }));

    try {
      const result = await loadSimpleExternal3DForValidatedExample({
        example: matchedExample,
        validationResult: currentValidation,
        requestId,
        getCurrentRequestId: () => analysisRequestIdRef.current,
        onStatusChange: (status) => {
          if (isCurrentRequest(requestId)) {
            setDerivedState((current) => ({
              ...current,
              external3DStatus: status,
            }));
          }
        },
      });

      if (!result || !isCurrentRequest(requestId)) {
        return;
      }

      if (result.ok) {
        setDerivedState((current) => ({
          ...current,
          coordinateData: result.molecule3D,
          validatedExampleId: matchedExample.id,
          external3DStatus: 'success',
          external3DMessage: `${matchedExample.nameKo}의 검증된 외부 교육용 3D 좌표를 출력했습니다.`,
        }));
        activate3DTool();
        return;
      }

      setDerivedState((current) => ({
        ...current,
        coordinateData: null,
        external3DStatus: result.status,
        external3DMessage:
          result.status === 'noData'
            ? `${matchedExample.nameKo}의 외부 3D 좌표 자료를 찾지 못했습니다. 2D 구조 확인 결과는 계속 사용할 수 있습니다.`
            : '외부 3D 자료를 불러오거나 현재 구조와 일치하는지 확인하지 못했습니다. 2D 구조 확인 결과는 계속 사용할 수 있습니다.',
      }));
    } catch {
      if (isCurrentRequest(requestId)) {
        setDerivedState((current) => ({
          ...current,
          coordinateData: null,
          external3DStatus: 'error',
          external3DMessage:
            '외부 3D 자료를 불러오지 못했습니다. 2D 구조 확인 결과는 계속 사용할 수 있습니다.',
        }));
      }
    }
  };

  const handleOutput3D = async () => {
    let currentValidation =
      derivedState.validationResult?.ok === true
        ? derivedState.validationResult
        : null;
    let matchedExample = currentValidation
      ? resolveSimpleExampleForValidatedStructure(currentValidation)
      : null;

    if (!currentValidation) {
      const requestId = beginRequest();
      let analysisSuccess: SimpleAnalysisSuccess | null = null;

      setIsPending(true);
      resetDerivedState('2D 구조를 분석한 뒤 3D 출력 경로를 확인하는 중입니다.');

      try {
        analysisSuccess = await analyzeWithRequest(requestId);
      } catch (error) {
        if (isCurrentRequest(requestId)) {
          const studentMessage = getStudentError(error);
          const next = createInitialSimpleDerivedState();

          setDerivedState({
            ...next,
            external3DStatus: 'error',
            external3DMessage: studentMessage,
            statusMessage: studentMessage,
          });
        }
      } finally {
        if (isCurrentRequest(requestId)) {
          setIsPending(false);
        }
      }

      if (!analysisSuccess || !isCurrentRequest(requestId)) {
        return;
      }

      currentValidation = analysisSuccess.validationResult;
      matchedExample = analysisSuccess.matchedExample;
    }

    await output3DForValidatedStructure(currentValidation, matchedExample);
  };

  const selectTool = (tool: SimpleTool) => {
    setActiveTool(tool);
  };

  const handleTabKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    tool: SimpleTool,
  ) => {
    const index = SIMPLE_TOOLS.indexOf(tool);
    let nextIndex = index;

    if (event.key === 'ArrowRight') {
      nextIndex = (index + 1) % SIMPLE_TOOLS.length;
    } else if (event.key === 'ArrowLeft') {
      nextIndex = (index - 1 + SIMPLE_TOOLS.length) % SIMPLE_TOOLS.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = SIMPLE_TOOLS.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    selectTool(SIMPLE_TOOLS[nextIndex]);
    document.getElementById(`simple-tool-${SIMPLE_TOOLS[nextIndex]}`)?.focus();
  };

  const validationResult = derivedState.validationResult;
  const validResult = validationResult?.ok ? validationResult : null;
  const has3DCoordinates = Boolean(derivedState.coordinateData);
  const hasExternalCoordinates =
    derivedState.coordinateData?.sourceType === 'pubchem';

  return (
    <main
      className="simple-modeler"
      data-testid="simple-modeler-shell"
    >
      <header className="simple-modeler__header">
        <div>
          <p className="simple-modeler__eyebrow">분자 구조 모델링 · 기본형</p>
          <h1>그리기 · VSEPR · 3D 측정</h1>
          <p>
            2D 연결 관계를 먼저 확인한 뒤 중심 원자 주변 모양과 교육용 3D
            좌표를 차례로 살펴봅니다.
          </p>
        </div>
        <div className="simple-modeler__example-controls">
          <label>
            <span>예시 분자</span>
            <select
              data-testid="simple-example-select"
              value={selectedExampleId}
              onChange={(event) => {
                setSelectedExampleId(event.currentTarget.value);
              }}
            >
              {simpleExamples.map((example) => (
                <option key={example.id} value={example.id}>
                  {example.nameKo} ({example.nameEn})
                </option>
              ))}
            </select>
          </label>
          <button
            data-testid="simple-load-example-button"
            type="button"
            disabled={!editorReady || isPending}
            onClick={() => {
              void handleLoadExample();
            }}
          >
            예시 불러오기
          </button>
          <button
            className="simple-modeler__button--quiet"
            data-testid="simple-clear-button"
            type="button"
            disabled={!editorReady || isPending}
            onClick={() => {
              void handleClear();
            }}
          >
            모두 지우기
          </button>
        </div>
      </header>

      <nav
        className="simple-modeler__tabs"
        data-testid="simple-tool-tabs"
        role="tablist"
        aria-label="분자 구조 모델링 도구"
      >
        {SIMPLE_TOOLS.map((tool, index) => {
          const labels = {
            '2d': '1. 2D 구조 그리기',
            vsepr: '2. VSEPR 생성기',
            '3d': '3. 3D 구조와 측정',
          };

          return (
            <button
              id={`simple-tool-${tool}`}
              key={tool}
              role="tab"
              type="button"
              data-testid={`simple-tool-${tool}`}
              aria-controls={`simple-tool-panel-${tool}`}
              aria-selected={activeTool === tool}
              tabIndex={activeTool === tool ? 0 : -1}
              onClick={() => {
                selectTool(tool);
              }}
              onKeyDown={(event) => {
                handleTabKeyDown(event, tool);
              }}
            >
              <span aria-hidden="true">{index + 1}</span>
              {labels[tool]}
            </button>
          );
        })}
      </nav>

      <p
        className="simple-modeler__status"
        data-testid="simple-validation-status"
        role="status"
        aria-live="polite"
      >
        {isPending ? '처리 중입니다. 잠시 기다려 주세요.' : derivedState.statusMessage}
      </p>

      <section
        id="simple-tool-panel-2d"
        className="simple-modeler__tool-panel"
        data-testid="simple-tool-panel-2d"
        role="tabpanel"
        aria-labelledby="simple-tool-2d"
        hidden={activeTool !== '2d'}
      >
        <div className="simple-modeler__two-column">
          <KetcherEditor
            ref={editorRef}
            isModeSwitchDisabled={isPending}
            onReadyChange={setEditorReady}
            onStructureChange={handleEditorStructureChange}
            onError={(message) => {
              resetDerivedState(getStudentError(new Error(message)));
            }}
          />

          <aside className="simple-modeler__results" aria-label="구조 확인 결과">
            <div className="simple-modeler__section-heading">
              <div>
                <p>구조 확인</p>
                <h2>연결 관계와 분자 정보</h2>
              </div>
              <button
                data-testid="simple-analyze-button"
                type="button"
                disabled={!editorReady || isPending}
                onClick={() => {
                  void handleAnalyze();
                }}
              >
                구조 확인하기
              </button>
            </div>
            <dl className="simple-modeler__result-grid">
              <div>
                <dt>연결 상태</dt>
                <dd data-testid="simple-graph-output">
                  {formatConnectivity(validationResult)}
                </dd>
              </div>
              <div>
                <dt>분자식</dt>
                <dd data-testid="simple-formula-output">
                  {validResult?.molecularFormula ?? '검증 후 표시'}
                </dd>
              </div>
              <div>
                <dt>분자량</dt>
                <dd data-testid="simple-mass-output">
                  {validResult
                    ? `${validResult.molecularWeight.toFixed(3)} g/mol`
                    : '검증 후 표시'}
                </dd>
              </div>
            </dl>
            <div className="simple-modeler__3d-output">
              <button
                data-testid="simple-output-3d-button"
                type="button"
                aria-describedby="simple-external-search-consent"
                disabled={isSimple3DOutputDisabled({
                  editorReady,
                  isStructureAnalysisPending: isPending,
                  external3DStatus: derivedState.external3DStatus,
                  candidateSearchStatus: candidateState.status,
                })}
                onClick={() => {
                  void handleOutput3D();
                }}
              >
                {getSimple3DOutputButtonLabel({
                  isStructureAnalysisPending: isPending,
                  external3DStatus: derivedState.external3DStatus,
                  candidateSearchStatus: candidateState.status,
                })}
              </button>
              <p
                data-testid="simple-3d-load-status"
                data-status={derivedState.external3DStatus}
                role="status"
                aria-live="polite"
              >
                {derivedState.external3DMessage}
              </p>
              <p
                id="simple-external-search-consent"
                className="simple-modeler__external-search-consent"
              >
                직접 그린 복잡 구조에서는 이 버튼을 누르는 것이 외부 3D 자료
                후보 검색에 대한 동의입니다. 구조 확인용 표준 구조 표현만
                전송하며 학생 이름·학급·활동 기록은 전송하지 않습니다.
              </p>
            </div>
            <p className="simple-modeler__boundary-note">
              2D 구조식은 원자가 어떻게 연결되었는지를 나타냅니다. 화면에서
              가까이 놓인 원자는 결합선으로 연결해야 같은 분자가 됩니다.
            </p>
          </aside>
        </div>
      </section>

      <section
        id="simple-tool-panel-vsepr"
        className="simple-modeler__tool-panel"
        data-testid="simple-tool-panel-vsepr"
        role="tabpanel"
        aria-labelledby="simple-tool-vsepr"
        hidden={activeTool !== 'vsepr'}
      >
        {activeTool === 'vsepr' ? (
          <div className="simple-modeler__vsepr-grid">
            <VseprPanel
              analysis={derivedState.vseprAnalysis}
              selectedCentralAtomId={derivedState.selectedCentralAtomId}
              onSelectCentralAtom={handleSelectCentralAtom}
              canShowModel={
                derivedState.vseprAnalysis.status === 'supported' &&
                hasVseprGeometryTemplate(derivedState.vseprAnalysis.axeNotation)
              }
              modelStatus={derivedState.vseprModelStatus}
              onShowModel={() => {
                setDerivedState((current) => ({
                  ...current,
                  vseprModelStatus: 'rendered',
                }));
              }}
            />
            <Vsepr3DModelViewer
              analysis={derivedState.vseprAnalysis}
              modelStatus={derivedState.vseprModelStatus}
            />
          </div>
        ) : null}
      </section>

      <section
        id="simple-tool-panel-3d"
        className="simple-modeler__tool-panel"
        data-testid="simple-tool-panel-3d"
        role="tabpanel"
        aria-labelledby="simple-tool-3d"
        hidden={activeTool !== '3d'}
      >
        {activeTool === '3d' ? (
          <>
            {candidateState.status !== 'not_requested' &&
            !has3DCoordinates ? (
              <div
                className="simple-modeler__candidate-search"
                data-testid="simple-candidate-search"
                aria-busy={
                  candidateState.status === 'searching' ||
                  derivedState.external3DStatus === 'loading'
                }
              >
                <p
                  className="simple-modeler__candidate-search-status"
                  data-testid="simple-candidate-search-status"
                  role="status"
                  aria-live="polite"
                >
                  {derivedState.external3DMessage}
                </p>
                <PubChemCandidatePanel
                  displayMode="student"
                  canSearch={
                    Boolean(validResult) &&
                    candidateState.status !== 'searching' &&
                    derivedState.external3DStatus !== 'loading'
                  }
                  status={candidateState.status}
                  candidates={candidateState.candidates}
                  warnings={candidateState.warnings}
                  studentMessage={candidateState.studentMessage}
                  selectedCandidateCid={
                    candidateState.selectedCandidateCid
                  }
                  isLoading3D={
                    derivedState.external3DStatus === 'loading'
                  }
                  onSearch={() => {
                    if (validResult) {
                      void handleSearchExternal3DCandidates(validResult);
                    }
                  }}
                  onSelectCandidate={(candidate) => {
                    void handleSelectExternal3DCandidate(candidate);
                  }}
                />
              </div>
            ) : null}
            <div
              className={
                has3DCoordinates
                  ? 'simple-modeler__coordinate-note'
                  : 'simple-modeler__coordinate-note is-limited'
              }
            >
              <strong>
                {hasExternalCoordinates
                  ? 'RDKit 구조 일치를 확인한 외부 교육용 3D 좌표입니다.'
                  : has3DCoordinates
                    ? '앱 내장 교육용 정적 3D 좌표입니다.'
                    : '아직 출력된 3D 좌표가 없습니다.'}
              </strong>
              <p>
                출처: {derivedState.coordinateData?.coordinateSource ?? '좌표 자료 없음'}.
                표시되는 좌표와 측정값은 개념 학습용이며 실험으로 측정한
                결합길이·결합각이 아닙니다. 물·메테인은 앱 내장 좌표를,
                암모니아·이산화탄소와 직접 그린 복잡 구조는 구조 일치를
                재검증한 외부 좌표를 사용합니다.
              </p>
            </div>
            <Molecule3DViewer
              coordinateData={derivedState.coordinateData}
              hasValidatedStructure={validationResult?.ok === true}
              validatedStructureKey={validResult?.canonicalSmiles}
              userMode="student"
              showAdvancedControls
              showMeasurementControls
            />
          </>
        ) : null}
      </section>
    </main>
  );
}

export default SimpleMoleculeModeler;
