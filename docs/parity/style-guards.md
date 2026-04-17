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
