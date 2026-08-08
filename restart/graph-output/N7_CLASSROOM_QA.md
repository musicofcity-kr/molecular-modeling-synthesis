# N7 CLASSROOM QA — 수업 통합 검증

## Status

**N7 PASS — 통제된 교실 파일럿용 MVP release candidate**

N2~N6의 학생 흐름과 부모 molecular modeling 핵심 기능을 최신 트리에서 다시 실행했다. 자동화 범위의 Critical/P0 문제는 남지 않았고 독립 품질 리뷰는 **ACCEPT, 23/24**로 판정했다. 이 PASS는 합성 사진·결정론적 외부 응답과 자동 브라우저를 사용한 코드 수준 release 판정이다. 실제 학생 기기, 카메라 권한, 다양한 조명·가림, 학교망 PubChem, 장치별 WebGL까지 검증했다는 뜻은 아니다.

## Classroom scenarios

| 시나리오 | 결과 | 현재 근거 | 경계 |
|---|---|---|---|
| CH4 정상 모형 | PASS | DEMO 사진 → 원자 5개 사람 확인 → 결합 4개 확인 → RDKit CH4 exact validation → source-labeled PubChem Reference → 회전·측정 → Physical/Reference 비교·학생 설명 기록 | PubChem 성공 경로는 고정 SDF 응답이며 실제 학교망 확인이 아님 |
| CH4 평면형 오개념 | PASS | 사진 한 장으로 평면성을 자동 판정하지 않고, Reference를 회전한 뒤 공통점·차이/판단 곤란·수정 설명을 학생이 직접 기록한다. 형태명·정답 각도를 먼저 주지 않고 자동 채점하지 않는다. | 입력 설명의 학습 효과는 실제 학생 파일럿이 필요 |
| H2O 원자 가림 | PASS (E2 synthetic) | SVG z-order에서 H 하나가 O 뒤에 완전히 가려져 O+H 두 후보만 검출된다. 학생이 실제 모형을 근거로 빠진 H를 추가한 뒤 3 atoms, 2 bonds, 1 component, RDKit H2O exact 결과까지 확인한다. | 실제 사진·반사·흰색 수소 검출 성능을 증명하지 않음 |
| 잘못된 결합수·결합차수 | PASS | CH4의 C-H 이중결합은 학생 안내와 함께 차단되고 결합 수정으로 돌아간다. lone C 부족결합과 C-5H 과결합도 fail-closed로 검증된다. | 범용 분자 인식기나 전체 주기율표 원자가 검사 주장이 아님 |
| 인식 실패 후 학생 수정 | PASS | 자동 후보를 사실로 확정하지 않으며, 빠진 원자를 직접 추가·원소 확인·결합 확인한 뒤에만 chemistry validation으로 이동한다. | 이미지 decode/카메라 권한 자체 실패는 친화적 오류 복구 범위로 별도 확인 필요 |
| 390×844 모바일 | PASS (자동화 범위) | 각 scanner 단계의 가로 overflow, 주요 44px 조작 대상, 단일 source 전환을 검증했다. 부모 direct construction의 touch 회귀와 mobile completed flow도 통과했다. | scanner 사진 촬영과 실제 touch gesture는 실기기 미검증 |
| 기존 molecular modeling 회귀 | PASS | Ketcher 직접 그리기·연결성 차단, 단순 분자 모델러, 기존 student workbench 핵심 흐름 3 files/16 tests 통과 | 전체 서버/API 보안 검토나 실제 Firebase 배포 판정은 N7 범위 밖 |

## Critical issue found and repaired

### Reference fetch success was mistaken for render success

- 재현: 유효한 methane SDF 응답을 주되 3D host를 0×0으로 만들면 `data-model-rendered=false`인데도 기존 N5 회전 버튼이 활성화됐다. no-op 회전 클릭이 `hasRotated=true`를 만들고 N6 진입을 열 수 있었다.
- RED: 신규 Playwright 회귀가 회전 버튼 `toBeDisabled()`에서 예상대로 1회 실패했다.
- 수리:
  - `Molecule3DViewer`가 current structure key와 실제 render 상태를 콜백으로 전달한다.
  - `rotate`, `zoom`, `resetView`는 viewer가 실제 렌더되고 host가 비영 크기일 때만 성공을 반환한다.
  - N5는 current Reference revision의 render evidence가 있을 때만 카메라 조작을 허용하고, 성공한 회전만 기록한다.
  - N6 진입은 자식과 부모 양쪽에서 `hasRendered && hasRotated`를 확인한다.
  - 새 load/retry/revision은 render·rotation·parent snapshot을 폐기한다. N6 진입 뒤 hidden-mounted 상태는 완료 기록을 보존한다.
- GREEN: render success, 0×0 fail-closed, N6 hidden-mounted 복귀·upstream invalidation 집중 E2E 3/3 PASS.

## Scientific safety

- structure intent는 scanner MVP에서 `single-molecule`로 유지되며 disconnected graph는 chemistry output 전에 차단된다.
- 분자식·정체·canonical 결과는 연결성 정책과 deterministic RDKit validation을 통과한 current revision에서만 표시된다.
- Physical 사진 좌표·구 반지름·막대 길이는 `observation-only`이며 Å 또는 결합각으로 변환하지 않는다.
- Scientific Reference는 `external-database`, `verified`, PubChem 계산 conformer provenance를 유지한다.
- 사진 한 장에서 평면성·깊이·정답 여부를 자동 판정하지 않는다.
- Structure Coach 결과는 `student-observation-not-auto-graded`이며 자동 정답 판정이 아니다.

## Student UX and accessibility

- 자동 후보는 모두 미확정 상태로 시작하고 학생이 원소·누락·가림을 확인해야 한다.
- 잘못된 결합은 raw toolkit 오류가 아니라 수정 행동과 돌아갈 단계를 안내한다.
- Physical Model과 Scientific Reference는 출처 label·카드·data contract가 분리된다.
- 주요 mobile 조작 대상은 44px 이상이며 390×844에서 가로 overflow가 없다.

## Verification evidence

실행 위치: `apps/workbench`

- `npm run typecheck` — PASS.
- `npm test` — **63 files, 502 tests PASS**.
- `npx vitest run src/components/Molecule3DViewer.test.tsx` — **1 file, 10 tests PASS**.
- `npx playwright test e2e/physical-molecule-scanner.spec.ts --project=chromium` — **1 file, 20/20 PASS**, 1 worker, automatic retries 0.
- `npx playwright test e2e/direct-molecule-construction.spec.ts e2e/simple-molecule-modeler.spec.ts e2e/molecule-workbench.spec.ts --project=chromium` — **3 files, 16/16 PASS**.
- `npx playwright test e2e/mobile-completed-flow.spec.ts --project=mobile-chromium` — **1 file, 1/1 PASS**.
- `npm run build` — PASS, **2,150 modules transformed**.

H2O 신규 테스트의 최초 좌표는 O marker가 preview click을 가로채 full 1회와 focused retry 1회가 동일 실패했다. 원인을 수동 H 배치 좌표로 한정해 수정한 뒤 focused 1/1과 scanner 전체 20/20을 재실행했다. 최종 게이트에는 retry나 환경 실패가 없다.

## Independent review

`code-review-and-quality` rubric: **23/24, ACCEPT**

- Direct construction 3/3
- Connectivity policy 3/3
- RDKit validation 3/3
- VSEPR/2D boundary 3/3
- Classroom UI 3/3
- Architecture/types 2/3
- Test coverage 3/3
- Dependency/source discipline 3/3

Architecture/types 1점 이월 사유: render 성공 직후 `ConfirmedScientificReferenceSnapshot`은 `hasRotated=false`인 progressive snapshot으로 먼저 발행된다. 자식·부모 N6 gate가 모두 두 evidence를 재검사하므로 현재 우회 경로는 없지만, 추후 domain evidence type에 이 전제조건을 더 강하게 표현할 수 있다.

## Remaining risks and deferred work

- 실제 Android/iOS/Chromebook touch, 카메라 권한, 200% zoom, landscape를 교실 기기에서 확인한다.
- 실제 분자키트 사진에서 조명·그림자·반사·배경색·흰 수소·부분/완전 가림을 확인한다.
- 학교망에서 PubChem endpoint 지연·차단과 retry 안내를 확인한다.
- 장치별 WebGL 픽셀 출력, context loss, 저사양 GPU fallback을 확인한다.
- NH3/H2O의 비공유 전자쌍이 Reference 원자로 표시되지 않는다는 학생 안내를 파일럿 관찰 후 보강한다.
- `ConfirmedScientificReferenceEvidence` domain type에 render/rotation interaction evidence를 직접 포함하는 개선을 검토한다.
- 기존 3Dmol `eval` 및 큰 Ketcher/앱 chunk build 경고는 남는다.

## MVP decision

코드·자동화 기준 MVP는 완료됐으며 **통제된 교실 파일럿으로 진행 가능**하다. 불특정 학교·기기 대상의 일반 release 또는 실제 수업 효과 검증 완료로 확대 해석하지 않는다. 다음 최선의 행동은 대표 학교 기기 1~2종에서 실제 CH4/H2O 사진과 학교망으로 짧은 교사 주도 파일럿 체크리스트를 실행하는 것이다.

## Files changed for N7

- `apps/workbench/src/components/Molecule3DViewer.tsx`
- `apps/workbench/src/components/Molecule3DViewer.test.tsx`
- `apps/workbench/src/scanner/ScientificReferenceStage.tsx`
- `apps/workbench/src/scanner/PhysicalMoleculeScanner.tsx`
- `apps/workbench/e2e/physical-molecule-scanner.spec.ts`
- `restart/physical-molecule-scanner/CURRENT_NODE.md`
- `restart/graph-output/N7_CLASSROOM_QA.md`

## Rollback path

N7의 app 변경은 render evidence callback/boolean viewer controls, N5·부모 gate, 두 Playwright 시나리오에 한정된다. 문제가 생기면 이 N7 추가분만 제거하면 N6 코드 경계로 돌아갈 수 있으며, N2~N6 domain validation과 기존 사용자 데이터를 되돌리거나 삭제할 필요는 없다.
