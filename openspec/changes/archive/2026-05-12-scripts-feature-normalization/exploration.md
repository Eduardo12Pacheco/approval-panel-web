## Exploration: scripts-feature-normalization

### Current State
`js/modules/features/scripts/index.js` is the current public Scripts entry point and a mixed-responsibility module. It exports pure public helpers (`getScriptPublishStageMeta`, `normalizeScriptDraftRows`, `buildScriptSelectionCardMarkup`, `resolveScriptListKey`, `resolveScriptTitle`, `isScriptProcessed`, `resolveScriptIdentity`, `scriptPublishJobMatchesRow`, `resolveScriptPublishCardState`, `buildScriptDocxFilename`) plus the stateful `createScriptsFeature(...)` factory.

Behavior today spans draft loading, selection, save/publish/download commands, async publish-job polling, processed-script dismissal, card markup, and identity/title/status normalization. The facade is imported directly by app-shell composition, app-shell events, script-to-audio voice flow, Scripts rendering, and global parity checks, so any normalization must keep `index.js` as a compatibility facade and preserve all named exports.

### Affected Areas
- `js/modules/features/scripts/index.js` — main refactor target; should become a small stable facade while internals move behind focused modules.
- `js/modules/features/scripts/render.js` — imports card/status/title helpers from the facade and owns DOM rendering plus card event binding.
- `js/modules/app-shell/composition.js` — constructs `createScriptsFeature(...)` with approval API, shell state/store, selectors, callbacks, and download helper.
- `js/modules/app-shell/events/scripts.js` — imports `resolveScriptTitle` and binds close/edit/original/publish/voice/download/video-project refresh events.
- `js/modules/app-shell/voice/script-to-audio.js` — imports `isScriptProcessed` and `resolveScriptTitle`; protects processed/dirty/pronunciation readiness and Audio handoff ordering.
- `js/modules/app-shell/runtime.js` — still imports Scripts facade/render helpers and contains legacy duplicate script/voice functions; public behavior must not drift while this file keeps compatibility code.
- `js/modules/app-shell/state.js` — defines Scripts-owned state fields: `scriptDrafts`, `selectedScript`, `scriptEditorDirty`, `scriptPublishJob`, polling flags/timer, dismissal set, and command loading flags.
- `js/modules/core/http/approval-api.js` — documents protected script endpoints in `APPROVAL_PARITY_ENDPOINTS`.
- `js/modules/__checks__/global/runtime-ui-parity-replay.js` — currently checks `createScriptsFeature` refresh/open/save/publish replay and Script→Audio source-order tokens.
- `js/modules/__checks__/global/rollback-scope-validator.js` — P2 rollback scope includes `js/modules/features/scripts/` and `js/modules/core/http/approval-api.js`.

### Approaches
1. **Facade plus focused internal modules** — Keep `features/scripts/index.js` as the only public import surface and re-export/wire internals such as `identity.js`, `publish-status.js`, `cards.js`, and `controller.js` or `commands.js`.
   - Pros: Preserves callers, matches the existing Audio/Subtitles decomposition pattern, and makes helper/command/polling responsibilities easier to test separately.
   - Cons: Requires careful export inventory and relative-import updates inside `render.js`; circular imports are possible if card helpers depend back on the facade.
   - Effort: Medium

2. **Controller-only extraction with helpers left in facade** — Move only `createScriptsFeature(...)` internals into a controller module and leave pure helpers in `index.js`.
   - Pros: Smaller diff and lower immediate risk; most imports stay unchanged.
   - Cons: `index.js` remains a mixed helper/markup facade and does not fully normalize the public boundary; future slices still need another split.
   - Effort: Low

3. **Deep domain split plus caller migration** — Move helpers to internal modules and update app-shell/render/voice imports to consume new paths directly.
   - Pros: Maximizes local explicitness.
   - Cons: Violates the stable facade goal, increases coupling from app-shell into Scripts internals, and conflicts with current spec guardrails that compatibility entry points stay stable.
   - Effort: High

### Recommendation
Use **Facade plus focused internal modules**. Keep every current named export available from `features/scripts/index.js`, but make the facade import/re-export stable pure helpers and delegate `createScriptsFeature(...)` to a focused controller/wiring module. Start by extracting pure, dependency-light helpers (`identity/title/status/docx`) before moving publish polling and commands; keep rendering imports pointed at the facade unless a dedicated follow-up intentionally migrates them.

Proposal/spec should explicitly require parity for: endpoint strings and payload keys, publish polling interval and terminal cleanup, `scriptPublishJob` card lock/error labels, processed dismissal behavior and `data-action="dismiss-processed-script"`, editor dirty preservation, DOCX filename sanitization, Script→Audio readiness/copy/order, and all current named exports.

### Risks
- The publish polling closure currently calls `refreshScriptDrafts(...)` and then updates selected state/rendering; extracting commands without preserving closure order can change async completion behavior.
- `buildScriptSelectionCardMarkup(...)` depends on `escapeHtmlCore` plus status/identity helpers; moving it into an internal module can create circular imports if the facade is used internally.
- Runtime still has legacy duplicate script and Script→Audio functions; checks rely on source tokens, so implementation must avoid breaking protected token searches while not reviving legacy paths.
- Existing `replayScriptsScenario()` is useful but shallow: it does not cover async publish job polling, processed dismissal, failed jobs, DOCX download, or publish-card lock state.
- The requested OpenSpec artifact path said `explore.md`, but the loaded SDD/OpenSpec convention allows only `exploration.md` for this phase.

### Ready for Proposal
Yes — tell the user this should be a behavior-preserving Scripts facade normalization, scoped to `js/modules/features/scripts/` plus only necessary check updates, with no app-shell public import migration and no endpoint/copy/payload changes.
