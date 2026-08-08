import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type MouseEvent,
} from 'react';
import {
  detectAtomCandidates,
  SUPPORTED_ELEMENTS,
  type AtomCandidate,
  type SupportedElement,
} from './atomDetection';
import {
  BondConfirmationStage,
  type ConfirmedPhysicalGraphSnapshot,
} from './BondConfirmationStage';
import { ChemistryValidationStage } from './ChemistryValidationStage';
import {
  ScientificReferenceStage,
  type ConfirmedScientificReferenceSnapshot,
} from './ScientificReferenceStage';
import {
  PhysicalReferenceComparisonStage,
  type ConfirmedPhysicalReferenceComparisonSnapshot,
} from './PhysicalReferenceComparisonStage';
import type { PhysicalGraphValidationResult } from './physicalGraphValidation';
import './PhysicalMoleculeScanner.css';

type ReviewStatus = 'unconfirmed' | 'confirmed';
type CandidateSource = 'detected' | 'manual';

interface EditableCandidate extends Omit<AtomCandidate, 'reviewStatus'> {
  reviewStatus: ReviewStatus;
  source: CandidateSource;
}

interface LoadedImage {
  url: string;
  name: string;
  width: number;
  height: number;
}

type N5ReadyValidationSnapshot = Extract<
  PhysicalGraphValidationResult,
  { ok: true }
>;

const loadImageElement = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('이미지를 열 수 없습니다.'));
    image.src = url;
  });

async function analyzeImage(file: File) {
  if (file.size > 20 * 1024 * 1024) {
    throw new Error('사진 파일은 20MB 이하로 선택해 주세요.');
  }
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImageElement(url);
    if (image.naturalWidth * image.naturalHeight > 40_000_000) {
      throw new Error('사진 해상도가 너무 큽니다. 4천만 픽셀 이하 사진을 선택해 주세요.');
    }
    const maximumSide = 1200;
    const scale = Math.min(1, maximumSide / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('이 브라우저에서 이미지 분석을 시작할 수 없습니다.');
    context.drawImage(image, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height);
    return {
      loadedImage: {
        url,
        name: file.name,
        width: image.naturalWidth,
        height: image.naturalHeight,
      } satisfies LoadedImage,
      candidates: detectAtomCandidates(pixels).map((candidate) => ({
        ...candidate,
        source: 'detected' as const,
      })),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

export function PhysicalMoleculeScanner() {
  const [loadedImage, setLoadedImage] = useState<LoadedImage | null>(null);
  const [candidates, setCandidates] = useState<EditableCandidate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [addElement, setAddElement] = useState<SupportedElement>('C');
  const [isComplete, setIsComplete] = useState(false);
  const [isBondReviewStarted, setIsBondReviewStarted] = useState(false);
  const [hasBondStageMounted, setHasBondStageMounted] = useState(false);
  const [isChemistryValidationStarted, setIsChemistryValidationStarted] = useState(false);
  const [hasChemistryStageMounted, setHasChemistryStageMounted] = useState(false);
  const [isReferenceStageStarted, setIsReferenceStageStarted] = useState(false);
  const [hasReferenceStageMounted, setHasReferenceStageMounted] = useState(false);
  const [isComparisonStageStarted, setIsComparisonStageStarted] = useState(false);
  const [hasComparisonStageMounted, setHasComparisonStageMounted] = useState(false);
  const [atomRevision, setAtomRevision] = useState(1);
  const [confirmedPhysicalGraph, setConfirmedPhysicalGraph] =
    useState<ConfirmedPhysicalGraphSnapshot | null>(null);
  const [n5ReadyValidationSnapshot, setN5ReadyValidationSnapshot] =
    useState<N5ReadyValidationSnapshot | null>(null);
  const [confirmedScientificReference, setConfirmedScientificReference] =
    useState<ConfirmedScientificReferenceSnapshot | null>(null);
  const [confirmedComparison, setConfirmedComparison] =
    useState<ConfirmedPhysicalReferenceComparisonSnapshot | null>(null);
  const [hasComparedWholeModel, setHasComparedWholeModel] = useState(false);
  const [message, setMessage] = useState('사진을 선택하면 원자처럼 보이는 영역을 후보로 표시합니다.');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nextManualIdRef = useRef(1);
  const analysisRequestRef = useRef(0);

  useEffect(() => {
    return () => {
      if (loadedImage) URL.revokeObjectURL(loadedImage.url);
    };
  }, [loadedImage]);

  const selectedCandidate = candidates.find(({ id }) => id === selectedId) ?? null;
  const confirmedCount = candidates.filter(({ reviewStatus }) => reviewStatus === 'confirmed').length;
  const canComplete =
    !isAnalyzing &&
    candidates.length > 0 &&
    confirmedCount === candidates.length &&
    hasComparedWholeModel;

  const elementCounts = useMemo(() => {
    const counts = new Map<SupportedElement, number>();
    for (const candidate of candidates) {
      counts.set(candidate.element, (counts.get(candidate.element) ?? 0) + 1);
    }
    return [...counts.entries()];
  }, [candidates]);

  const resetCompletion = () => {
    setIsComplete(false);
    setIsBondReviewStarted(false);
    setHasBondStageMounted(false);
    setConfirmedPhysicalGraph(null);
    setIsChemistryValidationStarted(false);
    setHasChemistryStageMounted(false);
    setN5ReadyValidationSnapshot(null);
    setIsReferenceStageStarted(false);
    setHasReferenceStageMounted(false);
    setConfirmedScientificReference(null);
    setIsComparisonStageStarted(false);
    setHasComparisonStageMounted(false);
    setConfirmedComparison(null);
  };

  const processFile = async (file: File, demo = false) => {
    if (!file.type.startsWith('image/') && !file.name.toLowerCase().endsWith('.svg')) {
      setMessage('이미지 파일을 선택해 주세요.');
      return;
    }

    const requestId = analysisRequestRef.current + 1;
    analysisRequestRef.current = requestId;
    setIsAnalyzing(true);
    setMessage('사진의 색상 영역을 살펴보는 중입니다…');
    setLoadedImage(null);
    setCandidates([]);
    setSelectedId(null);
    setIsDemo(false);
    setIsComplete(false);
    setIsBondReviewStarted(false);
    setHasBondStageMounted(false);
    setConfirmedPhysicalGraph(null);
    setIsChemistryValidationStarted(false);
    setHasChemistryStageMounted(false);
    setN5ReadyValidationSnapshot(null);
    setIsReferenceStageStarted(false);
    setHasReferenceStageMounted(false);
    setConfirmedScientificReference(null);
    setIsComparisonStageStarted(false);
    setHasComparisonStageMounted(false);
    setConfirmedComparison(null);
    setAtomRevision((current) => current + 1);
    setHasComparedWholeModel(false);
    setIsAdding(false);
    try {
      const result = await analyzeImage(file);
      if (requestId !== analysisRequestRef.current) {
        URL.revokeObjectURL(result.loadedImage.url);
        return;
      }
      nextManualIdRef.current = 1;
      setLoadedImage(result.loadedImage);
      setCandidates(result.candidates);
      setSelectedId(result.candidates[0]?.id ?? null);
      setIsDemo(demo || file.name.toLowerCase() === 'demo-methane.svg');
      setMessage(
        result.candidates.length > 0
          ? `${result.candidates.length}개의 원자 후보를 찾았습니다. 모두 직접 확인해 주세요.`
          : '원자 후보를 찾지 못했습니다. 더 밝은 곳에서 다시 찍거나 직접 후보를 추가하세요.',
      );
    } catch (error) {
      if (requestId !== analysisRequestRef.current) return;
      setMessage(error instanceof Error ? error.message : '이미지 분석에 실패했습니다.');
    } finally {
      if (requestId === analysisRequestRef.current) setIsAnalyzing(false);
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void processFile(file);
    event.target.value = '';
  };

  const loadDemo = async () => {
    const requestId = analysisRequestRef.current + 1;
    analysisRequestRef.current = requestId;
    setIsAnalyzing(true);
    setMessage('DEMO 사진을 불러오는 중입니다…');
    setLoadedImage(null);
    setCandidates([]);
    setSelectedId(null);
    setIsDemo(false);
    setIsComplete(false);
    setIsBondReviewStarted(false);
    setHasBondStageMounted(false);
    setConfirmedPhysicalGraph(null);
    setIsChemistryValidationStarted(false);
    setHasChemistryStageMounted(false);
    setN5ReadyValidationSnapshot(null);
    setIsReferenceStageStarted(false);
    setHasReferenceStageMounted(false);
    setConfirmedScientificReference(null);
    setIsComparisonStageStarted(false);
    setHasComparisonStageMounted(false);
    setConfirmedComparison(null);
    setHasComparedWholeModel(false);
    try {
      const response = await fetch('/scanner-fixtures/demo-methane.svg');
      if (!response.ok) throw new Error('DEMO 사진을 불러오지 못했습니다.');
      const blob = await response.blob();
      if (requestId !== analysisRequestRef.current) return;
      await processFile(new File([blob], 'demo-methane.svg', { type: 'image/svg+xml' }), true);
    } catch (error) {
      if (requestId !== analysisRequestRef.current) return;
      setMessage(error instanceof Error ? error.message : 'DEMO 사진을 불러오지 못했습니다.');
      setIsAnalyzing(false);
    }
  };

  const updateCandidate = (
    id: string,
    update: Partial<EditableCandidate>,
    invalidatesWholeModelComparison = true,
  ) => {
    setCandidates((current) =>
      current.map((candidate) => (candidate.id === id ? { ...candidate, ...update } : candidate)),
    );
    if (invalidatesWholeModelComparison) setHasComparedWholeModel(false);
    if (invalidatesWholeModelComparison) setAtomRevision((current) => current + 1);
    resetCompletion();
  };

  const removeSelected = () => {
    if (!selectedId) return;
    setCandidates((current) => {
      const next = current.filter(({ id }) => id !== selectedId);
      setSelectedId(next[0]?.id ?? null);
      return next;
    });
    setHasComparedWholeModel(false);
    setAtomRevision((current) => current + 1);
    resetCompletion();
  };

  const addCandidateAt = (x: number, y: number) => {
    const candidate: EditableCandidate = {
      id: `manual-${String(nextManualIdRef.current).padStart(3, '0')}`,
      element: addElement,
      x: Math.min(1, Math.max(0, x)),
      y: Math.min(1, Math.max(0, y)),
      radius: 0.04,
      confidenceScore: 1,
      evidence: ['사용자가 사진에서 직접 추가'],
      reviewStatus: 'unconfirmed',
      source: 'manual',
    };
    nextManualIdRef.current += 1;
    setCandidates((current) => [...current, candidate]);
    setSelectedId(candidate.id);
    setIsAdding(false);
    setMessage('후보를 추가했습니다. 원소 종류를 확인한 뒤 확정하세요.');
    setHasComparedWholeModel(false);
    setAtomRevision((current) => current + 1);
    resetCompletion();
  };

  const handlePreviewClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!isAdding) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    addCandidateAt(
      (event.clientX - bounds.left) / bounds.width,
      (event.clientY - bounds.top) / bounds.height,
    );
  };

  const handleGraphConfirmed = useCallback((
    snapshot: ConfirmedPhysicalGraphSnapshot | null,
  ) => {
    setConfirmedPhysicalGraph(snapshot);
    setIsChemistryValidationStarted(false);
    setHasChemistryStageMounted(false);
    setN5ReadyValidationSnapshot(null);
    setIsReferenceStageStarted(false);
    setHasReferenceStageMounted(false);
    setConfirmedScientificReference(null);
    setIsComparisonStageStarted(false);
    setHasComparisonStageMounted(false);
    setConfirmedComparison(null);
  }, []);

  const handleN5SnapshotChange = useCallback((snapshot: N5ReadyValidationSnapshot | null) => {
    setN5ReadyValidationSnapshot(snapshot);
    if (snapshot) return;
    setIsReferenceStageStarted(false);
    setHasReferenceStageMounted(false);
    setConfirmedScientificReference(null);
    setIsComparisonStageStarted(false);
    setHasComparisonStageMounted(false);
    setConfirmedComparison(null);
  }, []);

  const handleReferenceSnapshotChange = useCallback((
    snapshot: ConfirmedScientificReferenceSnapshot | null,
  ) => {
    setConfirmedScientificReference(snapshot);
    if (snapshot) return;
    setIsComparisonStageStarted(false);
    setHasComparisonStageMounted(false);
    setConfirmedComparison(null);
  }, []);

  const activeStage = isComparisonStageStarted
    ? 6
    : isReferenceStageStarted
      ? 5
    : isChemistryValidationStarted
      ? 4
      : isBondReviewStarted
        ? 3
        : 2;

  return (
    <main className="scanner-shell" data-testid="scanner-shell">
      <header className="scanner-hero">
        <div>
          <p className="scanner-eyebrow">실물 분자 모형 스캐너 · {activeStage}단계</p>
          <h1>
            {activeStage === 6
              ? 'Physical Model과 Scientific Reference 비교하기'
              : activeStage === 5
              ? 'Scientific Reference 3D 살펴보기'
              : activeStage === 4
              ? '확인한 연결 구조 검증하기'
              : activeStage === 3
                ? '사진에서 결합 확인하기'
                : '사진에서 원자 후보 찾기'}
          </h1>
          <p>
            {activeStage === 6
              ? '사진과 Reference 3D의 출처를 구분하고, 직접 관찰한 공통점과 차이를 근거로 설명을 다듬습니다.'
              : activeStage === 5
              ? '검증한 연결 구조와 일치하는 출처 표시 3D 좌표를 살펴보고, Reference 좌표에서 계산한 거리와 각도를 구분해 기록합니다.'
              : activeStage === 4
              ? '학생이 확인한 원자와 결합을 화학 규칙으로 검증합니다. 검증과 분자 이름 대조는 별개입니다.'
              : activeStage === 3
                ? '자동으로 찾은 선은 후보입니다. 실제 모형의 막대를 보고 연결을 확인합니다.'
                : '자동 표시 결과는 정답이 아닙니다. 사진 위 후보를 학생이 고치고 하나씩 확인합니다.'}
          </p>
        </div>
        {isDemo && <span className="scanner-demo-badge" data-testid="scanner-demo-badge">DEMO 자료</span>}
      </header>

      <ol className="scanner-progress" aria-label="스캔 진행 단계">
        <li className={loadedImage ? 'done' : 'active'}>1. 사진 선택</li>
        <li className={isComplete ? 'done' : loadedImage ? 'active' : ''}>2. 원자 확인</li>
        <li className={activeStage > 3 ? 'done' : activeStage === 3 ? 'active' : ''} aria-disabled={activeStage < 3}>3. 결합 확인</li>
        <li className={activeStage > 4 ? 'done' : activeStage === 4 ? 'active' : ''} aria-disabled={activeStage < 4}>4. 구조 검증</li>
        <li className={activeStage > 5 ? 'done' : activeStage === 5 ? 'active' : ''} aria-disabled={activeStage < 5}>5. Reference 3D</li>
        <li className={activeStage === 6 ? 'active' : ''} aria-disabled={activeStage < 6}>6. 구조 비교</li>
      </ol>

      <section className="scanner-card scanner-upload-card" aria-labelledby="scanner-upload-title">
        <div>
          <h2 id="scanner-upload-title">1. 분자 모형 사진 선택</h2>
          <p>가능하면 단색 배경에서 구가 겹치지 않게 찍어 주세요. 사진은 브라우저 안에서만 처리됩니다.</p>
          <p>DEMO 색상표를 기준으로 찾으므로 다른 색 키트, 그림자, 겹친 원자는 직접 고쳐야 합니다.</p>
        </div>
        <div className="scanner-upload-actions">
          <label className="scanner-primary-button" htmlFor="scanner-file-input">
            {loadedImage ? '다른 사진 선택' : '사진 찍기 또는 선택'}
          </label>
          <input
            ref={fileInputRef}
            id="scanner-file-input"
            data-testid="scanner-image-input"
            className="scanner-visually-hidden"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileChange}
          />
          <button
            type="button"
            className="scanner-secondary-button"
            data-testid="scanner-demo-button"
            onClick={() => void loadDemo()}
            disabled={isAnalyzing}
          >
            DEMO 사진 사용
          </button>
        </div>
      </section>

      <p className="scanner-status" role="status" aria-live="polite" data-testid="scanner-status">
        {isAnalyzing ? '분석 중 · ' : ''}{message}
      </p>

      {loadedImage && !isBondReviewStarted && (
        <section className="scanner-workspace" aria-labelledby="scanner-review-title">
          <div className="scanner-image-column">
            <div className="scanner-heading-row">
              <div>
                <h2 id="scanner-review-title">2. 원자 후보 직접 확인</h2>
                <p>{loadedImage.name} · 원본 {loadedImage.width} × {loadedImage.height} px</p>
              </div>
              <strong data-testid="scanner-confirmation-status">{confirmedCount}/{candidates.length} 확인</strong>
            </div>

            <div
              className={`scanner-preview${isAdding ? ' is-adding' : ''}`}
              data-testid="scanner-preview"
              onClick={handlePreviewClick}
              onKeyDown={(event) => {
                if (!isAdding || (event.key !== 'Enter' && event.key !== ' ')) return;
                event.preventDefault();
                addCandidateAt(0.5, 0.5);
              }}
              role={isAdding ? 'button' : undefined}
              tabIndex={isAdding ? 0 : undefined}
              aria-label={isAdding ? `${addElement} 원자 후보를 추가할 위치 선택` : undefined}
            >
              <img src={loadedImage.url} alt="분석할 실물 분자 모형" draggable={false} />
              {candidates.map((candidate, index) => (
                <button
                  key={candidate.id}
                  type="button"
                  className={`scanner-marker ${candidate.reviewStatus}${candidate.id === selectedId ? ' selected' : ''}`}
                  style={{ left: `${candidate.x * 100}%`, top: `${candidate.y * 100}%` }}
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedId(candidate.id);
                  }}
                  data-testid="scanner-candidate-marker"
                  data-candidate-id={candidate.id}
                  aria-label={`${index + 1}번 ${candidate.element} 후보, ${candidate.reviewStatus === 'confirmed' ? '확정됨' : '미확정'}`}
                >
                  {candidate.element}
                </button>
              ))}
            </div>

            <div className="scanner-add-controls">
              <label>
                추가할 원소
                <select value={addElement} onChange={(event) => setAddElement(event.target.value as SupportedElement)}>
                  {SUPPORTED_ELEMENTS.map((element) => <option key={element}>{element}</option>)}
                </select>
              </label>
              <button
                type="button"
                className="scanner-secondary-button"
                data-testid="scanner-add-button"
                aria-pressed={isAdding}
                onClick={() => setIsAdding((current) => !current)}
              >
                {isAdding ? '추가 취소' : '빠진 원자 직접 추가'}
              </button>
              {isAdding && <p>사진에서 원자 중심을 한 번 누르세요.</p>}
            </div>
          </div>

          <aside className="scanner-review-panel" aria-label="원자 후보 편집">
            <h2>후보 목록</h2>
            {candidates.length === 0 ? (
              <p>표시된 후보가 없습니다. 사진 위에서 직접 추가할 수 있습니다.</p>
            ) : (
              <ul className="scanner-candidate-list" data-testid="scanner-candidate-list">
                {candidates.map((candidate, index) => (
                  <li key={candidate.id}>
                    <button
                      type="button"
                      className={candidate.id === selectedId ? 'selected' : ''}
                      onClick={() => setSelectedId(candidate.id)}
                    >
                      <span>{index + 1}. {candidate.element}</span>
                      <small>{candidate.reviewStatus === 'confirmed' ? '확정됨' : '미확정 · 직접 확인 필요'}</small>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {selectedCandidate && (
              <div className="scanner-editor" data-testid="scanner-candidate-editor">
                <h3>선택한 후보: {selectedCandidate.id}</h3>
                <label>
                  원소 종류
                  <select
                    data-testid="scanner-selected-candidate-element"
                    value={selectedCandidate.element}
                    onChange={(event) =>
                      updateCandidate(selectedCandidate.id, {
                        element: event.target.value as SupportedElement,
                        reviewStatus: 'unconfirmed',
                      })
                    }
                  >
                    {SUPPORTED_ELEMENTS.map((element) => <option key={element}>{element}</option>)}
                  </select>
                </label>
                <p>
                  {selectedCandidate.source === 'manual'
                    ? '직접 추가 · 자동 신뢰도 없음'
                    : `자동 신뢰도 ${Math.round(selectedCandidate.confidenceScore * 100)}% · ${selectedCandidate.confidenceScore < 0.75 ? '불확실한 후보' : '사람 확인 전 후보'}`}
                </p>
                <p className="scanner-evidence">근거: {selectedCandidate.evidence.join(', ')}</p>
                <div className="scanner-editor-actions">
                  <button
                    type="button"
                    className="scanner-confirm-button"
                    data-testid="scanner-confirm-selected"
                    disabled={selectedCandidate.reviewStatus === 'confirmed'}
                    onClick={() =>
                      updateCandidate(selectedCandidate.id, { reviewStatus: 'confirmed' }, false)
                    }
                  >
                    {selectedCandidate.reviewStatus === 'confirmed' ? '확정됨' : '이 후보 확인'}
                  </button>
                  <button
                    type="button"
                    className="scanner-delete-button"
                    data-testid="scanner-delete-selected"
                    onClick={removeSelected}
                  >
                    후보 삭제
                  </button>
                </div>
              </div>
            )}

            <div className="scanner-gate" data-ready={canComplete} data-testid="scanner-review-gate">
              <strong>{canComplete ? '모든 원자 후보와 실제 모형을 확인했습니다.' : '사람 확인이 더 필요합니다.'}</strong>
              <p>후보마다 사진과 원소 색을 비교하고, 검출되지 않거나 가려진 원자가 없는지도 확인하세요.</p>
              <label className="scanner-whole-model-check" data-testid="scanner-whole-model-check">
                <input
                  type="checkbox"
                  data-testid="scanner-whole-model-checkbox"
                  checked={hasComparedWholeModel}
                  onChange={(event) => {
                    setHasComparedWholeModel(event.target.checked);
                    resetCompletion();
                  }}
                />
                사진과 실제 모형을 대조했으며 빠진 원자나 가려진 원자가 없음을 확인했습니다.
              </label>
              <button
                type="button"
                className="scanner-primary-button"
                data-testid="scanner-complete-button"
                disabled={!canComplete}
                onClick={() => setIsComplete(true)}
              >
                원자 후보 검토 완료
              </button>
            </div>
          </aside>
        </section>
      )}

      {isComplete && !isBondReviewStarted && (
        <section className="scanner-complete-card" data-testid="scanner-completion-summary" aria-live="polite">
          <h2>원자 후보 확인 완료</h2>
          <p>{elementCounts.map(([element, count]) => `${element} ${count}개`).join(' · ')}</p>
          <strong>아직 결합, 분자식, 분자 정체는 확인하지 않았습니다.</strong>
          <p>이 결과는 사진 속 원자 후보의 사람 확인 기록이며 화학 구조 결과가 아닙니다.</p>
          <button
            type="button"
            className="scanner-primary-button"
            data-testid="scanner-start-bond-review"
            onClick={() => {
              setHasBondStageMounted(true);
              setIsBondReviewStarted(true);
            }}
          >
            3단계 결합 확인 시작
          </button>
        </section>
      )}

      {isComplete && hasBondStageMounted && loadedImage && (
        <div
          hidden={!isBondReviewStarted || isChemistryValidationStarted}
          data-confirmed-graph-revision={confirmedPhysicalGraph?.revisionId ?? ''}
        >
          <BondConfirmationStage
            image={loadedImage}
            atoms={candidates}
            sourceRevision={`atoms-${atomRevision}`}
            onBackToAtoms={() => setIsBondReviewStarted(false)}
            onGraphConfirmed={handleGraphConfirmed}
            onStartChemistryValidation={() => {
              setHasChemistryStageMounted(true);
              setIsChemistryValidationStarted(true);
            }}
          />
        </div>
      )}

      {isComplete && hasChemistryStageMounted && confirmedPhysicalGraph && (
        <div
          hidden={!isChemistryValidationStarted || isReferenceStageStarted}
          data-confirmed-validation-revision={n5ReadyValidationSnapshot?.revisionId ?? ''}
        >
          <ChemistryValidationStage
            snapshot={confirmedPhysicalGraph}
            onBackToBonds={() => setIsChemistryValidationStarted(false)}
            onN5SnapshotChange={handleN5SnapshotChange}
            onStartReference3D={() => {
              setHasReferenceStageMounted(true);
              setIsReferenceStageStarted(true);
            }}
          />
        </div>
      )}

      {isComplete &&
        hasReferenceStageMounted &&
        n5ReadyValidationSnapshot && (
          <div
            hidden={!isReferenceStageStarted || isComparisonStageStarted}
            data-confirmed-reference-revision={confirmedScientificReference?.revisionId ?? ''}
          >
            <ScientificReferenceStage
              snapshot={n5ReadyValidationSnapshot}
              onBackToValidation={() => setIsReferenceStageStarted(false)}
              onReferenceSnapshotChange={handleReferenceSnapshotChange}
              onStartComparison={() => {
                if (
                  !confirmedScientificReference?.interactionEvidence.hasRendered ||
                  !confirmedScientificReference.interactionEvidence.hasRotated
                ) return;
                setHasComparisonStageMounted(true);
                setIsComparisonStageStarted(true);
              }}
            />
          </div>
        )}

      {isComplete &&
        hasComparisonStageMounted &&
        loadedImage &&
        confirmedPhysicalGraph &&
        n5ReadyValidationSnapshot &&
        confirmedScientificReference && (
          <div
            hidden={!isComparisonStageStarted}
            data-confirmed-comparison-reference={confirmedComparison?.sourceReferenceRevision ?? ''}
          >
            <PhysicalReferenceComparisonStage
              image={loadedImage}
              physicalSnapshot={confirmedPhysicalGraph}
              validationSnapshot={n5ReadyValidationSnapshot}
              referenceSnapshot={confirmedScientificReference}
              onBackToReference={() => setIsComparisonStageStarted(false)}
              onBackToBonds={() => {
                setIsComparisonStageStarted(false);
                setIsReferenceStageStarted(false);
                setIsChemistryValidationStarted(false);
              }}
              onComparisonSnapshotChange={setConfirmedComparison}
            />
          </div>
        )}
    </main>
  );
}

export default PhysicalMoleculeScanner;
