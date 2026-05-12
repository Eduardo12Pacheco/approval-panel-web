# Tasks: Subtitles Controller Decomposition

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 650-950 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 context/checks → PR 2 renderer/preview → PR 3 table/session/render commands → PR 4 facade cleanup |
| Delivery strategy | auto-chain |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Add parity seam checks and shared context | PR 1 | Base = feature/tracker branch; tests first. |
| 2 | Extract workflow rendering and preview player | PR 2 | Base = PR 1 branch; preserve copy/selectors/object URLs. |
| 3 | Extract table, session, and render commands | PR 3 | Base = PR 2 branch; preserve polling/editing payload parity. |
| 4 | Shrink facade and document cohesive exceptions | PR 4 | Base = PR 3 branch; final contract verification. |

## Phase 1: Parity Harness / RED

- [x] 1.1 Add failing seam coverage in `01-Control-Panel/js/modules/__checks__/subtitles-controller-seams.check.mjs` for facade export, expected support files, and syntax imports.
- [x] 1.2 Update `01-Control-Panel/tests/test_subtitle2_parity_polish.py` source aggregation to expect new controller support modules while keeping existing token assertions strict.
- [x] 1.3 Add contract assertions for current `createSubtitlesController(...)` return keys used by `01-Control-Panel/js/modules/app-shell/runtime.js`.

## Phase 2: Shared Context / GREEN

- [x] 2.1 Create `01-Control-Panel/js/modules/features/subtitles/controller/context.js` to build explicit `state`, `el`, `api`, `ui`, helper, timer, URL/window, and render callback adapters.
- [x] 2.2 Refactor `01-Control-Panel/js/modules/features/subtitles/controller.js` to use the context without changing exports, arguments, selectors, copy, endpoints, payload keys, or phase names.
- [x] 2.3 Run the Phase 1 checks and fix only parity failures introduced by context wiring.

## Phase 3: Behavior Seams / RED-GREEN

- [x] 3.1 Extract workflow DOM rendering into `controller/render-workflow.js`; verify health/history/phases/meta/cards/table/buttons parity.
- [x] 3.2 Extract preview lifecycle into `controller/preview-player.js`; verify object URL revoke/create, source assignment, seek timing, drag cleanup, and latest-intent behavior.
- [x] 3.3 Extract row editing into `controller/table-editor.js`; verify row identity, timing validation, error copy, selection, ordering, and drag-drop behavior.
- [x] 3.4 Extract remote orchestration into `controller/session.js`; verify upload, hydrate, history rename/delete, polling interval, terminal cleanup, stale callback guards, and phase transitions.
- [x] 3.5 Extract save/render/download flow into `controller/render-commands.js`; verify segment payloads, render polling handoff, and download behavior.

## Phase 4: Facade Cleanup / REFACTOR

- [x] 4.1 Shrink `controller.js` to facade/collaborator wiring while preserving every public method name and app-shell binding.
- [x] 4.2 Document any cohesive 300-500 LOC exception inline; file-size budgets guide natural seams, not mechanical splitting.
- [x] 4.3 Remove duplicated helper logic and keep support modules private to `features/subtitles/controller/`.

## Phase 5: Verification

- [x] 5.1 Run `node --test 01-Control-Panel/js/modules/__checks__/subtitles-controller-seams.check.mjs`.
- [x] 5.2 Run the relevant pytest parity target for `01-Control-Panel/tests/test_subtitle2_parity_polish.py`.
- [x] 5.3 Compare implementation against all spec scenarios: facade stability, polling, terminal cleanup, preview URL/seek, table editing/drag-drop, and decomposition guardrail.
