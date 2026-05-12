# Apply Progress: Control Panel Docs Hygiene

**Change**: `control-panel-docs-hygiene`  
**Mode**: Strict TDD  
**Workload / PR boundary**: single docs/ignore PR; 400-line budget risk Low; no chain required.

## Completed Tasks

- [x] 1.1 Inspected `01-Control-Panel/README.md`, Control Panel `.gitignore`, root `.gitignore`, and active non-archive docs for stale service/tree references.
- [x] 1.2 Inspected `js/modules/features/video-projects/README.md` and current folders; missing entries included `controller/`, `__checks__/`, split clients, and nested renderer details.
- [x] 2.1 Updated `01-Control-Panel/README.md` with `assets/`, active `services/approval-editor/`, current Video Projects layout, checks, compatibility facades, and no-build validation.
- [x] 2.2 Marked `docs/video-projects-refactor-plan.md` as historical/partially completed and linked the current module README.
- [x] 2.3 Updated `js/modules/features/video-projects/README.md` for current folder/facade details.
- [x] 3.1 Added missing `.pytest_cache/` coverage to `01-Control-Panel/.gitignore`; existing runtime and Python bytecode ignores were preserved.
- [x] 3.2 Confirmed root `.gitignore` already covers `01-Control-Panel/services/approval-editor/projects/`, Python caches, and `.pytest_cache/`.
- [x] 4.1 Added focused docs/ignore assertions to `tests/test_phase8_html_css_readme_structure_refactor.py`.
- [x] 4.2 Ran focused pytest from `01-Control-Panel/` without running a build.
- [x] 4.3 Searched active non-archive docs for stale `approval-editor-service/` references; remaining active hits are explicit migration/history notes or current specs describing the old path prohibition.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1-4.3 | `tests/test_phase8_html_css_readme_structure_refactor.py` | Unit/docs assertions | ✅ `12 passed` before edits | ✅ Added 4 docs/ignore assertions first; initial run failed 4 tests | ✅ `16 passed` after docs/ignore updates | ✅ Covered README, module README, historical plan, and ignore rules | ✅ Kept changes doc-only/source-tree hygiene; no production behavior edits |

## Test Summary

- **Total tests written**: 4 focused pytest tests.
- **Total tests passing**: 16/16 in `tests/test_phase8_html_css_readme_structure_refactor.py`.
- **Layers used**: Unit/docs assertions (4 new; existing file also includes Node contract subprocess cases).
- **Approval tests**: Existing focused file acted as safety net; no behavior refactor approval tests needed.
- **Pure functions created**: 0 — docs/ignore hygiene only.

## Commands Run

```powershell
pytest "tests/test_phase8_html_css_readme_structure_refactor.py"
```

Results:

- Baseline before edits: `12 passed in 0.24s`.
- RED after adding docs hygiene tests: `4 failed, 12 passed in 0.37s`.
- GREEN after docs/ignore updates: `16 passed in 0.23s`.

Search validation:

- `approval-editor-service/` active non-archive hits were reviewed.
- Remaining current-doc hits are migration/history notes in `README.md` and `services/approval-editor/README.md`, plus source-of-truth spec text that explicitly forbids old active service paths.
- Archived OpenSpec history was not rewritten.

## Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `01-Control-Panel/README.md` | Modified | Added current `assets/`, Video Projects folder/check map, compatibility facade guidance, active service note, and no-build docs validation guidance. |
| `01-Control-Panel/docs/video-projects-refactor-plan.md` | Modified | Added top historical/partially completed warning and linked current module README. |
| `01-Control-Panel/js/modules/features/video-projects/README.md` | Modified | Refreshed current `controller/`, `__checks__/`, split data clients, nested renderer, and facade map. |
| `01-Control-Panel/.gitignore` | Modified | Added `.pytest_cache/`; preserved runtime data and Python bytecode ignores. |
| `01-Control-Panel/tests/test_phase8_html_css_readme_structure_refactor.py` | Modified | Added focused docs/source-tree hygiene assertions. |
| `01-Control-Panel/openspec/changes/control-panel-docs-hygiene/tasks.md` | Modified | Marked all apply tasks complete. |

## Deviations from Design

None — implementation matches the design. Root `.gitignore` was inspected but not modified because required coverage already existed.

## Issues / Risks

- `services/approval-editor/projects/` contains local runtime project data and remains ignored; no cleanup was performed.
- Current docs intentionally retain old `approval-editor-service/` only as migration/history notes.

## Remaining Tasks

None. Ready for SDD verify.
