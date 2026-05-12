# Design: Scripts Feature Normalization

## Technical Approach

Normalize Scripts as a behavior-preserving facade extraction. `js/modules/features/scripts/index.js` remains the only public compatibility surface for app-shell, render, voice, events, and checks; internals move into focused sibling modules that import each other directly, never back through the facade.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Public boundary | Keep every current named export in `features/scripts/index.js`; facade imports/re-exports internals and delegates `createScriptsFeature(...)`. | Migrate callers to internals; keep monolith. | Matches stable-facade guardrail and avoids app-shell coupling to implementation seams. |
| Extraction order | Extract pure domain/data helpers first, then card markup, then controller/polling/commands. | Move controller first; deep split in one pass. | Pure helpers are low-risk dependencies for render, controller, and voice; this reduces circular-import pressure. |
| Circular import rule | Internal modules import sibling helpers directly; only external callers import `index.js`. `render.js` may keep facade imports unless implementation needs sibling imports to break cycles. | Let internals import the facade. | `render.js` currently imports helpers from `./index.js`; card/controller extraction would cycle if internals depend on facade. |
| Checks | Preserve global parity checks and add focused export/source-order assertions only if layout changes require them. | Rewrite checks around internals. | This is a no-behavior-change slice; checks should protect public contracts, not bless private paths. |

## Data Flow

```text
External callers -> features/scripts/index.js facade
  -> domain.js        identity/title/processed/docx helpers
  -> publish-status.js stage metadata + card publish state
  -> cards.js         selection-card markup
  -> controller.js    createScriptsFeature wiring
       -> client.js   endpoint wrappers / payload helpers
       -> polling.js  publish job polling and terminal cleanup
       -> commands.js refresh/open/save/publish/download/dismiss
```

## File Changes

| File | Action | Description |
|---|---|---|
| `js/modules/features/scripts/index.js` | Modify | Small stable facade exporting existing helper names and `createScriptsFeature`. |
| `js/modules/features/scripts/domain.js` | Create | `normalizeScriptDraftRows`, identity, title, processed-state, DOCX filename helpers. |
| `js/modules/features/scripts/publish-status.js` | Create | Stage order/labels, stage meta, publish-job row matching, card state. |
| `js/modules/features/scripts/cards.js` | Create | `buildScriptSelectionCardMarkup` with escaping and dismiss action unchanged. |
| `js/modules/features/scripts/client.js` | Create | Named endpoint/payload helper seam for drafts, save, publish, status, DOCX download. |
| `js/modules/features/scripts/controller.js` | Create | Factory wiring and public controller methods. |
| `js/modules/features/scripts/polling.js` | Create | Publish polling interval, in-flight guard, terminal cleanup. |
| `js/modules/features/scripts/render.js` | Modify | Keep public imports or switch only to siblings needed to avoid cycles; preserve DOM/copy/events. |
| `js/modules/__checks__/global/runtime-ui-parity-replay.js` | Modify if needed | Add/adjust export inventory, publish polling, processed dismissal, DOCX, Script → Audio order checks. |
| `js/modules/__checks__/global/rollback-scope-validator.js` | Modify if needed | Keep Scripts rollback scope covering `js/modules/features/scripts/`. |

## Interfaces / Contracts

`index.js` must continue exporting: `getScriptPublishStageMeta`, `normalizeScriptDraftRows`, `buildScriptSelectionCardMarkup`, `resolveScriptListKey`, `resolveScriptTitle`, `isScriptProcessed`, `resolveScriptIdentity`, `scriptPublishJobMatchesRow`, `resolveScriptPublishCardState`, `buildScriptDocxFilename`, `createScriptsFeature`.

`createScriptsFeature({ api, store, ui, selectors, callbacks, helpers })` keeps the same arguments and return methods: `buildScriptSelectionCardMarkup`, `refreshScriptDrafts`, `openScriptEditor`, `saveSelectedScript`, `publishSelectedScript`, `downloadSelectedScriptDocx`, `dismissProcessedScript`.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Static parity | Named exports, forbidden internal imports from app-shell, endpoint strings, poll interval. | Extend existing global checks only as needed. |
| Runtime replay | Refresh/open/save/publish, async job completion order, failed job lock/error state, processed dismissal. | Expand `runtime-ui-parity-replay.js` scenarios without changing public command paths. |
| Integration parity | Script → Audio readiness/copy/navigation/generation order and title tokens. | Preserve existing source-order assertions and add coverage only if extraction moves tokens. |
| Rollback | Scope includes all Scripts internals and global check edits. | Validate rollback-scope guard after file additions. |

## Migration / Rollout

No data migration required. Roll out as one refactor slice: add/strengthen parity checks, extract helpers, extract controller/polling/commands, then keep facade stable. Rollback is reverting `js/modules/features/scripts/` plus any changed global check files.

## Open Questions

None.
