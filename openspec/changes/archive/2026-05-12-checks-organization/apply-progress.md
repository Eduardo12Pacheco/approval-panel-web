# Apply Progress: Checks Organization

**Change**: checks-organization  
**Mode**: Strict TDD  
**Workload / PR boundary**: auto-chain, stacked-to-main, Work Unit 2 (`Phase 3` + `Phase 4` cleanup) continuing Work Unit 1 because the task forecast marks 400-line budget risk as High.

## Completed Tasks

- [x] 1.1 Inventory every current `js/modules/__checks__/*` command/import, assertion-bearing file, CLI ok message, and Python caller into `js/modules/__checks__/manifest.js` expectations.
- [x] 1.2 Add/adjust a failing parity check for manifest coverage: every facade path, implementation path, owner, command kind, and exported helper is present exactly once.
- [x] 1.3 Run the current focused check commands from the inventory and save the before/after assertion checklist; do not change assertions.
- [x] 2.1 Move cross-feature checks to `js/modules/__checks__/global/`: parity checklist, dependency boundary, CSS parity, rollback scope, and runtime UI replay helpers.
- [x] 2.2 Replace old global check files in `js/modules/__checks__/` with thin facades preserving exports, side effects, CLI behavior, and ok text.
- [x] 2.3 Keep `js/modules/__checks__/approval-editor-service-timings.check.cjs` unchanged unless parity proves a wrapper is safe.
- [x] 2.4 Make the manifest parity check pass for global checks and verify old public paths still run.
- [x] 3.1 Move Audio checks to `js/modules/features/audio/__checks__/audio-seams.check.mjs`; update only relative imports.
- [x] 3.2 Move Subtitles checks to `js/modules/features/subtitles/__checks__/subtitles-controller-seams.check.mjs`; preserve all facade/session/table/preview assertions.
- [x] 3.3 Move app-shell checks to `js/modules/app-shell/__checks__/app-shell-seams.check.mjs`; preserve boot/view lifecycle assertions.
- [x] 3.4 Move Radar check to `js/modules/features/radar/__checks__/radar-panel-check.js`; preserve API/state/render/controller assertions.
- [x] 3.5 Move Video Projects checks to `js/modules/features/video-projects/__checks__/`; preserve editor, assets, motion, composition, payload, manifest, preload, contract, and segment assertions.
- [x] 3.6 Replace every moved root file with a facade that delegates to the owner file and keeps the same public command/import path.
- [x] 4.1 Run old facade commands and direct moved implementation commands; failures must be assertion failures, not missing imports.
- [x] 4.2 Run focused `tests/*.py` import callers and any source aggregation checks; update only stale path expectations to use the manifest.
- [x] 4.3 Compare before/after assertion inventory and confirm no selector, endpoint, payload, copy, timer, rollback, or CSS parity guardrail changed.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1 | `js/modules/__checks__/manifest.check.mjs` | Unit/static contract | ✅ Global entrypoints imported before edits | ✅ Failed on missing `manifest.js` | ✅ Manifest accounts for 22 legacy check entries | ✅ Path/owner/export metadata test covers different manifest behavior | ✅ Manifest validation extracted to pure `validateCheckManifestCoverage()` |
| 1.2 | `js/modules/__checks__/manifest.check.mjs` | Unit/static contract | ✅ Same global entrypoint baseline | ✅ Failed before manifest implementation existed | ✅ `node --test js/modules/__checks__/manifest.check.mjs` passed 2/2 | ✅ Duplicate/path summary plus filesystem existence checks | ✅ Pure duplicate detection kept side-effect-free |
| 1.3 | `js/modules/__checks__/manifest.check.mjs` + focused commands | Compatibility | ✅ `node js/modules/__checks__/{parity,dependency,css,rollback}...` and runtime import baseline succeeded | ✅ Inventory test failed before coverage existed | ✅ Old and direct global paths import/run after move | ✅ Python source-token compatibility tests pass for old facades | ✅ Assertion-bearing code remains in moved implementations, wrappers contain no assertions |
| 2.1 | `js/modules/__checks__/manifest.check.mjs` | Structural + import contract | ✅ Baseline global imports passed | ✅ Manifest expected global implementations under `/global/` before move | ✅ Manifest and old/direct global imports pass | ✅ Runtime Audio replay exercises moved `runtime-ui-parity-replay.js` relative imports | ✅ Fixed moved relative imports only |
| 2.2 | `js/modules/__checks__/manifest.check.mjs` | Compatibility | ✅ Old global public paths existed before edit | ✅ Tests required legacy facades and implementation paths both resolve | ✅ Old public global paths still import/run | ✅ Python callers that source-read `parity-checklist.js` pass with compatibility source tokens | ✅ Facades are thin re-export surfaces |
| 2.3 | `js/modules/__checks__/manifest.check.mjs` | Structural | ✅ CJS check left untouched | ✅ Manifest asserts CJS kept as same facade/implementation path | ✅ CJS entry remains mapped once | ➖ Single structural invariant | ✅ No wrapper introduced for CJS |
| 2.4 | `js/modules/__checks__/manifest.check.mjs` | Compatibility | ✅ Same focused baseline | ✅ Manifest test failed before mappings existed | ✅ Manifest check 2/2, old/direct global paths pass | ✅ Broad Python caller run improved to only unrelated existing drifts | ✅ Compatibility comments keep stale source aggregators working until Phase 4 updates them |
| 3.1 | `js/modules/__checks__/manifest.check.mjs` + audio checks | Unit/static + node-test compatibility | ✅ Existing audio checks passed from old path after RED test was added | ✅ Manifest test failed while Audio implementation still pointed at root `__checks__` | ✅ Old and direct Audio paths pass 4/4 each | ✅ Manifest checks moved implementation path and implementation source token | ✅ Audio check imports rebased to owner path; root file is a facade |
| 3.2 | `js/modules/__checks__/manifest.check.mjs` + subtitles checks | Unit/static + node-test compatibility | ✅ Existing subtitles checks passed from old path after RED test was added | ✅ Manifest test failed while Subtitles implementation still pointed at root `__checks__` | ✅ Old and direct Subtitles paths pass 12/12 each | ✅ Manifest checks moved implementation path and implementation source token | ✅ Subtitles relative source reads now resolve from module root |
| 3.3 | `js/modules/__checks__/manifest.check.mjs` + app-shell checks | Unit/static + node-test compatibility | ✅ Existing app-shell checks passed from old path after RED test was added | ✅ Manifest test failed while app-shell implementation still pointed at root `__checks__` | ✅ Old and direct app-shell paths pass 9/9 each | ✅ Manifest checks moved implementation path and implementation source token | ✅ Runtime replay import uses root global facade from owner location |
| 3.4 | `js/modules/__checks__/manifest.check.mjs` + radar checks | Unit/static + CLI compatibility | ✅ Existing Radar check passed from old path after RED test was added | ✅ Manifest test failed while Radar implementation still pointed at root `__checks__` | ✅ Old and direct Radar CLI paths pass | ✅ Python radar contract caller passes 2/2 | ✅ Radar check imports rebased to owner path; root CLI facade preserves ok text |
| 3.5 | `js/modules/__checks__/manifest.check.mjs` + video-project checks | Unit/static + node-test/CLI compatibility | ✅ Representative old video checks ran before/after move | ✅ Manifest test failed while Video Projects implementations still pointed at root `__checks__` | ✅ Old/direct controller, render, composition helper, segment picker, assets, cover-pan, motion, payload, preload, manifest, and approval-motion paths pass | ✅ Assertion inventory reads moved implementation source instead of old facade source | ✅ Approval motion source aggregation follows split render files; async CLI helpers export callable runners |
| 3.6 | `js/modules/__checks__/manifest.check.mjs` | Compatibility facade contract | ✅ Legacy root paths existed before replacement | ✅ Manifest expected feature-owned implementations while old root files still held implementations | ✅ Manifest check passes 4/4 and root facades resolve | ✅ Old and direct paths were exercised for each owner group | ✅ Root files reduced to thin re-export/CLI facades; no assertion-bearing code required in facades |
| 4.1 | Manifest facade/direct command matrix | Compatibility | ✅ Prior manifest and representative path checks were available from Work Unit 2 | ✅ Full manifest matrix exposed only the known contract-pipeline assertion failure, not missing imports | ✅ 42/44 facade/direct command executions passed; both failures were the same `Audio voice` service-error assertion | ✅ Matrix covered module-import, node-test, commonjs-test, and node-cli command kinds | ✅ No app behavior changed |
| 4.2 | `tests/test_phase1_slice0_bootstrap_parity.py`, `tests/test_phase6_runtime_parity_and_boundaries.py`, `tests/test_phase9_appshell_decomposition_archive_legacy.py` | Python source aggregation | ✅ Existing stale aggregation test failed while reading thin `parity-checklist.js` facade | ✅ Added manifest-backed source readers and doc guard before cleanup | ✅ Focused aggregation tests passed 3/3 and documentation guard passed | ✅ Focused Python check callers passed 62/65; remaining 3 are known unrelated failures | ✅ Source aggregation now reads manifest `implementationPath` instead of facade comments |
| 4.3 | `js/modules/__checks__/manifest.check.mjs` + command/Python inventories | Static inventory + compatibility | ✅ Previous assertion inventory checklist existed in apply-progress | ✅ Manifest check validates implementation-source assertion tokens after moves | ✅ Manifest check passed 4/4 and facade/direct matrix found no import/missing-file failures beyond known assertion drift | ✅ Python source aggregation, CLI/node-test, and docs manifest references cover selector/endpoint/payload/timer/rollback/CSS guardrails | ✅ Final cleanup limited to tests/docs/tasks/apply-progress |

## Assertion / Inventory Checklist

| Owner | Facade | Implementation | Command kind | Exported helpers / ok text |
|-------|--------|----------------|--------------|----------------------------|
| global | `js/modules/__checks__/parity-checklist.js` | `js/modules/__checks__/global/parity-checklist.js` | module-import | `REQUIRED_SELECTOR_IDS`, `SUBTITLE_REMOTE_CUTOVER_GATES`, `runParityChecklist` |
| global | `js/modules/__checks__/dependency-boundary-validator.js` | `js/modules/__checks__/global/dependency-boundary-validator.js` | module-import | dependency validators |
| global | `js/modules/__checks__/css-computed-style-parity.js` | `js/modules/__checks__/global/css-computed-style-parity.js` | module-import | `runComputedStyleParityCheck` |
| global | `js/modules/__checks__/rollback-scope-validator.js` | `js/modules/__checks__/global/rollback-scope-validator.js` | module-import | rollback helpers |
| global | `js/modules/__checks__/runtime-ui-parity-replay.js` | `js/modules/__checks__/global/runtime-ui-parity-replay.js` | module-import | protected replay helpers |
| global | `js/modules/__checks__/approval-editor-service-timings.check.cjs` | same path | commonjs-test | kept unchanged |
| audio | `js/modules/__checks__/audio-seams.check.mjs` | `js/modules/features/audio/__checks__/audio-seams.check.mjs` | node-test | root facade imports moved test for side effects |
| app-shell | `js/modules/__checks__/app-shell-seams.check.mjs` | `js/modules/app-shell/__checks__/app-shell-seams.check.mjs` | node-test | root facade imports moved test for side effects |
| subtitles | `js/modules/__checks__/subtitles-controller-seams.check.mjs` | `js/modules/features/subtitles/__checks__/subtitles-controller-seams.check.mjs` | node-test | root facade imports moved test for side effects |
| radar | `js/modules/__checks__/radar-panel-check.js` | `js/modules/features/radar/__checks__/radar-panel-check.js` | node-cli | `runRadarPanelCheck`, `radar-panel-check: ok` |
| video-projects | remaining Video Projects root check paths | `js/modules/features/video-projects/__checks__/*` | node-test/node-cli | exported runner helpers and previous ok/PASS text preserved where applicable |

## Commands Run

- RED: `node --test js/modules/__checks__/manifest.check.mjs` → failed on feature-owned implementation expectations while entries still pointed to root files.
- GREEN: `node --test js/modules/__checks__/manifest.check.mjs` → 4/4 passed.
- Old/new owner paths passed: Audio 4/4 each, app-shell 9/9 each, Subtitles 12/12 each, Radar CLI, Video Projects controller 3/3 each, render 4/4 each, composition helpers 3/3 each, segment picker 18/18 each, assets, cover-pan, motion presets, payload, preload, manifest resolution, and approval motion.
- Focused Python callers: `python -m pytest tests/test_radar_panel_contract.py tests/test_video_contract_pipeline_boundary.py` → 2 radar tests passed, 1 contract pipeline failure noted below.
- Phase 4 RED: `python -m pytest tests/test_phase1_slice0_bootstrap_parity.py::test_parity_checklist_defines_selector_and_bootstrap_contract_assertions tests/test_phase6_runtime_parity_and_boundaries.py::test_bootstrap_boundary_invariance_and_runtime_helper_delegation_contract tests/test_phase9_appshell_decomposition_archive_legacy.py::test_parity_checklist_freezes_three_hop_bootstrap_boundary_including_app_shell_link` → 1 failed because the stale source aggregation read the thin `parity-checklist.js` facade.
- Phase 4 GREEN: same focused source aggregation command → 3/3 passed after reading manifest implementation paths.
- Phase 4 RED/GREEN docs: `python -m pytest tests/test_phase6_runtime_parity_and_boundaries.py::test_contract_matrix_documents_check_manifest_source_aggregation` → failed before docs referenced manifest; passed after `docs/parity/contract-matrix.md` documented `implementationPath` source aggregation.
- Manifest: `node --test js/modules/__checks__/manifest.check.mjs` → 4/4 passed.
- Full manifest facade/direct matrix: 42/44 passed; both failures were `contract-pipeline-client-check` facade/direct on `Expected visible service error to include Audio voice; got ''`.
- Focused Python check/import callers: `python -m pytest tests/test_phase1_slice0_bootstrap_parity.py tests/test_phase5_css_split_parity.py tests/test_phase6_runtime_parity_and_boundaries.py tests/test_phase7_runtime_ui_replay_and_rollback.py tests/test_phase9_appshell_decomposition_archive_legacy.py tests/test_radar_panel_contract.py tests/test_video_contract_pipeline_boundary.py` → 62 passed, 3 failed on known unrelated drifts documented below.

## Issues Found

- `node js/modules/__checks__/contract-pipeline-client-check.js` and `tests/test_video_contract_pipeline_boundary.py` fail on the existing contract assertion `Expected visible service error to include Audio voice; got ''`. The moved direct implementation resolves/imports correctly, so this is an assertion failure rather than a missing import; not fixed because this work unit is organization-only.
- Previous Work Unit 1 issues remain: broad focused replay still had `js/modules/app-shell/events.js` missing from an architecture file-size guard and known `composition/assets` `dust-2 asset drift`.
- Phase 4 confirmed the two known unrelated focused Python failures still exist: `js/modules/app-shell/events.js` missing from the architecture file-size guard and runtime replay `composition/assets` `dust-2 asset drift`. They were not fixed because they are outside check organization.

## Remaining Tasks

None for `checks-organization` apply. Ready for verify, with unrelated behavioral drifts documented above.

## Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `js/modules/__checks__/manifest.js` | Modified | Feature-owned entries now map to owner `__checks__` implementation paths. |
| `js/modules/__checks__/manifest.check.mjs` | Modified | Added Work Unit 2 RED/GREEN coverage for feature-owned implementation paths and implementation-source assertion inventory. |
| `tests/test_phase1_slice0_bootstrap_parity.py` | Modified | Source aggregation now resolves assertion-bearing source via `CHECK_MANIFEST` implementation paths. |
| `tests/test_phase6_runtime_parity_and_boundaries.py` | Modified | Source aggregation now resolves check implementation source via the manifest; added docs guard for manifest aggregation. |
| `tests/test_phase9_appshell_decomposition_archive_legacy.py` | Modified | Source aggregation now resolves parity checklist implementation through the manifest. |
| `docs/parity/contract-matrix.md` | Modified | Documents manifest-backed source aggregation and `implementationPath` as the assertion inventory source. |
| `js/modules/features/audio/__checks__/audio-seams.check.mjs` | Created by move | Moved Audio check implementation and rebased imports/source roots. |
| `js/modules/features/subtitles/__checks__/subtitles-controller-seams.check.mjs` | Created by move | Moved Subtitles check implementation and rebased imports/source reads. |
| `js/modules/app-shell/__checks__/app-shell-seams.check.mjs` | Created by move | Moved app-shell check implementation and rebased runtime replay import. |
| `js/modules/features/radar/__checks__/radar-panel-check.js` | Created by move | Moved Radar CLI check implementation and rebased imports. |
| `js/modules/features/video-projects/__checks__/*` | Created by move | Moved Video Projects check implementations and rebased relative imports/asset paths. |
| `js/modules/__checks__/*` | Replaced | Added thin compatibility facades for moved feature-owned checks. |
| `openspec/changes/checks-organization/tasks.md` | Updated | Marked Work Unit 2 Phase 3 and Phase 4 tasks complete. |
