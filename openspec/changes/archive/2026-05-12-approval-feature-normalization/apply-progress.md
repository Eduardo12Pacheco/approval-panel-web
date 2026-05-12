# Apply Progress: Approval Feature Normalization

**Change**: `approval-feature-normalization`  
**Mode**: Strict TDD  
**Status**: complete — ready for verify

## Summary

Resumed from the previous blocked apply-progress after `app-shell-events-guard-fix`; the focused parity safety net now passes. Approval is normalized behind `features/approval/index.js` as the stable facade, app-shell imports Approval-owned render helpers only through that facade, and focused parity checks now prove existing named exports, render helper exports, DOM dataset contracts, and success/failure sequencing remain protected.

## Completed Tasks

- [x] 1.1 Update `01-Control-Panel/js/modules/features/approval/index.js` to re-export `buildApprovalNewsCardMarkup`, `renderApprovalTopicDetail`, `renderQueueMonitor`, and queue helper named exports.
- [x] 1.2 If extracting helpers, create focused Approval-owned modules without changing exported names or helper behavior. *(No helper extraction was needed; existing Approval-owned render modules remain internal implementation modules and are re-exported by the facade.)*
- [x] 2.1 Update `01-Control-Panel/js/modules/app-shell/runtime.js` to import all Approval-owned helpers from `features/approval/index.js`.
- [x] 2.2 Preserve existing render functions in `runtime.js` so card filtering, topic detail, queue render, and source link behavior stay unchanged.
- [x] 3.1 Add/update checks proving `features/approval/index.js` preserves all previous named exports plus render helper exports.
- [x] 3.2 Add/update markup assertions for topic detail `data-action`, `data-url`, `data-id-noticia`, `data-index`, and queue `data-queue-id` contracts.
- [x] 3.3 Keep approval success/failure sequencing assertions covering renders, toast, pending refresh, queue refresh, and injected `refreshScriptDrafts`.
- [x] 4.1 Run existing focused Approval/runtime parity checks only; do not run a build.
- [x] 4.2 Review `01-Control-Panel/tests/test_phase6_runtime_parity_and_boundaries.py` and `test_phase7_runtime_ui_replay_and_rollback.py` for weakened or duplicated assertions.

## Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `01-Control-Panel/js/modules/features/approval/index.js` | Modified | Re-exported Approval card/detail/queue render helpers and queue helper named exports through the stable Approval facade. |
| `01-Control-Panel/js/modules/app-shell/runtime.js` | Modified | Replaced direct imports from Approval internal render modules with the Approval facade import while preserving render functions. |
| `01-Control-Panel/tests/test_phase6_runtime_parity_and_boundaries.py` | Modified | Added a focused Node parity guard for facade exports, source/card/detail/queue DOM contracts, queue helper behavior, and runtime import boundary normalization. |
| `01-Control-Panel/openspec/changes/approval-feature-normalization/tasks.md` | Modified | Marked all apply tasks complete. |

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| Previous apply attempt | `tests/test_phase6_runtime_parity_and_boundaries.py`, `tests/test_phase7_runtime_ui_replay_and_rollback.py` | Pytest + focused Node checks through pytest | ❌ Pre-existing failure: `test_architecture_file_size_soft_cap_and_css_facade_guardrails` expected missing `js/modules/app-shell/events.js` before `app-shell-events-guard-fix` | ➖ Not started | ➖ Not started | ➖ Not started | ➖ Not started |
| 1.1, 3.1 | `tests/test_phase6_runtime_parity_and_boundaries.py::test_approval_facade_exports_render_helpers_and_preserves_dom_contracts` | Pytest-driven Node integration/static parity | ✅ 36/36 focused parity safety net passed before production changes | ✅ Failing import proved facade did not export `buildApprovalNewsCardMarkup` | ✅ New guard passed after facade re-exports | ✅ Existing exports + render helpers + queue helpers covered with distinct behavior cases | ✅ Re-export-only facade, no helper extraction needed |
| 2.1, 2.2, 3.2 | `tests/test_phase6_runtime_parity_and_boundaries.py::test_approval_facade_exports_render_helpers_and_preserves_dom_contracts` | Pytest-driven Node integration/static parity | ✅ 36/36 focused parity safety net passed before production changes | ✅ Static assertion expected runtime to remove internal Approval render imports | ✅ Runtime uses only `../features/approval/index.js` for Approval-owned helpers | ✅ Card id/escaping, detail actions/datasets, queue dismiss dataset, and source link behavior covered | ✅ Runtime render function bodies left behaviorally unchanged |
| 3.3, 4.1, 4.2 | `tests/test_phase6_runtime_parity_and_boundaries.py`, `tests/test_phase7_runtime_ui_replay_and_rollback.py` | Pytest + focused Node checks through pytest | ✅ 36/36 baseline before changes | ✅ Existing sequencing guards retained before implementation | ✅ 37/37 focused parity checks passed after implementation | ✅ Success/failure sequencing remains covered by existing focused guards; new guard adds facade/dataset coverage without duplication | ✅ Reviewed focused guards; no assertion was removed or weakened |

## Test Summary

- **Safety net command**: `python -m pytest "tests/test_phase6_runtime_parity_and_boundaries.py" "tests/test_phase7_runtime_ui_replay_and_rollback.py"`
- **Safety net result before changes**: 36 passed.
- **RED command**: `python -m pytest "tests/test_phase6_runtime_parity_and_boundaries.py::test_approval_facade_exports_render_helpers_and_preserves_dom_contracts"`
- **RED result**: failed with `SyntaxError: ... does not provide an export named 'buildApprovalNewsCardMarkup'`.
- **GREEN command**: `python -m pytest "tests/test_phase6_runtime_parity_and_boundaries.py::test_approval_facade_exports_render_helpers_and_preserves_dom_contracts"`
- **GREEN result**: 1 passed.
- **Focused verification command**: `python -m pytest "tests/test_phase6_runtime_parity_and_boundaries.py" "tests/test_phase7_runtime_ui_replay_and_rollback.py"`
- **Focused verification result**: 37 passed.
- **Total tests written**: 1 focused pytest guard containing Node integration/static parity assertions.
- **Total tests passing**: 37 focused parity checks.
- **Layers used**: Integration/static parity via pytest + Node.
- **Approval tests**: 1 new facade/render contract guard; existing runtime replay and approval sequencing guards retained.
- **Pure functions created**: 0 — implementation used facade re-exports only.
- **Build run**: No.

## Deviations from Design

None — implementation matches the facade-first design. Optional helper extraction was intentionally skipped because re-exporting existing Approval-owned modules achieved the boundary normalization without extra churn.

## Issues Found

None in this resumed apply. The previous pre-existing guardrail blocker is resolved; focused parity now passes.

## Remaining Tasks

None.

## Workload / PR Boundary

- **Mode**: single PR work unit, auto execution, low review-budget risk.
- **Current work unit**: Normalize Approval facade and app-shell imports.
- **Boundary**: Approval facade exports, app-shell import normalization, and focused parity guard updates only.
- **Estimated review budget impact**: within the planned 160-280 changed-line forecast; no build or commit was performed.

## Next Step

Run `sdd-verify` for `approval-feature-normalization`.
