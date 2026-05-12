# Tasks: Composition Assets Dust Drift

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 2-8 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single parity-only fix |
| Delivery strategy | auto |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Refresh stale parity expectations and focused checks | PR 1 | Keep production resolver/service files untouched; tests stay with the fix. |

## Phase 1: Baseline Confirmation

- [x] 1.1 Inspect `01-Control-Panel/js/modules/__checks__/global/runtime-ui-parity-replay.js` and locate the `composition/assets` `dust-2` expected URL.
- [x] 1.2 Inspect `01-Control-Panel/tests/test_phase7_runtime_ui_replay_and_rollback.py` and locate the protected replay `result.passed.length` assertion.
- [x] 1.3 Confirm no changes are needed in `01-Control-Panel/js/modules/features/video-projects/composition/*` or `01-Control-Panel/approval-editor-service/server.js`.

## Phase 2: Parity Expectation Update

- [x] 2.1 Update only the `dust-2` expected URL in `runtime-ui-parity-replay.js` to `http://127.0.0.1:3042/api/overlays/dust-2.mp4`.
- [x] 2.2 If still stale, update only the protected replay count assertion in `test_phase7_runtime_ui_replay_and_rollback.py` from historical `6` to current `10`.

## Phase 3: Focused Verification

- [x] 3.1 Run the focused Node replay/check that covers `composition/assets` and verify the `dust-2` service-backed URL passes.
- [x] 3.2 Run the focused Python runtime replay test in `tests/test_phase7_runtime_ui_replay_and_rollback.py` and verify `runProtectedFlowsReplay()` passes 10 scenarios.
- [x] 3.3 Do not run a build; this change is expectation-only and the project instruction forbids builds.

## Phase 4: Regression Boundary

- [x] 4.1 Review the diff and verify only `runtime-ui-parity-replay.js`, and possibly `test_phase7_runtime_ui_replay_and_rollback.py`, changed.
- [x] 4.2 Confirm `resolveCompositionDustUrl`, `COMPOSITION_LOCAL_OVERLAY_BASE_URL`, `/api/overlays/`, and `approval-editor-service/server.js` remain unchanged.
