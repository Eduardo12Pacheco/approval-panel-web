# Design: Control Panel Architecture Refactor

## Technical Approach

Refactor by slices, not by rewrite: move large CSS/JS concerns into focused modules while preserving the current public entry points, DOM IDs, `data-action` values, endpoint names, payload keys, visible copy, and asset URL semantics. `styles.css`, `js/modules/app-shell.js`, `features/video-projects/index.js`, `features/video-projects/render.js`, and legacy Video Projects facades stay as compatibility imports until guardrails prove parity.

No OpenSpec `config.yaml` exists in `01-Control-Panel`, so this design follows the proposal, exploration artifact, real code, and existing parity tests.

## Architecture Decisions

| Area | Decision | Rationale |
|---|---|---|
| CSS split | Replace `styles/features/video-projects.css` with an import-only `styles/features/video-projects/index.css`; keep the `styles.css` import in the same cascade slot. | Matches the existing subtitles CSS facade and reduces cascade drift risk. |
| JS facades | Keep `app-shell.js`, `features/video-projects/index.js`, `features/video-projects/render.js`, `api.js`, and `composition-renderer.js` as public facades during migration. | Existing tests and imports depend on these paths; facades make rollback per slice cheap. |
| Render/controller split | Extract view builders and hydration/lifecycle modules before changing behavior. | `render/index.js` currently mixes markup, event hydration, preview lifecycle, and video selector behavior; moving seams first protects parity. |
| Renderer timing | Do not split playback/audio sequencing first. Extract pure frame math/DOM/video-layer helpers only after render/controller guardrails pass. | `CompositionRenderer` has race-sensitive play/pause/seek/audio code. |
| App shell | Extract shell composition behind `app-shell/index.js`; leave `app-shell.js` as `export { bootApp, bootCompatibilityShell, __testHooks } from './app-shell/index.js';`. | Keeps boot chain `main.js → composition-root.js → app-shell.js` stable. |

## Data Flow

```text
main.js → composition-root.js → app-shell.js facade → app-shell/index.js
  ├─ shell state/services/navigation/settings/events
  └─ video-projects facade
       ├─ controller use-cases → data/domain modules
       └─ render facade → views + hydration → CompositionRenderer facade
```

## File Changes

| File | Action | Description |
|---|---|---|
| `styles.css` | Modify | Change only line 11 to `@import './styles/features/video-projects/index.css';`. |
| `styles/features/video-projects.css` | Delete after split | Source chunks move without selector rewrites. |
| `styles/features/video-projects/index.css` | Create | Import-only facade: `layout.css`, `project-list.css`, `setup-images.css`, `setup-audio.css`, `editor-shell.css`, `editor-controls.css`, `preview-composition.css`, `video-selector.css`, `responsive.css`. |
| `js/modules/features/video-projects/render/index.js` | Modify | Facade exporting focused render/hydration modules. |
| `js/modules/features/video-projects/render/{project-list-view,setup-view,editor-shell-view,preview-lifecycle,editor-hydration,video-selector-hydration,motion-scrub}.js` | Create | Split list/setup/editor markup and event hydration. |
| `js/modules/features/video-projects/controller/{create-video-projects-controller,project-loading,editor-state-persistence,approval-snapshot-operations,preview-export-commands,row-commands,audio-commands,brand-commands}.js` | Create | Extract use-cases from feature controller while preserving returned method names. |
| `js/modules/features/video-projects/index.js` | Modify | Public factory facade delegates to `controller/create-video-projects-controller.js`; retain existing named exports/check helpers. |
| `js/modules/app-shell/{index,state,services,navigation,settings,events,render-callbacks,approval-monitor}.js` | Create | Extract boot composition, state factory, API/controller composition, `setView`, settings, event wiring, render adapters, and news refresh monitor. |
| `js/modules/app-shell.js` | Modify | Compatibility facade only. |
| `js/modules/features/video-projects/composition/renderer/{index,dom,frame-math,video-layers,logo-chroma}.js` | Later create | Pure helper extraction only; no playback sequencing changes. |
| `tests/`, `js/modules/__checks__/`, `docs/parity/*` | Modify | Update path/boundary checks and file-size/import-facade guardrails. |

## Interfaces / Contracts

Public contracts remain: `createVideoProjectsFeature({ api, store, ui, callbacks })`, `renderSelectedVideoProjectView(...)`, `renderVideoProjectsListView(...)`, `updateSelectedVideoProjectCompositionPreview(...)`, `bootApp()`, and `bootCompatibilityShell()`. Extracted modules receive dependency bags; they must not import sibling features directly.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Static | CSS import order, facade-only files, selector/action stability, file-size budgets. | Update Python parity tests and `__checks__/parity-checklist.js`. |
| Unit | Motion scrub values, video selector window sync, row patching, approval snapshot fallback. | Keep/export existing pure helpers from facades. |
| Runtime parity | Boot, navigation, settings hydration, Video Projects list/detail/editor, composition preview controls. | Reuse existing Node checks; add focused checks for extracted hydration modules. |

## Migration / Rollout

1. Add guardrails/file-size report first; no behavior change.
2. Split Video Projects CSS via import facade.
3. Split render markup from hydration, then preview lifecycle, then video selector hydration.
4. Split Video Projects controller use-cases; preserve factory return shape.
5. Extract app-shell state/services/navigation/settings/events behind facade.
6. Only then split pure `CompositionRenderer` helpers.

## What Not To Touch First

- Do not convert `index.html` to templates/components.
- Do not change Radar wiring or behavior in this refactor.
- Do not rename selectors, `data-action`, endpoints, payload keys, copy, or assets.
- Do not split `CompositionRenderer` playback/audio sync until render/controller parity is protected.

## Open Questions

None.
