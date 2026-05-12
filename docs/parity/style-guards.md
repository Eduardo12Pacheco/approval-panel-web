# Approval Panel Web — Style Guards (Baseline)

## Protected Views

- `#authGate`
- `#appShell`
- `#viewApproval`
- `#viewScripts`
- `#viewAudio`
- `#viewSubtitulos2`

## Guarded Selectors

- `.sidebar`
- `.topbar`
- `.card`
- `.audio-queue-card`
- `.subtitle-phase-bar`
- `.video-projects-layout`
- `.video-project-card`
- `.composition-stage`

## Import/Cascade Guard Rule

`styles.css` MUST remain import-only with locked order matching the design split layers. Any selector rename, order drift, or specificity drift is a parity failure.

Video Projects CSS MUST enter through `styles/features/video-projects/index.css` in the same cascade slot previously held by `styles/features/video-projects.css`. That facade MUST stay import-only and preserve chunk order: layout → project-list → setup-images → setup-audio → editor-shell → editor-controls → preview-composition → video-selector → responsive.

## Video Projects CSS Rollback

If a Video Projects style guard fails, rollback only the CSS slice: restore the previous `styles.css` import target and remove the extracted `styles/features/video-projects/` chunk files. Do not bundle Radar, render, controller, app-shell, or CompositionRenderer behavior changes into this rollback.

## Executable Computed-Style Guard

- Runtime checker: `js/modules/__checks__/css-computed-style-parity.js`
- Contract test entry: `tests/test_phase5_css_split_parity.py::test_executable_computed_style_parity_evidence_exists_for_guarded_selectors`
- Guarded computed-style snapshot: `tests/test_phase5_css_split_parity.py::test_computed_style_parity_snapshot_covers_multiple_guarded_selectors`

## Legacy Archive Guard (non-runtime)

- `01-Control-Panel/app.js` is archived as legacy artifact in `js/legacy/app.js`.
- `js/legacy/app.js` MUST include `LEGACY ARCHIVE - non-runtime` marker.
- Runtime must never import/include `js/legacy/app.js`; any reference is a parity failure.
