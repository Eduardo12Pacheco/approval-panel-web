# Exploration: browser-composition-preview

## Current State

The video-projects editor renders previews via **Remotion server-side rendering** — a backend API generates MP4 files that are downloaded and played in a `<video>` element. The user edits composition parameters (motion, dust, logo, transition, images, audio volumes) in the browser, but every visual change requires a full server round-trip to re-render the MP4 preview.

### Current Preview Architecture

**Where `previewUrl` is used:**
- `editorState.preview_url` is set after Remotion server renders the preview (line 37, index.js — `normalizeEditorState`)
- In `render.js` line 445, `buildPreviewMonitor({ previewUrl })` receives it
- Rendered as `<video playsinline preload="metadata" src="${previewUrl}" data-preview-video>` (line 457)
- Also exposed as a direct download link in the footer (line 462)

**Video element lifecycle:**
- Created inside `.video-preview-stage` (16:9 aspect ratio container, max-height min(58vh, 620px))
- Play/pause controlled via `[data-action="toggle-preview-play"]` button + click-on-video
- Events: `loadedmetadata`, `timeupdate`, `play`, `pause`, `ended`

**Timeline/Scrubber:**
- `buildPreviewTimeline(rows, selectedRowId)` generates marker spans positioned by `--pos` CSS variable (% of total duration)
- `[data-preview-scrubber]` is a pointer-drag scrubber (pointerdown/move/up) that seeks the video
- `[data-preview-playhead]` follows `video.currentTime` via requestAnimationFrame loop
- `[data-preview-progress]` is a blue bar showing played portion
- Row markers highlight `is-current` based on which row's time range contains `currentTime`

### Editor Data Model

**`editorRows` (aka `_editorRows`):**
```js
{
  id: string,           // "row-1", "row-2", etc.
  index: number,
  phrase: string,       // caption text
  startTime: number,    // seconds
  endTime: number,      // seconds
  selectedAssetId: string | null,  // URL or candidate ID
  motion: 'slow-zoom-in' | 'slow-zoom-out' | 'pan-left' | 'pan-right' | 'none',
  dust: { enabled: boolean },
  logo: { enabled: boolean },
  filter: { enabled: boolean, mode: 'cover' },
  transition: 'none' | 'fade' | 'slide-left' | 'slide-right',
}
```

**`globalAudio`:**
```js
{
  voice: { volume: 0..1, muted: boolean },
  music: { volume: 0..1, muted: boolean },
}
```

**`editorState` (persisted):**
```js
{
  phase: 'idle' | 'preparing' | 'preview_rendering' | 'preview_ready' | 'editing_dirty' | 'final_rendering' | 'final_ready' | 'error',
  remotion_project_id: string,
  remotion_api_url: string,
  preview_url: string,        // MP4 download URL from Remotion
  final_url: string,          // Final 1080p MP4 URL
  composition_hash: string,   // FNV hash of rows+audio
  last_preview_hash: string,  // hash at last render
  dirty: boolean,             // composition_hash !== last_preview_hash
  export_status: 'idle' | 'rendering' | 'ready' | 'error',
  error: string,
  timed_rows: object[],       // server-side rows
  updated_at: ISO string,
}
```

**State location:**
- `store.getState().selectedVideoProject` — the active project
- `project._editorRows` — live editor rows (may differ from server `timed_rows`)
- `project._globalAudio` — live audio mix
- `project._selectedEditorRowId` — currently selected row
- `project._previewSeekTime` — last seek position for restore

### Change Propagation Flow

When user edits motion/logo/dust/timing/photo:

1. **`updateRow(rowId, patch)`** (index.js line 801):
   - Merges patch into `_editorRows[index]`
   - Recomputes `compositionHash` (FNV hash of JSON `{rows, globalAudio}`)
   - Compares with `last_preview_hash` → sets `dirty = true` if different
   - Sets phase to `editing_dirty`
   - Calls `renderSelectedVideoProject()` (immediate visual update)
   - **Debounced save** (400ms): calls `persistEditorState()` to Supabase RPC

2. **`updateGlobalAudio(kind, patch)`** (index.js line 913):
   - Same pattern: merge → hash → dirty check → render → debounced save

3. **Photo changes** via `uploadAndAssignImage(rowId, file)`:
   - Uploads to Supabase Storage
   - Calls `api.addVideoProjectCustomImages()` RPC
   - Then calls `updateRow(rowId, { selectedAssetId: publicUrl })`

4. **No live preview update** — changes only mark dirty. User must click "Actualizar preview" to re-render via Remotion.

### Save/Persist Flow

**When backend gets called:**
- `persistEditorState(project, patch)` → merges patch into `editor_state`, calls `api.saveVideoProjectEditorState({ draftId, editorState })` which hits Supabase RPC `save_video_project_editor_state`
- Image selection changes: debounced 400ms → `api.saveVideoProjectSelections()`
- Audio upload: immediate → `api.uploadAudioFile()` + `api.saveVideoProjectAudio()`
- Row/audio edits: debounced 400ms → `persistEditorState()`

**Remotion interaction:**
- `preparePreview()`: creates Remotion project via `/api/projects/create-from-approval`, renders preview, stores URL
- `refreshPreview()`: pushes composition via `updateComposition()`, re-renders preview
- `exportFinal()`: pushes composition, renders final 1080p

### CSS/JS Patterns for Preview Area

**CSS structure:**
- `.video-preview-monitor` — container with `--video-preview-content-width` variable (16:9 constrained)
- `.video-preview-stage` — 16:9 aspect-ratio box, black bg, holds `<video>`
- `.video-preview-transport` — 3-column grid: play button | timeline scrubber | timecode
- `.video-preview-timeline__track` — 4px height track with positioned markers
- `.video-preview-timeline__marker` — absolute positioned by `--pos` CSS variable
- `.video-preview-timeline__playhead` — accent-colored moving indicator
- `.video-preview-timeline__progress` — blue fill bar
- Responsive: collapses to single column at 1180px

**JS patterns:**
- Pure DOM manipulation, no framework
- Event delegation via `querySelectorAll` + per-element `addEventListener`
- rAF loop for timeline sync during playback
- Pointer capture for scrubber drag
- State mutations trigger full `renderSelectedVideoProject()` re-render

### Test Infrastructure

- **Python pytest** tests (13 files in `/tests/`)
- Video-projects specific: `test_video_projects_temp_image_cache.py` — 3 tests
- Tests run Node.js ESM scripts via `subprocess.run(["node", ...])` 
- Tests verify HTML output of render functions (string matching on `innerHTML`)
- No unit tests for `index.js` logic (updateRow, hash, etc.)
- No integration tests for the preview/timeline behavior
- No browser/E2E tests

## Affected Areas

- `js/modules/features/video-projects/render.js` — preview rendering, timeline, event hydration
- `js/modules/features/video-projects/index.js` — state management, save flow, composition hash
- `js/modules/features/video-projects/api.js` — Remotion client, Supabase RPCs
- `styles/features/video-projects.css` — preview monitor, timeline, transport styles
- `js/modules/app-shell.js` — wiring, state initialization

## Approaches

### 1. **Canvas-based Composition Preview** — Render composition on HTML5 Canvas
- Use `<canvas>` with 2D context for image transitions, motion (zoom/pan), overlays
- `requestAnimationFrame` loop driven by Web Audio API timing
- Web Audio API for synchronized voice + music playback with volume/mute controls
- CSS animations for dust overlay, logo overlay
- Pros: Full control, no dependencies, works offline, instant feedback
- Cons: Must implement all effects from scratch, complex motion math, image decode pipeline
- Effort: **High**

### 2. **WebGL/Shader-based** — Use WebGL for GPU-accelerated effects
- Similar to Canvas but with fragment shaders for transitions, filters, motion
- Libraries like PixiJS or Three.js could help
- Pros: GPU-accelerated, smooth transitions, can match Remotion output closely
- Cons: Heavy dependency, learning curve, overkill for simple zoom/pan
- Effort: **High**

### 3. **DOM + CSS Animation** — Layered divs with CSS transforms/transitions
- Each segment = positioned `<img>` with CSS `transform` for motion
- CSS `@keyframes` for zoom/pan effects
- Overlays as positioned divs (dust texture, logo)
- `<audio>` elements for voice + music, synced via `timeupdate`
- Pros: Leverages existing CSS skills, inspectable, debuggable, no build step
- Cons: Limited to CSS-achievable effects, potential jank with many layers
- Effort: **Medium**

### 4. **Hybrid DOM + Canvas** — DOM for layout, Canvas for image effects
- Use DOM for transport/timeline/controls (already working)
- Replace `<video>` with `<canvas>` for the stage area
- Canvas handles: image rendering, motion transforms, transitions, overlays
- DOM handles: play button, scrubber, timecode, row markers
- Web Audio API for audio sync
- Pros: Best of both — canvas for smooth image ops, DOM for UI controls
- Cons: Two rendering systems to coordinate
- Effort: **Medium-High**

## Recommendation

**Approach 4 (Hybrid DOM + Canvas)** is the sweet spot:

1. **Keep the existing transport/timeline DOM** — it works well, the scrubber, markers, timecode are solid
2. **Replace `<video>` with `<canvas>`** in `.video-preview-stage`
3. **Use Web Audio API** for synchronized voice + music with the existing volume/mute controls
4. **Canvas render loop** driven by audio `currentTime` (not rAF clock drift)
5. **Image effects in canvas**: drawImage with transforms for zoom/pan, globalAlpha for fades, composite operations for overlays
6. **Keep Remotion for final export** — browser preview is WYSIWYG editing, Remotion handles 1080p export

Key implementation notes:
- The composition hash system (`computeCompositionHash`) stays — it drives the dirty flag
- `preview_url` field becomes optional/null when using browser preview
- `phase` state machine simplifies: no `preview_rendering` step needed for browser preview
- The "Actualizar preview" button becomes unnecessary for visual preview (changes are instant)
- Still need it (or rename it) for final export preparation

## Risks

- **Audio sync precision**: Web Audio API `currentTime` is sample-accurate but DOM `<canvas>` drawing has frame latency. Need to use `audioContext.currentTime` not `audioElement.currentTime` for best sync
- **Image decode pipeline**: Large images need `createImageBitmap()` for async decode before canvas draw
- **Transition complexity**: Crossfade between two images during transition requires double-buffering or layering
- **Performance on mobile**: Canvas compositing with multiple layers + audio may strain lower-end devices
- **Remotion parity**: Browser preview must closely match Remotion output or users will be confused by export differences

## Ready for Proposal

**Yes** — the architecture is clear, the data model is well-structured, and the change propagation flow is clean enough to extend. The main design decision is whether to go full Canvas (approach 4) or try pure DOM/CSS first (approach 3). I recommend starting with approach 3 (DOM/CSS) and only moving to Canvas if performance or visual fidelity demands it.

## Files Inspected

- `js/modules/features/video-projects/render.js` (1357 lines) — all rendering functions
- `js/modules/features/video-projects/index.js` (971 lines) — feature logic, state, save flow
- `js/modules/features/video-projects/api.js` (461 lines) — Supabase + Remotion API client
- `js/modules/features/video-projects/default-background-music.js` (53 lines) — music track catalog
- `styles/features/video-projects.css` (1584 lines) — all video-projects styles
- `js/modules/app-shell.js` — wiring and state initialization
- `js/modules/shared/dom/selectors.js` — DOM element references
- `tests/test_video_projects_temp_image_cache.py` (150 lines) — 3 render output tests
