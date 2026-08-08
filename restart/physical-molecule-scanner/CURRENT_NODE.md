# CURRENT_NODE.md

## ACTIVE NODE

N7 — Classroom Integration QA

## STATUS

PASS

## MISSION

N2~N6의 Physical Molecule Scanner가 기능 데모를 넘어 실제 고등학교 화학 수업 흐름에서 안전하고 이해 가능하게 작동하는지 검증하고, Critical 결함만 최소 범위로 수리한 뒤 MVP 출시 여부를 판정한다.

## P0

- 검증되지 않은 사진·비전 추정이나 잘못된 graph를 과학적 사실로 확정하지 않는다.
- Physical Model 관찰과 Scientific Reference 좌표·측정값·출처를 데이터와 UI에서 분리한다.
- CH4 정상/평면 오개념, H2O 원자 가림, 잘못된 결합수, 인식 실패 후 학생 수정 흐름에서 학생의 확인·수정·검증 gate가 유지된다.
- 모바일 핵심 흐름과 기존 molecular modeling 기능에 치명적 회귀가 없다.
- mock·fixture 결과를 live classroom 검증으로 과장하지 않는다.

## FREEDOM ZONE

- QA 시나리오 구성, 테스트 조합, 증거 표현 방식
- P0/P1을 해치지 않는 최소 UI 문구·접근성·테스트 보강
- 다음 버전으로 미룰 비차단 항목의 우선순위

## INPUT

- N2~N6의 실제 동작 결과와 `graph-output/N2_RESULT.md`~`N6_RESULT.md`
- 기존 부모 프로젝트와 현재 회귀 테스트
- `PROJECT_INTENT.md`, `WORKFLOW_GRAPH.md`, `PROJECT_SPEC.md`

## TASK

`기능이 존재하는가`가 아니라 `수업에서 쓸 수 있는가`를 검증한다. 대표 시나리오, 모바일, 기존 molecular modeling 회귀를 자동화와 실제 브라우저 흐름으로 확인하고, 출시 차단 결함은 N7 범위 안에서 최소 수리한다.

## OUTPUT

- `graph-output/N7_CLASSROOM_QA.md`
- PASS/FAIL 시나리오와 실행 근거
- Critical 문제, 화학적 위험, 학생 UX 위험, 부모 프로젝트 회귀
- MVP 완료 여부와 다음 버전 이월 항목

## PASS CHECK

- [x] CH4 정상 모형 전체 흐름이 검증됐다.
- [x] CH4 평면형 오개념이 자동 정답 판정 없이 수정 행동을 유도한다.
- [x] H2O 원자 가림이 불확실성·학생 확인 경계를 유지한다.
- [x] 잘못된 결합수는 deterministic validation에서 차단된다.
- [x] 인식 실패 뒤 학생이 원자·결합을 수정하고 다시 검증할 수 있다.
- [x] 390×844 모바일에서 핵심 흐름, 44px 조작 대상, 가로 overflow가 검증됐다.
- [x] 기존 molecular modeling 핵심 기능 회귀가 없다.
- [x] typecheck, 관련 단위 테스트, Chromium E2E, production build 근거가 있다.
- [x] Critical 문제와 과학적·학생 UX 위험이 명시적으로 판정됐다.
- [x] fixture/mocked network와 실제 기기·학교망 미검증 범위가 분리 기록됐다.

## FINAL EVIDENCE

- Vitest: 63 files, 502 tests PASS
- Scanner Chromium E2E: 20/20 PASS
- Parent core Chromium E2E: 3 files, 16/16 PASS
- Mobile Chromium E2E: 1/1 PASS
- Typecheck and production build: PASS
- Independent review: ACCEPT, 23/24
- Detailed result: `graph-output/N7_CLASSROOM_QA.md`

## MINIMUM IMPLEMENTATION PATH

기존 테스트·동작을 먼저 재현하고, N7 시나리오 증거가 부족한 부분만 테스트로 보강한다. 실패가 확인된 경우에만 해당 계층을 최소 수정한 뒤 전체 회귀를 다시 실행한다.

## MAIN RISKS

- deterministic fixture 성공을 실제 학교망·카메라 성능으로 오인하는 것
- 한 장의 사진에서 가림·평면성·깊이를 자동 판정하는 과학적 과장
- scanner 수리가 부모 Ketcher/RDKit/3D 흐름을 깨뜨리는 것
- 자동화가 실제 touch, 카메라 권한, WebGL 장치 차이를 놓치는 것

## ADVANCE POLICY

N7은 최종 노드다. PASS여도 새 기능이나 다음 버전을 자동 시작하지 않는다.
