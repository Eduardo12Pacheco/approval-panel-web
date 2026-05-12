# Archive Report: Control Panel Docs Hygiene

**Change**: `control-panel-docs-hygiene`  
**Archive date**: 2026-05-12  
**Artifact store mode**: hybrid  
**Subproject**: `01-Control-Panel`  
**Verdict**: Archived

## Source Artifacts

| Artifact | Engram observation | OpenSpec path |
|---|---:|---|
| Proposal | #2935 | `01-Control-Panel/openspec/changes/archive/2026-05-12-control-panel-docs-hygiene/proposal.md` |
| Spec | #2936 | `01-Control-Panel/openspec/changes/archive/2026-05-12-control-panel-docs-hygiene/specs/control-panel-architecture-refactor/spec.md` |
| Design | #2937 | `01-Control-Panel/openspec/changes/archive/2026-05-12-control-panel-docs-hygiene/design.md` |
| Tasks | #2938 | `01-Control-Panel/openspec/changes/archive/2026-05-12-control-panel-docs-hygiene/tasks.md` |
| Verify report | #2951 | `01-Control-Panel/openspec/changes/archive/2026-05-12-control-panel-docs-hygiene/verify-report.md` |

## Specs Synced

| Domain | Action | Details |
|---|---|---|
| `control-panel-architecture-refactor` | Updated | Added 4 requirements from the delta spec: Current Source Tree Documentation, Stale Current Docs Are Clearly Marked, Archived SDD History Is Preserved, and No Runtime Behavior Change. |

## Verify Evidence Included

- Verification verdict: PASS.
- Focused pytest evidence: `pytest "tests/test_phase8_html_css_readme_structure_refactor.py"` from `01-Control-Panel` produced `16 passed in 0.22s`.
- Build evidence: not run, explicitly prohibited for this docs/ignore hygiene change.
- Ignore evidence: `git check-ignore -v` confirmed `services/approval-editor/projects/`, `.pytest_cache/`, and `__pycache__/` coverage.
- Archive preservation evidence before archive: `git diff -- "01-Control-Panel/openspec/changes/archive"` produced no tracked output during verify.

## Archive Verification

- Source-of-truth spec updated: `01-Control-Panel/openspec/specs/control-panel-architecture-refactor/spec.md`.
- Change folder archived to `01-Control-Panel/openspec/changes/archive/2026-05-12-control-panel-docs-hygiene/`.
- Historical archives were not rewritten.
- Active change folder removed after archive move.

## Risks

- Local Approval Editor runtime data under `01-Control-Panel/services/approval-editor/projects/` remains intentionally ignored and must not be deleted blindly.
- Current docs intentionally retain `approval-editor-service/` only as migration/history wording; future searches should distinguish allowed history notes from active service-path references.
