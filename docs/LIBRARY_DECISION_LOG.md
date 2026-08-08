# Library Decision Log

Use this file to record why a chemistry or UI dependency was added.

## Decision Template

```md
## YYYY-MM-DD — Library name

- Purpose:
- Official documentation checked:
- License:
- Browser compatibility:
- Bundle size / performance risk:
- Security/privacy risk:
- Why not implement ourselves:
- Test added:
- Decision: adopt / spike only / reject
```

## Initial Candidate Libraries

## 2026-06-29 — React/Vite/TypeScript scaffold

- Purpose: Create the first browser-first workbench shell for the classroom MVP.
- Official documentation checked: React documentation, Vite guide, TypeScript configuration guidance through the Vite template pattern.
- License: React, Vite, and TypeScript are open-source dependencies; exact license review should be repeated when `package-lock.json` is generated.
- Browser compatibility: Static Vite app target; no backend required in this phase.
- Bundle size / performance risk: Low for scaffold. Chemistry libraries are intentionally excluded from this phase.
- Security/privacy risk: Low. No student data, network chemistry lookup, or file upload path exists yet.
- Why not implement ourselves: React/Vite/TypeScript provide the standard app/runtime/build toolchain; custom tooling would not improve chemistry safety.
- Test added: `apps/workbench/src/app/App.test.tsx` checks required placeholder regions render.
- Decision: adopt for app scaffold only.

### Ketcher

- Purpose: 2D chemical structure editor.
- Decision: candidate for MVP editor.
- Risk: package integration and licensing must be checked in the target project.

## 2026-06-29 — Ketcher editor integration

- Purpose: Add the 2D molecular structure input layer and allow extraction of SMILES/MOL data.
- Official documentation checked: EPAM Ketcher GitHub README, `ketcher-react` README, `ketcher-standalone` README, and npm package metadata.
- License: `ketcher-react@3.15.0`, `ketcher-core@3.15.0`, and `ketcher-standalone@3.15.0` report `Apache-2.0`.
- Browser compatibility: Implemented through React component `Editor` plus `StandaloneStructServiceProvider`; no Indigo service or backend is required in this spike.
- Bundle size / performance risk: High. `npm run build` emitted large chunk warnings, including a roughly 24 MB minified JS chunk before gzip. Ketcher also brings many transitive UI/editor dependencies.
- Security/privacy risk: No external chemistry lookup or student data path was added. The editor runs locally in the browser bundle.
- Why not implement ourselves: A reliable chemistry editor is outside MVP scope and would be less safe than using a specialized editor.
- Test added: `apps/workbench/src/app/App.test.tsx` checks that the Ketcher integration shell renders and does not present RDKit results.
- Install warnings: npm reported peer dependency override warnings and deprecated transitive packages `deep-diff@0.3.8` and `intersection-observer@0.12.2`.
- Runtime note: Ketcher transitive browser code references Node-style `process` and `global`; `apps/workbench/index.html` provides a minimal browser polyfill so the Vite dev page does not fail before React renders.
- Scope note: The active Ketcher-only phase stops after SMILES/MOL extraction. It does not install or call RDKit.js, 3Dmol.js, PubChem, or molecular weight calculation.
- Extraction note: The wrapper requests SMILES through `getSmiles()` and MOL block through `getMolfile('v2000')`, then stores both as unvalidated `MoleculeInput` data.
- Limitation: Extracted Ketcher data is displayed for inspection only. Long MOL blocks are scrollable in the right panel, and no chemical correctness or molecular weight is claimed before a later RDKit.js validation layer.
- Decision: adopt for Ketcher-only integration spike; revisit code splitting and bundle size before production deployment.

### RDKit.js

- Purpose: deterministic molecule parsing, rendering, formula/molecular descriptors where supported.
- Decision: candidate for MVP validation layer.
- Risk: WASM loading and maintenance state must be checked before locking version.

## 2026-06-29 — RDKit.js validation layer deferred

Superseded by the adoption decision below.

## 2026-06-29 — RDKit.js validation layer

- Purpose: Deterministically validate Ketcher-extracted SMILES/MOL block data before showing canonical SMILES, molecular formula, or molecular weight.
- Official documentation checked: Local `@rdkit/rdkit` package README, package metadata, and TypeScript declarations for `initRDKitModule`, `get_mol`, `is_valid`, `get_smiles`, `get_json`, `get_descriptors`, and `delete`.
- License: `@rdkit/rdkit@2025.3.4-1.0.0` reports `BSD-3-Clause`.
- Browser compatibility: Uses RDKit.js MinimalLib through `/rdkit/RDKit_minimal.js` and `/rdkit/RDKit_minimal.wasm` static assets. The loader passes `locateFile` so the browser can find the WASM file in Vite public assets.
- Bundle size / performance risk: Medium. The WASM asset is about 6.9 MB and is initialized lazily on first validation, then reused.
- Security/privacy risk: Low for this step. Validation runs locally in the browser; no PubChem, backend, or external network chemistry lookup was added.
- Why not implement ourselves: SMILES/MOL parsing, sanitization, canonical SMILES, and descriptor calculation must come from a chemistry toolkit, not custom or LLM-generated parsing.
- Test added: `apps/workbench/src/services/rdkitService.test.ts` covers empty input, invalid SMILES, existing classroom fixtures, MOL block validation, molecular formula, average molecular weight from `amw`, canonical SMILES, and single RDKit initialization reuse. `StructureInfoPanel` tests cover hiding chemistry output when validation fails.
- Limitation: Formula display is derived from RDKit molecule JSON after RDKit parsing; the helper currently supports common classroom elements needed by the MVP fixture set. Broader element support should be expanded with explicit tests before using uncommon elements in class.
- Limitation: This step does not implement valence warning UI, 3Dmol.js visualization, PubChem lookup, or example molecule expansion.
- Decision: adopt for the MVP validation layer.

### 3Dmol.js

- Purpose: browser-based 3D molecular visualization.
- Decision: Phase 2 viewer candidate.
- Risk: 3D coordinates and conformer generation should not be overstated.

## 2026-06-30 — 3Dmol.js Viewer Shell

- Purpose: Add a browser-based 3D molecular visualization shell that can later render coordinate-bearing molecule data after RDKit validation.
- Official documentation checked: 3Dmol.js documentation for npm usage, `createViewer`, model loading, `clear()`, `resize()`, and render flow; installed `3dmol@2.5.5` package metadata and TypeScript declarations.
- License: `3dmol@2.5.5` reports `BSD-3-Clause`.
- Browser compatibility: Runs as a client-side WebGL viewer inside React. The component initializes 3Dmol.js with a browser-only dynamic import so server-side/static render tests do not instantiate WebGL.
- Bundle size / performance risk: Medium. 3Dmol.js adds WebGL rendering code to the Vite bundle and should remain isolated from Ketcher/RDKit state. `npm run build` produced a separate `3Dmol` chunk of about 588 KB before gzip and retained the existing large Ketcher/RDKit-related chunk warning.
- Build warning: Vite warned that `node_modules/3dmol/build/3Dmol.js` uses `eval`; keep this dependency isolated and re-check before production deployment.
- Security/privacy risk: Low in this phase. No PubChem, backend conversion, Open Babel, or remote structure lookup is called.
- Why not implement ourselves: Molecular 3D rendering, camera control, model parsing, and WebGL management are specialized concerns and should not be hand-rolled for a classroom MVP.
- Test added: `apps/workbench/src/components/Molecule3DViewer.test.tsx` verifies the no-coordinate student message and coordinate source/format labels.
- Install note: `npm install 3dmol` added 6 packages, found 0 vulnerabilities, and repeated the existing Ketcher `miew-react` React 18 peer dependency warning under the React 19 app.
- Scope note: The viewer shell does not generate 3D conformers from SMILES, does not treat Ketcher 2D MOL blocks as 3D structures, and does not override RDKit validation.
- Decision: adopt for viewer shell only; coordinate generation/import remains a later, separately validated feature.

## 2026-06-30 — Static 3D example coordinate handoff

- Purpose: Connect a small number of local example molecules to 3Dmol.js with explicit coordinate-bearing data while preserving the Ketcher -> RDKit.js validation flow.
- Decision: Add static in-app SDF coordinate examples for water and methane only.
- PubChem: Not integrated in this phase.
- SMILES-to-3D conversion: Not implemented in this phase.
- Open Babel / backend conversion: Not implemented in this phase.
- RDKit 3D conformer generation: Not implemented in this phase.
- 3Dmol.js role: Coordinate data visualization only. It does not validate chemistry and does not provide formula, molecular weight, canonical SMILES, energy, bond angle, or optimized geometry.
- Source label: Static examples are labeled `예제 내장 3D 구조` and include a note that they are educational static coordinates, not experimental values, energy-minimized results, or bond-angle calculation data.
- Safety gate: The app sends static 3D data to the viewer only after the selected example passes RDKit.js validation; examples without static coordinates keep the student-facing no-coordinate message.
- Test added: `apps/workbench/src/data/exampleMolecules.test.ts` checks that only water and methane currently have static 3D data and that the records remain molecular-weight-free metadata.

### Open Babel

- Purpose: optional backend conversion for chemical file formats.
- Decision: not MVP unless import/export requirements demand it.
- Risk: server-side dependency complexity.

### PubChem PUG-REST

- Purpose: name/compound lookup.
- Decision: Phase 5 candidate.
- Risk: external API dependence and classroom network reliability.

## 2026-06-30 — PubChem PUG-REST 3D structure candidate deferred

- Purpose: Evaluate PubChem PUG-REST as a future source for external coordinate-bearing 3D records, such as SDF, for molecules that do not have embedded static 3D examples.
- Official documentation checked: PubChem PUG-REST documentation at https://pubchem.ncbi.nlm.nih.gov/docs/pug-rest.
- Decision: Defer API integration.
- Reason for deferral: The app should first stabilize the 3Dmol.js Viewer Shell, static 3D examples, source metadata, and the 3D data trust policy before adding classroom network dependency or candidate matching logic.
- Current boundary: No PubChem API calls, no external fetch service, no Open Babel conversion, no RDKit conformer generation, and no SMILES-to-3D conversion were added in this phase.
- Required future gate: PubChem 3D data may be shown only after the current Ketcher structure passes RDKit.js validation and the external result is labeled with source metadata.
- Known risk: PubChem may have no 3D coordinate record for a molecule, may return multiple candidates, or may return a structure that does not match the current RDKit-validated structure.
- Required UI/log behavior: Student-facing failures must remain short and non-technical; developer logs must include query key, source URL or endpoint, candidate identifier when available, and mismatch/failure reason.
- Test/verification: Documentation-only phase. Existing checks remain `npx tsc --noEmit`, `npm test`, and `npm run build`.

## 2026-06-30 — PubChem PUG-REST CID-based 3D SDF prototype

- Purpose: Load external coordinate-bearing 3D SDF data for curated example molecules through PubChem CID, then pass the SDF to 3Dmol.js for classroom visualization.
- Official documentation checked: PubChem PUG-REST documentation at https://pubchem.ncbi.nlm.nih.gov/docs/pug-rest and the CID SDF endpoint shape `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/{cid}/record/SDF?record_type=3d`.
- License: No new package dependency was added. PubChem is an external NCBI service; source attribution and classroom network reliability remain operational concerns.
- Browser compatibility: Uses browser `fetch` from the React app. No backend proxy, Open Babel service, RDKit conformer generation, or server-side chemistry conversion was introduced.
- Bundle size / performance risk: Low for bundle size because no dependency was added. Runtime risk shifts to classroom network availability and PubChem response latency.
- Security/privacy risk: Medium-low for this prototype. The app only requests curated numeric CIDs from local example metadata. It does not send user-drawn SMILES, MOL blocks, student names, or worksheet data to PubChem.
- Why not implement ourselves: External coordinate records should come from a chemistry data provider or curated source; frontend code must not invent 3D coordinates.
- Scope boundary: This is not a PubChem search system. User-input SMILES automatic matching, name search, candidate ranking, and mismatch reconciliation are still not implemented.
- Chemistry boundary: PubChem SDF is used only as coordinate-bearing visualization input. Formula, average molecular weight, canonical SMILES, and validation status remain RDKit.js outputs.
- Student-facing failure: If loading fails, the app says that PubChem 3D data could not be loaded and that the 2D structure plus RDKit verification results remain usable.
- Developer logging: Failure logs include `PubChem 3D SDF fetch failed`, CID, HTTP status where available, response text excerpt where available, and fetch error message where available.
- Test added: `apps/workbench/src/services/pubchem3d.test.ts` covers successful SDF mapping, no-data HTTP failure, network failure, and keeping the long API URL out of `Molecule3DInput.sourceUrl`.
- Decision: spike only for curated CID-based example molecules.

## 2026-07-02 — Curated example PubChem 3D auto-load

- Purpose: Reduce classroom confusion where examples with a curated PubChem CID but no static 3D payload appeared to have no 3D structure until the user found the manual load button.
- Decision: After RDKit.js validation succeeds for a selected example, the app automatically requests CID-based PubChem 3D SDF only when the example has `external3DSource: 'pubchem'`, has a numeric `pubchemCid`, and does not already have static `structure3D`.
- Boundary: This is not automatic PubChem matching for arbitrary user-drawn structures. Free-draw structures still require manual candidate search and manual candidate selection.
- Chemistry boundary: RDKit.js remains the source for formula, average molecular weight, canonical SMILES, and validation status. PubChem SDF remains coordinate visualization input only.
- Failure behavior: If PubChem has no 3D data or the network fails, the RDKit.js validation result remains visible and the viewer reports that external 3D data could not be loaded.
- Test added: `apps/workbench/src/app/App.test.tsx` covers that auto-load eligibility applies to PubChem-only curated examples such as ethanol, but not to static examples such as water or no-CID examples such as aspirin.

## 2026-06-30 — PubChem manual candidate matching policy

- Purpose: Define the safety boundary for later connecting user-drawn RDKit-validated structures to PubChem candidate search.
- Official documentation checked: PubChem PUG-REST documentation at https://pubchem.ncbi.nlm.nih.gov/docs/pug-rest.
- Decision: Defer automatic PubChem matching for user-drawn structures.
- Reason for deferral: RDKit.js canonical SMILES can be a useful query key, but it does not guarantee that PubChem has the same molecule or that returned candidates should be trusted without review.
- Matching boundary: A user-drawn structure must pass RDKit.js validation before PubChem candidate search can be requested. Validation alone must not trigger network lookup.
- Candidate policy: PubChem search may return zero, one, or multiple candidates. The app must not automatically select a candidate, including the single-candidate case, until the UI has a manual confirmation gate.
- UI language: Student-facing UI should call returned items `외부 데이터 후보`, not confirmed structures.
- Chemistry boundary: RDKit.js remains the source for formula, average molecular weight, canonical SMILES, and validation status. PubChem candidate metadata and 3D SDF data must not replace RDKit.js values.
- Risk: Automatic matching could show a plausible but wrong external 3D structure for a student-drawn molecule, especially when stereochemistry, salts, tautomers, charges, or ambiguous representations are involved.
- Implementation note: This phase adds only policy documentation and TypeScript draft types. It does not implement `searchPubChemCandidatesByCanonicalSmiles`, automatic search, candidate ranking, or automatic 3D loading from user input.
- Test/verification: `npx tsc --noEmit` and `npm run build`; existing CID-based 3D prototype tests remain unchanged.

## 2026-06-30 — PubChem manual candidate search UI prototype

- Purpose: Let the user explicitly request PubChem external data candidates for an RDKit.js-validated structure, then manually choose a candidate for existing CID-based 3D SDF loading.
- Official documentation checked: PubChem PUG-REST documentation at https://pubchem.ncbi.nlm.nih.gov/docs/pug-rest and the `compound/smiles/property/.../JSON` PUG-REST endpoint shape.
- License: No new dependency was added. PubChem remains an external NCBI service.
- Browser compatibility: Uses browser `fetch` through `src/services/pubchemSearch.ts`; no backend proxy or Open Babel conversion was introduced.
- Bundle size / performance risk: Low for bundle size because no package was added. Runtime risk remains classroom network availability and PubChem response latency.
- Security/privacy risk: Medium. The search sends only RDKit.js canonical SMILES after a user clicks `PubChem 후보 검색`; it does not run as a hidden automatic lookup.
- Why not automatic matching: PubChem search can return zero, one, or multiple candidates, and a plausible candidate can still be wrong for salts, charges, stereochemistry, or alternate representations.
- Auto-selection policy: The app does not auto-select a candidate, including the single-candidate case.
- Chemistry boundary: RDKit.js remains the source for formula, average molecular weight, canonical SMILES, and validation status. PubChem molecular formula and molecular weight are candidate metadata only.
- 3D loading boundary: Candidate selection reuses `fetchPubChem3DSdf(...)`; no second 3D SDF fetch path was added.
- Test added: `apps/workbench/src/services/pubchemSearch.test.ts` covers successful mapping, no-match responses, HTTP errors, and empty canonical SMILES. `apps/workbench/src/components/pubchem/PubChemCandidatePanel.test.tsx` covers disabled pre-validation UI and external candidate display.
- Decision: adopt as a manual candidate-search prototype only.

## 2026-07-01 — Firebase Web SDK Auth phase 1

- Purpose: Connect browser-side Firebase Auth for student anonymous sessions and teacher Google/email login before enabling Firestore persistence.
- Official documentation checked: Firebase Web Auth getting started, anonymous auth, Google sign-in, and password auth documentation.
- License: `firebase@12.15.0` reports `Apache-2.0`.
- Browser compatibility: Uses modular `firebase/app` and `firebase/auth` imports. Firebase App/Auth are initialized lazily only when required `VITE_FIREBASE_*` Web App config values exist.
- Bundle size / performance risk: Medium. Firebase is now a runtime dependency. Firestore client imports are intentionally not added to the app runtime in this phase.
- Security/privacy risk: Medium. Firebase Web App config is public client config, not a service account secret. API keys, service account JSON, AI API keys, and private tokens must remain outside the browser bundle and repository.
- Why not implement ourselves: Authentication provider flows, token issuance, anonymous auth identity, Google popup sign-in, and email/password sign-in should be delegated to a maintained identity provider rather than custom browser code.
- Scope boundary: Firestore writes remain disabled. `teacher` custom claims, classroom membership, trusted `joinClassroom`, and production submission persistence are not implemented in this phase.
- Failure policy: Missing config does not break the app; student flow can continue with browser-local temporary sessions. Configured-but-failing Auth returns student-facing messages and developer logs separately.
- Test added: `apps/workbench/src/services/firebase/firebaseAuthService.test.ts` covers missing config, anonymous sign-in success/failure, teacher Google sign-in, missing email/password input, and teacher email/password sign-in.
- Decision: adopt for Auth phase 1 only; persistence remains gated by rules tests and server-side authority design.

## 2026-07-02 — Firebase Admin SDK for trusted classroom join endpoint

- Decision: Add `firebase-admin` as a server-only dependency for the Vercel `/api/join-classroom` Function. Pin the dependency to `13.5.0` and deploy the workbench with Node `22.x`.
- Source checked: Firebase Admin SDK setup documentation, Firebase Admin ID token verification documentation, Cloud Firestore write documentation, and Vercel Node.js Functions documentation.
- Evidence: Firebase documents the Admin SDK as server libraries for privileged environments and documents `verifyIdToken()` for validating client ID tokens. Firestore documentation uses server-side `set()` for document writes. Vercel documents TypeScript files inside `/api` as Node.js Functions with full Node.js support.
- Scope boundary: The Admin SDK must only be imported by Vercel Function files under `apps/workbench/api`. It must not be imported into React components or browser services.
- Security/privacy risk: High if service account credentials are exposed. Required environment variables are server-only and must not use the `VITE_` prefix. Public repository commits must never contain service account JSON, private keys, AI keys, or student records.
- Runtime risk: Adds serverless cold-start and deployment dependency size. Client bundle should not grow because the dependency is not imported from `src`. Vercel production logs showed `firebase-admin@14.1.0 -> jwks-rsa@4.1.0 -> jose@6.2.3` could fail in the Node 24 serverless runtime with `ERR_REQUIRE_ESM`, so the server dependency is pinned to `firebase-admin@13.5.0` and `package.json` specifies `"node": "22.x"`.
- Test/verification: `apps/workbench/api/join-classroom.test.ts` covers request validation, credential parsing, membership document shape, successful membership creation through injected dependencies, and missing classroom rejection. `npm run typecheck`, `npm test`, and `npm run build` remain required before deployment.

## 2026-07-27 — Ketcher 간편/고급 편집 모드

- 목적: 학생 기본 화면에서는 원자·결합·선택·이동·삭제·실행 취소 중심의 간편 모드를 제공하고, 필요할 때 같은 편집기에서 고급 구조 및 반응식 도구를 다시 사용할 수 있게 한다.
- 확인한 근거: 설치된 `ketcher-react@3.15.0`의 패키지 메타데이터와 TypeScript 선언. `Editor`는 공식 `buttons?: ButtonsConfig` 입력을 제공하고 `ButtonsConfig`의 각 도구에 `hidden` 설정을 지원한다.
- 구현 결정: Ketcher 내부 DOM이나 툴바 CSS 선택자를 조작하지 않고 `Editor.buttons`만 사용한다. 간편/고급 설정을 확실히 반영하기 위해 `Editor`를 재마운트하되, 전환 전에 `getKet()`으로 현재 구조를 보존하고 새 인스턴스에 `setMolecule()`로 그대로 복원한다. 구조를 LLM으로 변환하거나 새로 추론하지 않는다.
- 변경 이벤트 결정: Ketcher v3.15.0 공식 소스(`https://github.com/epam/ketcher/blob/v3.15.0/packages/ketcher-core/src/application/ketcher.ts`)와 설치 타입 선언에서 `Ketcher.changeEvent: Subscription`, `add(handler)`/`remove(handler)` 계약을 확인했다. wrapper가 실제 사용자 편집 이벤트를 App에 알리면 기존 RDKit.js 검증, 참고 3D, VSEPR, 제출 완료 상태를 즉시 무효화한다. 예제 `setMolecule`, 앱의 `clear`, 편집 모드 재마운트 복원 중 발생하는 프로그램 변경 이벤트는 무시한다.
- 3D 경계: Ketcher 내부 Miew 버튼은 두 모드 모두 공식 버튼 설정으로 숨긴다. 앱의 참고 3D 구조는 검증 후 3Dmol.js 경로, VSEPR 모형은 별도 교육용 예측 경로를 계속 사용한다.
- 라이선스: `ketcher-react@3.15.0`은 `Apache-2.0`. 새 패키지를 추가하지 않았으므로 이번 변경으로 라이선스나 정적 배포 의존성은 늘지 않았다.
- 번들 영향: 새 의존성은 없지만 기존 Ketcher 지연 청크는 2026-07-27 빌드에서 약 23.9 MB(minified), 7.0 MB(gzip)로 여전히 크다. 최초 편집기 로딩 지연 안내와 lazy import를 유지한다.
- 런타임 결정: 설치된 Ketcher 3.15.0 메타데이터가 Node `>=24.14.1`을 요구하므로 앱의 `engines.node`를 `24.x`로 맞춘다. Vercel 공식 지원 버전 문서(`https://vercel.com/docs/functions/runtimes/node-js/node-js-versions`)도 빌드·함수용 Node 24.x를 지원한다. 기존 Node 24 ESM 장애를 일으켰던 `firebase-admin@14.1.0`은 도입하지 않고 검증된 `firebase-admin@13.5.0` 고정을 유지한다.
- 검증: `npm run typecheck`, 단위 테스트, `npm run build`, Playwright에서 실제 Ketcher canvas clear 직후 결과 차단, 예제 재로드 복구, 모드 전환 시 구조와 검증 결과 보존을 확인한다.

## 2026-07-27 — RDKit 그래프 연결성 및 Ketcher 직접 사슬 그리기 경계

- 목적: 화학 문자열이 파싱되는 것과 학생이 의도한 하나의 연결된 분자가 만들어진 것을 분리해 판정한다.
- 확인한 버전: 잠금 파일과 설치 패키지 기준 `@rdkit/rdkit@2025.3.4-1.0.0`, `ketcher-core/react/standalone@3.15.0`.
- 확인한 공개 API: RDKit `JSMol.get_json()`과 `get_smiles()`, Ketcher `getSmiles()`, `getMolfile('v2000')`, `getKet()`, `changeEvent`. 앱은 Ketcher 내부 `editor.struct()`에 의존하지 않는다.
- 런타임 근거: 설치된 RDKit 2025.03.4에서 `C.C.C.C`는 JSON 원자 4개·결합 0개, `CCCC`는 원자 4개·결합 3개, `[Na+].[Cl-]`는 원자 2개·결합 0개로 확인했다. RDKit JSON의 `molecules[0].bonds[].atoms` 0 기반 원자 인덱스를 앱 소유 adapter에서 엄격히 읽고 BFS로 연결 성분을 계산한다.
- 정책: `single-molecule`은 다중 연결 성분을 계산 전에 차단한다. `ionic-compound`와 `mixture`는 명시적 의도일 때 연결성 자체는 허용하지만, 현재 버전은 여러 성분을 하나의 분자식·분자량으로 합산하지 않고 별도 교육 범위 메시지로 차단한다.
- UI 결정: 분석 결과에 원자 수(A), 결합 수(B), 연결 성분 수(C)를 함께 표시한다. Ketcher의 공개 `chain` 도구를 학생용 간편 모드에 유지하고, 별도 원자 클릭이 분리 조각을 만든다는 안내와 직접 드래그 경로를 제공한다.
- 터치 호환 결정: Ketcher 3.15.0의 직접 그리기 도구가 `mousedown`/`mousemove`/`mouseup` 경로를 사용하고 SVG 캔버스의 터치 드래그를 자체 변환하지 않는 것을 설치 소스와 실제 브라우저에서 확인했다. 앱 소유 adapter는 `ketcher-host`의 capture 단계에서 단일 터치가 버전 고정 selector `[data-testid="canvas"]` 내부에서 시작한 경우에만 같은 target으로 mouse 이벤트를 전달한다. 툴바와 멀티터치는 가로채지 않으며 Ketcher 인스턴스나 비공개 editor API에는 접근하지 않는다. Ketcher 업그레이드 시 이 selector와 직접 그리기 E2E를 함께 재검증한다.
- 라이선스/배포 영향: 새 의존성은 없다. RDKit BSD-3-Clause와 Ketcher Apache-2.0의 기존 라이선스 및 브라우저 정적 배포 경계가 유지된다.
- 위험과 방어: RDKit JSON의 atom/bond 배열이 없거나 결합 인덱스가 범위를 벗어나면 fail-closed한다. canonical SMILES의 `.` 문자 검색은 연결성 판정 근거로 사용하지 않는다.
- 검증: 빈 구조, 고립 원자, 분리 C4, 선형/분지/고리 C4, 이온성/혼합물 의도 단위 테스트와 실제 Ketcher canvas 마우스/터치 회귀를 유지한다.

## 2026-07-29 — Ketcher 명시적 수소 구조의 RDKit 동등성 비교

- 목적: Ketcher가 같은 메테인을 SMILES `C([H])([H])([H])[H]`와 명시적 수소 V2000(원자 5개·결합 4개)으로 내보낼 때, RDKit 파서의 수소 처리 차이 때문에 서로 다른 구조로 오판하지 않도록 한다.
- 확인한 버전과 공개 API: `ketcher-core/react/standalone@3.15.0`의 `getSmiles()`·`getMolfile('v2000')`, `@rdkit/rdkit@2025.3.4-1.0.0`의 `get_mol(input, details_json?)`·`get_smiles()`·`remove_hs(details_json)`·`delete()`를 확인했다. 설치 타입 선언은 `remove_hs()` 무인자 형식만 제공하지만, 고정된 RDKit Release_2025_03_4의 `Code/MinimalLib/minilib.cpp`, `JSONParsers.cpp`, `Code/GraphMol/MolOps.h`에서 옵션 JSON 바인딩과 `RemoveHsParameters` 필드를 확인했다.
- 원인: 동일 구조가 Molfile 기본 파싱에서는 `[H]C([H])([H])[H]`, SMILES 기본 파싱에서는 `C`가 되어 기존 canonical 문자열 완전일치 검사가 오탐했다. 원본 그래프 연결성은 5원자·4결합·1성분으로 이미 정상이다.
- 구현 결정: 원본 Molfile RDKit 객체는 원자·결합·연결 성분·분자식·분자량·원자 주석의 근거로 그대로 유지한다. Ketcher가 MOL/SMILES 두 표현을 모두 제공한 경우에만 별도의 canonical 비교 키를 만든다.
- 수소 정규화 정책: 일반 중성·비매핑 명시적 수소만 접는다. 동위원소, 원자 매핑, 수소화물, 쐐기 결합/입체 정의, 질의, 더미 원자 이웃, SGroup 및 수소만으로 된 구조는 보존하도록 `RemoveHsParameters`를 명시한다. 정규화 Molfile 재파싱은 `removeHs:false`로 수행한다.
- 안전 게이트: 동위원소·라디칼·비영 전하의 기존 fail-closed 정책을 유지한다. 실제 에탄올/메테인 불일치와 반대 입체이성질체는 계속 차단한다. 모든 임시 `JSMol`은 `finally`에서 `delete()`한다.
- 최종 canonical 결정: Ketcher 교차검사를 통과한 결과만 수소 정규화 canonical을 반환한다. 따라서 명시적-H 메테인의 검증 키는 `C`가 되어 예제/참고 3D 매칭과 일치한다. Ketcher 외 example/import 입력의 기존 canonical 정책은 변경하지 않는다.
- 라이선스·배포 영향: 새 패키지를 추가하지 않았다. 기존 RDKit BSD-3-Clause와 Ketcher Apache-2.0 경계 및 브라우저 정적 배포 방식은 그대로다.
- 테스트: 실제 Ketcher 명시적-H 메테인, 진짜 MOL/SMILES 불일치, 동위원소 H, 매핑 H, 같은/반대 입체화학, H₂ 보존을 RDKit 단위 테스트로 고정하고, 포인터로 C와 H 네 개를 직접 배치·결합한 Playwright 회귀에서 `CH4`, 5/4/1 그래프와 VSEPR 결과를 확인한다.

## 2026-07-30 — 직접 그린 복잡한 분자의 수동 PubChem 3D 연결

- 목적: 기본 예제 목록에 없는, Ketcher 2D 보드에서 직접 그린 복잡한 분자도 검증된 외부 좌표를 선택해 3Dmol.js로 확인할 수 있게 한다.
- 공식 문서 확인: PubChem PUG-REST 문서(`https://pubchem.ncbi.nlm.nih.gov/docs/pug-rest`)와 공식 튜토리얼(`https://pubchem.ncbi.nlm.nih.gov/docs/pug-rest-tutorial`)에서 구조 검색, CID 기반 SDF 응답, `record_type=3d` 요청 경계를 확인했다.
- 사용자 동작 경계: RDKit.js 검증만으로 외부 요청을 시작하지 않는다. 사용자가 3D 출력 동작을 명시적으로 클릭한 뒤에만 RDKit canonical SMILES로 후보를 검색한다. 편집 이벤트나 백그라운드 상태 변경은 숨은 검색을 발생시키지 않는다.
- 후보 선택 결정: PubChem 후보가 한 개뿐이어도 자동 선택하지 않는다. 사용자가 후보를 직접 고른 뒤에만 선택 CID의 3D SDF를 요청한다.
- 화학 안전 게이트: 후보 메타데이터 비교는 예비 게이트일 뿐이다. 내려받은 SDF를 RDKit.js로 다시 파싱하고, 현재 2D 구조의 검증 결과와 동일한 수소 정규화 exact-match 키가 확인될 때만 3Dmol.js에 전달한다. 이 재검증을 우회하지 않는다.
- 실패 및 stale 정책: 네트워크 실패, 빈/비정상 응답, 3D 좌표 부재, 후보 또는 최종 SDF 불일치, 요청 중 구조 변경은 모두 fail-closed한다. 늦게 도착한 후보/SDF 응답은 현재 검증 키가 달라졌으면 폐기하며 기존 2D 구조는 보존한다.
- 개인정보 경계: 외부 요청에는 구조 검색에 필요한 canonical SMILES 또는 선택 CID만 사용한다. 학생 이름, 학급 식별자, 학습 기록, 인증 토큰은 PubChem으로 보내지 않는다.
- 라이선스·번들 영향: 새 패키지나 런타임 의존성을 추가하지 않았다. 기존 브라우저 `fetch`, RDKit.js, 3Dmol.js 경계를 재사용한다.
- 결정: 명시적 클릭 → 수동 후보 선택 → 선택 CID `record_type=3d` SDF → RDKit 재검증 → exact-match 성공 시 출력하는 경로만 채택한다.

## 2026-08-08 — Scanner N5 Scientific Reference 3D

- 목적: N4에서 정확히 검증되고 제한 목록의 분자 1개와 일치한 실물 모형 기록에만 출처 표시 Reference 3D를 연결한다.
- 확인한 공식 근거: PubChem PUG-REST의 CID full-record SDF와 `record_type=3d` 요청 계약(`https://pubchem.ncbi.nlm.nih.gov/docs/pug-rest`), PubChem3D가 이론적으로 생성된 conformer 모형임을 설명하는 PubChem3D 논문(`https://pubmed.ncbi.nlm.nih.gov/21272340/`), 3Dmol.js `GLViewer`의 `createViewer`·`rotate`·`zoom`·`setClickable` 공개 API(`https://3dmol.org/doc/GLViewer.html`).
- 설치·라이선스: 새 production dependency는 없다. 설치된 `3dmol@2.5.5`(BSD-3-Clause)와 `@rdkit/rdkit@2025.3.4-1.0.0`(BSD-3-Clause), 브라우저 `fetch` 경로를 재사용한다.
- 입력 게이트: current revision의 N4 결과가 `ok=true`, `n5Ready=true`, exact identity 1개일 때만 준비한다. revision, source atom revision, identity ID, hydrogen-normalized canonical key를 요청 전후에 모두 재대조한다.
- 조회 결정: 학생이 `5단계 Scientific Reference 3D 시작`을 명시적으로 누른 뒤에만 로컬 고정 identity→CID registry로 SDF를 요청한다. 이것은 이름 검색이나 후보 자동 순위화가 아니며, 내려받은 SDF도 RDKit exact structure match를 다시 통과해야 한다.
- 고정 범위: 현재 registry는 N4의 10개 identity에 CID provenance를 기록한다. 기존 H2 SDF 수소 정규화 경계가 안전하게 일치하지 않아 H2는 요청 전에 fail-closed하고, 나머지 9개만 지원한다.
- 좌표 의미: PubChem SDF는 `external-database`의 계산 3D conformer Reference 좌표다. 실험 구조, 문헌 기준값, 이 앱이 생성·최적화한 좌표라고 부르지 않으며 N4 분자식·몰 질량을 대체하지 않는다.
- 측정 결정: current Reference 좌표에서만 Å 거리와 각도를 계산한다. 거리 선택은 SDF 결합표의 bonded pair, 각도 선택은 두 이웃이 같은 중심과 결합한 경우만 허용한다. 결과에는 `reference-coordinate` evidence를 붙이고 사진 픽셀·실물 막대 길이를 Å로 바꾸지 않는다.
- 접근성: WebGL 클릭 외에 같은 원자를 고르는 44px 이상 DOM 버튼과 `aria-pressed` 상태를 제공하고, 앱 소유 회전·확대·축소·초기 보기 버튼을 유지한다.
- 네트워크·개인정보: PubChem 요청에는 고정 CID만 포함하며 학생 이름, 학급, 학습 기록, 인증 토큰은 보내지 않는다. 15초 timeout, HTTP/빈 응답/불일치/late response는 viewer를 표시하지 않고 N4 결과를 보존한 채 재시도를 제공한다.
- 범위 경계: N5는 Physical/Reference 비교, VSEPR, 맞음·틀림 판정, Structure Coach 또는 N6 시작 동작을 구현하지 않는다.

## 2026-08-08 — Scanner N6 Physical Model ↔ Scientific Reference 비교

- 목적: 학생이 확인한 Physical 사진·연결 graph와 N5 exact-matched Scientific Reference 3D를 출처가 분명한 별도 자료로 비교하고, 자동 채점 없이 관찰과 설명 수정을 기록한다.
- 라이브러리 결정: 새 production dependency와 새 외부 API를 추가하지 않는다. 기존 React, 3Dmol.js viewer, RDKit.js로 검증된 N4/N5 snapshot을 재사용한다.
- 입력 권위: parent-owned current Physical revision과 source atom/image revision, N4 validation revision, N5 Reference revision, exact identity, hydrogen-normalized canonical key가 모두 일치해야 한다. Reference SDF 원자·결합·원소 구성과 측정 결합 인접성도 scanner-owned domain에서 다시 검사한다.
- 좌표 경계: Physical x/y/radius는 사진 overlay 용도뿐이며 비교 결과의 길이·각도·단위로 내보내지 않는다. Å/도 값은 approved Reference SDF 좌표에만 남고 Physical stable atom과 SDF atom의 1:1 map은 만들지 않는다.
- 교육 결정: deterministic Structure Coach는 회전·관찰·근거 기록을 유도하지만 사진 한 장에서 평면성·깊이·정답·형태 이름을 자동 판정하지 않는다. 완료 snapshot은 `student-observation-not-auto-graded`로 고정한다.
- 상태 결정: N6 draft/completion은 current source revisions에 묶고 무수정 뒤로가기는 hidden mount로 보존한다. 사진·원자·결합·validation·Reference 변경은 N6와 모든 downstream snapshot을 즉시 폐기한다.
- 접근성·모바일: 데스크톱 2열, 390px에서는 source-labelled 단일 패널 전환을 제공하고 주요 버튼·textarea는 44px 이상을 유지한다.
- 테스트: strict domain 15 tests, 전체 Vitest, scanner Chromium 18개 흐름, typecheck와 production build를 release gate로 유지한다.
- 범위 경계: N6는 교실 QA, teacher scoring/dashboard, 제출·분석, 전체 분자 일반화 또는 MVP 완료 선언을 구현하지 않는다. 이는 명시적 N7 범위다.
