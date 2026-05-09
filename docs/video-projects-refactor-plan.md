# Video Projects Refactor Plan

Date: 2026-05-08

## Goal

Make `js/modules/features/video-projects/` understandable, navigable, and safe for future maintainers/AI agents while preserving **exactly the same runtime behavior**.

This is a structural refactor plan, not a feature change plan.

## Non-negotiable rules

- Do not change user-facing behavior.
- Do not change DOM shape, IDs, `data-action` attributes, CSS classes, endpoint names, payload keys, visible copy, or storage paths unless explicitly scoped.
- Do not run builds.
- Do not push or commit unless explicitly requested.
- Do not delete legacy/compatibility code without strong evidence and a dedicated deletion phase.
- Do not touch Video Projects preview lifecycle for now:
  - `CompositionRenderer` lifecycle
  - preload/update/seek sequencing
  - play/pause behavior
  - scrubber/timeline behavior
  - `requestAnimationFrame` loop
  - `AudioManager` lifecycle
  - audio/video sync behavior

## Current state

`video-projects/` currently has many files in one flat folder. Recent refactors extracted helpers from the original large `render.js` and `index.js`, but the folder still needs structural organization.

Current files:

```text
api.js
audio-manager.js
composition-contract.js
composition-renderer.js
composition-view-model.js
contract-pipeline-client.js
default-background-music.js
detail-cache.js
editor-markup.js
editor-state.js
editor-view-model.js
formatters.js
image-candidates.js
index.js
motion-presets.js
project-identity.js
project-list-events.js
project-list-markup.js
render.js
setup-events.js
status-labels.js
view-model.js
```

Largest remaining files:

```text
index.js                  ~1027 lines
render.js                 ~1014 lines
composition-renderer.js    ~885 lines
audio-manager.js           ~532 lines
api.js                     ~502 lines
```

## Target folder structure

```text
video-projects/
├─ index.js                         # public feature factory / controller facade
├─ data/
│  ├─ api.js                        # Supabase / Remotion / Approval Pipeline API client for now
│  ├─ detail-cache.js               # detail cache, in-flight dedupe, prefetch
│  └─ contract-pipeline-client.js    # pipeline contract client
├─ domain/
│  ├─ editor-state.js               # editor/global-audio state normalization
│  ├─ formatters.js                 # pure formatting helpers
│  ├─ image-candidates.js           # image candidate URL/dimensions/scoring/blocking
│  ├─ project-identity.js           # project key/title helpers
│  └─ status-labels.js              # phase/status labels
├─ composition/
│  ├─ composition-contract.js        # preview composition contract builder
│  ├─ composition-renderer.js        # browser-local composition renderer
│  ├─ composition-view-model.js      # preview composition rows/assets derivation
│  └─ motion-presets.js             # motion preset catalog
├─ audio/
│  ├─ audio-manager.js              # preview audio manager / clock / fades
│  └─ default-background-music.js    # default music catalog
├─ render/
│  ├─ index.js                      # current render.js moved here
│  ├─ editor-markup.js              # editor timeline/table/detail markup
│  ├─ editor-view-model.js          # editor timeline/table/detail view-models
│  ├─ project-list-markup.js        # project list cards
│  └─ view-model.js                 # selected project view model
└─ events/
   ├─ project-list-events.js        # project list event hydration
   └─ setup-events.js               # non-preview image/audio setup events
```

## Boundary rules for future agents

### `domain/`

Belongs here:

- Pure normalization.
- Project IDs/titles.
- Status/phase labels.
- Candidate URL/dimension/scoring helpers.
- Formatting helpers.
- Editor state normalization.

Must not import:

- DOM APIs.
- `data/`.
- `render/`.
- `events/`.
- `CompositionRenderer`.
- Store/UI objects.

### `data/`

Belongs here:

- Supabase RPC/storage client.
- Approval Pipeline client.
- Remotion API client.
- Detail cache and fetch/prefetch behavior.
- Transport/upload helpers.

May import:

- `domain/` helpers.

Must not import:

- `render/`.
- `events/`.
- DOM markup.
- `CompositionRenderer`.

### `composition/`

Belongs here:

- Composition contract building.
- Preview composition rows/assets derivation.
- Motion presets.
- Browser-local composition renderer.

May import:

- `domain/`.
- `audio/` only for explicit renderer/audio-manager integration.

Must not import:

- `data/`.
- `render/`.
- feature `index.js`.

### `audio/`

Belongs here:

- `AudioManager`.
- Default background music catalog.
- Future audio playback helpers.

Must not import:

- `render/`.
- `events/`.
- `data/` unless a future explicit audio upload data module is created.

### `render/`

Belongs here:

- HTML string builders.
- UI view-models.
- Rendering entrypoints.
- Escaping and presentational assembly.

May import:

- `domain/`.
- `composition/` for preview display assets/renderer.
- `events/` from the render orchestration layer.

Must not import:

- Supabase/Remotion/API clients directly.
- Store mutation logic.
- Feature controller internals.

### `events/`

Belongs here:

- DOM event hydration.
- Translating DOM events into callbacks.

May import:

- Lightweight `domain/` helpers only if needed.

Must not import:

- API clients.
- Store directly.
- Composition mutation/lifecycle logic.

## Known misplaced code

These are not all fixed yet. Some should wait until after folder organization.

1. `contract-pipeline-client.js` duplicates project identity helpers.
   - Should import from `domain/project-identity.js` after the folder move.

2. `index.js` owns composition payload/hash helpers.
   - `hashString`, `computeCompositionHash`, and `buildCompositionPayload` belong in a future `composition/composition-payload.js`.

3. `index.js` owns custom image validation/dimension detection.
   - Image max size/type constants and `detectImageDimensions` belong in a future `domain/image-files.js` or `data/uploads.js`.

4. `api.js` mixes multiple clients.
   - Eventually split into:
     - `data/supabase-client.js`
     - `data/remotion-client.js`
     - `data/approval-pipeline-client.js`
   - Do not split during the structural move unless separately scoped.

5. `composition-contract.js` duplicates legacy candidate URL resolution.
   - Can import from `domain/image-candidates.js` later, after parity checks.

6. `render/index.js` will still contain preview lifecycle and some markup glue.
   - This is intentional for now.

## Phase plan

### Phase 0 — Baseline verification

Purpose: capture current known-good state before moving files.

Tasks:

- Run targeted checks from `01-Control-Panel/`.
- Record current import surfaces from external callers.
- Confirm no new changes touch preview lifecycle.

Checks:

```powershell
node --check js/modules/features/video-projects/index.js
node --check js/modules/features/video-projects/render.js
node js/modules/__checks__/video-projects-composition-payload.check.mjs
node js/modules/__checks__/video-projects-manifest-resolution.check.mjs
node js/modules/__checks__/contract-pipeline-client-check.js
pytest tests/test_video_projects_temp_image_cache.py tests/test_video_contract_pipeline_boundary.py tests/test_phase6_runtime_parity_and_boundaries.py
```

Stop if any check fails unexpectedly.

---

### Phase 1 — Move `domain/` files

Purpose: move pure, low-risk helpers first.

Move:

```text
editor-state.js       → domain/editor-state.js
formatters.js         → domain/formatters.js
image-candidates.js   → domain/image-candidates.js
project-identity.js   → domain/project-identity.js
status-labels.js      → domain/status-labels.js
```

Also move if desired:

```text
motion-presets.js     → composition/motion-presets.js
```

Rules:

- Update imports only.
- Do not modify logic.
- Keep public compatibility if external imports exist.

Checks:

- Node syntax checks for changed modules.
- Video Projects node checks.
- Video Projects pytest slice.

Rollback:

- Move files back and revert import updates.

---

### Phase 2 — Move `render/` and `events/` files

Purpose: group presentational code and DOM event hydration.

Move:

```text
render.js              → render/index.js
view-model.js          → render/view-model.js
editor-view-model.js   → render/editor-view-model.js
editor-markup.js       → render/editor-markup.js
project-list-markup.js → render/project-list-markup.js
project-list-events.js → events/project-list-events.js
setup-events.js        → events/setup-events.js
```

Recommended compatibility facade:

```text
render.js              # temporary re-export from ./render/index.js
```

Reason:

- External imports may still expect `./video-projects/render.js`.
- A facade reduces churn and makes rollback safer.

Rules:

- Do not alter HTML strings.
- Do not alter event selectors.
- Do not move preview lifecycle out of `render/index.js`.

Checks:

- Same targeted checks as Phase 0.
- If available, add parity tests around bootstrap/import boundaries.

Rollback:

- Restore old flat file paths and imports.

---

### Phase 3 — Move `data/` files

Purpose: group transport/cache/client code.

Move:

```text
api.js                      → data/api.js
detail-cache.js             → data/detail-cache.js
contract-pipeline-client.js → data/contract-pipeline-client.js
```

Recommended compatibility facade:

```text
api.js                      # temporary re-export from ./data/api.js
```

Rules:

- Do not split `api.js` yet.
- Do not change URLs, headers, payload keys, storage buckets, or RPC names.
- Do not modify Supabase/Remotion/Approval Pipeline behavior.

Checks:

- Existing Video Projects checks.
- Any check that imports `api.js` or `contract-pipeline-client.js`.

Rollback:

- Move files back or keep facades pointing to previous locations.

---

### Phase 4 — Move `audio/` and `composition/` files

Purpose: group preview composition and audio runtime code.

Move:

```text
audio-manager.js            → audio/audio-manager.js
default-background-music.js → audio/default-background-music.js
composition-contract.js     → composition/composition-contract.js
composition-renderer.js     → composition/composition-renderer.js
composition-view-model.js   → composition/composition-view-model.js
motion-presets.js           → composition/motion-presets.js
```

Rules:

- Do not change `CompositionRenderer` behavior.
- Do not change `AudioManager` behavior.
- Verify browser asset URLs still use app-root paths like `./assets/...`, not module-relative paths.
- Do not change preview lifecycle.

Checks:

- Existing Video Projects checks.
- Approval preview/audio checks if relevant:
  - `node js/modules/__checks__/composition-renderer-preload-window.check.mjs`
  - `node js/modules/__checks__/approval-editor-service-timings.check.cjs`

Rollback:

- Move files back and revert imports.

---

### Phase 5 — Documentation

Purpose: make the structure explicit for future humans and AI agents.

Update:

```text
README.md
js/modules/features/video-projects/README.md
```

Document:

- Folder responsibilities.
- Import boundaries.
- Off-limits preview lifecycle.
- Safe validation commands.
- Public entrypoints/facades.

Suggested `README.md` feature map entry:

```md
- `video-projects/index.js` → feature facade/controller for Video Projects.
- `video-projects/data/*` → Supabase, Approval Pipeline, Remotion client, detail cache.
- `video-projects/domain/*` → pure project/editor/candidate helpers.
- `video-projects/composition/*` → composition contract, preview rows/assets, renderer, motion presets.
- `video-projects/audio/*` → preview audio manager and default music catalog.
- `video-projects/render/*` → HTML rendering and render view-models.
- `video-projects/events/*` → DOM event hydration only.
```

---

### Phase 6 — Optional cleanup after all checks are green

Purpose: reduce temporary compatibility facades and address misplaced code.

Only after the structure is stable:

1. Replace compatibility imports with canonical folder imports.
2. Consider removing facades if no external imports need them.
3. Extract `composition/composition-payload.js` from `index.js`.
4. Extract `domain/image-files.js` or `data/uploads.js` from `index.js`.
5. Split `data/api.js` into client-specific modules.

Do not do this in the same phase as folder moves.

## Checks summary

Minimum checks after every phase:

```powershell
node --check js/modules/features/video-projects/index.js
node js/modules/__checks__/video-projects-composition-payload.check.mjs
node js/modules/__checks__/video-projects-manifest-resolution.check.mjs
node js/modules/__checks__/contract-pipeline-client-check.js
pytest tests/test_video_projects_temp_image_cache.py tests/test_video_contract_pipeline_boundary.py tests/test_phase6_runtime_parity_and_boundaries.py
```

Additional checks when composition/audio files move:

```powershell
node js/modules/__checks__/composition-renderer-preload-window.check.mjs
node js/modules/__checks__/approval-editor-service-timings.check.cjs
```

Recommended broader checks before considering the migration complete:

```powershell
pytest tests/test_phase7_runtime_ui_replay_and_rollback.py
pytest tests/test_phase9_appshell_decomposition_archive_legacy.py
```

## Stop conditions

Stop immediately if:

- A move requires changing preview lifecycle behavior.
- A move requires changing endpoint names, payload keys, DOM attributes, or visible copy.
- Any check fails for a non-obvious reason.
- Asset URLs change from browser-root semantics to module-relative semantics.
- Imports become cyclic through `index.js`.
- A change requires deleting compatibility code.

## Recommended next action

Start with Phase 0 and Phase 1 only:

1. Run baseline checks.
2. Move `domain/` helpers.
3. Update imports.
4. Re-run checks.

If Phase 1 is clean, proceed to Phase 2 in a separate step.
