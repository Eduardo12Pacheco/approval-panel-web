# Tasks: Scripts Feature Normalization

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 650-900 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 checks → PR 2 pure helpers/cards → PR 3 controller/polling facade |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Lock Scripts parity before refactor | PR 1 | Checks only; no production code. |
| 2 | Extract pure helpers and card markup | PR 2 | Facade exports unchanged; rerun checks. |
| 3 | Extract controller/polling/client seams | PR 3 | Final facade, render import sanity, rerun checks. |

## Phase 1: Baseline Parity Guards

- [x] 1.1 Update `js/modules/__checks__/global/runtime-ui-parity-replay.js` to assert the full `features/scripts/index.js` export inventory and forbid app-shell imports from Scripts internals.
- [x] 1.2 Extend the same check to cover endpoint strings, payload keys, `3000` ms polling, save-before-publish order, DOCX filename fallback, dismissal action/copy, failed-card `ERROR`, and Script → Audio source order.
- [x] 1.3 Run the focused global parity check before extraction and keep it passing as the baseline; do not run a build.

## Phase 2: Pure Helper Extraction

- [x] 2.1 Create `js/modules/features/scripts/domain.js` for draft normalization, list key/title/processed/identity, and DOCX filename helpers; re-export from `index.js`.
- [x] 2.2 Create `js/modules/features/scripts/publish-status.js` for stage metadata, job-row matching, and card publish state; import sibling domain helpers directly.
- [x] 2.3 Create `js/modules/features/scripts/cards.js` for `buildScriptSelectionCardMarkup`, preserving escaping, ARIA, classes, dismissal button, and lock/error badges.
- [x] 2.4 Rerun the focused parity check after helper/card extraction; fix only parity drift, not behavior.

## Phase 3: Controller and Facade Extraction

- [x] 3.1 Create `js/modules/features/scripts/client.js` constants/helpers for drafts, save, publish, status, and DOCX calls without changing endpoint strings or payload keys.
- [x] 3.2 Create `js/modules/features/scripts/polling.js` for publish polling, in-flight guard, terminal cleanup, completion refresh/select/render/toast order, and failed lock/toast state.
- [x] 3.3 Create `js/modules/features/scripts/controller.js` with `createScriptsFeature(...)` and the existing public methods: refresh, open, save, publish, download, dismiss.
- [x] 3.4 Reduce `js/modules/features/scripts/index.js` to the stable facade: import/re-export current named exports and delegate `createScriptsFeature(...)`.

## Phase 4: Integration Verification

- [x] 4.1 Adjust `js/modules/features/scripts/render.js` imports only if needed to avoid cycles; preserve DOM, copy, events, and visible state.
- [x] 4.2 Update `js/modules/__checks__/global/rollback-scope-validator.js` only if a new checkpoint/scope entry is required for all Scripts internals.
- [x] 4.3 Rerun focused parity checks after final extraction, including facade exports, runtime replay, dismissal/DOCX/polling, and Script → Audio order; do not run a build.
