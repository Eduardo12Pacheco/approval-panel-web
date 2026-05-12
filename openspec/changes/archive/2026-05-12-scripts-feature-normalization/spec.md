# Delta for control-panel-architecture-refactor

## ADDED Requirements

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
