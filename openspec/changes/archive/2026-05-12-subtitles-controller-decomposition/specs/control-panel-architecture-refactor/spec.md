# Delta for Control Panel Architecture Refactor

## ADDED Requirements

### Requirement: Subtitles Public Facade Stability

The subtitles decomposition MUST preserve the public `features/subtitles/index.js` facade and `createSubtitlesController(...)` contract while internals move behind focused support modules.

#### Scenario: Existing app-shell import remains valid

- GIVEN the app shell imports the subtitles feature facade
- WHEN subtitles controller internals are decomposed
- THEN the import path and exported factory MUST continue to resolve
- AND callers MUST NOT need new constructor arguments for parity behavior.

#### Scenario: Controller return contract remains stable

- GIVEN callers receive the subtitles controller object
- WHEN they invoke existing public methods or lifecycle hooks
- THEN each previously supported method MUST remain available
- AND visible copy, selectors, endpoints, payload keys, and phase names MUST remain unchanged.

### Requirement: Subtitles Polling and Phase Parity

Remote subtitle session orchestration MUST preserve existing request cadence, timer cleanup, status transitions, and terminal phase behavior.

#### Scenario: Remote generation polling is unchanged

- GIVEN a remote subtitles generation session is active
- WHEN the poll timer advances through pending or processing statuses
- THEN the same status endpoint and interval behavior MUST be used
- AND the same UI phase/status copy MUST be rendered.

#### Scenario: Terminal states stop polling

- GIVEN a subtitles polling session reaches success, failure, cancellation, or reset
- WHEN the terminal transition is handled
- THEN active timers MUST be cleared
- AND stale poll callbacks MUST NOT mutate the current session state.

### Requirement: Subtitles Preview URL and Seek Parity

Preview playback behavior MUST preserve object URL lifecycle, source assignment, seek timing, and cleanup semantics.

#### Scenario: Preview source uses the same URL lifecycle

- GIVEN a previewable subtitles render result is available
- WHEN the preview source is prepared or replaced
- THEN object URLs MUST be created and revoked with the same lifetime as before
- AND the video element MUST receive equivalent source values.

#### Scenario: Seek behavior remains equivalent

- GIVEN a subtitle row or preview control requests a timestamp seek
- WHEN preview media is loaded or waiting for metadata
- THEN the same seek target MUST be applied at the same readiness point
- AND no duplicate or stale seek MUST override the latest user intent.

### Requirement: Subtitles Table Editing and Drag-Drop Parity

Subtitle row editing, validation, selection, ordering, and drag-drop behavior MUST remain equivalent after extraction.

#### Scenario: Editing preserves row identity and validation

- GIVEN a user edits subtitle text or timing fields in the table
- WHEN the edit is committed or rejected
- THEN the same row identity, validation rules, error copy, and state update behavior MUST apply
- AND invalid edits MUST NOT corrupt neighboring rows.

#### Scenario: Drag-drop preserves ordering semantics

- GIVEN subtitle rows are reordered through drag-drop controls
- WHEN a drag starts, moves, drops, or is cancelled
- THEN the resulting row order MUST match existing behavior
- AND focus/selection state SHOULD remain consistent with the prior controller.

### Requirement: Subtitles Decomposition Guardrail

The refactor MUST NOT replace the monolithic controller with another giant mixed-responsibility controller.

#### Scenario: Focused subtitles seams are created

- GIVEN subtitles controller logic is moved
- WHEN maintainers inspect the feature folder
- THEN session/polling, preview, table editing, and render/save/download concerns SHOULD be discoverable as focused seams
- AND the root controller SHOULD remain primarily facade and wiring code.

#### Scenario: Cohesive exceptions are justified

- GIVEN a subtitles support file exceeds the project soft size budget
- WHEN boundary checks or review inspect it
- THEN the file SHOULD be documented as a cohesive exception or split plan
- AND checks MUST NOT weaken existing behavior coverage to pass the refactor.
