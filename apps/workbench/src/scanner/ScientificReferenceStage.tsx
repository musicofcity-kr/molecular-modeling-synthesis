import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Molecule3DViewer,
  type Molecule3DViewerHandle,
} from '../components/Molecule3DViewer';
import type { GeometryMeasurementResult, Molecule3DInput } from '../types/molecule';
import type { PhysicalGraphValidationResult } from './physicalGraphValidation';
import {
  loadScannerN5Reference,
  prepareScannerN5Reference,
  type ScannerN5ReferenceRequestDescriptor,
  type ScannerN5ReferenceState,
} from './scientificReference';
import './ScientificReferenceStage.css';

type ValidN5Snapshot = Extract<PhysicalGraphValidationResult, { ok: true }>;

export interface ConfirmedScientificReferenceSnapshot {
  revisionId: string;
  sourceValidationRevision: string;
  sourceAtomRevision: string;
  identityId: string;
  canonicalSmiles: string;
  sourceCategory: 'external-database';
  coordinateUse: 'coordinate-measurement-approved';
  structureMatchStatus: 'verified';
  molecule3D: Molecule3DInput;
  measurements: GeometryMeasurementResult[];
  interactionEvidence: {
    hasRendered: true;
    hasRotated: boolean;
  };
}

interface ScientificReferenceStageProps {
  snapshot: ValidN5Snapshot;
  onBackToValidation: () => void;
  onReferenceSnapshotChange: (
    snapshot: ConfirmedScientificReferenceSnapshot | null,
  ) => void;
  onStartComparison: () => void;
}

type ReferenceLoadStatus =
  | 'loading'
  | Extract<ScannerN5ReferenceState, { status: 'success' | 'noData' | 'error' | 'blocked' }>;

function referenceRevision(request: ScannerN5ReferenceRequestDescriptor): string {
  return `reference-${request.provenance.revisionId}-pubchem-${request.lookup.cid}`;
}

function statusMessage(status: ReferenceLoadStatus): string {
  if (status === 'loading') {
    return '현재 검증된 분자에 맞는 Reference 3D 자료를 불러오는 중입니다.';
  }
  if (status.status === 'success') {
    return '현재 구조와 일치 검증된 Reference 3D 자료를 불러왔습니다.';
  }
  if (status.status === 'noData') {
    return '이 분자에 사용할 수 있는 Reference 3D 자료를 찾지 못했습니다. 4단계 구조 검증 결과는 유지됩니다.';
  }
  if (status.status === 'error') {
    return 'Reference 3D 자료를 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요. 4단계 구조 검증 결과는 유지됩니다.';
  }
  return status.status === 'blocked'
    ? status.studentMessage
    : status.result.studentMessage;
}

export function ScientificReferenceStage({
  snapshot,
  onBackToValidation,
  onReferenceSnapshotChange,
  onStartComparison,
}: ScientificReferenceStageProps) {
  const prepared = useMemo(() => prepareScannerN5Reference(snapshot), [snapshot]);
  const viewerRef = useRef<Molecule3DViewerHandle>(null);
  const mountedRef = useRef(true);
  const currentValidationRef = useRef<ValidN5Snapshot>(snapshot);
  const requestSequenceRef = useRef(0);
  const autoLoadedRevisionRef = useRef<string | null>(null);
  const [loadStatus, setLoadStatus] = useState<ReferenceLoadStatus>(() =>
    prepared.status === 'ready' ? 'loading' : prepared,
  );
  const [measurements, setMeasurements] = useState<GeometryMeasurementResult[]>([]);
  const [renderedReferenceRevision, setRenderedReferenceRevision] = useState<string | null>(null);
  const [hasRotated, setHasRotated] = useState(false);
  const [cameraStatus, setCameraStatus] = useState('Reference 3D를 회전하거나 확대·축소할 수 있습니다.');
  const handleDeveloperLog = useCallback((message: string) => {
    console.info('[Scanner Reference 3D]', message);
  }, []);

  currentValidationRef.current = snapshot;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestSequenceRef.current += 1;
    };
  }, []);

  const loadReference = useCallback(async () => {
    if (prepared.status !== 'ready') {
      setLoadStatus(prepared);
      onReferenceSnapshotChange(null);
      return;
    }

    const requestSequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestSequence;
    setLoadStatus('loading');
    setMeasurements([]);
    setRenderedReferenceRevision(null);
    setHasRotated(false);
    onReferenceSnapshotChange(null);

    const nextState = await loadScannerN5Reference(
      prepared.request,
      () => currentValidationRef.current,
    );

    if (!mountedRef.current || requestSequenceRef.current !== requestSequence) {
      return;
    }

    setLoadStatus(nextState.status === 'ready' ? 'loading' : nextState);
  }, [onReferenceSnapshotChange, prepared]);

  useEffect(() => {
    const revision = prepared.status === 'ready'
      ? prepared.request.provenance.revisionId
      : `blocked-${snapshot.revisionId}`;

    if (autoLoadedRevisionRef.current === revision) return;
    const timer = window.setTimeout(() => {
      autoLoadedRevisionRef.current = revision;
      void loadReference();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadReference, prepared, snapshot.revisionId]);

  const successfulState =
    loadStatus !== 'loading' && loadStatus.status === 'success' ? loadStatus : null;
  const coordinateData = successfulState?.result.molecule3D ?? null;
  const successfulReferenceRevision = successfulState
    ? referenceRevision(successfulState.request)
    : null;
  const hasRendered = Boolean(
    successfulReferenceRevision && renderedReferenceRevision === successfulReferenceRevision,
  );

  useEffect(() => {
    if (!successfulState) {
      onReferenceSnapshotChange(null);
      return;
    }

    if (!hasRendered) {
      return;
    }

    const { request, result } = successfulState;
    onReferenceSnapshotChange({
      revisionId: referenceRevision(request),
      sourceValidationRevision: request.provenance.revisionId,
      sourceAtomRevision: request.provenance.sourceRevision,
      identityId: request.identityId,
      canonicalSmiles: request.provenance.expectedCanonicalSmiles,
      sourceCategory: 'external-database',
      coordinateUse: 'coordinate-measurement-approved',
      structureMatchStatus: 'verified',
      molecule3D: result.molecule3D,
      measurements,
      interactionEvidence: { hasRendered: true, hasRotated },
    });
  }, [hasRendered, hasRotated, measurements, onReferenceSnapshotChange, successfulState]);

  const statusValue = loadStatus === 'loading' ? 'loading' : loadStatus.status;
  const canControlViewer = hasRendered;

  return (
    <section
      className="scanner-reference-stage"
      data-testid="scanner-reference-3d-stage"
      data-validation-revision={snapshot.revisionId}
      aria-labelledby="scanner-reference-title"
    >
      <header className="scanner-reference-heading">
        <div>
          <p className="scanner-eyebrow">실물 분자 모형 스캐너 · 5/6 과학적 Reference 3D</p>
          <h2 id="scanner-reference-title">Scientific Reference 3D 살펴보기</h2>
          <p>
            4단계에서 확인한 연결 구조와 일치하는 출처 표시 3D 자료를 불러옵니다.
            사진 속 거리나 모형 막대 길이는 사용하지 않습니다.
          </p>
        </div>
        <button
          type="button"
          className="scanner-secondary-button"
          data-testid="scanner-return-to-validation"
          onClick={onBackToValidation}
        >
          분자 확인으로 돌아가기
        </button>
      </header>

      <div
        className={`scanner-reference-load-status ${statusValue}`}
        data-testid="scanner-reference-load-status"
        data-status={statusValue}
        role={statusValue === 'error' || statusValue === 'blocked' ? 'alert' : 'status'}
        aria-live="polite"
        aria-busy={statusValue === 'loading'}
      >
        <strong>{statusMessage(loadStatus)}</strong>
        {(statusValue === 'error' || statusValue === 'noData') && (
          <button
            type="button"
            className="scanner-secondary-button"
            data-testid="scanner-reference-retry"
            onClick={() => void loadReference()}
          >
            Reference 3D 다시 불러오기
          </button>
        )}
      </div>

      {successfulState ? (
        <section
          className="scanner-reference-source"
          data-testid="scanner-reference-source"
          data-source-category="external-database"
        >
          <h3>Scientific Reference 자료 근거</h3>
          <dl>
            <div><dt>자료 유형</dt><dd>외부 데이터베이스 3D 좌표</dd></div>
            <div><dt>좌표 출처</dt><dd>PubChem CID {successfulState.request.lookup.cid}</dd></div>
            <div><dt>구조 일치</dt><dd>현재 검증한 연결 구조와 일치</dd></div>
            <div><dt>좌표 성격</dt><dd>PubChem이 계산해 만든 3D 배치 참고 좌표</dd></div>
            <div><dt>측정 승인 범위</dt><dd>Å 거리 · 도 단위 각도 · SDF 결합 관계만</dd></div>
          </dl>
          <p>
            이 좌표는 실험에서 직접 측정한 구조가 아니며, 이 앱에서 계산하거나 최적화한 결과도
            아닙니다. 현재 좌표에서 계산한 거리와 각도는 문헌 기준값이 아닙니다.
          </p>
        </section>
      ) : null}

      <div className="scanner-reference-camera-controls" aria-label="Reference 3D 보기 조작">
        <button
          type="button"
          className="scanner-secondary-button"
          data-testid="scanner-reference-rotate-left"
          disabled={!canControlViewer}
          onClick={() => {
            if (!hasRendered || viewerRef.current?.rotate(-20) !== true) return;
            setHasRotated(true);
            setCameraStatus('Reference 3D를 왼쪽으로 회전했습니다.');
          }}
        >
          왼쪽 회전
        </button>
        <button
          type="button"
          className="scanner-secondary-button"
          data-testid="scanner-reference-zoom-in"
          disabled={!canControlViewer}
          onClick={() => {
            if (!hasRendered || viewerRef.current?.zoom(1.2) !== true) return;
            setCameraStatus('Reference 3D를 확대했습니다.');
          }}
        >
          확대
        </button>
        <button
          type="button"
          className="scanner-secondary-button"
          data-testid="scanner-reference-zoom-out"
          disabled={!canControlViewer}
          onClick={() => {
            if (!hasRendered || viewerRef.current?.zoom(0.8) !== true) return;
            setCameraStatus('Reference 3D를 축소했습니다.');
          }}
        >
          축소
        </button>
        <button
          type="button"
          className="scanner-secondary-button"
          data-testid="scanner-reference-reset-view"
          disabled={!canControlViewer}
          onClick={() => {
            if (!hasRendered || viewerRef.current?.resetView() !== true) return;
            setCameraStatus('Reference 3D를 처음 보기로 되돌렸습니다.');
          }}
        >
          처음 보기
        </button>
      </div>
      <p
        className="scanner-reference-camera-status"
        data-testid="scanner-reference-camera-status"
        role="status"
        aria-live="polite"
      >
        {cameraStatus}
      </p>

      <Molecule3DViewer
        ref={viewerRef}
        coordinateData={coordinateData}
        hasValidatedStructure={Boolean(successfulState)}
        validatedStructureKey={snapshot.canonicalSmiles}
        userMode="student"
        showAdvancedControls={false}
        showMeasurementControls={
          successfulState?.request.measurementPolicy.status === 'approved'
        }
        testIdNamespace="scanner-reference"
        measurementEvidenceType="reference-coordinate"
        requireBondedMeasurements
        renderEvidenceKey={successfulReferenceRevision ?? undefined}
        onMeasurementResultsChange={setMeasurements}
        onRenderStateChange={({ evidenceKey, modelRendered }) => {
          setRenderedReferenceRevision(modelRendered ? evidenceKey : null);
        }}
        onDeveloperLog={handleDeveloperLog}
      />

      <p
        className="scanner-reference-measurement-evidence"
        data-testid="scanner-reference-measurement-evidence"
      >
        거리와 각도는 현재 Reference 좌표에서 계산한 값입니다. 사진이나 실물 모형에서 측정한 값이
        아닙니다. 실험값이 아닙니다. 이 앱에서 계산하거나 최적화한 좌표도 아닙니다.
      </p>

      {successfulState ? (
        <section className="scanner-reference-next-step" aria-labelledby="scanner-reference-next-title">
          <div>
            <h3 id="scanner-reference-next-title">Physical Model과 비교할 준비</h3>
            <p>
              Reference 3D를 한 번 이상 회전해 공간 배치를 살펴본 뒤, 두 자료의 출처를
              구분해 비교합니다.
            </p>
          </div>
          <button
            type="button"
            className="scanner-primary-button"
            data-testid="scanner-start-comparison"
            disabled={!hasRendered || !hasRotated}
            onClick={() => {
              if (!hasRendered || !hasRotated) return;
              onStartComparison();
            }}
          >
            6단계 구조 비교 시작
          </button>
        </section>
      ) : null}
    </section>
  );
}
