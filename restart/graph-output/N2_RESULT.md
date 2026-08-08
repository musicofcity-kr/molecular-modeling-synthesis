# N2 RESULT — Image → Atom Candidates

## Status

**N2 PASS**

N2 범위인 이미지 입력, 원자 후보 표시, 사람 검토·수정, 불확실성 표시, 수동 복구, DEMO fixture와 검증을 구현했다. N3 결합 graph는 시작하지 않았다.

## User-facing behavior

- `?entry=scanner`에서 실물 분자 모형 사진을 촬영하거나 파일로 선택할 수 있다.
- 사진은 서버 전송 없이 브라우저 Canvas에서 축소 분석된다.
- H/C/N/O/F/Cl 색상 후보를 사진 위에 오버레이한다.
- 후보는 자동 확정되지 않으며 원소 수정, 빠진 원자 추가, 잘못된 후보 삭제, 후보별 확인이 가능하다.
- 낮은 색상 일치도 후보는 불확실 후보로 표시된다.
- 모든 후보 확인 뒤에도 실제 모형과 사진을 대조해 빠진 원자·가려진 원자가 없음을 별도로 확인해야 완료된다.
- 새 사진, 후보 수정·추가·삭제는 기존 완료 상태를 무효화한다.
- 완료 결과는 원자 후보 확인 기록일 뿐이며 결합, 분자식, 분자 정체 또는 3D 구조가 아님을 명시한다.

## Implementation

- `apps/workbench/src/scanner/atomDetection.ts`
  - 결정적 팔레트 분류와 8방향 connected-component 분석
  - 배경·점 노이즈·선형 영역 필터
  - 원본 이미지 기준 정규화 좌표와 안정적 검출 ID
  - 색상 일치도·원형성·종횡비 기반 후보 신뢰도
- `apps/workbench/src/scanner/PhysicalMoleculeScanner.tsx`
  - 이미지 입력, 오버레이, 수정·추가·삭제, 개별 확인, 실제 모형 대조 게이트
  - 고유 수동 ID와 최신 이미지 요청만 반영하는 경쟁 상태 방지
  - 20MB/4천만 픽셀 입력 제한과 재촬영 복구 안내
- `apps/workbench/src/scanner/PhysicalMoleculeScanner.css`
  - 데스크톱/390px 반응형 UI와 44px 조작 대상
- `apps/workbench/public/scanner-fixtures/demo-methane.svg`
  - 명시적으로 DEMO라고 표시되는 대표 fixture
- `apps/workbench/src/simple/entryMode.ts`, `apps/workbench/src/main.tsx`
  - 기존 simple/legacy 진입을 보존한 opt-in scanner lazy entry

## Verification evidence

- 전체 Vitest 회귀: 59 files, 440 tests PASS (최종 상태)
- N2 집중 Vitest: 2 files, 7 tests PASS (최종 detector/entry 계약)
- Playwright Chromium: 2 tests PASS
  - DEMO 파일 입력 → 5개 후보 → 원소 수정 → 후보 추가·삭제 → 개별 확인 → 실제 모형 대조 → 완료
  - 수정/새 이미지 입력 시 완료 무효화
  - 390×844 가로 넘침 없음과 주요 44px 조작 대상
- `npm run typecheck`: PASS
- `npm run build`: PASS
- 독립 코드 리뷰 재검사: 잔여 P0 없음

## Boundaries and remaining risks

- 현재 검출은 DEMO 색상표 기반의 결정적 후보 생성기다. 키트 색상, 조명, 그림자, 반사, 흰 배경의 흰 수소, 겹침에 따라 후보가 빠지거나 잘못 잡힐 수 있다.
- 따라서 결과는 항상 미확정 후보로 시작하고 수동 수정·추가·삭제 및 실제 모형 대조가 필수다.
- 픽셀 좌표를 실제 Å 단위 결합 길이로 변환하지 않는다.
- 결합, molecular graph, 화학 검증, 분자식, 분자 정체, 3D는 N2 범위 밖이다.
- 새 production dependency는 추가하지 않았다.
- 빌드에는 기존 3Dmol `eval` 및 큰 chunk 경고가 남지만 N2의 lazy scanner chunk는 별도로 생성된다.

## Next best action

사용자가 요청하면 N3 — Bond Confirmation → Molecular Graph를 시작한다. N2 후보 상태는 자동으로 결합 확정에 사용하지 않고, N3에서도 사람 확인 게이트를 유지해야 한다.
