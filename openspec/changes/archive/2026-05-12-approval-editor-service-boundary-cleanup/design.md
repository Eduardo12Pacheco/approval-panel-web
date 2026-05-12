# Design: Approval Editor Service Boundary Cleanup

## Technical Approach

Move the Approval Editor Node service as a path-only boundary cleanup: `01-Control-Panel/approval-editor-service/` becomes `01-Control-Panel/services/approval-editor/`. Runtime contracts stay fixed: service identity, `APPROVAL_EDITOR_SERVICE_PORT || 3042`, `/health`, `/api/*`, `/api/overlays/*`, snapshot storage semantics, and `approval-editor-service-v1`. Only paths, imports, ignore rules, checks, and current docs change.

## Architecture Decisions

| Decision | Alternatives considered | Rationale |
|---|---|---|
| Move the whole service directory, including `lib/` and `README.md`, under `services/approval-editor/`. | Leave wrappers at the old root path. | The spec requires no active old service path; wrappers would preserve misleading ownership. |
| Keep `js/modules/__checks__/approval-editor-service-timings.check.cjs` as the stable check facade. | Move the check beside the service. | Existing manifest and docs treat it as a global Control Panel check; only its `require()` paths need adjustment. |
| Preserve service names and contract strings. | Rename identity to match the folder. | `approval-editor-service` and `approval-editor-service-v1` are runtime/API contracts, not filesystem labels. |
| Update active docs only; leave OpenSpec archives historical. | Rewrite archive references. | Archives are audit trail. Active docs/checks must point to the new boundary. |

## Data Flow

```text
Browser Approval client -> http://127.0.0.1:3042/api/*
                     -> services/approval-editor/server.js
                     -> services/approval-editor/lib/*
                     -> 03-Contracts-Core + 02-Video-Engine assets/helpers
                     -> services/approval-editor/projects/ (ignored runtime data)
```

No payload or route changes are introduced.

## File Changes

| File | Action | Description |
|---|---|---|
| `01-Control-Panel/services/approval-editor/**` | Move | New service boundary for `server.js`, `lib/*`, `README.md`, and ignored `projects/`. |
| `01-Control-Panel/approval-editor-service/**` | Remove | Old active service location removed after move; no compatibility wrapper. |
| `01-Control-Panel/services/approval-editor/server.js` | Modify imports only | Update `../../03-Contracts-Core/...` and `../../02-Video-Engine/...` to `../../../...`; keep runtime constants and routes unchanged. |
| `01-Control-Panel/js/modules/__checks__/approval-editor-service-timings.check.cjs` | Modify imports only | Require `../../../services/approval-editor/server.js` and `../../../services/approval-editor/lib/real-alignment.js`. |
| `01-Control-Panel/js/modules/features/video-projects/__checks__/video-segment-picker-ux.check.mjs` | Modify import only | Require `../../../../../services/approval-editor/lib/contract-updates.js`. |
| `02-Video-Engine/tests/approval-editor-service-v1.test.js` | Modify import only | Require `../../01-Control-Panel/services/approval-editor/server`. |
| `02-Video-Engine/scripts/approval-pipeline-local-service.js` | Modify import only | Require `../../01-Control-Panel/services/approval-editor/lib/contract-updates`. |
| `.gitignore`, `01-Control-Panel/.gitignore` | Modify | Ignore `01-Control-Panel/services/approval-editor/projects/` / `services/approval-editor/projects/`. |
| `01-Control-Panel/README.md`, service README, current workspace docs | Modify docs | Document new path, start command, checks, and manual local `projects/` migration. |

## Interfaces / Contracts

No new interfaces. These contracts MUST remain byte-for-byte semantic equivalents where applicable: `/health`, `/api/projects/create-from-approval`, `/api/projects/:id/snapshot`, `/api/projects/:id/files/*`, `/api/projects/:id/render-final`, `/api/projects/:id/status`, `/api/projects/:id/download/final`, `/api/assets/:id`, `/api/overlays/:file`, default host/port, and `createApprovalEditorService(...)` exports.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Syntax | Moved service and libs parse | `node --check services/approval-editor/server.js`, key `lib/*.js` checks from `01-Control-Panel/`. |
| Contract/check | CJS facade and browser-adjacent helper imports resolve | `node js/modules/__checks__/approval-editor-service-timings.check.cjs`; existing video-projects checks referencing service helpers. |
| Cross-subproject | `02-Video-Engine` service imports resolve | `node --test tests/approval-editor-service-v1.test.js` from `02-Video-Engine/`. |
| Audit | No stale active old-path refs | Search for `01-Control-Panel/approval-editor-service`, `approval-editor-service/server`, `approval-editor-service/lib`, excluding archives/migration notes. |

No build.

## Migration / Rollout

No data migration is required for committed files. Developers with untracked local snapshots should manually move `01-Control-Panel/approval-editor-service/projects/` to `01-Control-Panel/services/approval-editor/projects/` before starting the service, or keep a backup. Rollback is the inverse directory move plus restoring import, ignore, and doc paths.

## Open Questions

- None.
