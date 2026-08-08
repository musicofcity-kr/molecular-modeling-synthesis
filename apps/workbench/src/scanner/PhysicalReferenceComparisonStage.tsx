import { useMemo, useState } from 'react';
import { Molecule3DViewer } from '../components/Molecule3DViewer';
import type { ConfirmedPhysicalGraphSnapshot } from './BondConfirmationStage';
import type { PhysicalGraphValidationResult } from './physicalGraphValidation';
import {
  buildPhysicalReferenceComparison,
  type StudentComparisonObservation,
} from './physicalReferenceComparison';
import type { ConfirmedScientificReferenceSnapshot } from './ScientificReferenceStage';
import './PhysicalReferenceComparisonStage.css';

type ValidN5Snapshot = Extract<PhysicalGraphValidationResult, { ok: true }>;
type ComparisonResult = ReturnType<typeof buildPhysicalReferenceComparison>;

export type ConfirmedPhysicalReferenceComparisonSnapshot = Extract<
  ComparisonResult,
  { status: 'complete' }
>['completedSnapshot'];

interface PhysicalReferenceComparisonStageProps {
  image: {
    url: string;
    name: string;
    width: number;
    height: number;
  };
  physicalSnapshot: ConfirmedPhysicalGraphSnapshot;
  validationSnapshot: ValidN5Snapshot;
  referenceSnapshot: ConfirmedScientificReferenceSnapshot;
  onBackToReference: () => void;
  onBackToBonds: () => void;
  onComparisonSnapshotChange: (
    snapshot: ConfirmedPhysicalReferenceComparisonSnapshot | null,
  ) => void;
}

type ActiveSource = 'physical-model' | 'scientific-reference';

const EMPTY_OBSERVATION: StudentComparisonObservation = {
  samePoint: '',
  differentPoint: '',
  revisedExplanation: '',
};

const METHANE_COACH_PROMPT =
  '중심 탄소 주위 네 결합 방향이 서로 가능한 한 멀리 떨어져 있는지 살펴보세요.';

export function PhysicalReferenceComparisonStage({
  image,
  physicalSnapshot,
  validationSnapshot,
  referenceSnapshot,
  onBackToReference,
  onBackToBonds,
  onComparisonSnapshotChange,
}: PhysicalReferenceComparisonStageProps) {
  const [activeSource, setActiveSource] = useState<ActiveSource>('physical-model');
  const [observation, setObservation] =
    useState<StudentComparisonObservation>(EMPTY_OBSERVATION);
  const [completedSnapshot, setCompletedSnapshot] =
    useState<ConfirmedPhysicalReferenceComparisonSnapshot | null>(null);

  const result = useMemo(
    () =>
      buildPhysicalReferenceComparison({
        currentRevision: {
          physicalGraphRevisionId: physicalSnapshot.revisionId,
          sourceAtomRevision: physicalSnapshot.sourceRevision,
        },
        physical: physicalSnapshot,
        photo: {
          imageLabel: image.name,
          sourceAtomRevision: physicalSnapshot.sourceRevision,
        },
        validation: validationSnapshot,
        reference: referenceSnapshot,
        observation,
      }),
    [image.name, observation, physicalSnapshot, referenceSnapshot, validationSnapshot],
  );

  const updateObservation = (
    field: keyof StudentComparisonObservation,
    value: string,
  ) => {
    setObservation((current) => ({ ...current, [field]: value }));
    if (completedSnapshot) {
      setCompletedSnapshot(null);
      onComparisonSnapshotChange(null);
    }
  };

  if (result.status === 'blocked') {
    return (
      <section
        className="scanner-comparison-stage"
        data-testid="scanner-comparison-stage"
        aria-labelledby="scanner-comparison-title"
      >
        <header className="scanner-comparison-heading">
          <div>
            <p className="scanner-eyebrow">실물 분자 모형 스캐너 · 6/6 구조 비교</p>
            <h2 id="scanner-comparison-title">구조 비교를 다시 준비해 주세요</h2>
          </div>
        </header>
        <div className="scanner-comparison-blocked" role="alert">
          <p>{result.studentMessage}</p>
          <button
            type="button"
            className="scanner-secondary-button"
            data-testid="scanner-comparison-return-to-reference"
            onClick={onBackToReference}
          >
            Reference 3D로 돌아가기
          </button>
        </div>
      </section>
    );
  }

  const graph = physicalSnapshot.graph;
  const identityId = validationSnapshot.identity.status === 'exact'
    ? validationSnapshot.identity.candidates[0].id
    : 'unknown';
  const coachPrompts = identityId === 'methane'
    ? [METHANE_COACH_PROMPT, ...result.coachPrompts.filter((prompt) => prompt !== METHANE_COACH_PROMPT)]
    : result.coachPrompts;
  const canComplete = result.status === 'complete';

  return (
    <section
      className="scanner-comparison-stage"
      data-testid="scanner-comparison-stage"
      data-physical-revision={physicalSnapshot.revisionId}
      data-validation-revision={validationSnapshot.revisionId}
      data-reference-revision={referenceSnapshot.revisionId}
      aria-labelledby="scanner-comparison-title"
    >
      <header className="scanner-comparison-heading">
        <div>
          <p className="scanner-eyebrow">실물 분자 모형 스캐너 · 6/6 구조 비교</p>
          <h2 id="scanner-comparison-title">Physical Model과 Scientific Reference 비교하기</h2>
          <p>
            사진과 Reference 3D는 서로 다른 출처의 자료입니다. 두 화면에서 직접 관찰한
            공통점과 차이를 기록하되, 한 장의 사진을 정답 또는 오답으로 판정하지 않습니다.
          </p>
        </div>
        <div className="scanner-comparison-return-actions">
          <button
            type="button"
            className="scanner-secondary-button"
            data-testid="scanner-comparison-return-to-reference"
            onClick={onBackToReference}
          >
            Reference 3D로 돌아가기
          </button>
          <button
            type="button"
            className="scanner-secondary-button"
            data-testid="scanner-comparison-return-to-bonds"
            onClick={onBackToBonds}
          >
            결합 다시 확인
          </button>
        </div>
      </header>

      <div
        className="scanner-comparison-view-toggle"
        data-testid="scanner-comparison-view-toggle"
        role="group"
        aria-label="모바일 비교 화면 선택"
      >
        <button
          type="button"
          data-testid="scanner-show-physical"
          aria-pressed={activeSource === 'physical-model'}
          onClick={() => setActiveSource('physical-model')}
        >
          내가 만든 모형
        </button>
        <button
          type="button"
          data-testid="scanner-show-reference"
          aria-pressed={activeSource === 'scientific-reference'}
          onClick={() => setActiveSource('scientific-reference')}
        >
          Scientific Reference
        </button>
      </div>
      <p
        className="scanner-comparison-active-source"
        data-testid="scanner-comparison-active-source"
        role="status"
        aria-live="polite"
      >
        현재 보기: {activeSource === 'physical-model' ? '내가 확인한 Physical Model' : 'Scientific Reference 3D'}
      </p>

      <div className="scanner-comparison-panels" data-active-source={activeSource}>
        <article
          className="scanner-comparison-panel scanner-comparison-physical-panel"
          data-testid="scanner-comparison-physical-panel"
          data-source="physical-model"
        >
          <header>
            <span aria-hidden="true">📷</span>
            <div>
              <h3>내가 만든 Physical Model</h3>
              <strong>학생이 확인한 사진과 연결 구조</strong>
            </div>
          </header>
          <div className="scanner-comparison-physical-image">
            <img src={image.url} alt="학생이 촬영한 Physical Model 사진" />
            <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
              {graph.bonds.map((bond) => {
                const from = graph.atoms.find(({ id }) => id === bond.atomIds[0]);
                const to = graph.atoms.find(({ id }) => id === bond.atomIds[1]);
                if (!from || !to) return null;
                return (
                  <line
                    key={bond.id}
                    x1={from.x * 1000}
                    y1={from.y * 1000}
                    x2={to.x * 1000}
                    y2={to.y * 1000}
                  />
                );
              })}
            </svg>
            {graph.atoms.map((atom) => (
              <span
                key={atom.id}
                className="scanner-comparison-physical-atom"
                style={{ left: `${atom.x * 100}%`, top: `${atom.y * 100}%` }}
                aria-hidden="true"
              >
                {atom.element}
              </span>
            ))}
          </div>
          <p className="scanner-comparison-graph-summary">
            원자 {result.comparison.sharedVerifiedGraph.atomCount}개 · 결합{' '}
            {result.comparison.sharedVerifiedGraph.bondCount}개 · 학생이 직접 확인한 연결 기록
          </p>
          <p className="scanner-comparison-source-note">
            이 사진은 한 방향에서 본 모형입니다. 사진 속 픽셀 거리와 모형 막대 길이는 실제
            결합길이가 아니며, 사진 한 장만으로 앞뒤 깊이나 모든 원자가 같은 평면에 있는지
            확정할 수 없습니다.
          </p>
        </article>

        <article
          className="scanner-comparison-panel scanner-comparison-reference-panel"
          data-testid="scanner-comparison-reference-panel"
          data-source="scientific-reference"
        >
          <header>
            <span aria-hidden="true">🧭</span>
            <div>
              <h3>Scientific Reference 3D</h3>
              <strong>PubChem 계산 conformer · 외부 데이터베이스</strong>
            </div>
          </header>
          <p className="scanner-comparison-reference-source">
            좌표 출처: {referenceSnapshot.molecule3D.coordinateSource}
          </p>
          <Molecule3DViewer
            coordinateData={referenceSnapshot.molecule3D}
            hasValidatedStructure
            validatedStructureKey={referenceSnapshot.canonicalSmiles}
            userMode="student"
            showAdvancedControls={false}
            showMeasurementControls={false}
            testIdNamespace="scanner-comparison-reference"
          />
          <p className="scanner-comparison-source-note">
            현재 검증한 연결 구조와 일치하는 Reference 좌표입니다. 실험에서 직접 측정한
            구조나 정답 모형이 아니며, 사진이나 Physical Model의 거리에서 만든 자료도 아닙니다.
          </p>
        </article>
      </div>

      <section
        className="scanner-structure-coach"
        data-testid="scanner-structure-coach"
        data-identity-id={identityId}
        aria-labelledby="scanner-structure-coach-title"
      >
        <h3 id="scanner-structure-coach-title">Structure Coach · 관찰 도우미</h3>
        <p>정답을 대신 말하지 않습니다. 두 화면에서 직접 확인한 내용을 근거로 적어 보세요.</p>
        <ul>
          {coachPrompts.map((prompt, index) => (
            <li key={`${identityId}-${index}`}>{prompt}</li>
          ))}
        </ul>

        <div className="scanner-comparison-inputs">
          <label>
            두 자료에서 같게 관찰한 점
            <textarea
              data-testid="scanner-same-observation-input"
              value={observation.samePoint}
              onChange={(event) => updateObservation('samePoint', event.target.value)}
              placeholder="예: 원자 종류와 개수, 연결 관계"
            />
          </label>
          <label>
            다르게 보이거나 사진만으로 판단하기 어려운 점
            <textarea
              data-testid="scanner-different-observation-input"
              value={observation.differentPoint}
              onChange={(event) => updateObservation('differentPoint', event.target.value)}
              placeholder="차이가 없거나 판단하기 어렵다면 그 이유를 적어도 됩니다."
            />
          </label>
          <label>
            비교 뒤 수정하거나 근거를 보강한 설명
            <textarea
              data-testid="scanner-revised-explanation-input"
              value={observation.revisedExplanation}
              onChange={(event) => updateObservation('revisedExplanation', event.target.value)}
              placeholder="사진 시점과 Reference 좌표의 성격을 구분해 설명해 보세요."
            />
          </label>
        </div>

        <div
          className="scanner-comparison-gate"
          data-ready={canComplete}
          aria-live="polite"
        >
          <p>
            {canComplete
              ? '세 가지 비교 기록을 모두 작성했습니다.'
              : '같게 본 점, 다르게 보이거나 판단하기 어려운 점, 비교 뒤 설명을 모두 적어 주세요.'}
          </p>
          <button
            type="button"
            className="scanner-primary-button"
            data-testid="scanner-comparison-complete"
            disabled={!canComplete}
            onClick={() => {
              if (result.status !== 'complete') return;
              setCompletedSnapshot(result.completedSnapshot);
              onComparisonSnapshotChange(result.completedSnapshot);
            }}
          >
            현재 활동에 비교 기록 남기기
          </button>
        </div>
      </section>

      {completedSnapshot ? (
        <section
          className="scanner-comparison-completion"
          data-testid="scanner-comparison-completion"
          aria-live="polite"
        >
          <h3>비교 관찰 기록</h3>
          <p><strong>같게 본 점:</strong> {completedSnapshot.observation.samePoint}</p>
          <p><strong>다르게 보이거나 판단하기 어려운 점:</strong> {completedSnapshot.observation.differentPoint}</p>
          <p><strong>비교 뒤 설명:</strong> {completedSnapshot.observation.revisedExplanation}</p>
          <p>
            관찰과 설명을 현재 활동에 기록했습니다. 이것은 모형의 정답 판정이 아닙니다.
          </p>
        </section>
      ) : null}
    </section>
  );
}
