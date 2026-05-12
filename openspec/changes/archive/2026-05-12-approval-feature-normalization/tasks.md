# Tasks: Approval Feature Normalization

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 160-280 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR: facade exports/import normalization + checks |
| Delivery strategy | auto |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Normalize Approval facade and app-shell imports | PR 1 | Include focused checks with behavior changes. |

## Phase 1: Facade Foundation

- [x] 1.1 Update `01-Control-Panel/js/modules/features/approval/index.js` to re-export `buildApprovalNewsCardMarkup`, `renderApprovalTopicDetail`, `renderQueueMonitor`, and queue helper named exports.
- [x] 1.2 If extracting helpers, create focused Approval-owned modules without changing exported names or helper behavior.

## Phase 2: App-Shell Import Normalization

- [x] 2.1 Update `01-Control-Panel/js/modules/app-shell/runtime.js` to import all Approval-owned helpers from `features/approval/index.js`.
- [x] 2.2 Preserve existing render functions in `runtime.js` so card filtering, topic detail, queue render, and source link behavior stay unchanged.

## Phase 3: Behavior Guardrails

- [x] 3.1 Add/update checks proving `features/approval/index.js` preserves all previous named exports plus render helper exports.
- [x] 3.2 Add/update markup assertions for topic detail `data-action`, `data-url`, `data-id-noticia`, `data-index`, and queue `data-queue-id` contracts.
- [x] 3.3 Keep approval success/failure sequencing assertions covering renders, toast, pending refresh, queue refresh, and injected `refreshScriptDrafts`.

## Phase 4: Focused Verification

- [x] 4.1 Run existing focused Approval/runtime parity checks only; do not run a build.
- [x] 4.2 Review `01-Control-Panel/tests/test_phase6_runtime_parity_and_boundaries.py` and `test_phase7_runtime_ui_replay_and_rollback.py` for weakened or duplicated assertions.
