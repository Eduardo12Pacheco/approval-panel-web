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

Existing Python tests and JS checks MUST be updated to validate the new module layout without weakening behavior, boundary, rollback, or CSS parity coverage.

#### Scenario: Checks evolve with structure

- GIVEN modules move behind compatibility facades
- WHEN tests and `js/modules/__checks__/` are updated
- THEN they MUST validate the new paths and still assert selector, boot, API, boundary, and rollback contracts.

#### Scenario: Risky preview sequencing stays protected

- GIVEN preview hydration or composition rendering internals are split
- WHEN the parity suite runs
- THEN lifecycle, preload, payload, and playback-adjacent checks MUST still pass
- AND playback sequencing SHOULD remain unchanged unless a dedicated test protects the change.
