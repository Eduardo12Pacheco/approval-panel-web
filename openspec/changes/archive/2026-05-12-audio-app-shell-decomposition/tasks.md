# Tasks: Audio App Shell Decomposition

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 700-1,000 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 Audio checks → PR 2 Audio extraction → PR 3 app-shell checks/extraction |
| Delivery strategy | auto-chain |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

Line budgets are review guidance, not dogma; document cohesive exceptions instead of splitting a single responsibility artificially.

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Lock Audio parity contracts | PR 1 | Base = feature/tracker branch; RED checks only, no behavior move. |
| 2 | Extract Audio controller internals | PR 2 | Base = PR 1 branch; GREEN/REFACTOR Audio behind stable facade. |
| 3 | Extract app-shell runtime | PR 3 | Base = PR 2 branch; shell parity after Audio checkpoint passes. |

## Phase 1: Audio RED Parity Guardrails

- [x] 1.1 Add failing Audio seam checks in `js/modules/__checks__/` for facade methods, endpoints, payload keys, selectors, copy, timers, and no app-shell imports from `features/audio/controller/*`.
- [x] 1.2 Extend `js/modules/__checks__/runtime-ui-parity-replay.js` with failing coverage for active-job token cleanup, SSE fallback to polling, queue actions, download, and dismiss.

## Phase 2: Audio GREEN/REFACTOR Extraction

- [x] 2.1 Create `js/modules/features/audio/controller/context.js`, `commands.js`, `jobs.js`, `download.js`; move command/job behavior without changing public method arguments.
- [x] 2.2 Create `tracking.js`, `status-stream.js`, `polling.js`; preserve stale-token protection and terminal cleanup ordering.
- [x] 2.3 Create `queue-renderer.js`; preserve `data-action` download/dismiss delegation and active-view queue sync.
- [x] 2.4 Reduce `js/modules/features/audio/controller.js` to wiring/facade and keep `js/modules/features/audio/index.js` app-shell-facing contract stable.
- [x] 2.5 Run Audio parity checks; document any cohesive size exception before app-shell work starts.

## Phase 3: App-Shell RED Parity Guardrails

- [x] 3.1 Add failing app-shell checks for `bootApp`, `bootCompatibilityShell`, `__testHooks`, boot order, auth/app shell toggling, settings hydration, and initial refresh.
- [x] 3.2 Extend replay checks for `setView()` side effects: nav/view activation, approval monitor, Audio tracking/queue sync, Scripts video refresh, Subtitles refresh/render, Radar stop/refresh.
- [x] 3.3 Add failing Script → Audio replay for text, word count, preset `change`, navigation to Audio, and delegated generation.

## Phase 4: App-Shell GREEN/REFACTOR Extraction

- [x] 4.1 Create `js/modules/app-shell/composition.js`, `lifecycle.js`, `state.js`, `settings.js`, `services.js`; keep `runtime.js` as composition bootstrap.
- [x] 4.2 Move event binding into `js/modules/app-shell/events/{index.js,scripts.js,audio.js,subtitles.js,approval-dialog.js}`.
- [x] 4.3 Move navigation/render side effects into `js/modules/app-shell/views/{navigation.js,approval-search.js,renderers.js}` and related monitor/callback modules.
- [x] 4.4 Create `js/modules/app-shell/voice/script-to-audio.js`; preserve preset mutation, dispatched change event, route order, and stable Audio command call.
- [x] 4.5 Run full parity checks for both Audio and app-shell; no build.
