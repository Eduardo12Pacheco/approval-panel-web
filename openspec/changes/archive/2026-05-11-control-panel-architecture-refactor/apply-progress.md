# Apply Progress: Control Panel Architecture Refactor

## Scope

- **Work Units**: 1 — guardrails + Video Projects CSS facade/split; 2 — Video Projects render view/hydration seams; 3 — Video Projects controller use-case seams; 4 — app-shell facade extraction; 5 — pure CompositionRenderer helper split
- **Mode**: Strict TDD
- **Delivery**: `auto-chain`, `feature-branch-chain`, PR 5 boundary (base = PR 4 branch)

## Completed Tasks

- [x] 1.1 Path/size/facade checks for 500-line soft cap and import-only facades.
- [x] 1.2 CSS cascade checks for Video Projects protected selectors.
- [x] 1.3 Import-contract checks for stable facades and no sibling-feature imports.
- [x] 2.1 Created `styles/features/video-projects/index.css` with ordered imports.
- [x] 2.2 Split `styles/features/video-projects.css` into focused chunks without selector renames.
- [x] 2.3 Updated `styles.css` cascade slot and removed the monolith import target.
- [x] 2.4 Updated parity docs with CSS rollback and selector contracts.
- [x] 2.5 Fixed stale Video Segment Picker UX CSS check to read the new import-only facade recursively.
- [x] 3.1 Added render seam checks for facade exports, list empty-state copy, split-module delegation, preview hydration, and video-selector sync.
- [x] 3.2 Split `js/modules/features/video-projects/render/index.js` into focused render, setup, editor, preview lifecycle, video selector hydration, editor hydration, and motion scrub modules.
- [x] 3.3 Kept `render/index.js` and `render.js` as stable facades exporting current contracts.
- [x] 4.1 Added controller seam checks for facade API shape, project loading, state persistence, snapshot fallback, preview/export, and row helper exports.
- [x] 4.2 Split `js/modules/features/video-projects/index.js` controller logic into focused controller/use-case modules behind `createVideoProjectsController`.
- [x] 4.3 Kept `createVideoProjectsFeature` and helper exports stable, added controller rollback scope documentation.
- [x] 5.1 Added app-shell seam checks for facade delegation, valid navigation views including Radar, settings hydration/save wiring, state factory, render callback preservation, file-size guardrails, and rollback docs.
- [x] 5.2 Extracted app-shell facade modules under `js/modules/app-shell/`, made `js/modules/app-shell.js` a small compatibility facade, preserved the boot chain, and wired Radar as a valid shell view without touching CompositionRenderer.
- [x] 5.3 Added renderer helper parity checks and extracted pure `composition/renderer/{index,dom,frame-math,video-layers,logo-chroma}.js` helpers while keeping `composition-renderer.js` as the public `CompositionRenderer` facade and preserving playback/audio sequencing.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1 | `tests/test_phase6_runtime_parity_and_boundaries.py` | Static/contract | ⚠️ Existing focused suite had 1 expected CSS split failure before this slice | ✅ Missing CSS facade/chunks failed | ✅ 30/30 focused phase5+phase6 passed | ✅ Missing-file + oversize paths | ✅ Future JS split files documented as temporary exceptions |
| 1.2 | `tests/test_phase5_css_split_parity.py`, `js/modules/__checks__/css-computed-style-parity.js` | Static/computed-style | ⚠️ Same existing CSS split failure | ✅ Video Projects selector parity failed before baseline update | ✅ 30/30 focused phase5+phase6 passed | ✅ Layout/card/composition selectors | ✅ Recursive CSS import resolution preserved cascade checks |
| 1.3 | `tests/test_phase6_runtime_parity_and_boundaries.py`, `js/modules/__checks__/parity-checklist.js`, `js/modules/__checks__/dependency-boundary-validator.js` | Contract/unit | ✅ 29/29 focused checks passed before adding facade-contract test | ✅ Missing `validateNoSiblingFeatureImports` and facade checks failed | ✅ 30/30 focused phase5+phase6 passed | ✅ Baseline pass + mutated sibling/import facade failures | ✅ Kept checks pure and source-string based |
| 2.1-2.3 | `tests/test_phase5_css_split_parity.py`, `tests/test_phase6_runtime_parity_and_boundaries.py` | Static/cascade | ⚠️ Existing CSS split assertion was red before implementation | ✅ Facade/chunks missing and `styles.css` import drift failed | ✅ 42 focused pytest checks + editor assets Node check passed | ✅ Import order + computed-style selectors | ✅ Nested editor-control CSS facade keeps chunks under soft cap |
| 2.4 | `tests/test_phase5_css_split_parity.py`, docs assertions | Static/docs | ✅ Existing docs checks available | ✅ Docs lacked Video Projects rollback/selector contract text | ✅ 42 focused pytest checks passed | ✅ Style guard + contract matrix evidence | ✅ Rollback scoped to CSS only |
| 2.5 | `js/modules/__checks__/video-segment-picker-ux.check.mjs` | Runtime/static CSS contract | ❌ `node --test js/modules/__checks__/video-segment-picker-ux.check.mjs` failed with `ENOENT` on deleted `styles/features/video-projects.css` | ✅ Existing check failure captured before edit | ✅ 18/18 Video Segment Picker UX checks passed after reading `styles/features/video-projects/index.css` recursively | ✅ Imported facade resolves nested chunks and preserves selector assertions | ✅ Reused the existing recursive CSS import-reader pattern without changing runtime modules |
| 3.1 | `js/modules/__checks__/video-projects-render-seams.check.mjs`, `tests/test_phase6_runtime_parity_and_boundaries.py` | Contract/runtime hydration | ✅ 22/22 phase6, 18/18 video selector, editor assets, payload checks passed before edits | ✅ Missing split render files and render seam check failed | ✅ 23/23 phase6 and 4/4 render seam checks passed | ✅ Empty-state copy + facade delegation + selector preview hydration/root modal cases | ✅ Assertions stay behavioral/source-contract based, not CSS-class-only |
| 3.2 | `tests/test_phase6_runtime_parity_and_boundaries.py`, `js/modules/__checks__/video-segment-picker-ux.check.mjs` | Static/runtime parity | ✅ Same focused safety net | ✅ File-size guard failed for missing split modules and monolithic render index | ✅ Focused render parity suite passed | ✅ Preview lifecycle + selector sync stayed covered by existing 18-case UX check | ✅ Composition renderer lifecycle moved without changing playback sequencing internals |
| 3.3 | `js/modules/__checks__/video-projects-render-seams.check.mjs` | Facade contract | ✅ Existing `render.js` export facade stayed import-only | ✅ Facade contract check failed until `render/index.js` re-exported stable public functions from split modules | ✅ Render seam check 4/4 passed | ✅ Public exports + delegated list module identity | ✅ `render/index.js` is now a small re-export facade; `render.js` remains unchanged |
| 4.1 | `js/modules/__checks__/video-projects-controller-seams.check.mjs`, `tests/test_phase6_runtime_parity_and_boundaries.py` | Contract/unit | ✅ 23/23 phase6, 4/4 render seams, 18/18 Video Segment Picker UX, composition payload passed before edits | ✅ Missing controller modules and controller seam runner failed | ✅ 25/25 phase6 and 3/3 controller seam checks passed | ✅ API-shape, project-loading render order, state persistence, fallback, preview/export, and row-helper cases | ✅ Source-contract assertions verify facade delegation instead of rechecking internal line-by-line code |
| 4.2 | `tests/test_phase6_runtime_parity_and_boundaries.py`, `js/modules/__checks__/video-projects-controller-seams.check.mjs` | Static/controller parity | ✅ Same focused safety net | ✅ File-size guard failed for missing controller modules and oversized controller facade exception removal | ✅ Controller seam GREEN checks passed | ✅ Facade return-shape plus focused module exports force real split | ✅ `index.js` reduced to a stable facade delegating to `controller/create-video-projects-controller.js` |
| 4.3 | `tests/test_phase6_runtime_parity_and_boundaries.py` | Static/docs | ✅ Controller seam suite green before docs check | ✅ Controller rollback-scope doc check failed before documentation update | ✅ 25/25 phase6 and focused JS checks passed | ✅ Contract matrix covers controller evidence and rollback boundaries | ✅ Rollback scope excludes app-shell, Radar, CSS, render, and CompositionRenderer changes |
| 5.1 | `js/modules/__checks__/app-shell-seams.check.mjs`, `tests/test_phase6_runtime_parity_and_boundaries.py` | Static/unit shell seam | ⚠️ Focused safety net had known Radar static shell gap before this slice | ✅ Missing app-shell modules, Radar navigation validity, facade delegation, settings controller, and P6 docs failed | ✅ 3/3 focused phase6 app-shell checks and 4/4 app-shell seam checks passed | ✅ Valid views include approval/scripts/audio/radar/subtitulos2 plus invalid fallback; settings hydrate/save covers approval + Radar settings | ✅ Assertions are source/behavior contract checks, not CSS-class-only checks |
| 5.2 | `tests/test_phase6_runtime_parity_and_boundaries.py`, `tests/test_radar_panel_contract.py`, `tests/test_phase1_slice0_bootstrap_parity.py`, `tests/test_phase2_slice1_core_utilities_parity.py`, `tests/test_phase3_approval_scripts_extraction_parity.py`, `tests/test_phase4_audio_subtitles_extraction_parity.py`, `tests/test_phase9_appshell_decomposition_archive_legacy.py`, `js/modules/__checks__/app-shell-seams.check.mjs` | Static/runtime shell parity | ⚠️ Initial safety net showed the pre-existing Radar app-shell import gap; this WU explicitly scoped it into navigation guardrails | ✅ File-size guard failed while modules/facades were absent or oversized | ✅ 63 focused pytest checks and 4/4 app-shell seam checks passed | ✅ Facade contract + module existence + Radar static contract + settings/state/render callbacks | ✅ `app-shell.js` delegates to `app-shell/index.js`; large migrated runtime remains isolated behind focused WU4 seams without CompositionRenderer changes |
| 5.3 | `js/modules/__checks__/composition-renderer-helpers.check.mjs`, `tests/test_phase6_runtime_parity_and_boundaries.py`, `js/modules/__checks__/video-segment-picker-ux.check.mjs`, `js/modules/__checks__/composition-cover-pan-check.js`, `js/modules/__checks__/composition-renderer-preload-window.check.mjs`, `js/modules/__checks__/video-projects-composition-payload.check.mjs` | Static/unit/runtime composition parity | ✅ 27/27 phase6, 18/18 Video Segment Picker UX, cover-pan, preload-window, and payload checks passed before edits | ✅ Missing `composition/renderer/*` files and helper facade parity check failed | ✅ 28/28 phase6, 3/3 renderer helper checks, 18/18 Video Segment Picker UX, cover-pan, preload-window, and payload checks passed | ✅ Frame math + active segment + cover-pan, video layer planning/sync, DOM layer order, logo chroma detection | ✅ `composition-renderer.js` stays public facade/lifecycle class; pure helper modules are under 500-line guardrails and no file-size exceptions remain |

## Test Summary

- **Total new/updated tests/checks**: Python parity checks plus JS source-string/controller seam checks.
- **Focused run**: `python -m pytest tests/test_phase5_css_split_parity.py tests/test_phase6_runtime_parity_and_boundaries.py tests/test_phase8_html_css_readme_structure_refactor.py && node js/modules/__checks__/editor-assets-tab-check.js`
- **Result**: 42 pytest checks passed; `editor-assets-tab-check: ok`.
- **Verification retry**: `node --test js/modules/__checks__/video-segment-picker-ux.check.mjs` → 18/18 passed.
- **Work Unit 1 rerun**: `python -m pytest tests/test_phase5_css_split_parity.py tests/test_phase6_runtime_parity_and_boundaries.py tests/test_phase8_html_css_readme_structure_refactor.py && node js/modules/__checks__/editor-assets-tab-check.js` → 42 pytest checks passed; `editor-assets-tab-check: ok`.
- **Work Unit 2 safety net**: `python -m pytest tests/test_phase6_runtime_parity_and_boundaries.py && node --test js/modules/__checks__/video-segment-picker-ux.check.mjs && node js/modules/__checks__/editor-assets-tab-check.js` → 22/22 phase6, 18/18 Video Segment Picker UX, editor assets check passed before edits.
- **Work Unit 2 RED**: `python -m pytest tests/test_phase6_runtime_parity_and_boundaries.py -k "render_facade_and_hydration_seams or architecture_file_size" && node --test js/modules/__checks__/video-projects-render-seams.check.mjs` → failed on missing split render modules/render seam imports.
- **Work Unit 2 GREEN/REFACTOR**: `python -m pytest tests/test_phase6_runtime_parity_and_boundaries.py && node --test js/modules/__checks__/video-projects-render-seams.check.mjs && node --test js/modules/__checks__/video-segment-picker-ux.check.mjs && node js/modules/__checks__/editor-assets-tab-check.js && node js/modules/__checks__/video-projects-composition-payload.check.mjs` → 23/23 phase6, 4/4 render seam, 18/18 Video Segment Picker UX, editor assets, and payload checks passed.
- **Work Unit 3 safety net**: `python -m pytest tests/test_phase6_runtime_parity_and_boundaries.py && node --test js/modules/__checks__/video-projects-render-seams.check.mjs && node --test js/modules/__checks__/video-segment-picker-ux.check.mjs && node js/modules/__checks__/video-projects-composition-payload.check.mjs` → 23/23 phase6, 4/4 render seams, 18/18 Video Segment Picker UX, and payload check passed before edits.
- **Work Unit 3 RED**: `python -m pytest tests/test_phase6_runtime_parity_and_boundaries.py -k "controller_facade_and_use_case_seams or architecture_file_size" && node --test js/modules/__checks__/video-projects-controller-seams.check.mjs` → failed on missing controller modules and controller seam runner; later docs RED failed on missing controller rollback scope.
- **Work Unit 3 GREEN/REFACTOR**: `python -m pytest tests/test_phase6_runtime_parity_and_boundaries.py && node --test js/modules/__checks__/video-projects-controller-seams.check.mjs && node --test js/modules/__checks__/video-projects-render-seams.check.mjs && node --test js/modules/__checks__/video-segment-picker-ux.check.mjs && node js/modules/__checks__/video-projects-composition-payload.check.mjs` → 25/25 phase6, 3/3 controller seams, 4/4 render seams, 18/18 Video Segment Picker UX, and payload check passed.
- **Work Unit 4 safety net**: `python -m pytest tests/test_phase6_runtime_parity_and_boundaries.py tests/test_radar_panel_contract.py tests/test_phase9_appshell_decomposition_archive_legacy.py tests/test_phase1_slice0_bootstrap_parity.py` → 44 passed, 1 pre-existing Radar app-shell wiring failure captured before edits.
- **Work Unit 4 RED**: `python -m pytest tests/test_phase6_runtime_parity_and_boundaries.py -k "app_shell_facade_navigation_settings_and_render_callback_seams or app_shell_rollback_scope_is_documented or architecture_file_size" && node --test js/modules/__checks__/app-shell-seams.check.mjs` → failed on missing app-shell modules/facade seams and missing P6 rollback docs.
- **Work Unit 4 GREEN/REFACTOR**: `python -m pytest tests/test_phase3_approval_scripts_extraction_parity.py tests/test_phase4_audio_subtitles_extraction_parity.py tests/test_phase2_slice1_core_utilities_parity.py tests/test_phase6_runtime_parity_and_boundaries.py tests/test_radar_panel_contract.py tests/test_phase9_appshell_decomposition_archive_legacy.py tests/test_phase1_slice0_bootstrap_parity.py && node --test js/modules/__checks__/app-shell-seams.check.mjs` → 63 pytest checks and 4/4 app-shell seam checks passed.
- **Unrelated legacy suite observation**: `python -m pytest tests/test_phase5_css_split_parity.py tests/test_ui_design_recomposition.py tests/test_phase3_approval_scripts_extraction_parity.py tests/test_phase7_runtime_ui_replay_and_rollback.py tests/test_subtitle2_parity_polish.py tests/test_phase4_audio_subtitles_extraction_parity.py tests/test_phase2_slice1_core_utilities_parity.py` → app-shell source contract failures were fixed; unrelated UI-design/resource replay failures remain outside WU4.
- **Work Unit 5 safety net**: `python -m pytest tests/test_phase6_runtime_parity_and_boundaries.py`, `node --test js/modules/__checks__/video-segment-picker-ux.check.mjs`, `node js/modules/__checks__/composition-cover-pan-check.js`, `node js/modules/__checks__/composition-renderer-preload-window.check.mjs`, `node js/modules/__checks__/video-projects-composition-payload.check.mjs` → 27/27 phase6, 18/18 Video Segment Picker UX, cover-pan, preload-window, and payload checks passed before edits.
- **Work Unit 5 RED**: `python -m pytest tests/test_phase6_runtime_parity_and_boundaries.py -k "composition_renderer_pure_helper_facade_parity or architecture_file_size"` and `node --test js/modules/__checks__/composition-renderer-helpers.check.mjs` → failed on missing `composition/renderer/index.js` and missing split helper files.
- **Work Unit 5 GREEN/REFACTOR**: `python -m pytest tests/test_phase6_runtime_parity_and_boundaries.py`, `node --test js/modules/__checks__/composition-renderer-helpers.check.mjs`, `node --test js/modules/__checks__/video-segment-picker-ux.check.mjs`, `node js/modules/__checks__/composition-cover-pan-check.js`, `node js/modules/__checks__/composition-renderer-preload-window.check.mjs`, `node js/modules/__checks__/video-projects-composition-payload.check.mjs` → 28/28 phase6, 3/3 renderer helper checks, 18/18 Video Segment Picker UX, cover-pan, preload-window, and payload checks passed.
- **Build**: Not run, per constraint.

## Files Changed

| File | Action | What changed |
|------|--------|--------------|
| `styles.css` | Modified | Video Projects import now points to the facade in the same cascade slot. |
| `styles/features/video-projects.css` | Deleted | Replaced by focused CSS chunks. |
| `styles/features/video-projects/*.css` | Created | Split layout, list, setup, editor, preview, selector, and responsive concerns. |
| `tests/test_phase5_css_split_parity.py` | Modified | Added facade order and Video Projects computed-style coverage. |
| `tests/test_phase6_runtime_parity_and_boundaries.py` | Modified | Added file-size/facade, import-boundary, render seam, controller seam, and rollback-scope guardrails. |
| `tests/test_phase8_html_css_readme_structure_refactor.py` | Modified | Updated legacy style import expectation. |
| `js/modules/__checks__/css-computed-style-parity.js` | Modified | Added protected Video Projects selectors. |
| `js/modules/__checks__/parity-checklist.js` | Modified | Added Video Projects facade/import contract checks. |
| `js/modules/__checks__/dependency-boundary-validator.js` | Modified | Added sibling feature import validator. |
| `js/modules/__checks__/editor-assets-tab-check.js` | Modified | Reads the new CSS facade recursively. |
| `js/modules/__checks__/video-segment-picker-ux.check.mjs` | Modified | Reads `styles/features/video-projects/index.css` recursively instead of the deleted monolith. |
| `docs/parity/style-guards.md` | Modified | Documented Video Projects CSS facade and rollback. |
| `docs/parity/contract-matrix.md` | Modified | Added Video Projects CSS and controller evidence plus rollback scopes. |
| `js/modules/features/video-projects/render/index.js` | Modified | Replaced monolith with stable render facade re-exporting focused modules. |
| `js/modules/features/video-projects/render/project-list-view.js` | Created | Owns Video Projects list rendering and project-card hydration. |
| `js/modules/features/video-projects/render/setup-view.js` | Created | Owns setup/audio phase markup and setup event hydration. |
| `js/modules/features/video-projects/render/editor-shell-view.js` | Created | Owns editor shell/preparing/status markup. |
| `js/modules/features/video-projects/render/selected-project-view.js` | Created | Orchestrates selected project view composition behind the stable facade. |
| `js/modules/features/video-projects/render/preview-lifecycle.js` | Created | Owns composition renderer lifecycle, preview transport, and selector layer sync. |
| `js/modules/features/video-projects/render/video-selector-hydration.js` | Created | Owns video-selector modal/open/drag/commit/preview hydration. |
| `js/modules/features/video-projects/render/editor-hydration.js` | Created | Owns editor row, asset, motion, brand, audio, and export event hydration. |
| `js/modules/features/video-projects/render/motion-scrub.js` | Created | Owns motion scrub pure value math and pointer handlers. |
| `js/modules/__checks__/video-projects-render-seams.check.mjs` | Created | Adds render facade/export, list copy, and video-selector hydration seam checks. |
| `js/modules/features/video-projects/index.js` | Modified | Reduced to a stable public facade delegating to `createVideoProjectsController` and re-exporting public helpers. |
| `js/modules/features/video-projects/controller/create-video-projects-controller.js` | Created | Composes Video Projects controller use-cases and preserves returned API shape. |
| `js/modules/features/video-projects/controller/project-loading.js` | Created | Owns refresh/open project loading commands and selected editor-state hydration. |
| `js/modules/features/video-projects/controller/editor-state-persistence.js` | Created | Owns editor-state persistence, selected project hydration, and step state helper. |
| `js/modules/features/video-projects/controller/approval-snapshot-operations.js` | Created | Owns approval service client creation, snapshot commit queue, canonical snapshot application, and motion draft flushing. |
| `js/modules/features/video-projects/controller/preview-export-commands.js` | Created | Owns prepare preview, refresh preview, and final export commands. |
| `js/modules/features/video-projects/controller/row-commands.js` | Created | Owns row patch helpers, approval fallback detection, and row update command. |
| `js/modules/features/video-projects/controller/audio-commands.js` | Created | Owns global audio update command. |
| `js/modules/features/video-projects/controller/brand-commands.js` | Created | Owns brand channel update command. |
| `js/modules/__checks__/video-projects-controller-seams.check.mjs` | Created | Adds controller facade/API shape, project loading, persistence, fallback, preview/export, and helper seam checks. |
| `js/modules/app-shell.js` | Modified | Small compatibility facade preserving `bootApp`, `bootCompatibilityShell`, and `__testHooks`. |
| `js/modules/app-shell/index.js` | Created | Public app-shell module facade delegating to runtime composition. |
| `js/modules/app-shell/runtime.js` | Created | Migrated shell composition runtime behind the app-shell facade and wired Radar navigation/controller. |
| `js/modules/app-shell/state.js` | Created | Owns initial shell state factory. |
| `js/modules/app-shell/navigation.js` | Created | Owns valid shell view normalization, including Radar fallback guardrails. |
| `js/modules/app-shell/settings.js` | Created | Owns settings hydration/save and news-search timestamp storage wiring. |
| `js/modules/app-shell/services.js` | Created | Adds shell service registry seam. |
| `js/modules/app-shell/events.js` | Created | Adds shell event binding seam. |
| `js/modules/app-shell/render-callbacks.js` | Created | Adds render callback contract seam for approval, scripts, and Video Projects rendering. |
| `js/modules/app-shell/approval-monitor.js` | Created | Adds approval monitor refresh seam. |
| `js/modules/__checks__/app-shell-seams.check.mjs` | Created | Adds app-shell facade, navigation, settings, state, and render callback seam checks. |
| `docs/parity/contract-matrix.md` | Modified | Added P6 app-shell acceptance and rollback scope. |
| `js/modules/features/video-projects/composition/composition-renderer.js` | Modified | Reduced to the public renderer facade/lifecycle class and imports pure helpers from `composition/renderer/`. |
| `js/modules/features/video-projects/composition/renderer/index.js` | Created | Stable helper barrel for renderer helper imports. |
| `js/modules/features/video-projects/composition/renderer/dom.js` | Created | Owns composition DOM/layer construction and DOM constants. |
| `js/modules/features/video-projects/composition/renderer/frame-math.js` | Created | Owns frame math, zoom/cover-pan calculations, active segment resolution, and image dimension resolution. |
| `js/modules/features/video-projects/composition/renderer/video-layers.js` | Created | Owns video segment layer planning and managed video sync helpers. |
| `js/modules/features/video-projects/composition/renderer/logo-chroma.js` | Created | Owns logo constants, green-screen logo detection, and chroma-key drawing helper. |
| `js/modules/__checks__/composition-renderer-helpers.check.mjs` | Created | Adds helper facade parity, video layer sync, DOM order, and logo chroma checks. |
| `js/modules/__checks__/video-segment-picker-ux.check.mjs` | Modified | Reads renderer DOM source after the pure helper split while preserving existing UX/composition assertions. |
| `docs/parity/contract-matrix.md` | Modified | Added P6 app-shell and P7 CompositionRenderer helper acceptance/rollback scopes. |
| `openspec/changes/control-panel-architecture-refactor/tasks.md` | Modified | Marked Work Unit 5 CompositionRenderer helper task complete. |
| `openspec/changes/control-panel-architecture-refactor/apply-progress.md` | Modified | Merged cumulative Work Units 1-5 apply progress and TDD evidence. |

## Deviations

- `editor-controls.css` is a tiny nested facade that imports focused editor-control chunks. This preserves the required top-level facade order while keeping CSS chunks below the 500-line soft cap.
- `composition-renderer.js` remains the public lifecycle/playback facade; helper extraction lowered it below the 500-line soft cap without changing audio/playback sequencing.
- `selected-project-view.js` is an orchestration seam that composes setup/editor markup and hydration modules. It is intentionally kept behind `render/index.js` so public imports remain unchanged.
- `js/modules/features/video-projects/controller/create-video-projects-controller.js` is a composition seam rather than a use-case implementation file; it wires focused command modules and keeps `createVideoProjectsFeature` stable.
- `js/modules/app-shell/runtime.js` remains a migrated runtime composition seam in this WU; state/settings/navigation/facade seams were extracted first to preserve boot behavior and avoid broad event/render rewrites in the same PR slice.
- The previously discovered Radar app-shell gap was addressed only as a navigation guardrail: Radar is now a valid shell view and wires its existing thin client/controller. No Radar feature redesign was included.

## Remaining Tasks

- None — all planned work units for this change are complete.
