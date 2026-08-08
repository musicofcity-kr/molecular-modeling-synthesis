import { useMemo, useState } from 'react';
import {
  createPhysicalGraph,
  createStableBondId,
  decideGraphConnectivity,
  proposeBondCandidates,
  summarizePhysicalGraph,
  type BondAtom,
  type BondOrder,
  type ConfirmedBond,
  type PhysicalGraph,
} from './bondGraph';
import './BondConfirmationStage.css';

type BondReviewStatus = 'unconfirmed' | 'confirmed';
type BondSource = 'geometry' | 'manual';

interface EditableBond {
  id: string;
  atomIds: readonly [string, string];
  order: BondOrder;
  reviewStatus: BondReviewStatus;
  source: BondSource;
}

interface BondConfirmationStageProps {
  image: {
    url: string;
    name: string;
    width: number;
    height: number;
  };
  atoms: readonly BondAtom[];
  sourceRevision: string;
  onBackToAtoms: () => void;
  onGraphConfirmed: (snapshot: ConfirmedPhysicalGraphSnapshot | null) => void;
  onStartChemistryValidation: () => void;
}

export interface ConfirmedPhysicalGraphSnapshot {
  revisionId: string;
  sourceRevision: string;
  graph: PhysicalGraph;
}

const canonicalPair = (left: string, right: string): readonly [string, string] =>
  left.localeCompare(right, 'en') <= 0 ? [left, right] : [right, left];

const pairKey = (left: string, right: string) => canonicalPair(left, right).join('|');

export function BondConfirmationStage({
  image,
  atoms,
  sourceRevision,
  onBackToAtoms,
  onGraphConfirmed,
  onStartChemistryValidation,
}: BondConfirmationStageProps) {
  const initialBonds = useMemo<EditableBond[]>(
    () =>
      proposeBondCandidates(atoms, {
        imageWidth: image.width,
        imageHeight: image.height,
      }).map(({ id, atomIds, order, reviewStatus, source }) => ({
        id,
        atomIds,
        order,
        reviewStatus,
        source,
      })),
    [atoms, image.height, image.width],
  );
  const [bonds, setBonds] = useState<EditableBond[]>(initialBonds);
  const [selectedBondId, setSelectedBondId] = useState<string | null>(
    initialBonds[0]?.id ?? null,
  );
  const [isAddingBond, setIsAddingBond] = useState(false);
  const [pendingAtomIds, setPendingAtomIds] = useState<string[]>([]);
  const [hasComparedSticks, setHasComparedSticks] = useState(false);
  const [graphRevision, setGraphRevision] = useState(1);
  const [completedRevision, setCompletedRevision] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState(
    initialBonds.length > 0
      ? `${initialBonds.length}개의 결합 후보를 찾았습니다. 실제 막대를 보고 하나씩 확인하세요.`
      : '결합 후보를 찾지 못했습니다. 빠진 결합 추가로 두 원자를 직접 연결하세요.',
  );

  const atomById = useMemo(
    () => new Map(atoms.map((atom) => [atom.id, atom])),
    [atoms],
  );
  const atomOrder = useMemo(
    () => new Map(atoms.map((atom, index) => [atom.id, index + 1])),
    [atoms],
  );
  const atomLabel = (atomId: string) => {
    const atom = atomById.get(atomId);
    return atom ? `${atom.element}${atomOrder.get(atomId) ?? ''}` : atomId;
  };

  const confirmedBonds = useMemo<ConfirmedBond[]>(
    () =>
      bonds
        .filter(({ reviewStatus }) => reviewStatus === 'confirmed')
        .map(({ id, atomIds, order, source }) => ({
          id,
          atomIds,
          order,
          reviewStatus: 'confirmed',
          source,
        })),
    [bonds],
  );
  const physicalGraph = useMemo(
    () => createPhysicalGraph(atoms, confirmedBonds, graphRevision),
    [atoms, confirmedBonds, graphRevision],
  );
  const graphSummary = useMemo(
    () => summarizePhysicalGraph(physicalGraph),
    [physicalGraph],
  );
  const connectivity = useMemo(
    () => decideGraphConnectivity(physicalGraph, 'single-molecule'),
    [physicalGraph],
  );
  const selectedBond = bonds.find(({ id }) => id === selectedBondId) ?? null;
  const confirmedCount = confirmedBonds.length;
  const unconfirmedCount = bonds.length - confirmedCount;
  const allCandidatesReviewed = unconfirmedCount === 0;
  const canConfirmGraph =
    allCandidatesReviewed && connectivity.ok && hasComparedSticks && atoms.length > 0;

  const invalidateGraphCompletion = () => {
    setCompletedRevision(null);
    onGraphConfirmed(null);
    setHasComparedSticks(false);
    setGraphRevision((current) => current + 1);
  };

  const updateSelectedBond = (update: Partial<EditableBond>) => {
    if (!selectedBondId) return;
    setBonds((current) =>
      current.map((bond) => (bond.id === selectedBondId ? { ...bond, ...update } : bond)),
    );
    invalidateGraphCompletion();
  };

  const deleteSelectedBond = () => {
    if (!selectedBondId) return;
    const deleted = bonds.find(({ id }) => id === selectedBondId);
    setBonds((current) => {
      const next = current.filter(({ id }) => id !== selectedBondId);
      setSelectedBondId(next[0]?.id ?? null);
      return next;
    });
    invalidateGraphCompletion();
    if (deleted) {
      setStatusMessage(
        `${atomLabel(deleted.atomIds[0])}–${atomLabel(deleted.atomIds[1])} 결합 후보를 삭제했습니다.`,
      );
    }
  };

  const beginAddBond = () => {
    setIsAddingBond((current) => !current);
    setPendingAtomIds([]);
    setStatusMessage(
      isAddingBond
        ? '결합 추가를 취소했습니다.'
        : '첫 번째 원자를 선택하세요.',
    );
  };

  const selectBondEndpoint = (atomId: string) => {
    if (!isAddingBond) return;
    if (pendingAtomIds.length === 0) {
      setPendingAtomIds([atomId]);
      setStatusMessage(`${atomLabel(atomId)} 선택됨. 연결할 두 번째 원자를 선택하세요.`);
      return;
    }

    const firstAtomId = pendingAtomIds[0];
    if (firstAtomId === atomId) {
      setStatusMessage('같은 원자를 두 번 연결할 수 없습니다. 다른 원자를 선택하세요.');
      return;
    }

    const endpoints = canonicalPair(firstAtomId, atomId);
    const endpointsKey = pairKey(endpoints[0], endpoints[1]);
    if (bonds.some((bond) => pairKey(bond.atomIds[0], bond.atomIds[1]) === endpointsKey)) {
      setStatusMessage('이미 두 원자 사이에 결합 후보가 있습니다. 기존 후보를 확인하세요.');
      return;
    }

    const id = createStableBondId(endpoints[0], endpoints[1]);
    const newBond: EditableBond = {
      id,
      atomIds: endpoints,
      order: 1,
      reviewStatus: 'unconfirmed',
      source: 'manual',
    };
    setBonds((current) => [...current, newBond]);
    setSelectedBondId(id);
    setPendingAtomIds([]);
    setIsAddingBond(false);
    invalidateGraphCompletion();
    setStatusMessage(
      `${atomLabel(endpoints[0])}–${atomLabel(endpoints[1])} 결합 후보를 추가했습니다. 아직 확인이 필요합니다.`,
    );
  };

  const connectivityText = !allCandidatesReviewed
    ? `결합 확인 중입니다. 확인 필요 ${unconfirmedCount}개를 모두 검토하세요.`
    : connectivity.status === 'single-component'
      ? `원자 ${graphSummary.atomCount}개 · 확인한 결합 ${graphSummary.bondCount}개 · 하나의 구조로 연결됨`
      : `현재 구조가 ${graphSummary.componentCount}개의 조각으로 나뉘어 있습니다. 하나의 분자를 만들려면 원자 사이를 결합으로 연결해 주세요.`;

  const confirmPhysicalGraph = () => {
    const revisionId = `physical-${sourceRevision}-${graphRevision}`;
    setCompletedRevision(graphRevision);
    onGraphConfirmed({
      revisionId,
      sourceRevision,
      graph: physicalGraph,
    });
  };

  return (
    <section className="scanner-bond-stage" data-testid="scanner-bond-review" aria-labelledby="scanner-bond-title">
      <div className="scanner-bond-stage-heading">
        <div>
          <p className="scanner-eyebrow">실물 분자 모형 스캐너 · 3/6</p>
          <h2 id="scanner-bond-title">결합 확인</h2>
          <p>자동으로 찾은 선은 후보입니다. 실제 모형의 막대를 보고 하나씩 확인하거나 삭제하세요.</p>
        </div>
        <button
          type="button"
          className="scanner-secondary-button"
          data-testid="scanner-back-to-atoms"
          onClick={onBackToAtoms}
        >
          원자 다시 확인
        </button>
      </div>

      <div className="scanner-bond-workspace">
        <div className="scanner-image-column">
          <div className="scanner-heading-row">
            <div>
              <h3>사진 위 결합 후보</h3>
              <p>{image.name} · 선의 길이는 실제 Å 결합길이가 아닙니다.</p>
            </div>
            <strong data-testid="scanner-bond-confirmation-status">
              {confirmedCount}/{bonds.length} 확인
            </strong>
          </div>

          <div className="scanner-bond-preview" data-testid="scanner-bond-preview">
            <img src={image.url} alt="결합을 확인할 실물 분자 모형" draggable={false} />
            <svg className="scanner-bond-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {bonds.map((bond) => {
                const from = atomById.get(bond.atomIds[0]);
                const to = atomById.get(bond.atomIds[1]);
                if (!from || !to) return null;
                return (
                  <line
                    key={bond.id}
                    className={`${bond.reviewStatus}${bond.id === selectedBondId ? ' selected' : ''}`}
                    x1={from.x * 100}
                    y1={from.y * 100}
                    x2={to.x * 100}
                    y2={to.y * 100}
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })}
            </svg>

            {bonds.map((bond) => {
              const from = atomById.get(bond.atomIds[0]);
              const to = atomById.get(bond.atomIds[1]);
              if (!from || !to) return null;
              return (
                <button
                  key={bond.id}
                  type="button"
                  className={`scanner-bond-marker ${bond.reviewStatus}${bond.id === selectedBondId ? ' selected' : ''}`}
                  style={{
                    left: `${((from.x + to.x) / 2) * 100}%`,
                    top: `${((from.y + to.y) / 2) * 100}%`,
                  }}
                  data-testid="scanner-bond-marker"
                  data-bond-id={bond.id}
                  data-from-atom-id={bond.atomIds[0]}
                  data-to-atom-id={bond.atomIds[1]}
                  data-bond-order={bond.order}
                  data-review-status={bond.reviewStatus}
                  data-line-style={bond.reviewStatus === 'confirmed' ? 'solid' : 'dashed'}
                  aria-label={`${atomLabel(bond.atomIds[0])}과 ${atomLabel(bond.atomIds[1])}, ${bond.order === 1 ? '단일' : bond.order === 2 ? '이중' : '삼중'} 결합 후보, ${bond.reviewStatus === 'confirmed' ? '내가 확인함' : '확인 필요'}`}
                  onClick={() => setSelectedBondId(bond.id)}
                >
                  {bond.order}
                </button>
              );
            })}

            {atoms.map((atom) => (
              <button
                key={atom.id}
                type="button"
                className={`scanner-bond-atom${pendingAtomIds.includes(atom.id) ? ' pending' : ''}`}
                style={{ left: `${atom.x * 100}%`, top: `${atom.y * 100}%` }}
                data-testid="scanner-bond-endpoint"
                data-candidate-id={atom.id}
                data-atom-id={atom.id}
                aria-label={`${atomLabel(atom.id)}${isAddingBond ? ', 결합 끝점으로 선택' : ''}`}
                aria-pressed={isAddingBond ? pendingAtomIds.includes(atom.id) : undefined}
                disabled={!isAddingBond}
                onClick={() => selectBondEndpoint(atom.id)}
              >
                {atom.element}
              </button>
            ))}
          </div>

          <div className="scanner-bond-add-controls">
            <button
              type="button"
              className="scanner-secondary-button"
              data-testid="scanner-add-bond-button"
              aria-pressed={isAddingBond}
              onClick={beginAddBond}
            >
              {isAddingBond ? '결합 추가 취소' : '빠진 결합 추가'}
            </button>
            <p role="status" aria-live="polite" data-testid="scanner-add-bond-status">
              {statusMessage}
            </p>
          </div>
        </div>

        <aside className="scanner-review-panel" aria-label="결합 후보 편집">
          <h3>결합 후보 목록</h3>
          {bonds.length === 0 ? (
            <p>표시된 결합 후보가 없습니다. 빠진 결합 추가로 두 원자를 선택하세요.</p>
          ) : (
            <ul className="scanner-candidate-list" data-testid="scanner-bond-list">
              {bonds.map((bond) => (
                <li key={bond.id}>
                  <button
                    type="button"
                    className={bond.id === selectedBondId ? 'selected' : ''}
                    onClick={() => setSelectedBondId(bond.id)}
                  >
                    <span>
                      {atomLabel(bond.atomIds[0])}–{atomLabel(bond.atomIds[1])} ·{' '}
                      {bond.order === 1 ? '단일' : bond.order === 2 ? '이중' : '삼중'}
                    </span>
                    <small>{bond.reviewStatus === 'confirmed' ? '내가 확인함' : '확인 필요'}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {selectedBond && (
            <div className="scanner-editor" data-testid="scanner-bond-editor">
              <h3>{atomLabel(selectedBond.atomIds[0])}–{atomLabel(selectedBond.atomIds[1])} 선택됨</h3>
              <label>
                결합 종류
                <select
                  data-testid="scanner-selected-bond-order"
                  value={selectedBond.order}
                  onChange={(event) =>
                    updateSelectedBond({
                      order: Number(event.target.value) as BondOrder,
                      reviewStatus: 'unconfirmed',
                    })
                  }
                >
                  <option value="1">단일 결합 (1)</option>
                  <option value="2">이중 결합 (2)</option>
                  <option value="3">삼중 결합 (3)</option>
                </select>
              </label>
              <p>사진의 막대와 활동 안내를 보고 선택하세요. 이 선택만으로 화학적으로 옳다고 판단하지 않습니다.</p>
              <div className="scanner-editor-actions">
                <button
                  type="button"
                  className="scanner-confirm-button"
                  data-testid="scanner-confirm-selected-bond"
                  disabled={selectedBond.reviewStatus === 'confirmed'}
                  onClick={() => updateSelectedBond({ reviewStatus: 'confirmed' })}
                >
                  {selectedBond.reviewStatus === 'confirmed' ? '내가 확인함' : '이 결합 확인'}
                </button>
                <button
                  type="button"
                  className="scanner-delete-button"
                  data-testid="scanner-delete-selected-bond"
                  onClick={deleteSelectedBond}
                >
                  {atomLabel(selectedBond.atomIds[0])}–{atomLabel(selectedBond.atomIds[1])} 삭제
                </button>
              </div>
            </div>
          )}

          <div className="scanner-bond-summary" data-testid="scanner-bond-summary">
            <h3>내가 확인한 모형의 연결 상태</h3>
            <dl>
              <div><dt>원자</dt><dd data-testid="graph-atom-count">{graphSummary.atomCount}</dd></div>
              <div><dt>확인한 결합</dt><dd data-testid="graph-bond-count">{graphSummary.bondCount}</dd></div>
              <div><dt>연결 조각</dt><dd data-testid="graph-component-count">{graphSummary.componentCount}</dd></div>
              <div><dt>고립 원자</dt><dd data-testid="graph-isolated-count">{graphSummary.isolatedAtomCount}</dd></div>
            </dl>
            <p
              className={allCandidatesReviewed && !connectivity.ok ? 'blocked' : ''}
              data-testid="scanner-connectivity-status"
            >
              {connectivityText}
            </p>
          </div>

          <div className="scanner-gate" data-ready={canConfirmGraph} data-testid="scanner-graph-gate">
            <strong>{canConfirmGraph ? '모형의 연결 구조를 확인할 준비가 됐습니다.' : '결합과 연결 상태를 더 확인하세요.'}</strong>
            <label className="scanner-whole-model-check" data-testid="scanner-bond-whole-model-check">
              <input
                type="checkbox"
                data-testid="scanner-bond-whole-model-checkbox"
                checked={hasComparedSticks}
                onChange={(event) => {
                  setHasComparedSticks(event.target.checked);
                  setCompletedRevision(null);
                  if (!event.target.checked) onGraphConfirmed(null);
                }}
              />
              사진과 실제 모형의 모든 막대를 대조했습니다.
            </label>
            <button
              type="button"
              className="scanner-primary-button"
              data-testid="scanner-confirm-physical-graph"
              disabled={!canConfirmGraph}
              onClick={confirmPhysicalGraph}
            >
              이 연결 구조로 확인하기
            </button>
          </div>
        </aside>
      </div>

      {completedRevision !== null && (
        <section
          className="scanner-complete-card"
          data-testid="scanner-physical-graph-summary"
          data-graph-revision={`physical-${sourceRevision}-${completedRevision}`}
          aria-live="polite"
        >
          <h2>학생이 확인한 모형 연결 기록</h2>
          <p>
            원자 {graphSummary.atomCount}개 · 결합 {graphSummary.bondCount}개 · 연결 조각 {graphSummary.componentCount}개
          </p>
          <strong>사진과 실제 모형을 보고 학생이 확인한 연결 기록입니다.</strong>
          <p>화학적 타당성은 다음 단계에서 별도로 검증합니다.</p>
          <button
            type="button"
            className="scanner-primary-button"
            data-testid="scanner-start-chemistry-validation"
            onClick={onStartChemistryValidation}
          >
            4단계 구조 검증 시작
          </button>
        </section>
      )}
    </section>
  );
}
