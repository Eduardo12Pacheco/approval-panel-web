# Design: Subtitles Controller Decomposition

## Technical Approach

Keep `createSubtitlesController(...)` as the stable app-shell-facing facade and decompose only its private implementation. The controller becomes a wiring layer that builds focused collaborators for session/polling, preview playback, table editing, workflow rendering, and render/save/download commands. Behavior-sensitive constants, selectors, Spanish copy, endpoints, payload keys, phase names, timer cadence, and object URL lifecycle stay unchanged.

This maps to the spec requirements by preserving the public import/return contract while making the existing concerns discoverable behind local `features/subtitles/controller/` seams.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Facade stability | Keep `js/modules/features/subtitles/controller.js` exporting `createSubtitlesController(...)` and returning the same method names. | Move callers to `features/subtitles/index.js`; rename methods. | `app-shell/runtime.js` binds 30+ handlers directly. Changing that would widen scope and risk behavior drift. |
| Extraction shape | Add private support modules under `features/subtitles/controller/`. | Put modules in `runtime/`; split by technical layer only. | `runtime/` currently hosts pure helpers/state. The extracted code mutates state/DOM/API, so a controller subfolder is clearer. |
| Shared mutable context | Pass an explicit context object (`state`, `el`, `api`, `ui`, helpers, timers, URL/window, render callbacks). | Import globals or duplicate helpers in every file. | Explicit dependencies preserve testability and avoid hidden browser/app-shell coupling. |
| File size | Aim for focused files under ~300 LOC; allow cohesive 300-500 LOC modules with comments/checks. | Enforce tiny files mechanically. | User explicitly allowed large files when necessary; cohesion and parity are more important than arbitrary line count. |

## Data Flow

```text
app-shell/runtime.js
  └─ createSubtitlesController(deps)
      ├─ session-controller: upload, hydrate, history, polling, phase transitions
      ├─ render-commands: save, ready/render, download
      ├─ table-editor: row patching, timing validation, draft drag/drop
      ├─ preview-player: object URL, duration, seek, drag timeline, overlay state
      └─ workflow-renderer: health/history/phases/meta/cards/table/buttons

Remote session: upload → create session → load preview blob → hydrate/status → poll until editing/rendered
Editing: table event → table-editor mutates rows → workflow/overlay render → action buttons update
Preview: media/timeline event → preview-player updates ms/duration → overlay/timeline render
```

## File Changes

| File | Action | Description |
|---|---|---|
| `01-Control-Panel/js/modules/features/subtitles/controller.js` | Modify | Keep facade, normalize dependencies, create collaborators, return existing public methods. |
| `01-Control-Panel/js/modules/features/subtitles/controller/context.js` | Create | Build shared controller context: browser adapters, helpers, constants, render registry. |
| `01-Control-Panel/js/modules/features/subtitles/controller/session.js` | Create | Polling, reset, phase resolution/transition, upload, hydrate, health/history rename/delete. |
| `01-Control-Panel/js/modules/features/subtitles/controller/render-workflow.js` | Create | DOM rendering for health, history, phase bar/sections, language picker, metadata, processing/done card, table/buttons. |
| `01-Control-Panel/js/modules/features/subtitles/controller/table-editor.js` | Create | Row patching, timing input/nudge/delete/add, draft drag/drop, last non-draft lookup. |
| `01-Control-Panel/js/modules/features/subtitles/controller/preview-player.js` | Create | Preview blob URL lifecycle, video duration, overlay/timeline/playback state, seek and drag cleanup. |
| `01-Control-Panel/js/modules/features/subtitles/controller/render-commands.js` | Create | Save segments, ready/start render, render polling handoff, download. |
| `01-Control-Panel/tests/test_subtitle2_parity_polish.py` | Modify | Update source aggregation to include new controller support modules; keep contract tokens. |
| `01-Control-Panel/js/modules/__checks__/subtitles-controller-seams.check.mjs` | Create | Node check that facade exports remain stable and expected seam files exist/import without syntax errors. |

## Interfaces / Contracts

```js
createSubtitlesController({ state, el, api, ui, helpers, customDropdowns, browser })
// returns existing keys: pollRemoteSubtitleSessionStatus, pollRemoteSubtitleRenderStatus,
// stopPolling, resetRunState, renderWorkflow, hydrateSession, setPhaseFromRemoteStatus,
// all current event handlers, renameHistorySession, deleteHistorySession.
```

Collaborators return plain method objects and receive only the shared context plus required peer methods, e.g. `createSubtitlePreviewPlayer(ctx, { renderWorkflow, renderTable, updateButtons })`.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | Pure subtitle helpers and existing preview scaling/seek/render-state behavior. | Keep current Node snippets in `test_subtitle2_parity_polish.py`. |
| Seam | Facade contract and expected decomposition files. | Add `node --test js/modules/__checks__/subtitles-controller-seams.check.mjs`. |
| Regression | Existing app-shell/subtitles parity, selectors, endpoints, copy, object URL reset behavior. | Update existing Python token/source aggregation without weakening assertions. |
| Boundary | No sibling feature imports; app-shell direct binding remains valid. | Existing phase 6/7 boundary checks. |

## Migration / Rollout

No data migration required. Extract in phases: (1) context + renderer, (2) preview player, (3) table editor, (4) session/polling, (5) render/save/download, (6) shrink facade and add seam check. After each phase, keep public return keys green.

## Open Questions

- None.
