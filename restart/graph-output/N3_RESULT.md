# N3 RESULT — Bond Confirmation → Molecular Graph

## Status

**N3 PASS**

N2에서 학생이 확인한 원자를 바탕으로 결합 후보를 제시하고, 실제 모형의 막대와 대조해 사람이 확정한 결합만 molecular graph에 포함하는 N3 흐름을 구현했다. N4 화학 검증·분자 정체·Reference 3D는 시작하지 않았다.

## User-facing behavior

- 자동 결합 후보는 주황 점선과 `확인 필요` 상태로 시작하며 graph 결합 수에 포함되지 않는다.
- 학생은 결합을 선택해 단일·이중·삼중 종류를 정하고, 확인하거나 삭제할 수 있다.
- 빠진 결합은 두 원자를 차례로 선택해 추가하며, 같은 원자 연결과 중복 결합은 차단한다.
- 학생이 확인한 결합만으로 원자 수, 결합 수, 연결 조각 수, 고립 원자 수를 계산한다.
- 기본 의도인 `single-molecule`에서 연결 조각이 둘 이상이면 완료를 막고 빠진 연결을 확인하도록 안내한다.
- 모든 후보 검토, 하나의 연결 구조, 실제 막대 전체 대조가 충족돼야 연결 기록을 확정할 수 있다.
- 원자를 바꾸지 않고 이전 단계로 갔다가 돌아오면 결합 작업과 확정 revision을 보존한다.
- 원자 수정·추가·삭제 또는 새 사진 입력은 N3 graph와 완료 snapshot을 폐기한다.
- 완료 결과는 학생이 확인한 실물 모형 연결 기록이며 화학적 타당성은 아직 검증하지 않았음을 표시한다.

## Implementation

- `apps/workbench/src/scanner/bondGraph.ts`
  - 정규화된 이미지 좌표 기반의 결정적 결합 후보 생성
  - stable atom-pair bond ID
  - confirmed-only graph 생성과 self/duplicate/unknown-atom 방어
  - connected component·고립 원자 요약과 구조 의도별 연결성 판정
- `apps/workbench/src/scanner/BondConfirmationStage.tsx`
  - 점선/실선 overlay, 결합 목록, 삭제·추가·결합 종류 수정·사람 확인
  - 실제 막대 대조와 `single-molecule` 완료 게이트
  - source-linked graph revision과 상위 snapshot 전달
- `apps/workbench/src/scanner/PhysicalMoleculeScanner.tsx`
  - N2→N3 진입과 동적 단계 안내
  - 무수정 이전 단계 왕복 시 N3 상태 보존
  - 실제 원자/사진 변경 시 downstream graph 무효화
- `apps/workbench/src/scanner/BondConfirmationStage.css`
  - 상태별 선 모양·문구, 44px 이상 조작 대상, 390px 반응형 레이아웃

## Verification evidence

- 전체 Vitest 회귀: 60 files, 455 tests PASS
- graph 단위 테스트: 15/15 PASS
  - 빈 graph, 고립 원자, 선형·분기·고리·분리 graph, CH4, stable ID, aspect ratio, 무결성 방어
- Playwright Chromium scanner 흐름: 5/5 PASS
  - N2 대표·모바일 흐름
  - CH4 5 atoms → 4 unconfirmed candidates → 삭제·stable 재추가 → 결합 종류 변경 → 4 confirmed bonds → 1 component
  - disconnected 완료 차단과 복구
  - 완료 후 무수정 왕복 시 4/4·동일 revision 보존
  - 결합 변경, 원자 변경, 새 사진 입력 시 완료·snapshot 무효화
  - 390×844 가로 넘침 없음과 주요 44px 조작 대상
- `npm run typecheck`: PASS (`npm run build`의 `tsc -b` 포함)
- `npm run build`: PASS, 2,141 modules transformed
- 독립 domain·E2E·교육 UX 재검토: P0 0, P1 0 또는 비차단 안내 개선 1건, 최종 GO

## Scientific boundary and remaining risks

- 결합 후보는 이미지의 선을 화학적으로 판독한 결과가 아니라 원자 사이의 2D 기하 규칙으로 제안한 미확정 후보다.
- 결합 종류 선택은 실제 모형과 수업 안내를 보고 학생이 판단하며, N3는 원자가·분자식·분자명·SMILES·화학적 정당성을 계산하거나 자동 수정하지 않는다.
- 사진 좌표와 막대 길이는 overlay 전용이며 실제 Å 결합 길이로 표시하지 않는다.
- 새 production dependency는 추가하지 않았다.
- 비차단 개선점은 upstream 변경 후 `결합을 다시 확인해야 합니다`라는 직접 안내, 선택 결합의 `aria-current`, 모바일 실제 endpoint tap 회귀 테스트다.
- 빌드에는 기존 3Dmol `eval` 및 큰 chunk 경고가 남는다. N3 scanner chunk는 별도로 생성된다.

## Next best action

N3 노드를 PASS로 유지한다. 사용자가 명시적으로 요청할 때만 N4 화학 검증을 시작하며, N4는 parent-owned `ConfirmedPhysicalGraphSnapshot`과 source revision을 입력으로 사용해야 한다.
