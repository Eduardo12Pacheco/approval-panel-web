# Control Panel Architecture Refactor Specification

## Purpose

Define the behavior-preserving guardrails for refactoring `01-Control-Panel` into smaller, navigable modules without changing runtime contracts.

## Requirements

### Requirement: Behavioral Parity

The system MUST preserve existing user-visible behavior, selector contracts, endpoint names, payload keys, visible copy, and asset URL semantics while architecture files are split.

#### Scenario: Existing flows remain equivalent

- GIVEN the control panel is opened after a refactor slice
- WHEN existing approval, scripts, audio, subtitles, and Video Projects flows run
- THEN users MUST observe the same copy, controls, data actions, and saved payload semantics as before
- AND public selector IDs MUST remain valid.

#### Scenario: Dormant Radar behavior is not bundled

- GIVEN Radar wiring is present in HTML or selector contracts but not active in shell navigation
- WHEN this architecture refactor is implemented
- THEN Radar functional behavior MUST NOT be changed
- AND any Radar fix MUST be scoped separately.

### Requirement: Stable Facades and Imports

Compatibility entry points SHALL remain stable until downstream imports and checks are intentionally migrated.

#### Scenario: Facades preserve callers

- GIVEN callers import app shell or Video Projects public modules
- WHEN internals move into smaller modules
- THEN existing public factory and boot imports SHALL continue to resolve
- AND callers MUST NOT require new import paths for parity slices.

#### Scenario: Facade migration is intentional

- GIVEN a compatibility facade becomes unnecessary
- WHEN it is removed or redirected
- THEN tests/checks SHALL prove all downstream imports were migrated
- AND rollback instructions SHOULD identify the slice that changed it.

### Requirement: Navigable File Boundaries

Source files SHOULD be organized by concern and MUST NOT recreate large mini-app files without an explicit exception.

#### Scenario: Refactor creates focused modules

- GIVEN Video Projects CSS/render/controller or app-shell code is split
- WHEN a maintainer opens the resulting folders
- THEN files SHOULD map to clear concerns such as state, services, navigation, views, hydration, preview, commands, or CSS sections.

#### Scenario: File-size guardrail catches regressions

- GIVEN a source file exceeds the soft cap of 500 lines
- WHEN boundary checks run
- THEN the result SHOULD flag it unless it is documented as a temporary renderer/state-machine exception
- AND facades SHOULD remain small import/delegation files.

### Requirement: CSS Modularity and Cascade Parity

Video Projects CSS SHALL be split behind an import-only feature facade while preserving cascade position and computed style parity.

#### Scenario: Feature CSS facade preserves order

- GIVEN `styles.css` imports feature styles in a known order
- WHEN Video Projects CSS moves under a feature folder
- THEN `styles.css` SHALL keep the same cascade position via a single feature facade
- AND the facade SHOULD contain only ordered imports.

#### Scenario: Style contracts remain equivalent

- GIVEN representative Video Projects screens exist before and after CSS splitting
- WHEN CSS parity checks compare relevant selectors
- THEN computed styles SHALL remain equivalent for protected selectors
- AND selector names MUST NOT be changed to make the split easier.

### Requirement: Tests and Checks Preserve Contracts

Existing Python tests and JS checks MUST validate the same runtime contracts from feature-owned or global check locations without weakening behavior, boundary, rollback, source aggregation, executable entry point, CSS parity, asset URL, or protected replay coverage.
(Previously: Checks preserved contract coverage, but did not explicitly require fresh service-backed asset expectations or replay scenario counts.)

#### Scenario: Checks evolve with structure

- GIVEN modules move behind compatibility facades
- WHEN tests and `js/modules/__checks__/` are updated
- THEN they MUST validate the new paths and still assert selector, boot, API, boundary, and rollback contracts.

#### Scenario: Risky preview sequencing stays protected

- GIVEN preview hydration or composition rendering internals are split
- WHEN the parity suite runs
- THEN lifecycle, preload, payload, and playback-adjacent checks MUST still pass
- AND playback sequencing SHOULD remain unchanged unless a dedicated test protects the change.

#### Scenario: Existing check entry points remain stable

- GIVEN an existing command, runner path, or import targets a check under `js/modules/__checks__/`
- WHEN checks are moved or facaded
- THEN the old entry point MUST continue to execute an equivalent check
- AND callers MUST NOT need new command paths for this organization change.

#### Scenario: Assertions are not lost during moves

- GIVEN a check is relocated, renamed, wrapped, or split
- WHEN its before/after assertion inventory is reviewed
- THEN every previous assertion MUST remain present or be covered by an equivalent stronger assertion
- AND no selector, endpoint, payload, facade, copy, timer, rollback, asset URL, or CSS parity guardrail MAY be removed to simplify the move.

#### Scenario: Feature-owned checks live near owning features

- GIVEN a check protects one feature's local contract
- WHEN the check is reorganized
- THEN the owning feature SHOULD contain the executable check or focused implementation behind a stable facade
- AND the ownership mapping MUST be discoverable from the check source or manifest.

#### Scenario: Cross-feature checks remain global

- GIVEN a check protects integration, boot, rollback, selector, API, source aggregation, or multi-feature parity contracts
- WHEN the check hierarchy is reorganized
- THEN the check SHALL remain in a global checks area or equivalent shared guardrail location
- AND it MUST NOT be hidden inside a single feature folder that obscures its cross-feature scope.

#### Scenario: Source aggregation tracks moved checks

- GIVEN source aggregation, manifests, imports, or runner globs enumerate check files
- WHEN check files move or wrappers are introduced
- THEN those aggregation paths MUST be updated so every moved check remains included exactly once
- AND stale paths MUST NOT mask skipped checks.

#### Scenario: Moved checks remain executable

- GIVEN any check has been moved behind a feature-owned location or compatibility facade
- WHEN the same check suite or public command is executed
- THEN the moved check MUST run successfully from its new location
- AND failures MUST report the protected contract rather than a broken relative import or missing file path.

#### Scenario: Composition dust preview asset expectation stays fresh

- GIVEN the `composition/assets` parity replay asserts typed `dust-1` and `dust-2` preview output
- WHEN expected data is compared with production asset URL semantics
- THEN the expected URLs MUST be `./assets/dust-1.webm` and `./assets/dust-2.webm`
- AND the assertion MUST continue to protect Control Panel preview assets without changing render/export MP4 semantics.

#### Scenario: Protected replay count is refreshed when stale

- GIVEN the protected runtime replay scenario list has changed
- WHEN a Python assertion checks the protected replay count
- THEN the expected count MUST match the current protected scenario list
- AND stale historical counts MUST NOT block the Strict TDD baseline.

#### Scenario: Render/export asset resolution remains canonical

- GIVEN only Control Panel preview dust assets are optimized
- WHEN this change is implemented
- THEN Video Engine render/export dust assets MUST remain canonical MP4 assets
- AND preview WebM paths MUST NOT be sent to final render/export flows.

#### Scenario: Focused verification unblocks baseline

- GIVEN stale expectations have been refreshed
- WHEN focused replay and Python checks run
- THEN they MUST verify composition asset parity and protected replay coverage
- AND they SHOULD avoid unrelated refactors or weakened guards.

### Requirement: Scripts Facade Export Parity

The Scripts feature facade MUST preserve all current public named exports and the `createScriptsFeature(...)` return contract while internals move behind focused modules.

#### Scenario: Public imports remain valid

- GIVEN callers import `features/scripts/index.js`
- WHEN Scripts internals are normalized
- THEN `getScriptPublishStageMeta`, `normalizeScriptDraftRows`, `buildScriptSelectionCardMarkup`, `resolveScriptListKey`, `resolveScriptTitle`, `isScriptProcessed`, `resolveScriptIdentity`, `scriptPublishJobMatchesRow`, `resolveScriptPublishCardState`, `buildScriptDocxFilename`, and `createScriptsFeature` MUST still resolve
- AND app-shell callers MUST NOT import Scripts internal modules directly.

#### Scenario: Feature methods remain available

- GIVEN `createScriptsFeature(...)` is constructed with existing dependencies
- WHEN callers use its returned API
- THEN `refreshScriptDrafts`, `openScriptEditor`, `saveSelectedScript`, `publishSelectedScript`, `downloadSelectedScriptDocx`, and `dismissProcessedScript` MUST remain callable with equivalent behavior.

### Requirement: Script Draft Rendering and Editing Parity

Script draft list rendering, selection, editor state, and save validation MUST remain equivalent after normalization.

#### Scenario: Draft rows render with the same state

- GIVEN draft data arrives under `drafts`, `items`, `rows`, or `data`
- WHEN script cards and stats render
- THEN counts, selected card state, processed badges, titles, identities, and empty-list copy MUST match current behavior.

#### Scenario: Editor save behavior is unchanged

- GIVEN a user opens and edits a draft
- WHEN they save valid or invalid edited text
- THEN the same focus/dialog behavior, 20-character validation, save endpoint, identity payload keys, dirty flag, refresh, and toast copy MUST apply.

### Requirement: Script Publish Polling Parity

Publishing MUST preserve synchronous and asynchronous job behavior, polling cadence, status mapping, and terminal cleanup.

#### Scenario: Async publish starts and polls equivalently

- GIVEN publishing returns a `job_id`
- WHEN processing starts
- THEN the same save-before-publish order, publish endpoint, queued job state, monitor/card progress, 3000 ms poll interval, immediate status sync, and started toast MUST occur.

#### Scenario: Terminal publish states are handled equivalently

- GIVEN polling reports `completed` or `failed`
- WHEN the terminal status is processed
- THEN polling MUST stop, in-flight state MUST clear, completed jobs MUST refresh/select/render/toast in the same order, and failed jobs MUST keep the card locked with `ERROR` and show the same failure toast.

### Requirement: Script Download and Dismissal Parity

DOCX downloads, processed dismissal, and locked/failed card interactions MUST keep existing contracts.

#### Scenario: DOCX download contract is unchanged

- GIVEN a selected processed script has `doc_id`
- WHEN the user downloads DOCX
- THEN the same download endpoint, identity payload plus `format: docx`, filename fallback rules, button disabled behavior, render refresh, and toast copy MUST apply.

#### Scenario: Locked, failed, and dismissed cards behave unchanged

- GIVEN a card is publishing, failed, processed, or dismissed
- WHEN the user clicks, uses keyboard activation, or dismisses it
- THEN locked cards MUST NOT open, failed cards MUST show `ERROR`, processed dismiss MUST call `dismiss_processed`, update dismissed state/list/selection, and preserve current ARIA/actions/copy.

### Requirement: Script to Audio Integration Parity

Script → Audio handoff MUST preserve readiness guards, preset/text synchronization, navigation, and delegated generation order.

#### Scenario: Voice generation handoff remains ordered

- GIVEN a processed, clean script with pronunciation text is selected
- WHEN voice generation is requested
- THEN the same guard toasts MUST apply, Audio text/preset/change event/word count MUST update before navigation, `setView('audio')` MUST precede `runAudioGenerationFromText`, and title fallback rules MUST match current behavior.

### Requirement: Scripts Parity Checks Stay Protective

Checks MAY move only if they preserve or strengthen Scripts and Script → Audio parity coverage.

#### Scenario: Check coverage is not weakened

- GIVEN Scripts files or checks are reorganized
- WHEN parity checks are updated
- THEN export, endpoint, payload, timer, copy, card state, DOCX filename, dismissal, publish order, and Script → Audio source-order assertions MUST remain covered exactly once.

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

### Requirement: Approval Editor Service Boundary

The approval editor backend MUST live under `01-Control-Panel/services/approval-editor/`, and `01-Control-Panel/approval-editor-service/` MUST NOT remain a source, check, docs, or runtime service path except in historical archives or explicit migration notes.

#### Scenario: Service has a dedicated boundary

- GIVEN the service-boundary cleanup is complete
- WHEN maintainers inspect active Control Panel paths
- THEN the approval editor service entrypoint, support files, README, and ignored runtime `projects/` path MUST be under `services/approval-editor/`
- AND no active reference SHALL require the old top-level service directory.

### Requirement: Approval Editor Runtime Parity

The move MUST preserve approval editor runtime behavior, including service identity, default port `3042`, default base URL `http://127.0.0.1:3042`, `/api/*`, `/api/overlays/*`, payload contracts, and project snapshot semantics.

#### Scenario: API and port remain stable

- GIVEN callers use the current approval editor service contract
- WHEN the service runs from its new boundary
- THEN existing API routes and payload semantics MUST remain equivalent
- AND callers MUST NOT need a new port, base URL, or route.

#### Scenario: No behavior changes are introduced

- GIVEN the cleanup is reviewed
- WHEN source changes are inspected
- THEN they SHALL be limited to path, import, ignore, check, and documentation updates
- AND production behavior, selectors, contracts, routes, and scripts semantics MUST NOT be redesigned.

### Requirement: Path Consumers and Relative Imports

All active relative imports, CommonJS check imports, helper paths, and cross-subproject references MUST resolve from `services/approval-editor/` without weakening existing stable check facades.

#### Scenario: Relative paths resolve after move

- GIVEN approval editor files, Control Panel checks, and `02-Video-Engine` references import service helpers
- WHEN those imports are evaluated after the move
- THEN each active import MUST resolve from the new location
- AND stable global check entry points SHALL continue to execute equivalent checks.

### Requirement: Runtime Data Migration Safety

Ignored local runtime data MUST remain ignored at the new service path, and documentation MUST warn maintainers how to migrate any existing ignored `projects/` snapshots manually.

#### Scenario: Local snapshots are protected

- GIVEN a developer has untracked approval editor `projects/` data under the old path
- WHEN the service boundary cleanup is applied
- THEN ignore rules MUST cover the new runtime data path
- AND docs SHOULD describe manual migration from old ignored snapshots to avoid perceived data loss.

### Requirement: Checks and Documentation Track the Boundary

Active checks, README content, and current documentation MUST reference the new service path while leaving historical OpenSpec archives untouched.

#### Scenario: Active references are updated

- GIVEN active source, checks, README files, and current docs mention the approval editor service
- WHEN path references are audited
- THEN they MUST use `01-Control-Panel/services/approval-editor/`
- AND stale old-path mentions MUST remain only in intentional historical archive context.

### Requirement: Current Source Tree Documentation

The Control Panel documentation MUST describe the active source tree after the Approval Editor service move.

#### Scenario: README maps active paths

- GIVEN a future maintainer reads `01-Control-Panel/README.md`
- WHEN they inspect the folder map and architecture sections
- THEN the README MUST identify `services/approval-editor/` as the active local Node service boundary
- AND it MUST describe `assets/`, current feature folders, compatibility facades, checks, and no-build validation without pointing to old active service paths.

#### Scenario: Runtime service data remains protected

- GIVEN the Approval Editor service writes local runtime project data
- WHEN ignore rules are reviewed
- THEN `services/approval-editor/projects/` MUST remain ignored from both the workspace and Control Panel context where applicable
- AND Python caches such as `__pycache__/`, `*.py[cod]`, and `.pytest_cache/` SHOULD remain ignored.

### Requirement: Stale Current Docs Are Clearly Marked

Current non-archived docs MUST NOT present completed structural moves as still pending work.

#### Scenario: Video Projects plan does not mislead

- GIVEN `docs/video-projects-refactor-plan.md` contains an older migration plan
- WHEN a future agent opens it
- THEN the doc MUST clearly state that parts of the plan are historical/stale where completed
- AND it SHOULD point to `js/modules/features/video-projects/README.md` for the current module map.

### Requirement: Archived SDD History Is Preserved

Archived OpenSpec artifacts MUST remain historical audit records.

#### Scenario: Historical archives are not rewritten

- GIVEN stale paths appear under `01-Control-Panel/openspec/changes/archive/`
- WHEN this docs hygiene change is applied
- THEN archived artifacts MUST NOT be rewritten solely to modernize paths
- AND only active/current docs or source-of-truth specs MAY be updated when needed.

### Requirement: No Runtime Behavior Change

Docs hygiene MUST NOT alter app behavior.

#### Scenario: Validation avoids builds and behavior edits

- GIVEN this change is implemented
- WHEN verification runs
- THEN validation MUST use documentation/ignore assertions and targeted parse/search checks only
- AND it MUST NOT run a build or change production JS/CSS/service behavior.
