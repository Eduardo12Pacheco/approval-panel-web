# Video Projects module map

This module is organized by responsibility. The migration is structural only: runtime behavior, DOM shape, labels, endpoint payloads, Supabase/API behavior, CSS, and preview lifecycle must stay unchanged.

## Folders

- `index.js` — public feature factory/controller facade.
- `data/` — Supabase, Approval Pipeline, Remotion API client, detail cache, and transport helpers.
- `domain/` — pure normalization, project identity, status labels, formatting, and image candidate helpers.
- `composition/` — composition contract building, preview rows/assets derivation, `CompositionRenderer`, and motion presets.
- `audio/` — `AudioManager` and default background music catalog.
- `render/` — HTML rendering entrypoints, editor/list markup, and render view-models.
- `events/` — DOM event hydration that translates UI events into callbacks.

## Import boundaries

- `domain/` stays pure: no DOM, store, data client, renderer, or event imports.
- `data/` may import domain helpers, but not render/events/composition renderer code.
- `composition/` may import domain and explicit audio integration only; it must not import data, render, or the feature controller.
- `audio/` must not import render/events/data.
- `render/` may import domain, composition display helpers, and event hydration; it must not import API clients or own store mutation logic.
- `events/` should remain lightweight DOM hydration and must not import API clients or composition lifecycle logic.

## Public entrypoints and compatibility facades

- Canonical entrypoints: `index.js`, `data/api.js`, `data/contract-pipeline-client.js`, `render/index.js`, `composition/composition-renderer.js`.
- Compatibility facades remain at root for existing imports: `api.js`, `contract-pipeline-client.js`, `render.js`, `composition-contract.js`, `composition-renderer.js`, `composition-view-model.js`, `audio-manager.js`, and `default-background-music.js`.

## Off-limits preview lifecycle

Do not change `CompositionRenderer` lifecycle, preload/update/seek sequencing, play/pause, scrubber behavior, `requestAnimationFrame`, `AudioManager` lifecycle, preview transport events, or timeline interactions as part of folder/import work.

## Validation commands

Run from `01-Control-Panel/`:

```bash
node --check js/modules/features/video-projects/index.js
node --check js/modules/features/video-projects/render/index.js
node --check js/modules/features/video-projects/render.js
node js/modules/__checks__/video-projects-composition-payload.check.mjs
node js/modules/__checks__/video-projects-manifest-resolution.check.mjs
node js/modules/__checks__/contract-pipeline-client-check.js
node js/modules/__checks__/composition-renderer-preload-window.check.mjs
node js/modules/__checks__/approval-editor-service-timings.check.cjs
pytest tests/test_video_projects_temp_image_cache.py tests/test_video_contract_pipeline_boundary.py tests/test_phase6_runtime_parity_and_boundaries.py tests/test_phase7_runtime_ui_replay_and_rollback.py tests/test_phase9_appshell_decomposition_archive_legacy.py
```
