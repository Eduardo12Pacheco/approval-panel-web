# Apply Progress: Composition Assets Dust Drift

## Outcome

Parity-only expectation update completed. The `composition/assets` replay now expects the service-backed `dust-2` URL, and the Python protected replay guard expects the current 10-scenario count.

## Completed Tasks

- [x] 1.1 Located the stale `dust-2` expectation in `js/modules/__checks__/global/runtime-ui-parity-replay.js`.
- [x] 1.2 Located the stale `result.passed.length` assertion in `tests/test_phase7_runtime_ui_replay_and_rollback.py`.
- [x] 1.3 Confirmed production composition and approval-editor service files did not need changes.
- [x] 2.1 Updated only the `dust-2` expected URL to `http://127.0.0.1:3042/api/overlays/dust-2.mp4`.
- [x] 2.2 Updated the protected replay count assertion from 6 to 10.
- [x] 3.1 Ran the focused Node replay and verified 10 protected scenarios pass, including `composition/assets`.
- [x] 3.2 Ran the focused Python runtime replay test and verified it passes.
- [x] 3.3 No build was run.
- [x] 4.1 Reviewed the regression boundary; this apply touched only the two expectation files plus SDD progress/task artifacts.
- [x] 4.2 Confirmed production resolver constants/routes remain unchanged by this apply.

## Files Changed

| File | Action | What Changed |
|------|--------|--------------|
| `01-Control-Panel/js/modules/__checks__/global/runtime-ui-parity-replay.js` | Modified | Replaced stale direct-path `dust-2` expected URL with service-backed overlay URL. |
| `01-Control-Panel/tests/test_phase7_runtime_ui_replay_and_rollback.py` | Modified | Updated protected replay expected count from 6 to 10. |
| `01-Control-Panel/openspec/changes/composition-assets-dust-drift/tasks.md` | Modified | Marked all apply tasks complete. |
| `01-Control-Panel/openspec/changes/composition-assets-dust-drift/apply-progress.md` | Created | Recorded cumulative apply progress and TDD evidence. |

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 2.1 | `js/modules/__checks__/global/runtime-ui-parity-replay.js` | Node replay check | Baseline failed as expected: `composition/assets` → `dust-2 asset drift` | Existing parity guard failed before update | Focused Node replay passed with 10 scenarios | Count assertion verified non-empty full replay list including `composition/assets` | None needed; expectation-only update |
| 2.2 | `tests/test_phase7_runtime_ui_replay_and_rollback.py` | pytest guard invoking Node replay | Baseline pytest failed through stale replay guard | Existing pytest guard failed before update | Focused pytest test passed | Python guard now asserts current 10-scenario protected replay count | None needed; expectation-only update |

## Test Summary

- **Focused Node check**: `node --experimental-default-type=module -e "import { runProtectedFlowsReplay } from './js/modules/__checks__/runtime-ui-parity-replay.js'; ..."` → passed, `result.ok === true`, `passed.length === 10`.
- **Focused pytest check**: `pytest tests/test_phase7_runtime_ui_replay_and_rollback.py::test_runtime_ui_state_replay_executes_all_protected_flows` → 1 passed.
- **Build**: Not run, per project instruction.

## Deviations from Design

None — implementation matches the parity-only design and leaves production asset-resolution/service code unchanged.

## Issues Found

- The `01-Control-Panel` worktree already contains many unrelated modified/untracked files from prior work, so regression review was scoped to files touched by this apply.

## Remaining Tasks

None.

## Workload / PR Boundary

- Mode: single parity-only work unit.
- Boundary: stale replay expectations only; no production resolver or service route changes.
- Estimated review budget impact: tiny, below 400-line budget.
