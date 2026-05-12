# Approval Feature Normalization Delta Spec

## ADDED Requirements

### Requirement: Approval Facade Export Stability
`features/approval/index.js` MUST remain the stable public Approval facade and MUST preserve all current named exports while adding facade access to Approval-owned render helpers.

#### Scenario: Existing public imports remain valid
- GIVEN callers import `resolveApprovalOrderingAvg`, `orderApprovalItemsByLowestAvg`, `resolveApprovalSourceLink`, `normalizeApprovalQueueItems`, `createOptimisticApprovedTopic`, `syncPendingItemsAfterApproval`, or `createApprovalFeature`
- WHEN Approval internals are normalized
- THEN every named export MUST still resolve from `features/approval/index.js`
- AND each export MUST preserve equivalent input/output behavior.

#### Scenario: Render helpers are available through the facade
- GIVEN app-shell needs Approval card, topic-detail, or queue-monitor rendering
- WHEN imports are normalized
- THEN app-shell SHOULD import Approval-owned helpers from `features/approval/index.js`
- AND direct app-shell dependency on Approval internal render files SHOULD be removed.

### Requirement: Approval Runtime Behavior Parity
Approval normalization MUST preserve callbacks, toast timing, render ordering, v2 endpoints, payload keys, and dependency injection.

#### Scenario: Approval source approval sequence is unchanged
- GIVEN a topic source with `id_noticia` is approved
- WHEN `approveSourceFromTopic` completes successfully
- THEN the same decision endpoint and payload semantics MUST be used
- AND stats, country filter, cards, topic detail, success toast, pending refresh, queue refresh, and injected script-draft refresh MUST run in the same observable order.

#### Scenario: Failure rollback remains equivalent
- GIVEN approving a source fails
- WHEN the decision request rejects
- THEN selected topic, pending items, selected card id, render calls, and error toast MUST match current behavior.

### Requirement: Approval DOM Contract Stability
Approval render normalization MUST preserve DOM action and dataset contracts consumed by event delegation.

#### Scenario: Topic detail actions remain delegated
- GIVEN topic detail markup is rendered
- WHEN a user opens, approves, or deletes a source
- THEN `data-action="open-source"`, `data-action="approve-source"`, `data-action="delete-source"`, encoded `data-url`, `data-id-noticia`, and `data-index` MUST keep current names and encoding semantics.

#### Scenario: Queue dismissal remains delegated
- GIVEN queue monitor markup is rendered
- WHEN a user dismisses a queue job
- THEN `data-action="dismiss-approval-queue-job"` and `data-queue-id` MUST remain available to `app-shell/events/approval-dialog.js`.

### Requirement: Boundary Checks Remain Protective
Existing Approval checks MUST be preserved or strengthened, not weakened to make normalization easier.

#### Scenario: Checks track the facade
- GIVEN tests/checks assert Approval ordering, source links, optimistic updates, queue monitor, runtime replay, or boundary imports
- WHEN imports or files move
- THEN equivalent assertions MUST still execute exactly once
- AND no endpoint, payload, copy, callback, render, dataset, or boundary assertion MAY be removed without a stronger replacement.
