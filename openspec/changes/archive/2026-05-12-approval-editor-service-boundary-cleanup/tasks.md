# Tasks: Approval Editor Service Boundary Cleanup

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 120-220 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR/work unit: path move + import/docs/check parity |
| Delivery strategy | auto |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Move Approval Editor service boundary with parity checks and docs | PR 1 | Keep checks/docs with code; no build, commit, or push. |

## Phase 1: Baseline Parity Checks

- [x] 1.1 From `01-Control-Panel/`, run focused baseline checks for `approval-editor-service/server.js`, key `approval-editor-service/lib/*.js`, and `js/modules/__checks__/approval-editor-service-timings.check.cjs`; record failures before edits.
- [x] 1.2 From `02-Video-Engine/`, run `node --test tests/approval-editor-service-v1.test.js` to prove current cross-subproject contract resolution before the move.

## Phase 2: Service Boundary Move

- [x] 2.1 Move `01-Control-Panel/approval-editor-service/` to `01-Control-Panel/services/approval-editor/` without adding wrappers at the old path.
- [x] 2.2 Protect local runtime data: do not delete untracked `approval-editor-service/projects/`; document/carry manual migration to `services/approval-editor/projects/` only when user-controlled.
- [x] 2.3 Update `01-Control-Panel/services/approval-editor/server.js` relative imports from `../../03-Contracts-Core` and `../../02-Video-Engine` to `../../../...`; keep routes, port `3042`, service IDs, and exports unchanged.

## Phase 3: Import, Ignore, and Documentation Updates

- [x] 3.1 Update `01-Control-Panel/js/modules/__checks__/approval-editor-service-timings.check.cjs` and `js/modules/features/video-projects/__checks__/video-segment-picker-ux.check.mjs` to require helpers from `services/approval-editor/` while preserving stable check facades.
- [x] 3.2 Update `02-Video-Engine/tests/approval-editor-service-v1.test.js` and `02-Video-Engine/scripts/approval-pipeline-local-service.js` service imports to the new path.
- [x] 3.3 Update `.gitignore` and `01-Control-Panel/.gitignore` so `01-Control-Panel/services/approval-editor/projects/` remains ignored.
- [x] 3.4 Update `01-Control-Panel/README.md`, `services/approval-editor/README.md`, and current docs with the new start/check paths and manual `projects/` migration warning; leave OpenSpec archives historical.

## Phase 4: Focused Verification and Audit

- [x] 4.1 Re-run the Phase 1 focused checks from the new path; do not run a build.
- [x] 4.2 Search active files for `01-Control-Panel/approval-editor-service`, `approval-editor-service/server`, and `approval-editor-service/lib`; only archive or explicit migration-note hits may remain.
- [x] 4.3 Inspect the diff to confirm changes are path/import/ignore/docs only, with no API, route, payload, selector, script-semantics, commit, or push changes.
