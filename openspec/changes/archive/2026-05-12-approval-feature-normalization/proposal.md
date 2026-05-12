# Proposal: Approval Feature Normalization

## Summary
Normalize Approval behind `01-Control-Panel/js/modules/features/approval/index.js` as the stable facade while preserving current behavior, named exports, render sequencing, callback injection, v2 endpoints, DOM `data-action`/dataset contracts, and app-shell user flows.

## Problem
Approval is partly modularized, but `app-shell/runtime.js` still imports view helpers directly from `features/approval/cards.js`, `detail-dialog.js`, and `queue-monitor.js`. That makes the feature boundary leaky: future internal moves can force app-shell churn even when behavior does not change.

## Proposed Change
- Re-export Approval render helpers from `features/approval/index.js` without removing the existing named exports.
- Move only safe internal helpers from `index.js` when useful: ordering/source-link normalization, queue payload normalization, decision payload construction, and optimistic update helpers.
- Update app-shell imports to use the Approval facade only for Approval-owned helpers.
- Preserve event delegation in `app-shell/events/approval-dialog.js` and keep `refreshScriptDrafts` as an injected callback.
- Strengthen existing checks only where import-path assertions need to follow the facade.

## Non-Goals
- No redesign of Approval UX, queue monitor behavior, search refresh, Scripts handoff, endpoints, payload semantics, copy, selectors, or CSS.
- No build step.
- No direct cross-feature import from Approval into Scripts/Audio/Subtitles/TTS.

## Acceptance Scenarios
- GIVEN existing callers import any current named export from `features/approval/index.js`, WHEN the change is applied, THEN those exports still resolve with equivalent behavior.
- GIVEN Approval render helpers are used by app-shell, WHEN app-shell renders cards, detail, or queue monitor, THEN markup, `data-action`, `data-url`, `data-id-noticia`, `data-index`, and `data-queue-id` contracts remain unchanged.
- GIVEN a source is approved, WHEN callbacks/toasts/render refreshes run, THEN optimistic state, toast, `refreshPending`, `refreshQueue`, and injected `refreshScriptDrafts` sequencing remains equivalent.

## Rollback Plan
Revert the facade export/import changes and any helper extraction files in this change folder's implementation slice. Because behavior and data contracts are preserved, rollback should not require data migration.
