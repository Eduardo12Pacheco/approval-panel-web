# Proposal: Scripts Feature Normalization

## Intent

Normalize `js/modules/features/scripts/index.js` into a small stable facade while preserving the complete current Scripts runtime contract. The goal is maintainability: split mixed helper, card, command, and polling responsibilities behind focused internals without changing callers or behavior.

## Scope

### In Scope
- Keep every current named export from `features/scripts/index.js` available.
- Move Scripts internals behind focused modules while keeping `index.js` as the public compatibility facade.
- Preserve DOM behavior, text, events, API endpoint strings, payload keys, polling cadence/cleanup, DOCX naming, processed dismissal, and Script → Audio handoff order.
- Update only necessary parity/check references if file layout changes.

### Out of Scope
- No production behavior changes, redesigns, new UX, endpoint changes, payload changes, or copy changes.
- No app-shell migration to direct Scripts internal imports.
- No Radar, Audio, Subtitles, Approval, or Video Projects behavior work beyond existing integration preservation.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
None — this is a behavior-preserving refactor covered by existing `control-panel-architecture-refactor` guardrails.

## Approach

Use the exploration recommendation: facade plus focused internal modules. Extract pure dependency-light helpers first, then delegate `createScriptsFeature(...)` controller/command/polling behavior behind the facade. Internal modules MUST NOT import back through the facade in ways that create circular dependencies.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `js/modules/features/scripts/index.js` | Modified | Becomes stable import/re-export and factory facade. |
| `js/modules/features/scripts/` | Modified | Gains focused internal modules for helpers/controller responsibilities. |
| `js/modules/features/scripts/render.js` | Modified | Keeps behavior while imports continue through stable public surface unless unavoidable internally. |
| `js/modules/__checks__/global/runtime-ui-parity-replay.js` | Modified | Only if needed to preserve Scripts and Script → Audio parity coverage. |
| `js/modules/__checks__/global/rollback-scope-validator.js` | Modified | Only if needed to keep rollback scope accurate. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Poll completion order changes | Med | Preserve refresh/select/render cleanup sequence exactly. |
| Circular helper imports | Med | Keep internals importing sibling helpers directly, facade only for external callers. |
| Shallow checks miss regressions | Med | Inventory exports, payloads, timers, copy, events, and Script → Audio source-order tokens. |

## Rollback Plan

Revert the Scripts feature folder and any changed global check files for this slice. Since public behavior and data contracts are unchanged, rollback should restore the prior monolithic facade without migrations.

## Dependencies

- Existing `control-panel-architecture-refactor` OpenSpec guardrails.
- Exploration artifact `sdd/scripts-feature-normalization/explore`.

## Success Criteria

- [ ] `features/scripts/index.js` still exposes all existing named exports.
- [ ] Scripts UI, commands, polling, payloads, copy, events, and DOCX filenames remain equivalent.
- [ ] Script → Audio readiness/copy/navigation/generation order remains equivalent.
- [ ] No app-shell caller imports Scripts internal modules directly.
