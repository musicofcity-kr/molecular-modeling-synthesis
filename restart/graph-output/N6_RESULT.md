# N6 RESULT — Physical Model ↔ Scientific Reference 비교

## Status

**N6 PASS**

학생이 확인한 Physical Model과 current-revision Scientific Reference 3D를 서로 다른 근거로 유지하면서, 두 자료를 직접 관찰한 공통점·차이 또는 판단하기 어려운 점·수정 설명을 기록하는 6단계를 구현했다. N6는 사진을 자동 판정하거나 분자 형태 정답을 제시하지 않는다.

## User-facing behavior

- N5 Reference 3D를 한 번 이상 회전한 뒤에만 `6단계 구조 비교 시작`이 활성화된다.
- 데스크톱은 Physical/Reference를 동일한 2열 카드로, 390px 모바일은 현재 출처가 항상 보이는 단일 패널 전환으로 제공한다.
- Physical 카드는 원본 사진, 학생 확인 원자·결합 수, read-only overlay를 보여 주며 픽셀·막대 길이가 실제 결합길이가 아니라고 명시한다.
- Reference 카드는 현재 구조와 exact-match한 PubChem CID 계산 conformer를 별도 3D viewer와 source label로 보여 준다.
- CH4/NH3/H2O와 기타 identity에 대해 형태 이름이나 정답 각도를 먼저 말하지 않는 deterministic 관찰 질문을 제공한다.
- `같게 관찰한 점`, `다르게 보이거나 판단하기 어려운 점`, `비교 뒤 수정하거나 보강한 설명`이 모두 작성돼야 비교 기록을 남길 수 있다.
- 완료 문구는 학생 관찰 기록임을 알리고 모형의 정답 판정이나 자동 채점으로 표현하지 않는다.
- N6에서 N5 또는 결합 확인으로 돌아갈 수 있다. 무수정 복귀는 기록을 보존하고, 원자·결합 변경은 N4~N6 결과를 제거한다.

## Scientific and data boundary

- strict gate는 parent-owned Physical revision, atom/image revision, N4 validation revision, N5 Reference revision, identity, canonical key를 대조한다.
- N5의 `verified` 표시만 신뢰하지 않고 Reference SDF의 원자·결합·원소 구성과 측정 결합 인접성을 다시 검사한다.
- Physical 출력은 `metricUse: observation-only`; x/y/radius와 사진 거리·각도는 도메인 비교 결과에 포함하지 않는다.
- Reference 측정값만 `reference-coordinate` evidence를 유지한다. Physical 원자와 Reference SDF 원자의 1:1 atom map은 만들지 않는다.
- `automaticSpatialJudgement: not-performed`, 완료 snapshot은 `student-observation-not-auto-graded`로 고정된다.
- 사진 또는 학생 작성 내용을 외부 분석/LLM 서비스에 전송하지 않는다. N6에서 새 네트워크 요청이나 production dependency를 추가하지 않았다.

## Implementation

- `apps/workbench/src/scanner/physicalReferenceComparison.ts`
  - strict revision/source/identity/canonical/reference graph gate
  - Physical/Reference evidence 분리와 Reference measurement sanitization
  - identity별 Structure Coach prompt와 draft/complete 상태
- `apps/workbench/src/scanner/PhysicalReferenceComparisonStage.tsx`
  - 출처별 패널, Physical overlay, Reference viewer, 학생 입력과 완료 UI
  - 모바일 source switch와 복귀 동작
- `apps/workbench/src/scanner/PhysicalMoleculeScanner.tsx`
  - 6단계 parent state, hidden-mounted 보존, upstream invalidation, N7 경계
- `apps/workbench/src/scanner/ScientificReferenceStage.tsx`
  - Reference 회전 evidence와 명시적 N6 진입 gate

## Verification evidence

- N3–N6 focused Vitest: 59/59 PASS
- 전체 Vitest: 63 files, 501 tests PASS
- Playwright Chromium scanner 전체: 18/18 PASS
  - 기존 N2–N5 15/15
  - N6 3/3: desktop 비교·입력 gate·완료, 복귀/결합 변경 invalidation, 390px source switch/44px/overflow
- `npm run typecheck`: PASS
- `npm run build`: PASS, 2,150 modules transformed
- 독립 domain/state 리뷰: GO, P0 없음
- 독립 교육 UX·과학 리뷰: GO, P0 없음
- 독립 E2E 리뷰: GO

## Remaining non-blocking risks

- N6 Reference canvas는 키보드용 N6 전용 회전·초기화 버튼이 없으므로, 캔버스 조작이 어려운 학생은 N5로 돌아가 app-owned 버튼을 사용해야 한다.
- 완료 gate는 세 텍스트 입력을 검증하지만 N6 안에서 두 패널을 실제 방문했는지 별도 evidence로 저장하지 않는다. N5의 최소 1회 회전은 진입 전에 강제한다.
- NH3/H2O에서 비공유 전자쌍은 Reference 원자로 표시되지 않는다는 추가 학생 안내를 교실 파일럿 전에 보강할 수 있다.
- Playwright PubChem 성공 경로는 production URL을 deterministic SDF fixture로 intercept한다. 현재 학교망의 live PubChem 가용성은 보장하지 않는다.
- 실제 touch gesture, 200% zoom, landscape, WebGL 픽셀 정확도는 이번 자동화 범위 밖이다.
- 기존 3Dmol `eval` 및 큰 Ketcher/앱 chunk build 경고는 남는다.

## Next best action

N6 노드를 PASS로 유지한다. 사용자가 명시적으로 요청할 때만 N7 교실 QA, 실제 기기·학교망 점검, 최종 release 판정을 진행한다.
