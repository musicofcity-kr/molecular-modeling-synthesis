import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import type { GLViewer } from '3dmol';
import type {
  AtomSelectionMode,
  GeometryMeasurementResult,
  Molecule3DInput,
  Molecule3DRepresentationMode,
  SelectedAtom3D,
} from '../types/molecule';
import type { UserMode } from '../types/activity';
import {
  buildGeometryMeasurementResult,
  formatAtom3DLabel,
  getRequiredAtomCount,
  isBondedMeasurementSelection,
  parseAtomsFromMolecule3DInput,
  parseBondedAtomPairsFromMolecule3DInput,
} from '../services/geometryMeasurement';

export type Molecule3DViewerHandle = {
  loadStructure(input: Molecule3DInput): void;
  clear(): void;
  resize(): void;
  resetView(): boolean;
  rotate(degrees: number): boolean;
  zoom(factor: number): boolean;
};

export type Molecule3DRenderState = {
  evidenceKey: string | null;
  modelRendered: boolean;
};

export function emitMolecule3DRenderState(
  onRenderStateChange: ((state: Molecule3DRenderState) => void) | undefined,
  evidenceKey: string | null | undefined,
  modelRendered: boolean,
): Molecule3DRenderState {
  const state = {
    evidenceKey: evidenceKey ?? null,
    modelRendered,
  };
  onRenderStateChange?.(state);
  return state;
}

type Molecule3DViewerProps = {
  coordinateData?: Molecule3DInput | null;
  hasValidatedStructure: boolean;
  backgroundColor?: string;
  initialZoom?: number;
  validatedStructureKey?: string;
  userMode?: UserMode;
  showAdvancedControls?: boolean;
  showMeasurementControls?: boolean;
  testIdNamespace?: string;
  measurementEvidenceType?: 'coordinate' | 'reference-coordinate';
  requireBondedMeasurements?: boolean;
  renderEvidenceKey?: string;
  actionSlot?: ReactNode;
  onMeasurementResultsChange?: (results: GeometryMeasurementResult[]) => void;
  onRenderStateChange?: (state: Molecule3DRenderState) => void;
  onDeveloperLog?: (message: string) => void;
};

const NO_COORDINATES_MESSAGE = '이 분자의 3D 자료가 아직 준비되지 않았습니다';
const VIEWER_PREPARING_MESSAGE = '3D 구조 보기를 준비하는 중입니다.';
const NO_MEASUREMENT_COORDINATES_MESSAGE =
  '3D 자료가 없어서 측정 도구를 사용할 수 없습니다. 2D 구조 확인 결과는 계속 확인할 수 있습니다.';
const MEASUREMENT_LOADING_MESSAGE =
  '3D 구조 보기가 자료를 준비하는 중입니다. 준비가 끝나면 측정 도구를 사용할 수 있습니다.';
const MEASUREMENT_VALIDATION_BLOCKED_MESSAGE =
  'RDKit.js 검증을 통과한 3D 좌표 데이터에서만 측정 도구를 사용할 수 있습니다.';
const MEASUREMENT_PARSE_FAILED_MESSAGE =
  '현재 3D 좌표 데이터에서 측정 가능한 원자 좌표를 읽지 못했습니다.';
const NOT_CONFIRMED_3D_COORDINATES_MESSAGE =
  '참고 3D 자료로 확인된 데이터가 아니어서 3D 구조로 표시하지 않습니다.';
const SMILES_ONLY_DEVELOPER_LOG = 'SMILES만으로는 아직 3D 구조를 생성하지 않음';
const DEFAULT_REPRESENTATION_MODE: Molecule3DRepresentationMode = 'ball-and-stick';

type ThreeDmolAtomLike = {
  elem?: string;
  element?: string;
  index?: number;
  serial?: number;
  x?: number;
  y?: number;
  z?: number;
};

type ViewerHostSize = Pick<HTMLElement, 'clientWidth' | 'clientHeight'>;

type Molecule3DInitialViewViewer = {
  zoomTo(): unknown;
  zoom(factor: number): unknown;
  getView(): any[];
};

export function getMolecule3DViewerOptions(backgroundColor = 'white') {
  return { backgroundColor };
}

export function initializeMolecule3DViewerView(
  viewer: Molecule3DInitialViewViewer,
  initialZoom = 1,
): any[] {
  viewer.zoomTo();
  if (initialZoom !== 1) {
    viewer.zoom(initialZoom);
  }
  return viewer.getView();
}

export function hasRenderableMoleculeViewerSize(
  host: ViewerHostSize | null,
): boolean {
  return Boolean(host && host.clientWidth > 0 && host.clientHeight > 0);
}

function get3DmolModelFormat(format: Molecule3DInput['format']): string {
  if (format === 'mol') {
    return 'sdf';
  }

  return format;
}

function getInitialMessage(coordinateData?: Molecule3DInput | null): string {
  if (!coordinateData) {
    return NO_COORDINATES_MESSAGE;
  }

  if (coordinateData.coordinateDimension !== '3d') {
    return NOT_CONFIRMED_3D_COORDINATES_MESSAGE;
  }

  return `${coordinateData.label}의 교육용 3D 자료를 표시합니다.`;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '알 수 없는 3Dmol.js 오류';
}

function formatSourceType(sourceType?: Molecule3DInput['sourceType']): string {
  switch (sourceType) {
    case 'static-example':
      return '정적 예제';
    case 'pubchem':
      return 'PubChem';
    case 'user-import':
      return '사용자 가져오기';
    case 'review-needed':
      return '검토 필요';
    default:
      return '없음';
  }
}

function formatRepresentationMode(mode: Molecule3DRepresentationMode): string {
  switch (mode) {
    case 'ball-and-stick':
      return '공-막대 모형';
    case 'stick':
      return '막대 모형';
    case 'space-filling':
      return '공간 채움 모형';
  }
}

function formatStudentCoordinateNote(input?: Molecule3DInput | null): string {
  if (!input) {
    return '표시할 3D 자료가 없습니다.';
  }

  if (input.sourceType === 'pubchem') {
    return '외부 데이터베이스에서 불러온 교육용 참고 3D 자료입니다.';
  }

  return (input.sourceNote ?? '교육용 참고 3D 자료입니다.')
    .replace(/PubChem/g, '외부 자료')
    .replace(/SDF/g, '3D 자료')
    .replace(/3D 좌표/g, '3D 자료');
}

function getRepresentationStyle(mode: Molecule3DRepresentationMode) {
  switch (mode) {
    case 'stick':
      return { stick: { radius: 0.18 } };
    case 'space-filling':
      return { sphere: { scale: 1.0 } };
    case 'ball-and-stick':
      return {
        stick: { radius: 0.16 },
        sphere: { scale: 0.28 },
      };
  }
}

function formatMeasurementMode(mode: AtomSelectionMode): string {
  switch (mode) {
    case 'none':
      return '측정 안 함';
    case 'bond_length':
      return '결합길이 / 원자 간 거리';
    case 'bond_angle':
      return '결합각';
  }
}

function formatMeasurementValue(result: GeometryMeasurementResult): string {
  if (result.type === 'bond_length') {
    return `${result.atomLabels.join('-')} 거리: ${result.value.toFixed(2)} Å`;
  }

  return `${result.atomLabels.join('-')} 각도: ${result.value.toFixed(1)}°`;
}

function buildMeasurementSourceNote(input: Molecule3DInput): string {
  return `${input.coordinateSource} 기준 현재 로드된 3D 좌표 측정값입니다. 정밀 실험값이나 계산화학 최적화값으로 사용하지 마세요.`;
}

function getMeasurementNotice(input: {
  hasCoordinateData: boolean;
  has3DCoordinateData: boolean;
  hasValidatedStructure: boolean;
  viewerStatus: 'loading' | 'ready' | 'error';
  parsedAtomCount: number;
}): string {
  if (!input.hasCoordinateData) {
    return NO_MEASUREMENT_COORDINATES_MESSAGE;
  }

  if (!input.has3DCoordinateData) {
    return NOT_CONFIRMED_3D_COORDINATES_MESSAGE;
  }

  if (!input.hasValidatedStructure) {
    return MEASUREMENT_VALIDATION_BLOCKED_MESSAGE;
  }

  if (input.viewerStatus !== 'ready') {
    return MEASUREMENT_LOADING_MESSAGE;
  }

  if (input.parsedAtomCount === 0) {
    return MEASUREMENT_PARSE_FAILED_MESSAGE;
  }

  return '측정값은 현재 화면에 로드된 3D 좌표를 기준으로 계산됩니다.';
}

function findMatchingParsedAtom(
  clickedAtom: ThreeDmolAtomLike,
  parsedAtoms: SelectedAtom3D[],
): SelectedAtom3D | null {
  const zeroBasedIndex =
    typeof clickedAtom.index === 'number'
      ? clickedAtom.index
      : typeof clickedAtom.serial === 'number'
        ? clickedAtom.serial - 1
        : null;

  if (zeroBasedIndex !== null) {
    const byIndex = parsedAtoms.find((atom) => atom.atomIndex === zeroBasedIndex + 1);

    if (byIndex) {
      return byIndex;
    }
  }

  if (
    typeof clickedAtom.x !== 'number' ||
    typeof clickedAtom.y !== 'number' ||
    typeof clickedAtom.z !== 'number'
  ) {
    return null;
  }

  return (
    parsedAtoms.find(
      (atom) =>
        Math.abs(atom.x - clickedAtom.x!) < 0.001 &&
        Math.abs(atom.y - clickedAtom.y!) < 0.001 &&
        Math.abs(atom.z - clickedAtom.z!) < 0.001,
    ) ?? null
  );
}

export const Molecule3DViewer = forwardRef<
  Molecule3DViewerHandle,
  Molecule3DViewerProps
>(function Molecule3DViewer(
  {
    coordinateData = null,
    hasValidatedStructure,
    backgroundColor = 'white',
    initialZoom = 1,
    validatedStructureKey,
    userMode = 'student',
    showAdvancedControls,
    showMeasurementControls,
    testIdNamespace,
    measurementEvidenceType = 'coordinate',
    requireBondedMeasurements = false,
    renderEvidenceKey,
    actionSlot,
    onMeasurementResultsChange,
    onRenderStateChange,
    onDeveloperLog,
  },
  ref,
) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<GLViewer | null>(null);
  const initialViewRef = useRef<any[] | null>(null);
  const lastNoCoordinateLogKeyRef = useRef<string | null>(null);
  const parsedAtomsRef = useRef<SelectedAtom3D[]>([]);
  const measurementModeRef = useRef<AtomSelectionMode>('none');
  const selectedAtomsRef = useRef<SelectedAtom3D[]>([]);
  const renderEvidenceKeyRef = useRef<string | null>(renderEvidenceKey ?? null);
  const onRenderStateChangeRef = useRef(onRenderStateChange);
  const [viewerStatus, setViewerStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );
  const [modelRendered, setModelRendered] = useState(false);
  const [hasRenderableSize, setHasRenderableSize] = useState(false);
  const [studentMessage, setStudentMessage] = useState(
    getInitialMessage(coordinateData),
  );
  const [representationMode, setRepresentationMode] =
    useState<Molecule3DRepresentationMode>(DEFAULT_REPRESENTATION_MODE);
  const [showAtomLabels, setShowAtomLabels] = useState(false);
  const [atomSelectionMode, setAtomSelectionMode] =
    useState<AtomSelectionMode>('none');
  const [selectedAtoms, setSelectedAtoms] = useState<SelectedAtom3D[]>([]);
  const [measurementResults, setMeasurementResults] = useState<
    GeometryMeasurementResult[]
  >([]);
  const [measurementSelectionMessage, setMeasurementSelectionMessage] =
    useState<string | null>(null);
  const [parsedAtoms, setParsedAtoms] = useState<SelectedAtom3D[]>(
    parseAtomsFromMolecule3DInput(coordinateData),
  );

  renderEvidenceKeyRef.current = renderEvidenceKey ?? null;
  onRenderStateChangeRef.current = onRenderStateChange;

  function updateModelRendered(nextModelRendered: boolean) {
    setModelRendered(nextModelRendered);
    emitMolecule3DRenderState(
      onRenderStateChangeRef.current,
      renderEvidenceKeyRef.current,
      nextModelRendered,
    );
  }

  function clearViewer() {
    const viewer = viewerRef.current;

    if (!viewer) {
      return;
    }

    viewer.clear();
    viewer.render();
  }

  function resizeViewer() {
    viewerRef.current?.resize();
    const nextHasRenderableSize = hasRenderableMoleculeViewerSize(
      hostRef.current,
    );

    setHasRenderableSize(nextHasRenderableSize);

    if (!nextHasRenderableSize) {
      updateModelRendered(false);
    }
  }

  function addAtomLabels(viewer: GLViewer, atoms: SelectedAtom3D[]) {
    viewer.removeAllLabels();

    if (!showAtomLabels || atoms.length === 0) {
      return;
    }

    const includeIndex = atomSelectionMode !== 'none' || userMode === 'teacher';

    atoms.forEach((atom) => {
      viewer.addLabel(formatAtom3DLabel(atom, includeIndex), {
        position: { x: atom.x, y: atom.y + 0.18, z: atom.z },
        fontSize: 11,
        fontColor: '#1d2730',
        backgroundOpacity: 0,
      });
    });
  }

  function applyViewerPresentation(viewer: GLViewer, atoms: SelectedAtom3D[]) {
    viewer.setStyle({}, getRepresentationStyle(representationMode));
    addAtomLabels(viewer, atoms);
    viewer.setClickable({}, true, (atom: ThreeDmolAtomLike) => {
      handleAtomClick(atom);
    });
    viewer.render();
  }

  function handleAtomClick(clickedAtom: ThreeDmolAtomLike) {
    const matchedAtom = findMatchingParsedAtom(clickedAtom, parsedAtomsRef.current);

    if (!matchedAtom || !coordinateData) {
      onDeveloperLog?.('3D atom click ignored: could not map clicked atom to parsed coordinates.');
      return;
    }

    selectMeasurementAtom(matchedAtom);
  }

  function selectMeasurementAtom(matchedAtom: SelectedAtom3D) {
    const mode = measurementModeRef.current;

    if (mode === 'none' || !coordinateData) {
      return;
    }

    const requiredAtomCount = getRequiredAtomCount(mode);
    const currentAtoms = selectedAtomsRef.current;

    if (currentAtoms.some(({ atomIndex }) => atomIndex === matchedAtom.atomIndex)) {
      setMeasurementSelectionMessage('서로 다른 Reference 원자를 선택해 주세요.');
      return;
    }

    const nextAtoms = [...currentAtoms, matchedAtom].slice(-requiredAtomCount);
    selectedAtomsRef.current = nextAtoms;
    setSelectedAtoms(nextAtoms);

    if (nextAtoms.length !== requiredAtomCount) return;

    if (
      requireBondedMeasurements &&
      !isBondedMeasurementSelection(
        mode,
        nextAtoms.map(({ atomIndex }) => atomIndex),
        parseBondedAtomPairsFromMolecule3DInput(coordinateData),
      )
    ) {
      setMeasurementSelectionMessage(
        mode === 'bond_length'
          ? '서로 결합한 Reference 원자 2개를 선택해 주세요.'
          : '두 번째 원자가 중심이고, 양쪽 원자가 중심과 결합하도록 선택해 주세요.',
      );
      return;
    }

    try {
      const result = buildGeometryMeasurementResult({
        mode,
        atoms: nextAtoms,
        sourceNote: buildMeasurementSourceNote(coordinateData),
      });

      setMeasurementResults((currentResults) => [result, ...currentResults].slice(0, 4));
      setMeasurementSelectionMessage(null);
    } catch (error) {
      onDeveloperLog?.(
        `3D geometry measurement failed: ${getErrorMessage(error)}`,
      );
    }
  }

  function resetView(): boolean {
    const viewer = viewerRef.current;

    if (!modelRendered || !viewer || !hasRenderableMoleculeViewerSize(hostRef.current)) {
      return false;
    }

    if (initialViewRef.current) {
      viewer.setView(initialViewRef.current);
    } else {
      viewer.zoomTo();
    }

    viewer.render();
    return true;
  }

  function zoomToFit() {
    const viewer = viewerRef.current;

    if (!viewer) {
      return;
    }

    viewer.zoomTo();
    viewer.render();
  }

  function rotateViewer(degrees: number): boolean {
    const viewer = viewerRef.current;

    if (!modelRendered || !viewer || !hasRenderableMoleculeViewerSize(hostRef.current)) {
      return false;
    }

    viewer.rotate(degrees, 'y');
    viewer.render();
    return true;
  }

  function zoomViewer(factor: number): boolean {
    const viewer = viewerRef.current;

    if (!modelRendered || !viewer || !hasRenderableMoleculeViewerSize(hostRef.current)) {
      return false;
    }

    viewer.zoom(factor);
    viewer.render();
    return true;
  }

  function loadStructure(input: Molecule3DInput) {
    updateModelRendered(false);
    const viewer = viewerRef.current;

    if (!viewer || !hasRenderableMoleculeViewerSize(hostRef.current)) {
      return;
    }

    if (!input.data.trim()) {
      throw new Error('3D 자료가 비어 있습니다.');
    }

    if (input.coordinateDimension !== '3d') {
      throw new Error('참고 3D 자료로 확인된 데이터가 아닙니다.');
    }

    const atoms = parseAtomsFromMolecule3DInput(input);

    parsedAtomsRef.current = atoms;
    setParsedAtoms(atoms);
    selectedAtomsRef.current = [];
    setSelectedAtoms([]);
    setMeasurementResults([]);
    setMeasurementSelectionMessage(null);
    viewer.clear();
    viewer.addModel(input.data, get3DmolModelFormat(input.format));
    applyViewerPresentation(viewer, atoms);
    initialViewRef.current = initializeMolecule3DViewerView(viewer, initialZoom);
    viewer.render();
    updateModelRendered(true);
    setStudentMessage(`${input.label}의 교육용 3D 자료를 표시합니다.`);
  }

  useImperativeHandle(
    ref,
    () => ({
      loadStructure,
      clear: () => {
        clearViewer();
        updateModelRendered(false);
      },
      resize: resizeViewer,
      resetView,
      rotate: rotateViewer,
      zoom: zoomViewer,
    }),
    [
      atomSelectionMode,
      initialZoom,
      modelRendered,
      representationMode,
      showAtomLabels,
      userMode,
    ],
  );

  useEffect(() => {
    parsedAtomsRef.current = parsedAtoms;
  }, [parsedAtoms]);

  useEffect(() => {
    measurementModeRef.current = atomSelectionMode;
  }, [atomSelectionMode]);

  useEffect(() => {
    onMeasurementResultsChange?.(measurementResults);
  }, [measurementResults, onMeasurementResultsChange]);

  useEffect(() => {
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;

    const handleResize = () => {
      resizeViewer();
    };

    async function initializeViewer() {
      if (!hostRef.current) {
        return;
      }

      try {
        const threeDmol = await import('3dmol');

        if (cancelled || !hostRef.current) {
          return;
        }

        viewerRef.current = threeDmol.createViewer(
          hostRef.current,
          getMolecule3DViewerOptions(backgroundColor),
        );
        viewerRef.current.render();
        setViewerStatus('ready');
        handleResize();

        if (typeof ResizeObserver !== 'undefined') {
          resizeObserver = new ResizeObserver(handleResize);
          resizeObserver.observe(hostRef.current);
        }

        window.addEventListener('resize', handleResize);
      } catch (error) {
        updateModelRendered(false);
        setViewerStatus('error');
        setStudentMessage('3D 구조 보기를 초기화하지 못했습니다.');
        onDeveloperLog?.(`3Dmol.js viewer initialization failed: ${getErrorMessage(error)}`);
      }
    }

    void initializeViewer();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      window.removeEventListener('resize', handleResize);
      clearViewer();
      viewerRef.current = null;
    };
  }, [backgroundColor, onDeveloperLog]);

  useEffect(() => {
    if (viewerStatus !== 'ready') {
      return;
    }

    if (!coordinateData) {
      updateModelRendered(false);
      clearViewer();
      initialViewRef.current = null;
      parsedAtomsRef.current = [];
      setParsedAtoms([]);
      selectedAtomsRef.current = [];
      setSelectedAtoms([]);
      setMeasurementResults([]);
      setMeasurementSelectionMessage(null);
      setAtomSelectionMode('none');
      setStudentMessage(NO_COORDINATES_MESSAGE);
      return;
    }

    if (coordinateData.coordinateDimension !== '3d') {
      updateModelRendered(false);
      clearViewer();
      initialViewRef.current = null;
      parsedAtomsRef.current = [];
      setParsedAtoms([]);
      selectedAtomsRef.current = [];
      setSelectedAtoms([]);
      setMeasurementResults([]);
      setMeasurementSelectionMessage(null);
      setAtomSelectionMode('none');
      setStudentMessage(NOT_CONFIRMED_3D_COORDINATES_MESSAGE);
      onDeveloperLog?.('3D structure load blocked: coordinateDimension is not 3d.');
      return;
    }

    if (!hasRenderableSize) {
      updateModelRendered(false);
      return;
    }

    try {
      loadStructure(coordinateData);
    } catch (error) {
      updateModelRendered(false);
      clearViewer();
      initialViewRef.current = null;
      parsedAtomsRef.current = [];
      setParsedAtoms([]);
      selectedAtomsRef.current = [];
      setSelectedAtoms([]);
      setMeasurementResults([]);
      setMeasurementSelectionMessage(null);
      setAtomSelectionMode('none');
      setStudentMessage('3D 자료를 표시하지 못했습니다.');
      onDeveloperLog?.(`3Dmol.js structure load failed: ${getErrorMessage(error)}`);
    }
  }, [coordinateData, hasRenderableSize, initialZoom, onDeveloperLog, viewerStatus]);

  useEffect(() => {
    if (
      viewerStatus !== 'ready' ||
      !hasRenderableSize ||
      !modelRendered ||
      !coordinateData ||
      !viewerRef.current
    ) {
      return;
    }

    applyViewerPresentation(viewerRef.current, parsedAtoms);
  }, [
    atomSelectionMode,
    coordinateData,
    hasRenderableSize,
    modelRendered,
    parsedAtoms,
    representationMode,
    showAtomLabels,
    userMode,
    viewerStatus,
  ]);

  useEffect(() => {
    if (!hasValidatedStructure || coordinateData || !validatedStructureKey) {
      return;
    }

    if (lastNoCoordinateLogKeyRef.current === validatedStructureKey) {
      return;
    }

    lastNoCoordinateLogKeyRef.current = validatedStructureKey;
    onDeveloperLog?.(SMILES_ONLY_DEVELOPER_LOG);
  }, [coordinateData, hasValidatedStructure, onDeveloperLog, validatedStructureKey]);

  const displayedStudentMessage =
    viewerStatus === 'error'
      ? studentMessage
      : coordinateData?.coordinateDimension === '3d' && !modelRendered
        ? VIEWER_PREPARING_MESSAGE
        : coordinateData
          ? studentMessage
          : NO_COORDINATES_MESSAGE;
  const hasCoordinateData = Boolean(coordinateData);
  const has3DCoordinateData = coordinateData?.coordinateDimension === '3d';
  const canUseCoordinateControls =
    viewerStatus === 'ready' &&
    modelRendered &&
    hasCoordinateData &&
    has3DCoordinateData &&
    hasValidatedStructure &&
    (!requireBondedMeasurements || coordinateData?.structureMatchStatus === 'verified');
  const canUseParsedAtomTools = canUseCoordinateControls && parsedAtoms.length > 0;
  const measurementNotice = getMeasurementNotice({
    hasCoordinateData,
    has3DCoordinateData,
    hasValidatedStructure,
    viewerStatus,
    parsedAtomCount: parsedAtoms.length,
  });
  const requiredAtomCount = getRequiredAtomCount(atomSelectionMode);
  const measurementInstruction =
    atomSelectionMode === 'bond_length'
      ? requireBondedMeasurements
        ? '서로 결합한 원자 2개를 차례로 선택하세요.'
        : '원자 2개를 차례로 선택하면 두 원자 사이 거리를 계산합니다.'
      : atomSelectionMode === 'bond_angle'
        ? requireBondedMeasurements
          ? '이웃 원자, 중심 원자, 다른 이웃 원자 순서로 선택하세요.'
          : '원자 3개를 선택하면 두 번째 원자를 중심으로 각도를 계산합니다.'
        : '측정 모드를 선택한 뒤 3D 구조의 원자를 클릭하세요.';
  const shouldShowAdvancedControls = showAdvancedControls ?? userMode === 'teacher';
  const shouldShowMeasurementControls =
    showMeasurementControls ?? shouldShowAdvancedControls;

  const handleMeasurementModeChange = (nextMode: AtomSelectionMode) => {
    setAtomSelectionMode(nextMode);
    selectedAtomsRef.current = [];
    setSelectedAtoms([]);
    setMeasurementSelectionMessage(null);
  };
  const testId = (suffix: string, fallback: string) =>
    testIdNamespace ? `${testIdNamespace}-${suffix}` : fallback;

  return (
    <section
      className="workspace-panel viewer-panel"
      data-testid={testId('viewer', 'molecule-3d-viewer')}
      data-viewer-status={viewerStatus}
      data-model-rendered={modelRendered ? 'true' : 'false'}
    >
      <div className="panel-heading viewer-heading">
        <div>
          <p className="section-label">3D 구조 보기</p>
          <h2>참고 3D 구조 보기</h2>
        </div>
        <span className={viewerStatus === 'ready' ? 'status-pill ready' : 'status-pill'}>
          {viewerStatus === 'ready'
            ? userMode === 'teacher'
              ? '3Dmol.js 준비됨'
              : '3D 구조 보기 준비됨'
            : viewerStatus === 'error'
              ? userMode === 'teacher'
                ? '3Dmol.js 오류'
                : '3D 구조 보기 오류'
              : userMode === 'teacher'
                ? '3Dmol.js 로딩 중'
                : '3D 구조 보기 준비 중'}
        </span>
      </div>

      {actionSlot ? <div className="viewer-action-slot">{actionSlot}</div> : null}

      {shouldShowAdvancedControls ? (
        <div className="viewer-control-panel" data-testid="viewer-control-panel">
        <div className="viewer-control-group">
          <label>
            <span>표현 방식</span>
            <select
              data-testid="representation-mode-select"
              disabled={!canUseCoordinateControls}
              value={representationMode}
              onChange={(event) => {
                setRepresentationMode(
                  event.currentTarget.value as Molecule3DRepresentationMode,
                );
              }}
            >
              <option value="ball-and-stick">공-막대 모형</option>
              <option value="stick">막대 모형</option>
              <option value="space-filling">공간 채움 모형</option>
            </select>
          </label>
          <p>3D 좌표 데이터가 있는 경우에만 입체 표현 방식을 바꿀 수 있습니다.</p>
        </div>

        <div className="viewer-control-group">
          <label className="viewer-checkbox-control">
            <input
              checked={showAtomLabels}
              data-testid="atom-label-toggle"
              disabled={!canUseParsedAtomTools}
              type="checkbox"
              onChange={(event) => {
                setShowAtomLabels(event.currentTarget.checked);
              }}
            />
            <span>원자 라벨 표시</span>
          </label>
          <p>
            기본 라벨은 원소 기호입니다. 교사 모드 또는 측정 모드에서는 C1, H2처럼
            원자 식별 번호를 함께 표시합니다.
          </p>
        </div>

        <div className="viewer-button-row">
          <button
            className="secondary-action"
            data-testid="reset-view-button"
            disabled={!canUseCoordinateControls}
            type="button"
            onClick={resetView}
          >
            초기 방향
          </button>
          <button
            className="secondary-action"
            data-testid="zoom-to-fit-button"
            disabled={!canUseCoordinateControls}
            type="button"
            onClick={zoomToFit}
          >
            화면에 맞추기
          </button>
        </div>
      </div>
      ) : null}

      <div className="viewer-content">
        <div
          ref={hostRef}
          className="viewer-3d-host"
          data-testid="viewer-3d"
          aria-label="3D 분자 구조 보기 영역"
        />
        <div className="viewer-empty-state" data-testid="viewer-3d-message">
          <p>{displayedStudentMessage}</p>
          <dl>
            {userMode === 'teacher' ? (
              <>
                <div>
                  <dt>좌표 출처</dt>
                  <dd>{coordinateData?.coordinateSource ?? '없음'}</dd>
                </div>
                <div>
                  <dt>출처 유형</dt>
                  <dd>{formatSourceType(coordinateData?.sourceType)}</dd>
                </div>
                <div>
                  <dt>입력 형식</dt>
                  <dd>{coordinateData?.format.toUpperCase() ?? '대기 중'}</dd>
                </div>
              </>
            ) : (
              <div>
                <dt>자료 상태</dt>
                <dd>{coordinateData ? '3D 자료 표시 가능' : '3D 자료 준비 전'}</dd>
              </div>
            )}
            {coordinateData?.sourceUrl && userMode === 'teacher' ? (
              <div>
                <dt>출처 URL</dt>
                <dd className="code-output">{coordinateData.sourceUrl}</dd>
              </div>
            ) : null}
            <div>
              <dt>계산 기준</dt>
              <dd>
                {userMode === 'teacher'
                  ? '분자식과 몰 질량은 RDKit.js 검증 결과입니다.'
                  : '분자식과 몰 질량은 구조 확인 결과입니다.'}
              </dd>
            </div>
            {userMode === 'teacher' ? (
              <>
                <div>
                  <dt>3D 역할</dt>
                  <dd>3Dmol.js는 전달받은 좌표 데이터만 시각화합니다.</dd>
                </div>
                <div>
                  <dt>표현 방식</dt>
                  <dd>{formatRepresentationMode(representationMode)}</dd>
                </div>
              </>
            ) : null}
            <div>
              <dt>자료 안내</dt>
              <dd>
                {userMode === 'teacher'
                  ? coordinateData?.sourceNote ?? '표시할 3D 좌표 데이터가 없습니다.'
                  : formatStudentCoordinateNote(coordinateData)}
              </dd>
            </div>
          </dl>
        </div>
      </div>
      <p className="viewer-gesture-hint">
        한 손가락으로 회전하고 두 손가락으로 확대·축소할 수 있습니다.
      </p>

      {shouldShowMeasurementControls ? (
        <div
          className="geometry-measurement-panel"
          data-testid="geometry-measurement-panel"
        >
        <div className="panel-heading measurement-heading">
          <div>
            <p className="section-label">좌표 기준 측정</p>
            <h3>
              {userMode === 'teacher'
                ? '결합길이/결합각 측정 MVP'
                : '결합길이와 결합각 측정'}
            </h3>
          </div>
          <span className={canUseParsedAtomTools ? 'status-pill ready' : 'status-pill'}>
            {canUseParsedAtomTools ? '측정 가능' : '측정 비활성화'}
          </span>
        </div>

        <p className="measurement-notice">
          {measurementNotice}
        </p>

        <div className="measurement-mode-buttons">
          <button
            className={
              atomSelectionMode === 'none' ? 'secondary-action active' : 'secondary-action'
            }
            type="button"
            aria-pressed={atomSelectionMode === 'none'}
            onClick={() => {
              handleMeasurementModeChange('none');
            }}
          >
            측정 안 함
          </button>
          <button
            className={
              atomSelectionMode === 'bond_length'
                ? 'secondary-action active'
                : 'secondary-action'
            }
            data-testid={testId('distance-mode', 'bond-length-mode-button')}
            aria-pressed={atomSelectionMode === 'bond_length'}
            disabled={!canUseParsedAtomTools}
            type="button"
            onClick={() => {
              handleMeasurementModeChange('bond_length');
            }}
          >
            결합길이 측정
          </button>
          <button
            className={
              atomSelectionMode === 'bond_angle'
                ? 'secondary-action active'
                : 'secondary-action'
            }
            data-testid={testId('angle-mode', 'bond-angle-mode-button')}
            aria-pressed={atomSelectionMode === 'bond_angle'}
            disabled={!canUseParsedAtomTools}
            type="button"
            onClick={() => {
              handleMeasurementModeChange('bond_angle');
            }}
          >
            결합각 측정
          </button>
        </div>

        <dl className="measurement-state-grid">
          <div>
            <dt>현재 측정 모드</dt>
            <dd>{formatMeasurementMode(atomSelectionMode)}</dd>
          </div>
          <div>
            <dt>{testIdNamespace === 'scanner-reference' ? 'Reference 원자 수' : '읽은 원자 수'}</dt>
            <dd>{parsedAtoms.length > 0 ? `${parsedAtoms.length}개` : '좌표 없음'}</dd>
          </div>
          <div>
            <dt>선택한 원자</dt>
            <dd>
              {selectedAtoms.length > 0
                ? selectedAtoms.map((atom) => formatAtom3DLabel(atom)).join(', ')
                : '아직 선택하지 않음'}
            </dd>
          </div>
          <div>
            <dt>필요한 선택 수</dt>
            <dd>
              {requiredAtomCount > 0
                ? `${selectedAtoms.length}/${requiredAtomCount}`
                : '측정 모드 선택 전'}
            </dd>
          </div>
        </dl>

        <p className="measurement-instruction">{measurementInstruction}</p>
        {measurementSelectionMessage ? (
          <p className="measurement-selection-message" role="status" aria-live="polite">
            {measurementSelectionMessage}
          </p>
        ) : null}

        <div
          className="measurement-atom-picker"
          data-testid={testId('atom-list', 'measurement-atom-list')}
        >
          <strong>Reference 원자 선택</strong>
          <div className="measurement-atom-buttons">
            {parsedAtoms.map((atom) => {
              const isSelected = selectedAtoms.some(
                ({ atomIndex }) => atomIndex === atom.atomIndex,
              );
              const label = formatAtom3DLabel(atom);

              return (
                <button
                  key={atom.atomIndex}
                  className={isSelected ? 'secondary-action active' : 'secondary-action'}
                  data-testid={testId('atom-button', 'measurement-atom-button')}
                  data-atom-index={atom.atomIndex}
                  aria-label={`${label} 원자 선택`}
                  aria-pressed={isSelected}
                  disabled={!canUseParsedAtomTools || atomSelectionMode === 'none'}
                  type="button"
                  onClick={() => selectMeasurementAtom(atom)}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="viewer-button-row">
          <button
            className="secondary-action"
            data-testid="clear-selected-atoms-button"
            disabled={selectedAtoms.length === 0}
            type="button"
            onClick={() => {
              selectedAtomsRef.current = [];
              setSelectedAtoms([]);
            }}
          >
            선택 초기화
          </button>
          <button
            className="secondary-action"
            data-testid="clear-measurement-results-button"
            disabled={measurementResults.length === 0}
            type="button"
            onClick={() => {
              setMeasurementResults([]);
            }}
          >
            결과 초기화
          </button>
        </div>

        {measurementResults.length > 0 ? (
          <ol
            className="measurement-result-list"
            data-testid="measurement-result-list"
            aria-live="polite"
          >
            {measurementResults.map((result) => (
              <li
                key={`${result.type}-${result.atomIndices.join('-')}-${result.value}`}
                data-testid={testId(
                  result.type === 'bond_length' ? 'distance-output' : 'angle-output',
                  result.type === 'bond_length' ? 'distance-output' : 'angle-output',
                )}
                data-evidence-type={measurementEvidenceType}
              >
                <strong>{formatMeasurementValue(result)}</strong>
                <p>
                  {result.type === 'bond_angle'
                    ? '두 번째로 선택한 원자를 중심으로 계산한 각도입니다.'
                    : requireBondedMeasurements
                      ? 'Reference SDF 결합표에서 연결을 확인한 두 원자 사이 거리입니다.'
                      : '선택한 두 원자 사이 거리입니다. 실제 결합 여부를 단정하지 않습니다.'}
                </p>
                <p>{result.sourceNote}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="measurement-empty-result">최근 측정 결과가 없습니다.</p>
        )}

        {userMode === 'teacher' ? (
          <p className="measurement-teacher-note">
            교사용 안내: 정적 좌표, PubChem 좌표, VSEPR 예측 모형 좌표는 출처와
            의미가 다릅니다. 수업에서는 측정값의 출처를 구분해 지도하세요.
          </p>
        ) : null}
      </div>
      ) : null}
    </section>
  );
});
