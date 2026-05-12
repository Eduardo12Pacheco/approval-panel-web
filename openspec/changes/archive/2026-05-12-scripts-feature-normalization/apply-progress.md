# Apply Progress: Scripts Feature Normalization

## Status

Success — all planned tasks are complete, and the stale Phase 7 pytest replay expectation has been updated for the strengthened 11-scenario Scripts replay coverage. Previous blocker `composition/assets` / `dust-2 asset drift` was resolved before this resume; baseline parity replay now passes.

## Mode

Strict TDD.

## Workload / PR Boundary

- Mode: chained PR plan (`auto-chain`)
- Chain strategy: `stacked-to-main`
- Current apply batch: completed PR 1/2/3 work units in one workspace batch because the user requested full implementation if safe and no commit/PR was created.
- Boundary: `01-Control-Panel/js/modules/features/scripts/` plus focused global parity/rollback checks.

## Completed Tasks

- [x] 1.1 Export inventory and app-shell internal-import guard added to runtime parity replay.
- [x] 1.2 Endpoint, payload, polling interval, save-before-publish, DOCX fallback, dismissal, failed-card `ERROR`, and Script → Audio parity coverage preserved/strengthened.
- [x] 1.3 Baseline and final focused global parity checks passed; no build run.
- [x] 2.1 `domain.js` created for draft normalization, identity/title/processed, and DOCX filename helpers; facade re-exports preserved.
- [x] 2.2 `publish-status.js` created for stage metadata, job matching, and card publish state.
- [x] 2.3 `cards.js` created for script selection card markup with escaping, ARIA, dismissal, lock/error badges preserved.
- [x] 2.4 Focused parity replay passed after helper/card extraction.
- [x] 3.1 `client.js` created for endpoint/payload helper seams without changing strings or keys.
- [x] 3.2 `polling.js` created for publish polling, in-flight guard, terminal cleanup, completion/failed behavior.
- [x] 3.3 `controller.js` created with `createScriptsFeature(...)` and all existing public methods.
- [x] 3.4 `index.js` reduced to the stable public facade with existing named exports.
- [x] 4.1 `render.js` imports adjusted to siblings to avoid facade cycles while preserving DOM behavior.
- [x] 4.2 Rollback scope updated with `scripts-feature-normalization` checkpoint.
- [x] 4.3 Final focused parity and rollback checks passed; no build run.
- [x] Verify remediation: `tests/test_phase7_runtime_ui_replay_and_rollback.py` now expects 11 protected replay scenarios and explicitly requires `scripts/facade-parity`.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| Prior blocker | `js/modules/__checks__/global/runtime-ui-parity-replay.js` | Integration parity | Previously ❌ `composition/assets` → `dust-2 asset drift`; now ✅ resolved before resume | N/A | ✅ Baseline replay passed before edits | N/A | N/A |
| 1.1 | `js/modules/__checks__/global/runtime-ui-parity-replay.js` | Static/integration parity | ✅ baseline replay passed | ✅ Added facade export/internal-boundary check before modules existed; failed on missing `domain.js` | ✅ Final replay passed | ✅ Export inventory + app-shell forbidden internal imports | ✅ Check remains behavior-focused, not private API-only |
| 1.2 | `js/modules/__checks__/global/runtime-ui-parity-replay.js` | Static/runtime parity | ✅ baseline replay passed | ✅ Added endpoint/payload/polling/DOCX/dismiss/failure assertions before extraction | ✅ Final replay passed | ✅ Static contract tokens + runtime save/publish/DOCX/dismiss/failed-job cases | ✅ Reused existing protected-flow replay harness |
| 1.3 | `js/modules/__checks__/global/runtime-ui-parity-replay.js` | Integration parity | ✅ baseline replay passed | ✅ RED from missing planned internals after check update | ✅ Final replay passed | ✅ Baseline and final scenario list includes `scripts/facade-parity` | ✅ No build run |
| 2.1 | `js/modules/__checks__/global/runtime-ui-parity-replay.js` | Approval/static parity | ✅ baseline replay passed | ✅ Check required `domain.js` before it existed | ✅ Replay passed after `domain.js` + facade re-exports | ✅ Draft normalization, identity/title/processed, DOCX fallback covered through public facade/runtime checks | ✅ Pure helpers extracted without app-shell coupling |
| 2.2 | `js/modules/__checks__/global/runtime-ui-parity-replay.js` | Approval/static parity | ✅ baseline replay passed | ✅ Check required `publish-status.js` before it existed | ✅ Replay passed after `publish-status.js` | ✅ Stage metadata, job matching, failed `ERROR`, locked-card state covered | ✅ Sibling import from `domain.js`; no facade import cycle |
| 2.3 | `js/modules/__checks__/global/runtime-ui-parity-replay.js` | Runtime parity | ✅ baseline replay passed | ✅ Check required `cards.js` before it existed | ✅ Replay passed after `cards.js` | ✅ Card markup, dismissal action/copy, failed badge and lock behavior covered | ✅ Card rendering isolated from controller |
| 2.4 | `js/modules/__checks__/global/runtime-ui-parity-replay.js` | Integration parity | ✅ baseline replay passed | ✅ RED remained until helper/card modules existed | ✅ Replay passed after helper/card extraction | ✅ Existing Scripts replay plus facade parity scenario | ✅ No behavior changes beyond extraction |
| 3.1 | `js/modules/__checks__/global/runtime-ui-parity-replay.js` | Static/runtime parity | ✅ helper/card replay passed | ✅ Check required `client.js` and endpoint/payload tokens before it existed | ✅ Replay passed after `client.js` | ✅ Draft/save/publish/status/DOCX endpoints and payload keys covered | ✅ Endpoint strings centralized |
| 3.2 | `js/modules/__checks__/global/runtime-ui-parity-replay.js` | Runtime parity | ✅ helper/card replay passed | ✅ Check required `polling.js` and `SCRIPT_PUBLISH_POLL_INTERVAL_MS = 3000` | ✅ Replay passed after `polling.js` | ✅ Immediate status sync, failed terminal cleanup/toast/card state covered | ✅ Polling isolated behind callback seam |
| 3.3 | `js/modules/__checks__/global/runtime-ui-parity-replay.js` | Runtime parity | ✅ helper/card replay passed | ✅ Check required `controller.js` before it existed | ✅ Replay passed after `controller.js` | ✅ Refresh/open/save/publish/download/dismiss public methods exercised | ✅ Controller delegates to domain/client/polling/cards |
| 3.4 | `js/modules/__checks__/global/runtime-ui-parity-replay.js` | Static/integration parity | ✅ controller replay passed | ✅ Facade re-export token check failed until `index.js` was reduced | ✅ Replay passed after stable facade | ✅ Full named export inventory checked from module namespace and source | ✅ Facade contains only public re-exports |
| 4.1 | `js/modules/__checks__/global/runtime-ui-parity-replay.js` | Static/runtime parity | ✅ controller replay passed | ✅ Check forbade `render.js` importing `./index.js` | ✅ Replay passed after sibling imports | ✅ Render still covered by Scripts replay/card checks | ✅ Avoided circular import risk |
| 4.2 | `js/modules/__checks__/global/rollback-scope-validator.js` | Static rollback parity | ✅ scripts replay passed | ✅ `scripts-feature-normalization` checkpoint initially failed with empty allowed prefixes | ✅ Rollback scope check passed after checkpoint addition | ✅ Covered scripts files + global parity/rollback check paths | ✅ Scope isolated to this change |
| 4.3 | `js/modules/__checks__/global/runtime-ui-parity-replay.js` + rollback command | Integration/static parity | ✅ all prior checks green | ✅ N/A — final verification task reuses RED coverage from 1.1-4.2 | ✅ Final replay and rollback scope passed | ✅ Facade exports, runtime replay, dismissal/DOCX/polling, Script → Audio order, rollback scope | ✅ No build run |
| Verify remediation | `tests/test_phase7_runtime_ui_replay_and_rollback.py` | Pytest wrapper parity | ❌ focused test failed with `expected 10 protected scenarios, got 11` | ✅ Updated stale expectation to 11 and required `scripts/facade-parity` | ✅ Focused phase7 replay + rollback pytest passed: 2 passed | ➖ Single stale expectation fix | ✅ No production behavior changed |

## Test Execution

| Command | Result |
|---------|--------|
| `node --input-type=module -e "import('./js/modules/__checks__/global/runtime-ui-parity-replay.js').then(async (m) => { const result = await m.runProtectedFlowsReplay(); if (!result.ok) { console.error(JSON.stringify(result.failures, null, 2)); process.exit(1); } console.log(JSON.stringify(result)); })"` | ✅ Baseline passed before edits after prior blocker resolution |
| same runtime replay after RED check update | ❌ Expected RED: missing `features/scripts/domain.js` |
| same runtime replay after extraction | ✅ Passed: `auth/session`, `settings`, `composition/assets`, `approval`, `scripts`, `scripts/facade-parity`, `audio`, `subtitles`, `app-shell/lifecycle`, `app-shell/set-view`, `script-to-audio/voice` |
| `node --input-type=module -e "import('./js/modules/__checks__/global/rollback-scope-validator.js').then((m) => { const result = m.evaluateRollbackPlan({ checkpoint: 'scripts-feature-normalization', changedFiles: [...] }); if (!result.allowed) { console.error(JSON.stringify(result)); process.exit(1); } console.log(JSON.stringify(result)); })"` | ✅ Passed after checkpoint addition |
| `python -m pytest "tests/test_phase7_runtime_ui_replay_and_rollback.py::test_runtime_ui_state_replay_executes_all_protected_flows"` | ❌ Expected RED/baseline failure before edit: stale `10` scenario assertion got `11` |
| `python -m pytest "tests/test_phase7_runtime_ui_replay_and_rollback.py::test_runtime_ui_state_replay_executes_all_protected_flows" "tests/test_phase7_runtime_ui_replay_and_rollback.py::test_rollback_scope_validator_enforces_checkpoint_failure_boundaries"` | ✅ Passed: 2 passed in 0.20s |

## Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `01-Control-Panel/js/modules/features/scripts/index.js` | Modified | Reduced to stable facade re-exporting the existing public named exports. |
| `01-Control-Panel/js/modules/features/scripts/domain.js` | Created | Extracted draft normalization, identity/title/processed, and DOCX filename helpers. |
| `01-Control-Panel/js/modules/features/scripts/publish-status.js` | Created | Extracted publish stage metadata, job row matching, and publish card state. |
| `01-Control-Panel/js/modules/features/scripts/cards.js` | Created | Extracted script selection card markup. |
| `01-Control-Panel/js/modules/features/scripts/client.js` | Created | Centralized Scripts endpoint and payload helper seams. |
| `01-Control-Panel/js/modules/features/scripts/polling.js` | Created | Extracted async publish polling and terminal state handling. |
| `01-Control-Panel/js/modules/features/scripts/controller.js` | Created | Moved `createScriptsFeature(...)` controller methods behind facade. |
| `01-Control-Panel/js/modules/features/scripts/render.js` | Modified | Switched from facade imports to sibling internals to avoid cycles. |
| `01-Control-Panel/js/modules/__checks__/global/runtime-ui-parity-replay.js` | Modified | Added Scripts facade/static/runtime parity coverage. |
| `01-Control-Panel/js/modules/__checks__/global/rollback-scope-validator.js` | Modified | Added rollback checkpoint for this change. |
| `01-Control-Panel/tests/test_phase7_runtime_ui_replay_and_rollback.py` | Modified | Updated stale protected scenario count from 10 to 11 and asserted `scripts/facade-parity` is present. |
| `01-Control-Panel/openspec/changes/scripts-feature-normalization/tasks.md` | Modified | Marked all tasks complete. |
| `01-Control-Panel/openspec/changes/scripts-feature-normalization/apply-progress.md` | Modified | Persisted merged apply progress and TDD evidence. |

## Deviations from Design

- The design sketch mentioned a possible `commands.js`; implementation kept command methods in `controller.js` to preserve a smaller, reviewable extraction while still meeting the task list and public facade contract.

## Issues Found

- No current blocker. The previous `composition/assets` failure is green now.
- Verify failure root cause was a stale pytest wrapper expectation: runtime replay correctly returned 11 protected scenarios after adding `scripts/facade-parity`, while the Python guard still expected 10.
- The repository appears untracked from Git's perspective in this environment, so `git diff --stat` did not report changed-line totals.

## Remaining Tasks

None for this SDD apply phase.
