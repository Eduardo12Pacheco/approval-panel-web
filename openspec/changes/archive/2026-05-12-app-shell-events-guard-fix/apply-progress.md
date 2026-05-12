# Apply Progress: App Shell Events Guard Fix

**Change**: `app-shell-events-guard-fix`  
**Mode**: Strict TDD  
**Status**: complete

## Summary

Resolved the stale architecture guard target by updating the focused guard from the removed `js/modules/app-shell/events.js` seam to the current `js/modules/app-shell/events/` module structure. No runtime code was changed and no compatibility facade was added because the active contract already points at `events/index.js` plus focused event modules.

## Completed Tasks

- [x] 1.1 Update the architecture file-size guard to track the current app-shell events structure.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1 | `tests/test_phase6_runtime_parity_and_boundaries.py` | Pytest architecture guard + Node seam check | ❌ Existing focused guard failed on missing stale target `js/modules/app-shell/events.js` | ✅ Existing focused test reproduced the stale-target failure before edits | ✅ `python -m pytest "tests/test_phase6_runtime_parity_and_boundaries.py" -k "architecture_file_size_soft_cap_and_css_facade_guardrails"` passed | ✅ Guard now covers `events/index.js`, `scripts.js`, `audio.js`, `subtitles.js`, and `approval-dialog.js` | ✅ No runtime refactor needed; Node seam check stayed green |

## Test Summary

- **RED command**: `python -m pytest "tests/test_phase6_runtime_parity_and_boundaries.py" -k "architecture_file_size_soft_cap_and_css_facade_guardrails"` → 1 failed, missing `js/modules/app-shell/events.js`.
- **GREEN command**: `python -m pytest "tests/test_phase6_runtime_parity_and_boundaries.py" -k "architecture_file_size_soft_cap_and_css_facade_guardrails"` → 1 passed, 28 deselected.
- **Compatibility/seam command**: `node --test "js/modules/app-shell/__checks__/app-shell-seams.check.mjs"` → 9 passed.
- **Runtime files modified**: None.
- **Tests written/updated**: 1 focused guard updated.

## Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `tests/test_phase6_runtime_parity_and_boundaries.py` | Modified | Replaced stale `js/modules/app-shell/events.js` guard target with current `events/index.js` and focused event modules. |
| `openspec/changes/app-shell-events-guard-fix/apply-progress.md` | Created | Recorded Strict TDD evidence and focused verification results. |

## Deviations from Design

None — this is a guardrail correction only. Runtime behavior intentionally stayed unchanged.

## Issues Found

- The archived architecture-refactor progress listed `js/modules/app-shell/events.js` as created, but the current implementation has since moved event binding into `js/modules/app-shell/events/index.js` and focused event modules.

## Remaining Tasks

None for this fix.

## Workload / PR Boundary

- **Mode**: single small fix.
- **Current work unit**: architecture guard stale target correction.
- **Boundary**: test guard only; no runtime compatibility facade.
- **Estimated review budget impact**: very low.

## Next Step

Return to `approval-feature-normalization` apply and rerun its focused Strict TDD safety net.
