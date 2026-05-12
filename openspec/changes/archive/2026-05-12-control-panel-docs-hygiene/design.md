# Design: Control Panel Docs Hygiene

## Outcome

Refresh current docs so they describe the tree as it is now: frontend modules under `js/`, static browser assets under `assets/`, the Approval Editor service under `services/approval-editor/`, current checks, and no-build validation.

## Decisions

| Decision | Why |
|---|---|
| Treat `01-Control-Panel/README.md` as the human/agent entrypoint. | Future agents should not reconstruct the current architecture from archived SDD history. |
| Mark old plans as stale instead of deleting them. | `docs/video-projects-refactor-plan.md` still has historical value but currently overstates pending work. |
| Preserve archived OpenSpec files unchanged. | Archives are audit records; rewriting them corrupts traceability. |
| Use docs/search assertions over builds. | Scope is docs/source-tree hygiene only; project standard says no build. |

## File Plan

| Path | Planned change |
|---|---|
| `01-Control-Panel/README.md` | Add/refresh `assets/` map, `services/approval-editor/` details, current Video Projects folders including `controller/`, compatibility facades, checks, and no-build validation. |
| `01-Control-Panel/docs/video-projects-refactor-plan.md` | Add a top warning that the plan is historical/partially completed and link to the module README for current layout. |
| `01-Control-Panel/js/modules/features/video-projects/README.md` | Refresh only if it lacks current folders such as `controller/`, `data/*`, `render/*`, or compatibility facade context. |
| `01-Control-Panel/.gitignore` | Confirm/add `.pytest_cache/`, `__pycache__/`, `*.py[cod]`, and `services/approval-editor/projects/`. |
| `.gitignore` | Confirm existing root ignores still protect Control Panel service runtime and Python caches; update only if missing. |
| `01-Control-Panel/tests/test_phase8_html_css_readme_structure_refactor.py` or new focused test | Add docs hygiene assertions if current tests do not cover the README/doc/ignore guarantees. |

## Validation

- Search active, non-archive docs for stale active `approval-editor-service/` service-path references; allow explicit migration notes only.
- Run focused docs/ignore pytest if updated.
- Run `node --check services/approval-editor/server.js` only if documentation examples are changed around that command.
- Do not run a build.

## Risks

- `docs/video-projects-refactor-plan.md` mixes useful boundaries with stale migration state; the edit must warn clearly without erasing context.
- Empty locked old service directories or archived paths may still exist; docs should distinguish historical/migration notes from active paths.
