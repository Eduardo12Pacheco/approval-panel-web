# Apply Progress: approval-panel-web-parity-only-code-organization

## Mode
Strict TDD (pytest)

## Completed Tasks

- [x] 1.1 In `approval-panel-web/tests/test_phase6_runtime_parity_and_boundaries.py`, add RED assertions for unchanged API headers, payload-key sets, and bootstrap boundary invariance.
- [x] 1.2 In `approval-panel-web/tests/test_phase7_runtime_ui_replay_and_rollback.py`, add RED assertions that replayed protected flows remain 1:1 and rollback scope is latest-slice only.
- [x] 1.3 In `approval-panel-web/tests/test_phase9_appshell_decomposition_archive_legacy.py`, add RED structure assertions for expected helper locations after decomposition.
- [x] 1.4 In `approval-panel-web/js/modules/app-shell.js`, mark extraction seams for pure helpers only (no side-effect relocation).
- [x] 2.1 Move pure subtitles helpers (time/progress/metadata mapping) from `approval-panel-web/js/modules/app-shell.js` to `approval-panel-web/js/modules/features/subtitles/runtime/services.js`.
- [x] 2.2 Re-export those helpers from `approval-panel-web/js/modules/features/subtitles/runtime/controllers.js` and update `app-shell.js` call sites to use delegates.
- [x] 2.3 Preserve `bootApp`/`bootCompatibilityShell` behavior and keep DOM/network side effects in `app-shell.js`.
- [x] 2.4 Update GREEN expectations in phase6/phase7/phase9 tests for the new helper locations without altering parity assertions.
- [x] 3.1 Move pure audio helpers (status/percent/label mapping) from `approval-panel-web/js/modules/app-shell.js` to `approval-panel-web/js/modules/features/audio/runtime/services.js`.
- [x] 3.2 Re-export via `approval-panel-web/js/modules/features/audio/runtime/controllers.js` and rewire `app-shell.js` call sites.
- [x] 3.3 Keep SSE/polling/network/DOM side effects in `app-shell.js`; only pure computation is delegated.
- [x] 3.4 Update GREEN expectations in phase6/phase7/phase9 tests for audio helper locations while preserving behavior checks.
- [x] 4.1 In `approval-panel-web/js/modules/app-shell.js`, remove temporary aliases/adapters and finalize internal organization by responsibility.
- [x] 4.2 Apply minimal internal-only updates in `approval-panel-web/js/modules/__checks__/parity-checklist.js` required by the new organization.
- [x] 4.3 Run parity suite: `pytest approval-panel-web/tests/test_phase6_runtime_parity_and_boundaries.py approval-panel-web/tests/test_phase7_runtime_ui_replay_and_rollback.py approval-panel-web/tests/test_phase9_appshell_decomposition_archive_legacy.py`.
- [x] 4.4 Document slice outcome in change notes (no feature/style/UX/API/DOM contract deltas) within this change set artifacts.

## Files Changed

| File | Action | Summary |
|---|---|---|
| `tests/test_phase6_runtime_parity_and_boundaries.py` | Modified | Added RED/GREEN parity guardrails for bootstrap invariance and runtime-helper boundary checks. |
| `tests/test_phase7_runtime_ui_replay_and_rollback.py` | Modified | Added RED/GREEN assertions for runtime pure-helper location expectations. |
| `tests/test_phase9_appshell_decomposition_archive_legacy.py` | Modified | Added RED/GREEN structural assertions for post-decomposition helper placement. |
| `js/modules/features/subtitles/runtime/services.js` | Modified | Extracted subtitles pure helpers (progress, metadata, time formatting, engine mapping). |
| `js/modules/features/subtitles/runtime/controllers.js` | Modified | Re-exported extracted subtitles pure helpers. |
| `js/modules/features/subtitles/runtime/index.js` | Modified | Re-exported subtitles runtime pure helper contracts. |
| `js/modules/features/audio/runtime/services.js` | Modified | Extracted audio pure helpers (status normalization, terminal checks, labels/classes). |
| `js/modules/features/audio/runtime/controllers.js` | Modified | Re-exported extracted audio pure helpers. |
| `js/modules/features/audio/runtime/index.js` | Modified | Re-exported audio runtime pure helper contracts. |
| `js/modules/app-shell.js` | Modified | Rewired pure helper usage to runtime modules while preserving side effects and public behavior. |
| `js/modules/__checks__/parity-checklist.js` | Modified | Added app-shell helper-import guardrails required by new internal organization. |
| `openspec/changes/approval-panel-web-parity-only-code-organization/tasks.md` | Added/Modified | Added and completed task checklist for hybrid persistence. |

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 1.1 | `tests/test_phase6_runtime_parity_and_boundaries.py` | Unit (pytest+node) | ✅ 4/4 | ✅ Written | ✅ 6/6 | ✅ Added mutated-case guardrail | ✅ Clean |
| 1.2 | `tests/test_phase7_runtime_ui_replay_and_rollback.py` | Unit (pytest+node) | ✅ 4/4 | ✅ Written | ✅ 5/5 | ✅ Added app-shell + runtime-location assertions | ✅ Clean |
| 1.3 | `tests/test_phase9_appshell_decomposition_archive_legacy.py` | Unit (pytest+node) | ✅ 8/8 | ✅ Written | ✅ 9/9 | ✅ Added multi-helper location checks | ✅ Clean |
| 1.4 | `js/modules/app-shell.js` | Unit (pytest+node) | ✅ 5/5 + 5/5 + 9/9 | ✅ Failing checks referenced missing extracted helpers | ✅ Passing after seam rewiring | ✅ Multiple call-site assertions + mutated boundary checks | ✅ Removed inline pure helper duplicates |
| 2.1 | `tests/test_phase7_runtime_ui_replay_and_rollback.py` | Unit (pytest+node) | ✅ 4/4 | ✅ Written | ✅ 5/5 | ✅ Happy + drift/mutated path | ✅ Pure helper extraction in services |
| 2.2 | `tests/test_phase9_appshell_decomposition_archive_legacy.py` | Unit (pytest+node) | ✅ 8/8 | ✅ Written | ✅ 9/9 | ✅ Services + controllers + app-shell re-export path checks | ✅ Stable index/controller exports |
| 2.3 | `tests/test_phase6_runtime_parity_and_boundaries.py` | Unit (pytest+node) | ✅ 4/4 | ✅ Written | ✅ 6/6 | ✅ Bootstrap + helper import + mutated checklist path | ✅ Kept side effects in app-shell |
| 2.4 | `tests/test_phase6_runtime_parity_and_boundaries.py` / `tests/test_phase7_runtime_ui_replay_and_rollback.py` / `tests/test_phase9_appshell_decomposition_archive_legacy.py` | Unit (pytest+node) | ✅ per-file baselines | ✅ Written | ✅ 20/20 | ✅ Three-suite parity triangulation | ➖ None needed |
| 3.1 | `tests/test_phase7_runtime_ui_replay_and_rollback.py` | Unit (pytest+node) | ✅ 4/4 | ✅ Written | ✅ 5/5 | ✅ Non-empty + mutated import checks | ✅ Audio pure helpers extracted |
| 3.2 | `tests/test_phase9_appshell_decomposition_archive_legacy.py` | Unit (pytest+node) | ✅ 8/8 | ✅ Written | ✅ 9/9 | ✅ Services/controllers/app-shell location checks | ✅ Re-export-only controller layer |
| 3.3 | `tests/test_phase6_runtime_parity_and_boundaries.py` | Unit (pytest+node) | ✅ 4/4 | ✅ Written | ✅ 6/6 | ✅ Drift simulation in checklist gate | ✅ Side effects left in app-shell |
| 3.4 | `tests/test_phase6_runtime_parity_and_boundaries.py` / `tests/test_phase7_runtime_ui_replay_and_rollback.py` / `tests/test_phase9_appshell_decomposition_archive_legacy.py` | Unit (pytest+node) | ✅ per-file baselines | ✅ Written | ✅ 20/20 | ✅ Cross-suite parity triangulation | ➖ None needed |
| 4.1 | `tests/test_phase9_appshell_decomposition_archive_legacy.py` | Unit (pytest+node) | ✅ 8/8 | ✅ Written | ✅ 9/9 | ✅ Helper-location + app-shell usage assertions | ✅ Removed duplicated inline pure helpers |
| 4.2 | `tests/test_phase6_runtime_parity_and_boundaries.py` | Unit (pytest+node) | ✅ 4/4 | ✅ Written | ✅ 6/6 | ✅ Baseline/mutated checklist scenarios | ✅ Minimal check-only update |
| 4.3 | `tests/test_phase6_runtime_parity_and_boundaries.py tests/test_phase7_runtime_ui_replay_and_rollback.py tests/test_phase9_appshell_decomposition_archive_legacy.py` | Unit (pytest+node) | ✅ N/A (verification run) | ✅ Command predefined by task | ✅ 20/20 | ➖ Single command gate | ➖ None needed |
| 4.4 | `openspec/changes/approval-panel-web-parity-only-code-organization/apply-progress.md` | Structural | N/A (new artifact) | ✅ Written first | ✅ Captured with zero contract deltas | ➖ Single artifact output | ✅ Consolidated evidence |

## Test Summary

- **Total tests written**: 4
- **Total tests passing**: 20 (target parity suite)
- **Layers used**: Unit (20), Integration (0), E2E (0)
- **Approval tests (refactoring)**: 4 (structural parity guardrails for existing behavior)
- **Pure functions created**: 12

## Deviations from Design

None — implementation matches design and preserves `bootApp`/`bootCompatibilityShell`, bootstrap chain, API headers/payload keys, and DOM parity boundaries.

## Issues Found

None.

## Slice Outcome Notes

- No feature deltas.
- No visual/style deltas.
- No UX behavior deltas.
- No API contract deltas.
- No DOM selector contract deltas.

## Video Projects Phase B2 Addendum

### Mode

Standard cleanup (markup-only extraction; no preview lifecycle changes).

### Completed Tasks

- [x] Phase B2: moved project list/card markup builders out of `js/modules/features/video-projects/render.js`.

### Files Changed

| File | Action | Summary |
|---|---|---|
| `js/modules/features/video-projects/project-list-markup.js` | Created | Hosts `buildProjectCard`, `buildFutureProjectCard`, and private thumbnail resolution used by project catalog markup. |
| `js/modules/features/video-projects/render.js` | Modified | Imports project catalog markup builders and keeps list DOM insertion/event hydration in place. |

### Validation

- `node --check js/modules/features/video-projects/render.js` — PASS
- `node --check js/modules/features/video-projects/project-list-markup.js` — PASS
- `node --check js/modules/features/video-projects/editor-markup.js` — PASS
- `node js/modules/__checks__/video-projects-composition-payload.check.mjs` — PASS
- `node js/modules/__checks__/video-projects-manifest-resolution.check.mjs` — PASS
- `node js/modules/__checks__/contract-pipeline-client-check.js` — PASS
- `pytest tests/test_video_projects_temp_image_cache.py tests/test_video_contract_pipeline_boundary.py tests/test_phase6_runtime_parity_and_boundaries.py` — PASS (23 passed)

### Deviations

None — no DOM/event/API/CSS/preview lifecycle behavior changed.

## Video Projects Audio Setup Command Seam Addendum

### Mode

Standard cleanup (non-preview audio setup command extraction only; preview lifecycle unchanged).

### Completed Tasks

- [x] Extracted `uploadProjectAudio` and `selectDefaultBackgroundMusic` from `js/modules/features/video-projects/index.js` to an injected audio setup command factory.

### Files Changed

| File | Action | Summary |
|---|---|---|
| `js/modules/features/video-projects/audio/commands.js` | Created | Hosts `createAudioSetupCommands`, preserving upload/default-track API calls, state mutations, render calls, and toast/error messages. |
| `js/modules/features/video-projects/index.js` | Modified | Imports the audio setup command factory and returns the same public command names from `createVideoProjectsFeature`. |

### Validation

- `node --check js/modules/features/video-projects/index.js` — PASS
- `node --check js/modules/features/video-projects/audio/commands.js` — PASS
- `node js/modules/__checks__/video-projects-composition-payload.check.mjs` — PASS
- `node js/modules/__checks__/video-projects-manifest-resolution.check.mjs` — PASS
- `node js/modules/__checks__/contract-pipeline-client-check.js` — PASS
- `node js/modules/__checks__/composition-renderer-preload-window.check.mjs` — PASS
- `node js/modules/__checks__/approval-editor-service-timings.check.cjs` — PASS
- `pytest tests/test_video_projects_temp_image_cache.py tests/test_video_contract_pipeline_boundary.py tests/test_phase6_runtime_parity_and_boundaries.py tests/test_phase7_runtime_ui_replay_and_rollback.py tests/test_phase9_appshell_decomposition_archive_legacy.py` — PASS (39 passed)

### Deviations

None — audio setup command behavior was moved without changing API payloads, state update order, toast/error text, DOM contracts, or any preview lifecycle code.

## Video Projects Phase C2 Addendum

### Mode

Standard cleanup (small non-preview setup event hydration seam only; preview lifecycle unchanged).

### Completed Tasks

- [x] Phase C2: moved image/audio setup event hydration out of `js/modules/features/video-projects/render.js`.

### Files Changed

| File | Action | Summary |
|---|---|---|
| `js/modules/features/video-projects/setup-events.js` | Created | Hosts setup-only listeners for audio uploads, default background music selection, custom image uploads, and image candidate selection. |
| `js/modules/features/video-projects/render.js` | Modified | Imports `hydrateSetupEvents` and delegates only the non-editor setup event block inside `!inEditorPhase`. |

### Validation

- `node --check js/modules/features/video-projects/render.js` — PASS
- `node --check js/modules/features/video-projects/setup-events.js` — PASS
- `node js/modules/__checks__/video-projects-composition-payload.check.mjs` — PASS
- `node js/modules/__checks__/video-projects-manifest-resolution.check.mjs` — PASS
- `node js/modules/__checks__/contract-pipeline-client-check.js` — PASS
- `pytest tests/test_video_projects_temp_image_cache.py tests/test_video_contract_pipeline_boundary.py tests/test_phase6_runtime_parity_and_boundaries.py` — PASS (23 passed)

### Deviations

None — no DOM/event/API/CSS/preview lifecycle behavior changed. Editor-phase and preview lifecycle hydration remains in `render.js` untouched.

## Video Projects Controller Helper Extraction Addendum

### Mode

Standard cleanup (non-lifecycle pure/transport helper extraction only; preview lifecycle unchanged).

### Completed Tasks

- [x] Extracted composition payload/hash helpers from `js/modules/features/video-projects/index.js` to `js/modules/features/video-projects/composition/composition-payload.js`.
- [x] Extracted custom image file constants and dimension detection from `js/modules/features/video-projects/index.js` to `js/modules/features/video-projects/domain/image-files.js`.

### Files Changed

| File | Action | Summary |
|---|---|---|
| `js/modules/features/video-projects/composition/composition-payload.js` | Created | Hosts `hashString`, `computeCompositionHash`, and `buildCompositionPayload` with the same payload/hash logic. |
| `js/modules/features/video-projects/domain/image-files.js` | Created | Hosts custom image MIME/size constants and `detectImageDimensions` with unchanged error messages. |
| `js/modules/features/video-projects/index.js` | Modified | Imports extracted helpers and keeps controller call sites, lifecycle, API payload usage, and check export unchanged. |

### Validation

- `node --check js/modules/features/video-projects/index.js` — PASS
- `node --check js/modules/features/video-projects/composition/composition-payload.js` — PASS
- `node --check js/modules/features/video-projects/domain/image-files.js` — PASS
- `node js/modules/__checks__/video-projects-composition-payload.check.mjs` — PASS
- `node js/modules/__checks__/video-projects-manifest-resolution.check.mjs` — PASS
- `node js/modules/__checks__/contract-pipeline-client-check.js` — PASS
- `node js/modules/__checks__/composition-renderer-preload-window.check.mjs` — PASS
- `node js/modules/__checks__/approval-editor-service-timings.check.cjs` — PASS
- `pytest tests/test_video_projects_temp_image_cache.py tests/test_video_contract_pipeline_boundary.py tests/test_phase6_runtime_parity_and_boundaries.py tests/test_phase7_runtime_ui_replay_and_rollback.py tests/test_phase9_appshell_decomposition_archive_legacy.py` — PASS (39 passed)

### Deviations

None — no DOM/event/API/CSS/preview lifecycle behavior changed. Composition payload/hash field construction and custom image upload validation/dimension error messages were moved without logic changes.

## Video Projects Phase C1 Addendum

### Mode

Standard cleanup (small non-preview event hydration seam only; preview lifecycle unchanged).

### Completed Tasks

- [x] Phase C1: moved project card/list click hydration and prefetch wiring out of `js/modules/features/video-projects/render.js`.

### Files Changed

| File | Action | Summary |
|---|---|---|
| `js/modules/features/video-projects/project-list-events.js` | Created | Hosts `hydrateProjectListCards`, preserving card click, open-button keyboard activation, and one-time prefetch listeners. |
| `js/modules/features/video-projects/render.js` | Modified | Imports `hydrateProjectListCards` and delegates project catalog hydration after unchanged markup insertion. |

### Validation

- `node --check js/modules/features/video-projects/render.js` — PASS
- `node --check js/modules/features/video-projects/project-list-events.js` — PASS
- `node js/modules/__checks__/video-projects-composition-payload.check.mjs` — PASS
- `node js/modules/__checks__/video-projects-manifest-resolution.check.mjs` — PASS
- `node js/modules/__checks__/contract-pipeline-client-check.js` — PASS
- `pytest tests/test_video_projects_temp_image_cache.py tests/test_video_contract_pipeline_boundary.py tests/test_phase6_runtime_parity_and_boundaries.py` — PASS (23 passed)

### Deviations

None — no DOM/event/API/CSS/preview lifecycle behavior changed.
