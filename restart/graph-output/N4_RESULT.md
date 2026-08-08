# N4 RESULT — Chemistry Validation → Molecule Identity

## Status

**N4 PASS**

N3에서 학생이 확인한 Physical graph를 topology-only V2000 MolBlock으로 변환하고, 연결성 정책과 실제 RDKit.js 검증을 통과한 결과에만 분자식·몰 질량·표준 구조 문자열을 표시한다. 제한된 수업용 목록의 정체 일치는 별도 판정하며 N5 Reference 3D는 시작하지 않았다.

## User-facing behavior

- N3 graph를 확정한 뒤 `4단계 구조 검증 시작`으로 진입한다.
- 검증 입력이 학생이 확인한 Physical Model의 원자·결합 기록임을 표시한다.
- 유효한 구조만 분자식, 몰 질량, 기본 닫힘 상태의 표준 구조 문자열을 보여 준다.
- DEMO CH4는 `CH4`와 `메테인` 단일 일치 결과를 표시한다.
- 잘못된 C–H 이중결합은 수소·탄소의 결합 차수/원자가를 다시 확인하도록 안내하며 계산값과 이름을 숨긴다.
- RDKit이 사진에 없던 암묵적 수소를 보충할 수 있는 단일 C는 CH4·메테인으로 통과시키지 않는다.
- 유효한 ClF처럼 제한 목록 밖인 구조는 계산값은 보여 주되 이름을 추측하지 않고 N5 준비를 보류한다.
- 복수 identity 계약은 첫 후보를 임의 선택하지 않는다.
- N4에서 결합 단계로 돌아가도 무수정 상태는 보존하고, 결합·원자·사진 변경은 검증값과 N5 snapshot을 즉시 폐기한다.
- 검증 도구 오류는 Physical graph를 유지한 채 재시도할 수 있다.

## Implementation

- `apps/workbench/src/scanner/physicalGraphValidation.ts`
  - confirmed-only graph를 deterministic topology-only V2000으로 변환
  - RDKit보다 먼저 `single-molecule` 연결성 차단
  - 실제 RDKit parse/sanitize, graph count, 분자식, 몰 질량, canonical 구조 검증
  - N3의 명시적 원자 조성과 RDKit 분자식 조성 대조로 implicit-H drift 차단
  - 현재 중성 MVP 범위의 과결합만 보수적으로 사전 경고하고 RDKit을 최종 검증 권위로 유지
  - H-normalized canonical exact key 기반 identity 판정과 revision provenance
  - 모든 임시 RDKit molecule 객체를 `finally`에서 `delete()`
- `apps/workbench/src/scanner/ChemistryValidationStage.tsx`
  - validating·valid·invalid·error 상태와 학생용 복구 문구
  - valid-only 계산값·identity UI와 provenance
  - revision 변경·unmount·retry 시 이전 비동기 결과 폐기
  - exact 단일 identity만 parent-owned N5-ready snapshot으로 전달
- `apps/workbench/src/scanner/PhysicalMoleculeScanner.tsx`
  - N3→N4 진입, 4단계 진행 표시, 무수정 왕복 보존
  - upstream 변경 시 N4 stage/result/downstream snapshot 동기 무효화
- `apps/workbench/src/scanner/BondConfirmationStage.tsx`
  - 학생이 확정한 graph에서만 N4 진입 허용

## Limited identity registry

정체 일치는 분자식만이 아니라 RDKit이 정규화한 연결·결합차수 canonical key의 정확한 일치로 판정한다.

- H2 수소 분자
- O2 산소 분자
- N2 질소 분자
- H2O 물
- NH3 암모니아(RDKit Hill formula 표시는 H3N)
- CH4 메테인
- CO2 이산화 탄소
- C2H6 에테인
- C2H4 에텐
- CH3OH 메탄올(RDKit Hill formula 표시는 CH4O)

## Verification evidence

- N4 domain 테스트: 17/17 PASS
  - CH4, 10종 registry real-RDKit exact match, disconnected-before-RDKit, 과결합, lone C implicit-H 차단, ClF unknown, multiple, revision, lifecycle
- N3/N4 집중 테스트: 32/32 PASS
- 기존 RDKit service 회귀 포함: 66/66 PASS
- 전체 Vitest 회귀: 61 files, 472 tests PASS
- Playwright Chromium scanner 전체: 11/11 PASS
  - N2 2개, N3 3개, N4 6개
  - CH4 valid/single, invalid bond order, ClF valid/unknown, lone C fail-closed, N3 mutation invalidation, 390×844
- `npm run typecheck`: PASS (`npm run build`의 `tsc -b` 포함)
- `npm run build`: PASS, 2,144 modules transformed
- 독립 chemistry domain·교육 UX·E2E 리뷰: P0 0, 최종 ACCEPT/GO/PASS

## Scientific boundary and remaining risks

- MolBlock 좌표는 topology 전달을 위한 합성 2D 배치이며 Physical 사진 좌표, 실제 3D 좌표, Å 거리 또는 결합각이 아니다.
- 현재 과결합 사전 점검은 H/F/Cl 1, O 2, N 3, C 4를 넘는 경우만 잡는 중성 MVP용 보수적 진단이다. 보편적인 원자가 법칙이나 모든 전하·공명 구조의 판정기가 아니다.
- RDKit 유효성은 학생이 의도한 물질, 실험적 안정성, 정확한 3D 또는 사진 속 모형의 정답을 뜻하지 않는다.
- 같은 분자식이나 몰 질량만으로 identity를 정하지 않는다. 목록 밖·복수 후보는 이름을 확정하지 않는다.
- N4는 PubChem/network, VSEPR, 3D viewer, 거리·각도 측정을 호출하거나 표시하지 않는다.
- 새 production dependency는 추가하지 않았으며 설치된 `@rdkit/rdkit` 2025.3.4-1.0.0을 재사용했다.
- 비차단 테스트 공백은 실제 touch event, 강제 RDKit load error→retry, 지연된 in-flight stale race, multiple identity UI 통합 시나리오다. 핵심 상태는 domain 테스트와 cleanup/revision 코드로 방어한다.
- 빌드에는 기존 3Dmol `eval` 및 큰 chunk 경고가 남는다.

## Next best action

N4 노드를 PASS로 유지한다. 사용자가 명시적으로 요청할 때만 N5 Scientific Reference 3D + Measurement를 시작하며, N5는 current revision과 일치하고 `n5Ready=true`인 parent-owned validation snapshot만 입력으로 사용해야 한다.
