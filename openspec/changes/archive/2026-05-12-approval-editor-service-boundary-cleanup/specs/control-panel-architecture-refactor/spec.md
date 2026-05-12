# Delta for Control Panel Architecture Refactor

## ADDED Requirements

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
