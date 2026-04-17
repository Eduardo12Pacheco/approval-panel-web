# Tasks: Approval Panel Web Parity-Only Code Organization

## Phase 1: Baseline Guardrails (RED)

- [x] 1.1 In `approval-panel-web/tests/test_phase6_runtime_parity_and_boundaries.py`, add RED assertions for unchanged API headers, payload-key sets, and bootstrap boundary invariance.
- [x] 1.2 In `approval-panel-web/tests/test_phase7_runtime_ui_replay_and_rollback.py`, add RED assertions that replayed protected flows remain 1:1 and rollback scope is latest-slice only.
- [x] 1.3 In `approval-panel-web/tests/test_phase9_appshell_decomposition_archive_legacy.py`, add RED structure assertions for expected helper locations after decomposition.
- [x] 1.4 In `approval-panel-web/js/modules/app-shell.js`, mark extraction seams for pure helpers only (no side-effect relocation).

**Acceptance check:** New RED assertions fail before extraction, while existing baseline parity checks remain meaningful.
**Rollback note:** Revert only new RED assertions/seam markers if baseline assumptions are incorrect.

## Phase 2: Subtitles Pure-Helper Extraction (GREEN)

- [x] 2.1 Move pure subtitles helpers (time/progress/metadata mapping) from `approval-panel-web/js/modules/app-shell.js` to `approval-panel-web/js/modules/features/subtitles/runtime/services.js`.
- [x] 2.2 Re-export those helpers from `approval-panel-web/js/modules/features/subtitles/runtime/controllers.js` and update `app-shell.js` call sites to use delegates.
- [x] 2.3 Preserve `bootApp`/`bootCompatibilityShell` behavior and keep DOM/network side effects in `app-shell.js`.
- [x] 2.4 Update GREEN expectations in phase6/phase7/phase9 tests for the new helper locations without altering parity assertions.

**Acceptance check:** Phase6/7/9 tests pass for subtitles paths with unchanged selectors, endpoints, headers, payload keys, and startup order.
**Rollback note:** Revert only files touched in 2.x; keep Phase 1 as safe baseline.

## Phase 3: Audio Pure-Helper Extraction (GREEN)

- [x] 3.1 Move pure audio helpers (status/percent/label mapping) from `approval-panel-web/js/modules/app-shell.js` to `approval-panel-web/js/modules/features/audio/runtime/services.js`.
- [x] 3.2 Re-export via `approval-panel-web/js/modules/features/audio/runtime/controllers.js` and rewire `app-shell.js` call sites.
- [x] 3.3 Keep SSE/polling/network/DOM side effects in `app-shell.js`; only pure computation is delegated.
- [x] 3.4 Update GREEN expectations in phase6/phase7/phase9 tests for audio helper locations while preserving behavior checks.

**Acceptance check:** Phase6/7/9 tests pass for audio paths and bootstrap chain `index.html -> js/main.js -> composition-root.js -> app-shell.js` remains invariant.
**Rollback note:** Revert only files touched in 3.x; preserve passing Phase 2 snapshot.

## Phase 4: Final Parity Gate and Cleanup (REFACTOR)

- [x] 4.1 In `approval-panel-web/js/modules/app-shell.js`, remove temporary aliases/adapters and finalize internal organization by responsibility.
- [x] 4.2 Apply minimal internal-only updates in `approval-panel-web/js/modules/__checks__/parity-checklist.js` required by the new organization.
- [x] 4.3 Run parity suite: `pytest approval-panel-web/tests/test_phase6_runtime_parity_and_boundaries.py approval-panel-web/tests/test_phase7_runtime_ui_replay_and_rollback.py approval-panel-web/tests/test_phase9_appshell_decomposition_archive_legacy.py`.
- [x] 4.4 Document slice outcome in change notes (no feature/style/UX/API/DOM contract deltas) within this change set artifacts.

**Acceptance check:** All parity gates green; no visual/UX drift; no public contract drift.
**Rollback note:** Revert latest failing slice only; keep last fully green slice as active baseline.
