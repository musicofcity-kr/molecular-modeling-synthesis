# PROJECT_SPEC.md

## 1. Project Goal

실물 분자모형의 사진에서 원자와 결합 후보를 제시하고 학생이 이를 확인·수정한 뒤, 검증된 Scientific Reference 3D와 비교하여 분자의 공간 구조를 설명하도록 돕는다.

## 2. Primary User

- 고등학교 화학 수업의 학생

## 3. Primary Tasks

1. 실물 분자모형 사진을 입력하고 원자·결합 후보를 확인·수정한다.
2. 확정한 molecular graph를 검증하고 Scientific Reference 3D의 구조·거리·각도를 탐색한다.
3. Physical Model과 Scientific Reference의 차이를 관찰하고 자신의 설명을 수정한다.

## 4. Success Evidence

- 학생이 촬영부터 비교·성찰까지 핵심 흐름을 실제로 완료한다.
- 잘못되거나 모호한 인식은 학생 확인 전 화학적 사실로 확정되지 않는다.
- 구조 검증, 3D 좌표 출처, 거리·각도 계산 근거가 코드와 UI에서 추적 가능하다.
- 기존 분자 편집·검증·3D·측정 흐름의 회귀가 없다.

## 5. P0 — Non-Negotiables

- 검증되지 않은 화학정보를 사실처럼 표시하지 않는다.
- Physical Model과 Scientific Reference를 데이터와 UI에서 분리한다.
- 사진 픽셀 거리나 키트 막대 길이를 실제 Å 결합길이로 표시하지 않는다.
- AI/비전 결과는 후보로만 사용하고 불확실하면 학생이 확인·수정한다.
- 기존 Ketcher, RDKit.js, 3Dmol.js, 측정·검증 게이트를 불필요하게 변경하지 않는다.
- mock, fixture, 미작동 기능을 실제 완료 기능처럼 표시하지 않는다.

## 6. P1 — Important Quality

- 모바일 우선의 짧은 단계 흐름과 터치 조작
- 큰 3D 캔버스와 쉬운 원자·결합 수정
- 학생 수준의 오류·피드백 문구
- Physical / Reference의 명확한 시각적 구분
- 구조적 오개념을 줄이는 비교·성찰 행동

## 7. Freedom Zone

- 세부 레이아웃, 버튼 배치, 전환, 미세 상호작용
- 반응형 UI와 시각적 위계
- P0/P1과 현재 노드 범위를 지키는 컴포넌트 구성·구현 방식

## 8. Main Risks

- 단일 사진에서 완전한 3D 좌표를 복원할 수 있다고 과장하는 것
- Physical 관찰값과 Reference 좌표·측정값을 혼합하는 것
- AI 후보를 확정 구조로 취급하거나 잘못된 graph를 검증 없이 통과시키는 것
- 부모 앱의 미커밋 변경 및 기존 학생/교사 흐름을 덮어쓰는 것
- 학교망에서 Ketcher·3Dmol·RDKit WASM 및 PubChem 의존 흐름이 느리거나 실패하는 것

## 9. Minimum Done Criteria

- [ ] 현재 `CURRENT_NODE.md`의 PASS 조건을 충족했다.
- [ ] 핵심 학생 흐름이 실제 브라우저에서 확인됐다.
- [ ] P0 과학·출처·검증 경계가 유지됐다.
- [ ] 관련 typecheck, 단위 테스트, E2E, production build를 통과했다.
- [ ] 기존 주요 분자 예제와 편집·3D·측정 기능의 회귀가 없다.
- [ ] 미지원·미확인 항목을 명확히 기록했다.

## 10. Project-Specific Commands

앱 루트: `../apps/workbench`

```powershell
npm ci
npm run dev
npm run typecheck
npm test
npm run test:firestore-rules
npm run test:e2e
npm run build
npm run build:single-html
```
