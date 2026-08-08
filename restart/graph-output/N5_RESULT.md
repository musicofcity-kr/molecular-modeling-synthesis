# N5 RESULT — Scientific Reference 3D + Measurement

## Status

**N5 PASS**

N4에서 학생이 확인하고 RDKit.js가 검증한 current-revision graph가 제한 목록의 분자 1개와 정확히 일치할 때만, 고정 PubChem CID의 3D SDF를 불러와 다시 exact-match 검증한다. 성공한 Reference 좌표를 3Dmol.js로 실제 렌더하고, 승인된 CID별 정책과 SDF 결합 관계 안에서만 거리·각도를 계산한다. N6 비교 기능은 시작하지 않았다.

## User-facing behavior

- N4의 `5단계 Scientific Reference 3D 시작`을 누른 뒤에만 외부 3D 자료를 요청한다.
- DEMO CH4는 PubChem CID 297의 source-labeled 3D SDF를 실제 회전·확대·축소 가능한 viewer에 표시한다.
- WebGL 캔버스 외에 C1, H2 같은 44px 이상 DOM 원자 버튼으로 키보드 선택이 가능하다.
- 거리 모드는 SDF에서 서로 결합한 원자 2개만, 각도 모드는 두 번째 중심 원자와 결합한 두 이웃만 허용한다.
- 대표 tetrahedral CH4 fixture에서 C–H 1.09 Å, H–C–H 109.5°가 현재 Reference 좌표 계산값으로 표시된다.
- 출처 카드는 외부 데이터베이스, PubChem CID, 현재 구조 exact match, PubChem이 계산해 만든 3D 배치, 측정 승인 범위를 함께 표시한다.
- 좌표와 측정값은 실험값·문헌 기준값·이 앱의 최적화 결과가 아님을 학생 문구로 명시한다.
- HTTP 오류·자료 없음은 N4 검증 결과를 유지하고 `Reference 3D 다시 불러오기`를 제공한다.
- 결합·원자·사진 또는 validation revision이 바뀌면 Reference viewer, 측정, snapshot을 즉시 폐기한다.

## Implementation

- `apps/workbench/src/scanner/scientificReference.ts`
  - N4 exact identity 10개의 고정 ID→CID/canonical provenance registry
  - 현재 안전한 exact-match가 되지 않는 H2는 요청 전 fail-closed, 나머지 9개만 지원
  - supported CID마다 계산 conformer 방법, Å/도 단위, bonded distance/angle 선택 규칙, evidence type을 명시한 measurement allowlist
  - invalid·unknown·multiple·not-ready·unsupported·canonical mismatch 차단
  - 요청 전후 revision/source revision/identity/canonical/CID/measurement policy 재대조
  - 기존 `fetchPubChem3DSdf`와 실제 RDKit.js exact-match 권위 재사용
- `apps/workbench/src/scanner/ScientificReferenceStage.tsx`
  - loading·success·no-data·error와 retry, source/provenance, camera controls
  - approved measurement policy에서만 viewer 측정 UI 활성화
  - parent-owned `ConfirmedScientificReferenceSnapshot` handoff
  - Strict Mode의 effect 재실행이 중복 fetch를 만들지 않도록 지연 시작·sequence guard 적용
- `apps/workbench/src/components/Molecule3DViewer.tsx`
  - 기존 3Dmol.js viewer 재사용
  - scanner namespace의 stable controls, imperative rotate/zoom/reset
  - WebGL/DOM 공용 원자 선택과 Strict Mode 중복 측정 방지
  - `reference-coordinate` evidence와 student-readable 상태
- `apps/workbench/src/services/geometryMeasurement.ts`
  - strict V2000/SDF bond table parser
  - distinct bonded pair와 bonded-neighbor-center-neighbor gate
- `apps/workbench/src/scanner/PhysicalMoleculeScanner.tsx`
  - 5단계 hero/progress, N4→N5 진입, 무수정 복귀 보존
  - upstream graph/validation 변경 시 N5 동기 무효화
- `docs/THREE_D_DATA_POLICY.md`, `docs/LIBRARY_DECISION_LOG.md`, `restart/graph-output/N1_LEARNING_EXPERIENCE.md`
  - 일반 PubChem 측정 기본 차단과 Scanner fixed-CID measurement allowlist 예외를 정합화

## Verification evidence

- N5/3D/measurement 집중 Vitest: 40/40 PASS
- 전체 Vitest 회귀: 62 files, 486 tests PASS
- Playwright Chromium scanner 전체: 15/15 PASS
  - 기존 N2–N4 11/11
  - N5 4/4: exact CH4 render·camera·Reference measurement, 503 retry, N3 mutation invalidation, 390×844
- `npm run typecheck`: PASS
- `npm run build`: PASS, 2,147 modules transformed
- 독립 chemistry domain 리뷰: GO, P0/P1 없음
- 독립 교육 UX·과학 정책 재검토: CID별 measurement allowlist 수리 후 GO
- 독립 E2E 리뷰: GO

## Scientific boundary and remaining risks

- PubChem3D 좌표는 이론적으로 계산된 conformer 참고 모형이다. 실험 구조, 문헌 기준값, 에너지 최적화 결과 또는 이 앱이 생성한 구조라고 주장하지 않는다.
- Å와 도 값은 내려받고 exact-match한 현재 SDF 좌표의 유클리드 계산값이다. 권위 있는 결합 길이·각도 표준값이 아니다.
- 사진 픽셀 좌표와 실물 키트 막대 길이는 overlay·사람 확인 용도일 뿐 Reference 측정 계산에 들어가지 않는다.
- 분자식·몰 질량·identity는 N4 RDKit.js 결과이며 PubChem title·formula·mass로 대체하지 않는다.
- Playwright는 실제 production URL 모양을 intercept한 결정적 methane SDF fixture를 사용한다. 따라서 브라우저 네트워크 성공/실패 UI는 검증했지만 현재 교실망의 live PubChem 가용성을 보장하지 않는다.
- in-flight 요청은 최대 15초 뒤 timeout되고 late 결과는 폐기하지만, upstream 변경 순간 네트워크 전송 자체를 abort하지는 않는다.
- fetch 성공 직후 3Dmol.js 초기화가 별도로 실패하면 generic viewer 오류가 보이지만 Reference load 상태와 camera enablement를 viewer-ready와 완전히 분리하는 후속 개선이 남는다.
- 실제 WebGL 픽셀 변환과 실제 touch gesture는 자동 검증하지 않았고, app-owned camera 상태와 390px 터치 크기/overflow를 검증했다.
- H2 N5는 기존 explicit-H SDF normalization 경계를 별도로 수리·검증할 때까지 안전 차단한다.
- 새 production dependency는 추가하지 않았다. 기존 build의 3Dmol `eval` 및 큰 Ketcher/앱 chunk 경고는 남는다.

## Next best action

N5 노드를 PASS로 유지한다. 사용자가 명시적으로 요청할 때만 N6 Physical Model ↔ Scientific Reference 비교와 Structure Coach를 시작하며, N6는 current validation/reference revision과 source provenance를 그대로 입력으로 사용해야 한다.
