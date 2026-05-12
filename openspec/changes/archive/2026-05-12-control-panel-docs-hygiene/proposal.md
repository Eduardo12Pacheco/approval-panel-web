# Proposal: Control Panel Docs Hygiene

## Intent

Make the current Control Panel documentation match the post-move source tree without changing production behavior. The docs should point future agents to `services/approval-editor/`, `assets/`, the current feature/check layout, and no-build validation.

## Scope

- Update `01-Control-Panel/README.md` folder map, architecture notes, service commands, assets notes, feature layout, checks, and validation guidance.
- Update or clearly mark stale current docs such as `docs/video-projects-refactor-plan.md` so they do not describe completed work as pending.
- Confirm ignore coverage for `services/approval-editor/projects/`, Python caches, and common local runtime caches.
- Add focused documentation/ignore assertions only if needed; no app runtime code changes.

## Out of Scope

- No production behavior changes, endpoint changes, CSS/DOM changes, or service contract changes.
- No build.
- No rewrite of archived OpenSpec history. Historical archive paths remain audit evidence.
- No continuation of Scripts normalization or Video Projects behavior refactors.

## Files Likely Affected

| Path | Action |
|---|---|
| `01-Control-Panel/README.md` | Refresh current map and validation guidance. |
| `01-Control-Panel/docs/video-projects-refactor-plan.md` | Mark stale/completed sections or redirect to current module README. |
| `01-Control-Panel/js/modules/features/video-projects/README.md` | Update if current layout details are missing. |
| `01-Control-Panel/.gitignore` | Confirm/add Python and service runtime ignores. |
| `.gitignore` | Confirm root ignores still cover Control Panel runtime/cache paths. |
| `01-Control-Panel/tests/test_phase8_html_css_readme_structure_refactor.py` or focused docs test | Update/add docs hygiene assertions if useful. |

## Rollback

Revert documentation and ignore-rule edits. Since no runtime source changes are planned, rollback should not affect the app or local service behavior.
