# N0 Repository Map

조사 기준: `C:\all\molecule-modeling-skill-package`의 현재 작업 트리, 브랜치 `agent/fix-structure-analysis`, HEAD `d2d7b5d`. 실제 앱 루트는 `apps/workbench`이다. 이번 노드에서는 부모 앱 코드를 수정하거나 기능을 실행하지 않았다.

## Confirmed

### 기술 스택과 진입점

- `../apps/workbench/package.json`은 React 19 + TypeScript 5.8 + Vite 6을 사용하며 Ketcher 3.15, RDKit.js 2025.3.4-1.0.0, 3Dmol.js 2.5.5를 직접 의존한다.
- `../apps/workbench/src/main.tsx:8-31`은 기존 전체 워크벤치를 lazy load한다. 현재 미커밋 작업 트리에서는 기본 경로가 추적되지 않은 `SimpleMoleculeModeler`이고 `?entry=legacy`가 기존 앱 경로다.
- 전역 상태 라이브러리는 없다. 주요 화면 상태는 React state로, 사용자 세션은 `src/contexts/UserSessionContext.tsx`로 관리한다. 결과·제출 일부는 별도 storage/service 모듈을 거친다.

### 2D 입력과 구조 추출

- `src/components/editor/KetcherEditor.tsx:428-476`은 앱 소유 handle 뒤에서 Ketcher의 SMILES, V2000 Molfile, 구조 설정과 초기화를 제공한다.
- `src/editor/chemical-editor-handle.ts:3-16`과 `src/editor/ketcher-structure-extraction.ts:65-81`이 UI와 Ketcher API의 경계다. 추출값은 검증 전 데이터로 명시되고 SMILES와 V2000 Molfile을 함께 전달한다.
- InChI 처리 구현은 `src`, `e2e`, `api` 검색에서 확인되지 않았다.

### 연결성 및 화학 검증

- `src/chemistry/molecularGraphConnectivity.ts:30-201`은 RDKit JSON의 원자·결합을 검사하고 atom/bond/component 수를 계산하며 single molecule, ionic compound, mixture 정책을 분리한다.
- `src/services/rdkitService.ts:403-627`은 RDKit 파싱, 연결성, Ketcher MOL/SMILES 교차검증을 통과한 뒤에만 canonical SMILES, 분자식, 평균 분자량을 반환한다. 실패 타입에는 이 계산값이 없다(`src/types/molecule.ts:139-173`).
- 평균 분자량은 RDKit descriptor `amw`, 분자식은 RDKit JSON 기반이다. 공식 지원 원소 테이블은 제한적이지만 Scanner MVP의 H/C/N/O/F/Cl은 포함한다(`src/services/molecularFormula.ts:20-85`).
- VSEPR은 `src/services/vseprEngine.ts`의 제한된 V2000 분석으로 중심 원자별 AXE/이상각을 예측한다. 이것은 Scientific Reference 좌표 생성기가 아니다.

### 3D viewer, 원자 선택, 거리·각도

- `src/components/Molecule3DViewer.tsx`는 3Dmol.js로 MOL/SDF/XYZ/PDB 입력을 표시하고 원자 클릭 선택, 회전·확대·축소, 측정 UI를 제공한다.
- `src/services/geometryMeasurement.ts:27-129`은 `coordinateDimension === '3d'`인 좌표만 파싱해 두 점의 유클리드 거리와 세 점의 각도(두 번째 원자가 중심)를 계산한다.
- `src/types/molecule.ts:48-97`은 좌표 형식, source type, coordinate dimension, structure match status, coordinate source/note/URL을 구조화한다.
- 현재 측정은 선택된 원자 사이의 좌표 계산이며 두 원자가 실제로 결합했는지, 각도의 두 변이 graph bond인지 확인하지 않는다. UI도 임의 두 원자의 거리는 실제 결합 여부를 단정하지 않는다고 알린다.

### PubChem 및 구조 출처

- `src/services/pubchemSearch.ts:433-565`은 검증된 canonical SMILES로 PubChem 후보를 검색하며 timeout을 둔다. 후보는 formula/canonical/stereochemistry 검사와 필요 시 RDKit 정규화를 거쳐 fail-closed 처리된다.
- `src/services/pubchem3d.ts:199-349`은 선택 CID의 3D SDF를 받고 RDKit으로 현재 canonical structure와 다시 대조한 뒤 provenance가 포함된 `Molecule3DInput`을 만든다.
- 이 서비스의 source note는 PubChem 좌표를 교육용 시각화 자료로 제한하고, 분자식·질량·결합길이·결합각의 기준값으로 사용하지 않는다고 명시한다(`src/services/pubchem3d.ts:41-42`).

### 테스트, 빌드, 배포

- `../apps/workbench/package.json`에 `dev`, `typecheck`, `test`, `test:e2e`, `build`, `build:single-html` 명령이 있다. Node engine은 24.x다.
- Vitest 단위 테스트가 editor extraction, graph connectivity, RDKit, PubChem, 3D viewer, 측정, VSEPR와 UI 모듈 옆에 존재한다.
- Playwright는 desktop Chromium과 390×844 Pixel 5 프로젝트를 분리한다(`playwright.config.ts:22-42`). 직접 그리기, disconnected atoms, 모바일 3D, 오류 복구 및 전체 학생 흐름 시나리오가 있다.
- CI는 `apps/workbench`에서 Node 24와 Java 21을 사용해 install, typecheck, unit, Firestore rules, build를 수행하고 Playwright를 반복 실행한다(`../.github/workflows/ci.yml:15-67`). 현재 파일 기준 unit test 파일 59개, E2E spec 10개가 있으며 이는 실행 결과가 아닌 파일 집계다.
- Vite에는 Ketcher용 `require` shim과 Ketcher/3Dmol 최적화 설정이 있다(`vite.config.ts:4-29`). Vercel은 정적 asset 장기 캐시와 `/api`를 제외한 SPA rewrite를 사용한다(`vercel.json:2-18`).
- 이번 N0에서는 명령 정의와 테스트 코드를 확인했으며 현재 미커밋 트리에서 test/build를 실행하지 않았다.

## Reusable

- Ketcher adapter: `src/editor/chemical-editor-handle.ts`, `src/editor/ketcher-structure-extraction.ts`, `src/components/editor/KetcherEditor.tsx`
- 구조/검증: `src/chemistry/v2000MolBlock.ts`, `src/chemistry/molecularGraphConnectivity.ts`, `src/services/rdkitService.ts`, `src/services/molecularFormula.ts`
- Reference 후보/좌표: `src/services/pubchemSearch.ts`, `src/services/pubchem3d.ts`, `src/simple/simpleExternal3DFlow.ts`
- 3D/측정: `src/components/Molecule3DViewer.tsx`, `src/services/geometryMeasurement.ts`, `src/types/molecule.ts`
- 국소 구조 학습: `src/services/vseprEngine.ts`, `src/components/Vsepr3DModelViewer.tsx`, `src/components/vsepr/VseprPanel.tsx`
- 검증 후 결과를 지우는 stale-request/invalidation 패턴과 `SimpleMoleculeModeler`의 단순 2D→검증→VSEPR→3D 연결 방식
- 검증, viewer, 후보 검색, 좌표 계산을 위해 새 production chemistry dependency를 추가할 필요는 없다.

## New Build

- 사진 촬영/업로드, 이미지 전처리, 색상·구형 원자 후보 및 막대형 결합 후보 탐지. 현재 앱 소스에는 해당 입력·분석 흐름이 없다.
- 신뢰도와 근거를 가진 detection DTO, 원본 이미지 좌표, 학생 수정 상태를 보존하는 Physical Model 데이터 모델.
- 안정된 atom/bond ID와 bond order 수정이 가능한 editable molecular graph 및 V2000/SMILES 변환 경계. 현재 공개 graph 모델은 요약 통계 중심이다.
- 모바일에서 원자·결합 후보를 추가/삭제/수정하고 최종 확정하는 단계형 UI.
- Physical Model 사진/추정값과 Scientific Reference를 병렬 비교하고 학생 설명 수정으로 이어지는 흐름.
- 현재 `src/services/structureComparison.ts`는 Reference 좌표와 VSEPR 이상 모형의 비교이며, Physical Model과 Scientific Reference 비교 상태는 아니다.
- 결합 graph의 인접성을 확인한 뒤에만 “결합길이/결합각”을 제공하는 선택 정책.
- 검증 가능한 Reference 결합길이·결합각이 제품 요구라면 좌표 출처/계산 방법 정책과 데이터가 추가로 필요하다. 현재 PubChem 3D 좌표는 코드 정책상 그 기준값이 아니다.

## Unknown

- 사용할 실제 분자모형 키트의 색상 규칙, 구 크기, 결합 막대 형태, 촬영 배경·조명·카메라 조건.
- 사진 한 장에서 가림, 원근, 교차 결합을 어느 수준까지 지원할지와 후보 신뢰도 임계값.
- Scientific Reference 측정값을 어떤 권위 데이터나 명시된 계산 방법에서 제공할지.
- 실물 사진과 확정 graph 사이의 atom ID를 비교 화면에서 어떻게 지속적으로 매핑할지.
- 학교망/실기기에서 카메라 권한, PubChem CORS·timeout, RDKit WASM, Ketcher/3Dmol 로딩이 실제로 통과하는지. 현재 확인은 코드와 mock 기반 테스트 범위다.
- 3D 원자 클릭부터 실제 측정 결과 생성까지의 캔버스 E2E와 모바일 회전·핀치 제스처는 이번 N0에서 실행 확인하지 않았다. 기존 E2E는 주로 viewer 렌더와 측정 제어 활성화를 확인한다.
- InChI가 MVP에 정말 필요한지. 현재 요구 흐름은 canonical SMILES와 V2000 Molfile로 충족 가능하다.

## Parent Risk

- 부모 작업 트리는 이미 수정 상태다. `main.tsx`, RDKit/PubChem 서비스와 테스트, 관련 정책 문서가 modified이고 `src/simple/` 및 simple E2E가 untracked다. 이를 이번 기능의 baseline으로 오인하거나 덮어쓰면 안 된다.
- 현재 쓰기 허용 범위는 `restart`뿐이다. N1 이후 실제 앱 구현 전에는 `apps/workbench`를 포함하는 작업 공간/권한이 필요하다.
- 기본 `SimpleMoleculeModeler`와 `?entry=legacy` 전체 워크벤치가 병존한다. N1에서 Scanner의 대상 shell/route를 먼저 결정하지 않으면 진입점 충돌과 기능 중복이 발생한다.
- `App.tsx`는 화면·검증·수업·제출 상태를 크게 보유한다. Scanner 상태를 직접 추가하면 결합도가 더 커질 수 있으므로 기존 chemistry/editor adapters만 재사용하고 feature state는 경계 안에 둔다.
- geometry measurement를 그대로 “실제 결합길이”라고 부르면 비결합 원자 거리까지 결합값으로 오인할 수 있다.
- Physical 사진 좌표를 기존 `Molecule3DInput`의 Å 단위 reference 좌표처럼 전달하면 P0 위반이다.
- PubChem 실패를 전체 분석 실패로 만들면 오프라인 수업 흐름이 깨진다. 현재 서비스처럼 2D/RDKit 결과는 유지해야 한다.
- Ketcher 전용 Vite shim, RDKit WASM 경로, 3Dmol canvas 크기/ResizeObserver는 민감한 통합 지점이므로 불필요하게 변경하지 않는다.
- 외부 검토 문서에는 현재 `OPEN` 항목은 없지만 접근성 탭 패턴, 학생 3D 고급 제어 노출 의도, 초기 번들 크기 증가가 참고 위험으로 남아 있다(`../REVIEWER_FEEDBACK.md:143-148`, `:208`).

## Constraints for N1

- 학습 흐름은 `촬영 → 원자 확인 → 결합 확인 → 분자 확인 → Reference 3D → Physical/Reference 비교·설명 수정`을 유지하되 한 화면 한 핵심 행동으로 단순화한다.
- Physical Model과 Scientific Reference는 상태 타입, 화면 라벨, 색상/테두리, 측정 문구에서 분리한다.
- 사진 분석 결과는 candidate와 confidence/evidence로 표시하고 학생 확정 전에는 RDKit/identity/3D 단계로 보내지 않는다.
- 확정 graph 변경 시 formula, mass, identity, 3D, measurement를 즉시 무효화하고 다시 검증한다.
- 순서는 `human-confirmed atoms/bonds → explicit graph → connectivity policy → RDKit validation → identity/reference lookup → 3D/measurement`이다.
- Reference 측정은 graph-bonded pair 또는 graph-bonded neighbor-center-neighbor 선택만 허용하고, 좌표 출처와 계산/예측/실험 여부를 표시한다.
- PubChem은 선택적이고 실패 가능해야 한다. 네트워크 실패 시 학생의 Physical 확인과 RDKit 기반 2D 검증은 유지한다.
- 초기 범위는 H/C/N/O/F/Cl 및 지정한 10개 대표 분자에 한정한다. 범용 vision, 계정, DB, AR/VR, 자체 모델 학습은 N1 범위가 아니다.
- 콘셉트 이미지의 모바일 단계 흐름, 큰 3D 캔버스, Physical/Reference 분리, 관찰 중심 Structure Coach를 설계 기준으로 사용한다.

## N0 Pass Check

- [x] 주요 기능을 실제 코드와 설정 근거로 분류했다.
- [x] 재사용 / 새 구현 / 미확인을 분리했다.
- [x] 부모 소스는 수정하지 않았다.
- [x] N1의 현실적 제약을 정리했다.
- [x] N1 이후 기능을 구현하지 않았다.

판정: **N0 PASS**
