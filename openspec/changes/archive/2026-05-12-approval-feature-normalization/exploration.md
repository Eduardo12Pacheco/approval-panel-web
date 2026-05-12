## Exploration: approval-feature-normalization

### Current State
`features/approval/` is already partially split: `index.js` owns the public feature factory plus pure data helpers, while `cards.js`, `detail-dialog.js`, and `queue-monitor.js` own focused rendering helpers. The stable app-shell facade is `createApprovalFeature(...)` from `features/approval/index.js`; app-shell currently imports internals directly for card/detail/queue rendering, so the feature boundary is stable for commands but not yet normalized behind one approval facade.

Public exports today:
- `features/approval/index.js`: `resolveApprovalOrderingAvg`, `orderApprovalItemsByLowestAvg`, `resolveApprovalSourceLink`, `normalizeApprovalQueueItems`, `createOptimisticApprovedTopic`, `syncPendingItemsAfterApproval`, `createApprovalFeature`.
- `features/approval/cards.js`: `buildApprovalNewsCardMarkup`.
- `features/approval/detail-dialog.js`: `renderApprovalTopicDetail`.
- `features/approval/queue-monitor.js`: `renderQueueMonitor`, `buildQueueMonitorCard`, `pickFirstNonEmpty`, `normalizeQueueStatus`, `resolveQueueProgressPercent`, `isQueueTerminalStatus`, `shouldDisplayInQueueMonitor`, `getQueueStatusLabel`, `getQueueProgressLabel`, `getQueueTone`, `formatQueueAttempts`.

Behavioral contracts are protected by Python/Node checks for v2 endpoints, approval ordering, source link resolution, optimistic approval updates, script draft refresh after approval, manual queue refresh behavior, queue monitor dismissal, runtime replay, forbidden cross-feature imports, and app-shell compatibility comments.

### Affected Areas
- `01-Control-Panel/js/modules/features/approval/index.js` — mixed facade, data normalization, decision payload building, API orchestration, optimistic state mutation, and command methods; safest normalization target.
- `01-Control-Panel/js/modules/features/approval/cards.js` — focused news-card renderer; already small and safe to keep as an internal view module.
- `01-Control-Panel/js/modules/features/approval/detail-dialog.js` — topic detail renderer coupled to app-shell-provided `el`, `state`, `escapeHtml`, and `resolveApprovalSourceLink`.
- `01-Control-Panel/js/modules/features/approval/queue-monitor.js` — queue monitor renderer plus queue status/progress pure helpers; already cohesive and well tested.
- `01-Control-Panel/js/modules/app-shell/runtime.js` — imports approval internals directly and hosts approval list filtering/rendering, queue rendering, detail rendering, search refresh, and wrappers around feature commands.
- `01-Control-Panel/js/modules/app-shell/composition.js` — constructs `createApprovalFeature(...)` through dependency injection and wraps `refreshQueue` with `createSingleFlightRunner`.
- `01-Control-Panel/js/modules/app-shell/events/approval-dialog.js` — owns DOM event delegation for queue dismissal, search refresh, source open/delete/approve; behavior depends on renderer `data-action` and encoded dataset contracts.
- `01-Control-Panel/js/modules/__checks__/global/runtime-ui-parity-replay.js` and `01-Control-Panel/tests/test_phase6_runtime_parity_and_boundaries.py` / `test_phase7_runtime_ui_replay_and_rollback.py` — key parity checks that should be updated only to preserve or strengthen existing assertions.

### Approaches
1. **Facade-first internal extraction** — Keep `features/approval/index.js` as the only public feature entrypoint, move pure helpers into internal modules, and re-export the current named API from `index.js`.
   - Pros: Preserves public imports; reduces `index.js` responsibility; aligns with existing Scripts/Subtitles facade pattern and architecture spec.
   - Cons: App-shell direct imports from `cards.js`, `detail-dialog.js`, and `queue-monitor.js` remain unless migrated in the same slice.
   - Effort: Low/Medium

2. **Facade plus approval view barrel** — Re-export all approval render helpers from `features/approval/index.js` and update app-shell to import approval helpers from the stable facade only.
   - Pros: Normalizes imports behind one facade; makes future internals movable without app-shell churn; matches “stable facade” goal.
   - Cons: Requires careful test/static-token updates because existing checks reference direct paths and app-shell compatibility comments.
   - Effort: Medium

3. **Controller/view decomposition** — Split `createApprovalFeature(...)` into `controller/create-approval-feature.js`, `controller/payloads.js`, `controller/optimistic-updates.js`, `data/ordering.js`, `data/source-links.js`, and `render/*`, with `index.js` as a thin barrel.
   - Pros: Clearest long-term boundaries; isolates payload construction and optimistic mutation for focused testing.
   - Cons: Larger changed-file set; higher risk of missing a hidden static check or subtle order-of-callback behavior; should be split into reviewable work units if expanded.
   - Effort: Medium/High

### Recommendation
Use Approach 2 as the proposal baseline, implemented as a behavior-preserving normalization slice: make `features/approval/index.js` the stable facade for both current data/command exports and render helper exports, then extract `index.js` internals only where it reduces responsibility without changing public names. Safe extraction boundaries are pure data helpers (`ordering`, `source-links`, `queue-normalization`), payload building (`buildClusterSnapshot`, `buildDecisionPayload`), optimistic updates, and the existing render modules; avoid moving app-shell search refresh and event delegation unless a later SDD change explicitly targets app-shell ownership.

### Risks
- App-shell compatibility checks still inspect `js/modules/app-shell.js` comments and source tokens; import path changes may require token-preserving facade comments rather than behavior edits.
- `createApprovalFeature(...)` callback order is observable in runtime replay and approval tests; extracting commands must preserve render/toast/refresh sequencing exactly.
- Approval detail and queue renderers encode `data-action`, `data-url`, `data-id-noticia`, and `data-queue-id`; any normalization must preserve dataset names and encoding semantics.
- Cross-feature boundary checks forbid Approval importing Scripts/Audio/Subtitles/TTS directly; keep `refreshScriptDrafts` as injected callback, not an import.
- Current OpenSpec config for `01-Control-Panel` has specs but no `openspec/config.yaml`; downstream phases should rely on the existing architecture spec and project AGENTS rules.

### Ready for Proposal
Yes — tell the user this is a behavior-preserving facade normalization, not a redesign. The proposal should explicitly preserve public named exports, app-shell behavior, v2 endpoints, queue monitor/action dataset contracts, and existing checks; recommend focused verification through current Python/Node parity checks only, with no build.
