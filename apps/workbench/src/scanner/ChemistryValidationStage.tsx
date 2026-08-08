import { useEffect, useRef, useState } from 'react';
import type { ConfirmedPhysicalGraphSnapshot } from './BondConfirmationStage';
import {
  validateConfirmedPhysicalGraph,
  type PhysicalGraphValidationIssue,
  type PhysicalGraphValidationResult,
} from './physicalGraphValidation';
import './ChemistryValidationStage.css';

type ValidPhysicalGraphValidationResult = Extract<
  PhysicalGraphValidationResult,
  { ok: true }
>;

interface ChemistryValidationStageProps {
  snapshot: ConfirmedPhysicalGraphSnapshot;
  onBackToBonds: () => void;
  onStartReference3D: () => void;
  onN5SnapshotChange: (
    snapshot: ValidPhysicalGraphValidationResult | null,
  ) => void;
}

function identityStatus(
  result: ValidPhysicalGraphValidationResult,
): 'single' | 'multiple' | 'unknown' {
  if (result.identity.status === 'exact') return 'single';
  return result.identity.status;
}

const ELEMENT_NAME_KO = {
  H: '수소',
  C: '탄소',
  N: '질소',
  O: '산소',
  F: '플루오린',
  Cl: '염소',
} as const;

function studentIssueMessage(
  issue: PhysicalGraphValidationIssue,
  snapshot: ConfirmedPhysicalGraphSnapshot,
): string {
  if (issue.code === 'invalid-valence') {
    const affectedElements = [...new Set(
      issue.atomIds.flatMap((atomId) => {
        const atom = snapshot.graph.atoms.find(({ id }) => id === atomId);
        return atom ? [ELEMENT_NAME_KO[atom.element]] : [];
      }),
    )];
    const subject = affectedElements.length > 0
      ? `${affectedElements.join('·')} 원자`
      : '표시된 원자';
    return `${subject}의 결합 차수 또는 원자가를 실제 모형과 다시 확인해 주세요.`;
  }
  if (issue.code === 'rdkit-invalid') {
    return '원자 종류와 결합 차수를 확인한 뒤 결합 다시 확인으로 돌아가 주세요.';
  }
  if (issue.code === 'graph-contract-invalid' || issue.code === 'graph-mismatch') {
    return '검증 전후의 원자 또는 결합 기록이 달라 결과를 표시하지 않았습니다. 결합을 다시 확인해 주세요.';
  }
  return issue.message;
}

export function ChemistryValidationStage({
  snapshot,
  onBackToBonds,
  onStartReference3D,
  onN5SnapshotChange,
}: ChemistryValidationStageProps) {
  const [result, setResult] = useState<PhysicalGraphValidationResult | null>(null);
  const [retryRevision, setRetryRevision] = useState(0);
  const [hasUnexpectedValidationError, setHasUnexpectedValidationError] = useState(false);
  const statusHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let acceptsResult = true;
    const requestedRevision = snapshot.revisionId;
    setResult(null);
    setHasUnexpectedValidationError(false);
    onN5SnapshotChange(null);

    void validateConfirmedPhysicalGraph(snapshot)
      .then((nextResult) => {
        if (!acceptsResult || requestedRevision !== snapshot.revisionId) return;
        setResult(nextResult);
        onN5SnapshotChange(
          nextResult.ok && nextResult.n5Ready ? nextResult : null,
        );
      })
      .catch(() => {
        if (!acceptsResult || requestedRevision !== snapshot.revisionId) return;
        setHasUnexpectedValidationError(true);
        onN5SnapshotChange(null);
      });

    return () => {
      acceptsResult = false;
    };
  }, [onN5SnapshotChange, retryRevision, snapshot]);

  useEffect(() => {
    if (result || hasUnexpectedValidationError) statusHeadingRef.current?.focus();
  }, [hasUnexpectedValidationError, result]);

  const validationStatus = hasUnexpectedValidationError
    ? 'error'
    : result?.validationStatus ?? 'validating';
  const isN5Ready = result?.ok === true && result.n5Ready;

  return (
    <section
      className="scanner-validation-stage"
      data-testid="scanner-validation-stage"
      aria-labelledby="scanner-validation-title"
    >
      <header className="scanner-validation-heading">
        <div>
          <p className="scanner-eyebrow">실물 분자 모형 스캐너 · 4/6 구조 확인</p>
          <h2 id="scanner-validation-title">학생이 확인한 연결 구조 검증</h2>
          <p>
            학생이 확인한 원자와 결합을 화학 규칙으로 확인합니다. 사진 속 거리나
            모형의 공간 배치는 이 단계에서 판단하지 않습니다.
          </p>
        </div>
        <button
          type="button"
          className="scanner-secondary-button"
          data-testid="scanner-return-to-bonds"
          onClick={onBackToBonds}
        >
          결합 다시 확인
        </button>
      </header>

      <div className="scanner-validation-layout">
        <section
          className="scanner-physical-model-panel"
          data-testid="scanner-physical-model-panel"
          aria-labelledby="scanner-physical-model-title"
        >
          <p className="scanner-panel-kicker">검증 입력 · 학생이 확인한 Physical Model</p>
          <h3 id="scanner-physical-model-title">연결 구조 기록</h3>
          <dl>
            <div><dt>원자</dt><dd>{snapshot.graph.atoms.length}개</dd></div>
            <div><dt>확인한 결합</dt><dd>{snapshot.graph.bonds.length}개</dd></div>
          </dl>
          <p>원자 {snapshot.graph.atoms.length}개 · 확인한 결합 {snapshot.graph.bonds.length}개</p>
          <p
            data-testid="scanner-validation-connectivity"
            data-graph-revision={snapshot.revisionId}
          >
            연결 조각 {result?.graphSummary.componentCount ?? 1}개
          </p>
          <small>사진 좌표와 막대 길이는 이 계산에 사용하지 않습니다.</small>
        </section>

        <section
          className={`scanner-validation-status ${validationStatus}`}
          data-testid="scanner-validation-status"
          data-validation-status={validationStatus}
          aria-busy={validationStatus === 'validating'}
          role={validationStatus === 'invalid' || validationStatus === 'error' ? 'alert' : 'status'}
        >
          <h3 ref={statusHeadingRef} tabIndex={-1}>
            {validationStatus === 'validating' && '연결 구조를 확인하는 중입니다…'}
            {validationStatus === 'valid' && '구조 확인 결과'}
            {validationStatus === 'invalid' && '구조 검증 실패'}
            {validationStatus === 'error' && '구조 확인 도구 오류'}
          </h3>
          {validationStatus === 'validating' && (
            <p>학생이 확인한 원자와 결합을 확인하는 중입니다…</p>
          )}
          {result?.ok && (
            <>
              <strong className="scanner-validation-badge" data-testid="scanner-validation-badge">
                구조 검증 완료
              </strong>
              <p>이 연결 구조는 현재 지원 범위에서 계산에 사용할 수 있습니다.</p>
            </>
          )}
          {result && !result.ok && (
            <>
              <p>
                {result.validationStatus === 'error'
                  ? '구조 확인 도구를 불러오지 못했습니다. 확인한 원자와 결합은 그대로 유지됩니다.'
                  : '현재 구조는 계산에 사용할 수 있는 분자 구조로 확인되지 않았습니다. 원자 종류와 결합 수를 다시 확인해 주세요.'}
              </p>
              <ul data-testid="scanner-validation-issues">
                {result.issues.map((issue) => (
                  <li key={`${issue.code}-${issue.atomIds.join('-')}`}>
                    원자와 결합 검토: {studentIssueMessage(issue, snapshot)}
                  </li>
                ))}
              </ul>
              {result.validationStatus === 'error' && (
                <button
                  type="button"
                  className="scanner-secondary-button"
                  data-testid="scanner-retry-validation"
                  onClick={() => setRetryRevision((current) => current + 1)}
                >
                  구조 확인 다시 시도
                </button>
              )}
            </>
          )}
          {hasUnexpectedValidationError && (
            <>
              <p>구조 확인 도구를 불러오지 못했습니다. 확인한 원자와 결합은 그대로 유지됩니다.</p>
              <button
                type="button"
                className="scanner-secondary-button"
                data-testid="scanner-retry-validation"
                onClick={() => setRetryRevision((current) => current + 1)}
              >
                구조 확인 다시 시도
              </button>
            </>
          )}
        </section>
      </div>

      {result?.ok && (
        <div className="scanner-validation-results">
          <section className="scanner-validated-values" data-testid="scanner-validated-values">
            <h3>검증된 구조 계산값</h3>
            <dl>
              <div>
                <dt>분자식</dt>
                <dd data-testid="scanner-formula-output">{result.molecularFormula}</dd>
              </div>
              <div>
                <dt>몰 질량(평균 원자량 기준)</dt>
                <dd data-testid="scanner-molecular-weight-output">
                  {result.molecularWeight.toFixed(3)} g/mol
                </dd>
              </div>
            </dl>
            <p>평균 원자량을 사용해 계산한 값이며 사진의 거리나 막대 길이에서 얻은 값이 아닙니다.</p>
            <details className="scanner-canonical-details" data-testid="scanner-canonical-details">
              <summary>검증 근거 자세히 보기</summary>
              <p>표준 표기에서는 일부 수소가 생략될 수 있습니다.</p>
              <code data-testid="scanner-canonical-output">{result.canonicalSmiles}</code>
            </details>
            <p
              className="scanner-validation-provenance"
              data-testid="scanner-validation-provenance"
              data-graph-revision={result.revisionId}
              data-validator="rdkit"
              data-input-source="mol-block"
            >
              계산 기준: 학생이 확인한 연결 구조 · 구조 확인 완료
            </p>
          </section>

          <section
            className="scanner-identity-panel"
            data-testid="scanner-identity-panel"
            data-identity-status={identityStatus(result)}
          >
            <h3>수업용 분자 목록 대조</h3>
            {result.identity.status === 'exact' && (
              <>
                <p>수업용 목록에서 이 연결 구조와 일치하는 분자 1개를 찾았습니다.</p>
                <strong data-testid="scanner-identity-name">
                  {result.identity.candidates[0].nameKo}
                </strong>
                <p>원자 연결과 결합 종류가 검증 결과와 일치합니다.</p>
              </>
            )}
            {result.identity.status === 'unknown' && (
              <p>제한된 분자 목록에서 일치하는 이름을 찾지 못했습니다. 이름을 추측하지 않습니다.</p>
            )}
            {result.identity.status === 'multiple' && (
              <>
                <p>현재 정보와 일치하는 후보가 여러 개여서 하나를 자동으로 정하지 않습니다.</p>
                <ul>
                  {result.identity.candidates.map((candidate) => (
                    <li key={candidate.id} data-testid="scanner-identity-candidate" data-identity-id={candidate.id}>
                      {candidate.nameKo}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </div>
      )}

      <section
        className="scanner-reference-preparation"
        data-testid="scanner-reference-preparation"
      >
        <h3>다음 단계 준비 상태</h3>
        <p data-testid="scanner-n5-readiness" data-ready={isN5Ready}>
          {isN5Ready
            ? '검증 결과와 일치하는 분자 1개가 있어 5단계 Scientific Reference 준비가 가능합니다.'
            : '검증 결과와 일치하는 분자 1개가 없어 5단계 Scientific Reference 준비를 보류합니다.'}
        </p>
        {isN5Ready ? (
          <button
            type="button"
            className="scanner-primary-button"
            data-testid="scanner-start-reference-3d"
            onClick={onStartReference3D}
          >
            5단계 Scientific Reference 3D 시작
          </button>
        ) : null}
        <small>이 단계에서는 3D 구조, 거리, 각도를 생성하거나 표시하지 않습니다.</small>
      </section>
    </section>
  );
}
