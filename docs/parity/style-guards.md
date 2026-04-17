# Approval Panel Web — Style Guards (Baseline)

## Protected Views

- `#authGate`
- `#appShell`
- `#viewApproval`
- `#viewScripts`
- `#viewAudio`
- `#viewSubtitulos`

## Guarded Selectors

- `.sidebar`
- `.topbar`
- `.card`
- `.audio-queue-card`
- `.subtitle-phase-bar`

## Import/Cascade Guard Rule

`styles.css` MUST remain import-only with locked order matching the design split layers. Any selector rename, order drift, or specificity drift is a parity failure.

## Executable Computed-Style Guard

- Runtime checker: `js/modules/__checks__/css-computed-style-parity.js`
- Contract test entry: `tests/test_phase5_css_split_parity.py::test_executable_computed_style_parity_evidence_exists_for_guarded_selectors`
- Guarded computed-style snapshot: `tests/test_phase5_css_split_parity.py::test_computed_style_parity_snapshot_covers_multiple_guarded_selectors`
