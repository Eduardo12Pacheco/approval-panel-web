# Tasks: Checks Organization

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 450-750, mostly moves/facades |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 global manifest/facades → PR 2 feature-owned moves |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Establish inventory/parity harness and global compatibility facades | PR 1 | Base main; include manifest tests and global checks only. |
| 2 | Move feature-owned checks behind existing public entry points | PR 2 | Base PR 1/main after merge; include direct and facade command parity. |

## Phase 1: RED Baseline and Parity Inventory

- [x] 1.1 Inventory every current `js/modules/__checks__/*` command/import, assertion-bearing file, CLI ok message, and Python caller into `js/modules/__checks__/manifest.js` expectations.
- [x] 1.2 Add/adjust a failing parity check for manifest coverage: every facade path, implementation path, owner, command kind, and exported helper is present exactly once.
- [x] 1.3 Run the current focused check commands from the inventory and save the before/after assertion checklist; do not change assertions.

## Phase 2: GREEN Global Compatibility Slice

- [x] 2.1 Move cross-feature checks to `js/modules/__checks__/global/`: parity checklist, dependency boundary, CSS parity, rollback scope, and runtime UI replay helpers.
- [x] 2.2 Replace old global check files in `js/modules/__checks__/` with thin facades preserving exports, side effects, CLI behavior, and ok text.
- [x] 2.3 Keep `js/modules/__checks__/approval-editor-service-timings.check.cjs` unchanged unless parity proves a wrapper is safe.
- [x] 2.4 Make the manifest parity check pass for global checks and verify old public paths still run.

## Phase 3: GREEN Feature-Owned Slice

- [x] 3.1 Move Audio checks to `js/modules/features/audio/__checks__/audio-seams.check.mjs`; update only relative imports.
- [x] 3.2 Move Subtitles checks to `js/modules/features/subtitles/__checks__/subtitles-controller-seams.check.mjs`; preserve all facade/session/table/preview assertions.
- [x] 3.3 Move app-shell checks to `js/modules/app-shell/__checks__/app-shell-seams.check.mjs`; preserve boot/view lifecycle assertions.
- [x] 3.4 Move Radar check to `js/modules/features/radar/__checks__/radar-panel-check.js`; preserve API/state/render/controller assertions.
- [x] 3.5 Move Video Projects checks to `js/modules/features/video-projects/__checks__/`; preserve editor, assets, motion, composition, payload, manifest, preload, contract, and segment assertions.
- [x] 3.6 Replace every moved root file with a facade that delegates to the owner file and keeps the same public command/import path.

## Phase 4: REFACTOR Verification and Cleanup

- [x] 4.1 Run old facade commands and direct moved implementation commands; failures must be assertion failures, not missing imports.
- [x] 4.2 Run focused `tests/*.py` import callers and any source aggregation checks; update only stale path expectations to use the manifest.
- [x] 4.3 Compare before/after assertion inventory and confirm no selector, endpoint, payload, copy, timer, rollback, or CSS parity guardrail changed.
