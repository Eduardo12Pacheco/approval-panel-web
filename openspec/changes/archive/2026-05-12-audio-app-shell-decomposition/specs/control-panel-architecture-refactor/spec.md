# Delta for Control Panel Architecture Refactor

## ADDED Requirements

### Requirement: Audio Controller Public Contract Stability

Audio decomposition MUST preserve the existing app-shell-facing Audio facade while internals move behind focused controller modules.

#### Scenario: App-shell Audio calls remain valid

- GIVEN app-shell imports the Audio feature facade
- WHEN Audio controller internals are decomposed
- THEN existing app-shell-facing methods MUST remain callable with the same arguments
- AND endpoint paths, payload keys, selectors, and visible copy MUST remain unchanged.

#### Scenario: Internal seams do not become new shell dependencies

- GIVEN transport, job state, queue rendering, or command code moves under Audio internals
- WHEN app-shell code is reviewed
- THEN app-shell SHOULD depend on stable Audio commands/lifecycle methods
- AND MUST NOT require new direct imports from Audio internal modules.

### Requirement: Audio Tracking and Queue Parity

Audio status tracking, SSE fallback, polling, queue sync, render actions, downloads, and dismissal MUST remain behaviorally equivalent.

#### Scenario: Active job token protects terminal updates

- GIVEN Audio is tracking a generation job
- WHEN SSE falls back to polling or a terminal status arrives
- THEN stale callbacks MUST NOT mutate a newer active job
- AND tracking cleanup MUST occur only for the matching active job token.

#### Scenario: Queue render actions stay delegated

- GIVEN the Audio queue is rendered or refreshed
- WHEN a user clicks existing queue controls
- THEN existing `data-action` values MUST trigger the same download/dismiss behavior
- AND non-dismissed jobs SHOULD continue status sync while the Audio view is active.

### Requirement: Sequential Decomposition Checkpoint

Audio controller decomposition SHALL complete and pass parity guardrails before app-shell runtime behavior is moved.

#### Scenario: Audio first checkpoint

- GIVEN Audio internals have been extracted
- WHEN app-shell runtime work begins
- THEN Audio facade, tracking, queue, and command parity checks MUST already pass
- AND any cohesive size exception MUST be documented before proceeding.

### Requirement: App-Shell Boot and View Lifecycle Stability

App-shell runtime decomposition MUST preserve public boot exports and `setView()` lifecycle side effects.

#### Scenario: Boot exports remain stable

- GIVEN callers import the app-shell public module
- WHEN runtime composition moves into smaller shell modules
- THEN `bootApp`, `bootCompatibilityShell`, and `__testHooks` SHALL continue to resolve
- AND boot order, auth gate/app shell toggling, event binding, settings hydration, and initial refresh behavior MUST remain equivalent.

#### Scenario: View changes preserve side effects

- GIVEN a user navigates between existing views
- WHEN `setView()` is invoked after decomposition
- THEN nav visibility and view activation MUST match current behavior
- AND approval monitor, Audio tracking/queue sync, Scripts video refresh, Subtitles refresh/render, and Radar stop/refresh side effects MUST remain equivalent.

### Requirement: Script to Audio Voice Flow Parity

The Script → Audio voice flow MUST continue to update Audio UI state before generation using the same sequencing.

#### Scenario: Voice flow syncs preset and text

- GIVEN a script voice action prepares Audio generation
- WHEN the flow transfers text and preset state
- THEN Audio text, word count, and preset selection MUST be updated before generation
- AND the preset `change` event MUST still fire for custom dropdown state.

#### Scenario: Navigation precedes delegated generation

- GIVEN the voice flow has prepared Audio state
- WHEN it starts generation
- THEN the shell MUST navigate to Audio using the existing view route
- AND generation MUST call the stable Audio command without stale script text.

### Requirement: Behavior-Preserving Guardrails for Both Work Units

Checks and review docs MUST prove parity without weakening existing architecture guardrails.

#### Scenario: Protected contracts are unchanged

- GIVEN either work unit changes source layout
- WHEN parity checks inspect the result
- THEN DOM IDs, `data-action` values, endpoints, payload keys, copy, timers, public facades, and test hooks MUST remain protected.

#### Scenario: Scope stays limited

- GIVEN app-shell wiring touches other features for lifecycle parity
- WHEN the change is reviewed
- THEN Radar, Subtitles, Scripts, Approval, and Video Projects behavior MUST NOT be redesigned
- AND unrelated refactors MUST be deferred to separate SDD changes.
