# Delta Spec: Control Panel Docs Hygiene

## ADDED Requirements

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
