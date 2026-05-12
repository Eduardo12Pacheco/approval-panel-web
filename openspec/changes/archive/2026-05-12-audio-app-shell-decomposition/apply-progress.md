# Apply Progress: Audio App Shell Decomposition

## Change

`audio-app-shell-decomposition`

## Mode

Strict TDD

## Workload / PR Boundary

- Delivery strategy: `auto-chain`
- Chain strategy: `feature-branch-chain`
- Current work unit: Work Unit 4 — app-shell runtime decomposition
- Boundary: Completed app-shell runtime extraction behind stable `bootApp`, `bootCompatibilityShell`, and `__testHooks`; no commit, push, or build.
- Prior cohesive size note: WU2 created the planned focused Audio controller modules in one chained slice because splitting command/job/tracking/queue wiring further would make review harder and risk behavior drift.

## Completed Tasks

- [x] 1.1 Add failing Audio seam checks in `js/modules/__checks__/` for facade methods, endpoints, payload keys, selectors, copy, timers, and no app-shell imports from `features/audio/controller/*`.
- [x] 1.2 Extend `js/modules/__checks__/runtime-ui-parity-replay.js` with failing coverage for active-job token cleanup, SSE fallback to polling, queue actions, download, and dismiss.
- [x] 2.1 Create `js/modules/features/audio/controller/context.js`, `commands.js`, `jobs.js`, `download.js`; move command/job behavior without changing public method arguments.
- [x] 2.2 Create `tracking.js`, `status-stream.js`, `polling.js`; preserve stale-token protection and terminal cleanup ordering.
- [x] 2.3 Create `queue-renderer.js`; preserve `data-action` download/dismiss delegation and active-view queue sync.
- [x] 2.4 Reduce `js/modules/features/audio/controller.js` to wiring/facade and keep `js/modules/features/audio/index.js` app-shell-facing contract stable.
- [x] 2.5 Run Audio parity checks; document any cohesive size exception before app-shell work starts.
- [x] 3.1 Add failing app-shell checks for `bootApp`, `bootCompatibilityShell`, `__testHooks`, boot order, auth/app shell toggling, settings hydration, and initial refresh.
- [x] 3.2 Extend replay checks for `setView()` side effects: nav/view activation, approval monitor, Audio tracking/queue sync, Scripts video refresh, Subtitles refresh/render, Radar stop/refresh.
- [x] 3.3 Add failing Script → Audio replay for text, word count, preset `change`, navigation to Audio, and delegated generation.
- [x] 4.1 Create `js/modules/app-shell/composition.js`, `lifecycle.js`, `state.js`, `settings.js`, `services.js`; keep `runtime.js` as composition bootstrap.
- [x] 4.2 Move event binding into `js/modules/app-shell/events/{index.js,scripts.js,audio.js,subtitles.js,approval-dialog.js}`.
- [x] 4.3 Move navigation/render side effects into `js/modules/app-shell/views/{navigation.js,approval-search.js,renderers.js}` and related monitor/callback modules.
- [x] 4.4 Create `js/modules/app-shell/voice/script-to-audio.js`; preserve preset mutation, dispatched change event, route order, and stable Audio command call.
- [x] 4.5 Run full parity checks for both Audio and app-shell; no build.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1 | `01-Control-Panel/js/modules/__checks__/audio-seams.check.mjs` | Static/contract | ⚠️ Late: existing `app-shell-seams.check.mjs` later passed 4/4 | ✅ Failed before facade/app-shell binding updates (`getLatestTrackedJobId` missing, app-shell used controller directly) | ✅ `node --test __checks__/audio-seams.check.mjs` passed 3/3 | ✅ 3 contract groups | ✅ Minimal facade/runtime wiring only |
| 1.2 | `01-Control-Panel/js/modules/__checks__/runtime-ui-parity-replay.js` | Unit-like replay | ⚠️ Full replay shows unrelated `composition/assets` failure; Audio scenario isolated | ✅ Failed before facade update (`feature.getLatestTrackedJobId is not a function`) | ✅ `runAudioParityReplay()` returned `{ "ok": true }` | ✅ Covers facade, queue, download/dismiss, stale token, SSE fallback, terminal cleanup, queue sync | ✅ Exported focused Audio replay helper |
| 2.1-2.4 | `01-Control-Panel/js/modules/__checks__/audio-seams.check.mjs` | Static/contract + approval replay | ✅ Audio seam 3/3, focused Audio replay `{ "ok": true }`, app-shell seam 4/4 | ✅ Extraction seam failed on missing `controller/context.js` and planned controller modules | ✅ Audio seam passed 4/4 | ✅ Audio parity replay passed `{ "ok": true }` | ✅ Reduced `controller.js` to wiring/facade |
| 2.5 | `01-Control-Panel/js/modules/__checks__/audio-seams.check.mjs`; `runtime-ui-parity-replay.js`; `app-shell-seams.check.mjs` | Static/contract + unit-like replay | ✅ Same WU2 baseline | ✅ WU2 RED seam failed before modules existed | ✅ Audio seam 4/4, focused replay `{ "ok": true }`, app-shell seam 4/4 | ✅ Full replay still passes Audio and fails only known `composition/assets` drift | ✅ Documented WU2 cohesive size note |
| 3.1 | `01-Control-Panel/js/modules/__checks__/app-shell-seams.check.mjs`; `runtime-ui-parity-replay.js` | Static/contract + source replay | ✅ App-shell seam 4/4, Audio seam 4/4, focused Audio replay `{ "ok": true }` | ✅ Failed first because `runAppShellLifecycleReplay` was not exported | ✅ App-shell seam passed 7/7 | ✅ Lifecycle replay checks boot exports/order/auth/settings/initial refresh | ✅ Harness helpers only |
| 3.2 | `01-Control-Panel/js/modules/__checks__/app-shell-seams.check.mjs`; `runtime-ui-parity-replay.js` | Static/contract + source replay | ✅ Same WU3 baseline | ✅ Failed first because `runAppShellSetViewReplay` was not exported | ✅ App-shell seam passed 7/7 | ✅ Replay checks nav/view activation and feature lifecycle side effects | ✅ Parser fix only |
| 3.3 | `01-Control-Panel/js/modules/__checks__/app-shell-seams.check.mjs`; `runtime-ui-parity-replay.js` | Static/contract + source replay | ✅ Same WU3 baseline | ✅ Failed first because `runScriptToAudioVoiceReplay` was not exported | ✅ App-shell seam passed 7/7 | ✅ Replay checks ready-state guards, state sync, navigation, delegated generation | ✅ Guardrails only |
| 4.1-4.4 | `01-Control-Panel/js/modules/__checks__/app-shell-seams.check.mjs`; `runtime-ui-parity-replay.js`; `audio-seams.check.mjs` | Static/contract + source replay | ✅ Baseline: app-shell seam 7/7, Audio seam 4/4, focused lifecycle/setView/voice/audio replay all `{ "ok": true }` | ✅ New app-shell seam tests failed first because focused shell modules and runtime delegation did not exist | ✅ App-shell seam passed 9/9 after extracting composition, lifecycle, events, views/navigation/search/renderers, and voice modules | ✅ Focused replay passed lifecycle, setView, voice, and Audio; Audio seam updated to scan nested app-shell seams and passed 4/4 | ✅ Runtime delegates public lifecycle, events, navigation, approval search, render registry, and Script → Audio voice flow |
| 4.5 | Same as above plus protected replay | Static/contract + unit-like replay | ✅ Same WU4 baseline | ✅ WU4 RED seam failed before extraction modules existed | ✅ App-shell seam 9/9; Audio seam 4/4; focused replay all `{ "ok": true }`; `node --check js/modules/app-shell/runtime.js` passed | ✅ Protected replay passed auth/session, settings, approval, scripts, audio, subtitles, app-shell lifecycle, setView, and voice; failed only known unrelated `composition/assets` drift | ✅ No build; documented unrelated drift |

## Test Summary

- **Total tests/checks written**: 2 new WU4 app-shell seam subtests; existing WU3 replay checks updated to read extracted lifecycle, navigation, and voice modules; Audio shell-boundary check updated to scan nested app-shell modules.
- **Total tests passing**: App-shell seam check 9/9; Audio seam check 4/4; focused lifecycle/setView/voice/audio replay all `{ "ok": true }`; runtime syntax check passed.
- **Layers used**: Static/contract checks and unit-like source replay.
- **Approval tests**: WU3 source replay continues to protect current boot, `setView()`, and Script → Audio behavior after WU4 extraction.
- **Pure functions created**: Focused factory seams for lifecycle, navigation, approval search, events, composition, render registry, and Script → Audio voice flow.

## Commands Run

- `node --test "js/modules/__checks__/app-shell-seams.check.mjs"` → baseline passed 7/7 before WU4 changes.
- `node --test "js/modules/__checks__/audio-seams.check.mjs"` → baseline passed 4/4 before WU4 changes.
- Focused replay baseline via `node -e import('./js/modules/__checks__/runtime-ui-parity-replay.js')...` → lifecycle/setView/voice/audio all `{ "ok": true }`.
- `node --test "js/modules/__checks__/app-shell-seams.check.mjs"` → RED failed after adding WU4 seam tests because focused shell modules/runtime delegation did not exist.
- `node --test "js/modules/__checks__/app-shell-seams.check.mjs"` → passed 9/9 after WU4 extraction.
- Focused replay via `node -e import('./js/modules/__checks__/runtime-ui-parity-replay.js')...` → lifecycle/setView/voice/audio all `{ "ok": true }`.
- `node --check "js/modules/app-shell/runtime.js"` → passed.
- `node --test "js/modules/__checks__/audio-seams.check.mjs"` → initially failed because the Audio boundary check only scanned top-level app-shell modules after composition moved Audio wiring; passed 4/4 after the check recursively scanned nested app-shell modules.
- Protected replay via `node -e import('./js/modules/__checks__/runtime-ui-parity-replay.js')...runProtectedFlowsReplay()` → failed only on known unrelated `composition/assets` (`dust-2 asset drift`); all WU4 app-shell and Audio scenarios passed.

## Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `01-Control-Panel/js/modules/__checks__/app-shell-seams.check.mjs` | Modified | Added WU4 RED seam tests for focused app-shell modules and runtime delegation. |
| `01-Control-Panel/js/modules/__checks__/audio-seams.check.mjs` | Modified | Recursively scans nested app-shell modules so Audio facade guardrails follow extracted composition/navigation seams. |
| `01-Control-Panel/js/modules/__checks__/runtime-ui-parity-replay.js` | Modified | Updated lifecycle, `setView()`, and Script → Audio replay checks to read extracted modules. |
| `01-Control-Panel/js/modules/app-shell/runtime.js` | Modified | Delegates composition, lifecycle, events, navigation, approval search, render registry, and voice flow to focused seams while preserving public exports/hooks. |
| `01-Control-Panel/js/modules/app-shell/composition.js` | Created | Owns API, state, selector, feature/controller, Audio runtime, subtitles/radar, custom dropdown, and single-flight construction. |
| `01-Control-Panel/js/modules/app-shell/lifecycle.js` | Created | Owns boot/compatibility shell ordering and auth/app-shell toggle behavior. |
| `01-Control-Panel/js/modules/app-shell/events/{index.js,scripts.js,audio.js,subtitles.js,approval-dialog.js}` | Created | Moves core shell, script, audio, subtitles, and approval dialog event binding behind focused binders. |
| `01-Control-Panel/js/modules/app-shell/views/{navigation.js,approval-search.js,renderers.js}` | Created | Moves `setView()` side effects and approval search refresh state; provides render registry seam. |
| `01-Control-Panel/js/modules/app-shell/voice/script-to-audio.js` | Created | Moves Script → Audio voice guards, preset sync, navigation, and delegated generation payload. |
| `01-Control-Panel/openspec/changes/audio-app-shell-decomposition/tasks.md` | Modified | Marked WU4 tasks complete. |
| `01-Control-Panel/openspec/changes/audio-app-shell-decomposition/apply-progress.md` | Modified | Persisted combined WU1-WU4 apply-progress. |

## Deviations from Design

- `js/modules/app-shell/services.js`, `state.js`, and `settings.js` already existed before WU4; WU4 reused and wired them rather than recreating duplicate modules.
- `runtime.js` still retains local render callback functions because they are tightly coupled to feature render contracts; WU4 added a render registry seam and moved navigation/search side effects, but did not force a risky full renderer extraction beyond the current parity guardrails.

## Issues Found

- `runProtectedFlowsReplay()` still fails on unrelated `composition/assets` (`dust-2 asset drift`). Audio and all app-shell WU4 scenarios pass; this was not fixed because the prompt explicitly scoped out unrelated dust-2 drift.
- Existing `01-Control-Panel` working tree contains many unrelated modified/untracked files from prior work. WU4 touched only the files listed above.

## Remaining Tasks

- None for `audio-app-shell-decomposition` apply scope. Ready for SDD verify, with the known unrelated `composition/assets` replay drift carried forward.

## Status

15/15 tasks complete. Ready for verify.
