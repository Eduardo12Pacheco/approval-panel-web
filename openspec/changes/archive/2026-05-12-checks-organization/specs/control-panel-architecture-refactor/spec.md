# Delta for Control Panel Architecture Refactor

## MODIFIED Requirements

### Requirement: Tests and Checks Preserve Contracts

Existing Python tests and JS checks MUST be reorganized to validate the same runtime contracts from feature-owned or global check locations without weakening behavior, boundary, rollback, source aggregation, executable entry point, or CSS parity coverage.
(Previously: Checks only needed to evolve with the new module layout while preserving contract coverage.)

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
- AND no selector, endpoint, payload, facade, copy, timer, rollback, or CSS parity guardrail MAY be removed to simplify the move.

#### Scenario: Feature-owned checks live near owning features

- GIVEN a check protects one feature's local contract, such as Audio, Subtitles, Video Projects, or app-shell lifecycle behavior
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
