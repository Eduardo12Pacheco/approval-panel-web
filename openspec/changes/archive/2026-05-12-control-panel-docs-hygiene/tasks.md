# Tasks: Control Panel Docs Hygiene

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 80-160 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single docs/ignore PR |
| Delivery strategy | auto |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Refresh current Control Panel docs and ignore hygiene | PR 1 | Docs, ignores, and focused docs assertions together. |

## Phase 1: Baseline Inspection

- [x] 1.1 Inspect `01-Control-Panel/README.md`, `.gitignore`, root `.gitignore`, and current non-archive docs for stale active service/tree references.
- [x] 1.2 Inspect `js/modules/features/video-projects/README.md` and current folders to identify missing map entries such as `controller/`.

## Phase 2: Documentation Updates

- [x] 2.1 Update `01-Control-Panel/README.md` with `assets/`, `services/approval-editor/`, current feature/check layout, compatibility facades, and no-build validation.
- [x] 2.2 Mark `01-Control-Panel/docs/video-projects-refactor-plan.md` as historical/partially completed and point to the current module README.
- [x] 2.3 Update `js/modules/features/video-projects/README.md` only where current folder/facade details are missing.

## Phase 3: Ignore Hygiene

- [x] 3.1 Confirm or add `services/approval-editor/projects/`, `__pycache__/`, `*.py[cod]`, and `.pytest_cache/` coverage in `01-Control-Panel/.gitignore`.
- [x] 3.2 Confirm root `.gitignore` still covers Control Panel service runtime and Python caches; update only if missing.

## Phase 4: Verification

- [x] 4.1 Add/update focused docs assertions in `tests/test_phase8_html_css_readme_structure_refactor.py` or a new docs hygiene test if existing coverage is insufficient.
- [x] 4.2 Run the focused docs/ignore pytest from `01-Control-Panel/`; do not run a build.
- [x] 4.3 Search active non-archive docs for stale active `approval-editor-service/` paths; allow only explicit migration/history notes.
