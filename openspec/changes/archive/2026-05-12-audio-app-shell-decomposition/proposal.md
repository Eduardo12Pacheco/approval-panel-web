# Proposal: Audio App Shell Decomposition

## Intent

Preserve current Control Panel behavior while splitting two orchestration hotspots into reviewable, sequential work units: Audio controller first, then app-shell runtime. The outcome is easier navigation and safer future maintenance, not a feature redesign.

## Scope

### In Scope
- Decompose `features/audio/controller.js` behind the existing Audio facade.
- Then decompose `app-shell/runtime.js` around the cleaner Audio contract.
- Preserve DOM IDs, `data-action` values, endpoint paths, payload keys, visible copy, timers, and public facades.
- Update checks to prove parity and document any cohesive size exceptions.

### Out of Scope
- Framework rewrite, class hierarchy rewrite, or feature redesign.
- Radar/Subtitles/Video Projects behavior changes except app-shell wiring needed for parity.
- Build, commit, push, or endpoint/client contract changes.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `control-panel-architecture-refactor`: add Audio controller and app-shell runtime decomposition guardrails under the existing behavior-preserving refactor capability.

## Approach

1. **Audio first:** keep `features/audio/index.js` and app-shell-facing methods stable while extracting commands, job state, tracking, SSE/polling, queue sync, and rendering into focused modules under `features/audio/controller/`.
2. **App-shell second:** keep `bootApp`, `bootCompatibilityShell`, and `__testHooks` stable while moving composition, lifecycle, view side effects, event binding, render callbacks, and Script → Audio voice flow into focused app-shell modules.
3. Treat line budgets as review guidance; document cohesive exceptions instead of forcing artificial splits.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `js/modules/features/audio/controller.js` | Modified | Becomes small facade/wiring entry. |
| `js/modules/features/audio/controller/` | New | Focused Audio internals. |
| `js/modules/features/audio/index.js` | Modified | Keeps public feature contract stable. |
| `js/modules/app-shell/runtime.js` | Modified | Becomes composition bootstrap after Audio work. |
| `js/modules/app-shell/` | Modified | Existing seams receive real shell behavior. |
| `js/modules/__checks__/` | Modified | Parity and boundary checks evolve with structure. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Audio SSE/polling fallback drift | Med | Preserve active-job token semantics and terminal cleanup checks. |
| Hidden `setView()` side effects missed | Med | Decompose shell only after Audio and keep central lifecycle mapping. |
| Script → Audio voice flow stale UI state | Med | Preserve preset change dispatch, text/word-count mutation, navigation order. |

## Rollback Plan

Revert by work unit: first restore app-shell runtime files if shell parity fails; restore Audio controller files if Audio parity fails. Keep compatibility facades unchanged so import rollback is localized.

## Dependencies

- Existing `control-panel-architecture-refactor` spec and parity checks.
- Exploration artifact `sdd/audio-app-shell-decomposition/explore`.

## Success Criteria

- [ ] Audio behavior matches current generation, tracking, queue, download, and dismissal flows.
- [ ] App-shell boot, session, navigation, refresh, and Script → Audio flows remain equivalent.
- [ ] Facades and test hooks stay stable until checks prove intentional migration.
