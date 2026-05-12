# Proposal: Subtitles Controller Decomposition

## Intent

Decompose `features/subtitles/controller.js` behind the existing subtitles facade so the remote subtitles workflow is easier to review and change without altering behavior.

## Scope

### In Scope
- Split controller internals by natural seams: remote session/polling, table editing, preview player, render/save/download orchestration.
- Preserve `createSubtitlesController(...)` as the app-shell-facing factory and keep selector, endpoint, payload, copy, timer, object URL, and phase behavior unchanged.
- Update or keep existing checks so parity and import contracts still cover the new module layout.

### Out of Scope
- No subtitle UX redesign, endpoint/payload changes, framework rewrite, build setup, or feature expansion.
- No refactor of app-shell, audio, scripts, approval, Video Projects, or global check organization.
- No split solely to satisfy line-count budgets; cohesive files may stay larger with rationale.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `control-panel-architecture-refactor`: implementation-only refactor under existing behavioral parity, stable facade/import, navigable boundary, and checks requirements.

## Approach

Keep `features/subtitles/index.js` and `createSubtitlesController` stable. Move cohesive nested logic from `controller.js` into local controller support modules that receive explicit dependencies (`state`, `el`, `api`, `ui`, helpers, browser timers/URL) instead of reaching through globals. Use existing `runtime/` helpers for pure presentation/state behavior; avoid moving behavior-sensitive preview timing unless the extracted seam remains contract-covered.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `01-Control-Panel/js/modules/features/subtitles/controller.js` | Modified | Shrinks to facade/orchestration wiring for subtitles controller. |
| `01-Control-Panel/js/modules/features/subtitles/` | New/Modified | Adds focused support modules for session, table editing, preview, and render workflow. |
| `01-Control-Panel/js/modules/features/subtitles/runtime/` | Modified | Reuse or lightly adjust pure helpers only when extraction needs it. |
| `01-Control-Panel/js/modules/__checks__/` | Modified | Preserve/update subtitles parity and architecture checks for new paths. |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Subtitle phase or polling behavior drifts | Med | Keep timers/status transitions unchanged and covered by checks. |
| Table edit/drag/drop edge cases regress | Med | Extract as one cohesive seam first; preserve row IDs and validation helpers. |
| Preview object URL or seek timing leaks | Med | Keep cleanup and browser dependency injection explicit. |

## Rollback Plan

Revert this change folder and the subtitles module/check edits. Because public facades and contracts remain stable, rollback should restore the prior monolithic controller without app-shell changes.

## Dependencies

- Existing `control-panel-architecture-refactor` spec.
- Existing subtitles runtime helpers and parity checks.

## Success Criteria

- [ ] `createSubtitlesController(...)` import and returned behavior remain compatible.
- [ ] No user-visible copy, selectors, payloads, endpoints, or phase names change.
- [ ] Controller logic is organized by concern with any large cohesive exceptions documented.
- [ ] Existing relevant checks pass or are updated without weakening behavior coverage.
