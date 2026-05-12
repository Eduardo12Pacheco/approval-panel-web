# Proposal: Approval Editor Service Boundary Cleanup

## Intent

Move the local Node approval editor backend from the Control Panel root to a dedicated service boundary: `01-Control-Panel/services/approval-editor/`. This removes the misleading top-level mixed frontend/backend layout while preserving port `3042`, API routes, contracts, runtime behavior, and check coverage.

## Scope

### In Scope
- Move `approval-editor-service/` to `services/approval-editor/` as a path-only cleanup.
- Update relative imports, CommonJS checks, `02-Video-Engine` references, ignore rules, and service/README docs.
- Preserve `approval-editor-service-v1`, `/api/*`, `/api/overlays/*`, project snapshot semantics, and default `http://127.0.0.1:3042` behavior.

### Out of Scope
- Production behavior, API, contract, route, payload, selector, or port changes.
- Scripts normalization, OpenSpec archive rewrites, generated runtime data cleanup, or build execution.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- None. Existing `control-panel-architecture-refactor` behavior-preserving guardrails cover this organization change without new requirements.

## Approach

Treat this as one reviewable service-boundary work unit: move the directory, adjust every path consumer, keep stable global check facades, and document any manual local `projects/` data migration. Verification should use targeted path/check commands only; do not build.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `01-Control-Panel/services/approval-editor/` | New | New home for service entrypoint, libs, README, and ignored runtime `projects/`. |
| `01-Control-Panel/approval-editor-service/` | Removed | Old service path removed after move. |
| `01-Control-Panel/js/modules/__checks__/` | Modified | CJS service timing check imports updated, facade path retained. |
| `01-Control-Panel/js/modules/features/video-projects/__checks__/` | Modified | Service helper imports updated. |
| `02-Video-Engine/tests/`, `02-Video-Engine/scripts/` | Modified | Cross-subproject service imports updated. |
| `.gitignore`, `01-Control-Panel/.gitignore`, README/docs | Modified | Runtime ignores and documented commands/paths updated. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Relative import drift | Medium | Search all old-path references and run focused service/check tests. |
| Local snapshots appear missing | Medium | Document manual move from old ignored `projects/` path. |
| Historical OpenSpec noise misleads implementation | Low | Update active/current docs only; do not rewrite archives. |

## Rollback Plan

Move `services/approval-editor/` back to `approval-editor-service/`, restore old import/ignore/doc paths, and move any local `projects/` data back if migrated.

## Dependencies

- Existing service behavior and checks remain source of truth.
- Organization audit Engram artifact `sdd/control-panel-organization-audit/explore`.

## Success Criteria

- [ ] No source/docs/check references remain to the old service path except intentional historical archives.
- [ ] Service still defaults to port `3042` and exposes equivalent API/runtime behavior.
- [ ] Targeted approval-editor service checks and cross-subproject references resolve from the new path.
