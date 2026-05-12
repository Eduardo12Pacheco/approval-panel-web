# Tasks: Control Panel Architecture Refactor

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 900-1,600 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 guardrails+CSS → PR 2 render → PR 3 controller → PR 4 app shell → PR 5 renderer helpers |
| Delivery strategy | auto-chain |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Guardrails plus Video Projects CSS facade | PR 1 | Base = feature/tracker branch; safest first slice. |
| 2 | Render view/hydration seams | PR 2 | Base = PR 1 branch; protects preview lifecycle. |
| 3 | Video Projects controller use-cases | PR 3 | Base = PR 2 branch; preserve factory API. |
| 4 | App shell facade extraction | PR 4 | Base = PR 3 branch; preserve boot chain. |
| 5 | Pure CompositionRenderer helpers | PR 5 | Base = PR 4 branch; no playback sequencing change. |

## Phase 1: RED Guardrails / Parity Baseline

- [x] 1.1 Add failing path/size/facade checks in `tests/test_phase6_runtime_parity_and_boundaries.py` for 500-line soft cap and import-only facades.
- [x] 1.2 Add failing CSS cascade checks in `tests/test_phase5_css_split_parity.py` and `js/modules/__checks__/css-computed-style-parity.js` for Video Projects protected selectors.
- [x] 1.3 Add failing import-contract checks in `js/modules/__checks__/parity-checklist.js` and `dependency-boundary-validator.js` for stable facades and no sibling-feature imports.

## Phase 2: GREEN Work Unit 1 — CSS Split

- [x] 2.1 Create `styles/features/video-projects/index.css` with ordered imports for layout, list, setup, editor, preview, selector, and responsive chunks.
- [x] 2.2 Move selectors from `styles/features/video-projects.css` into focused files under `styles/features/video-projects/` without renames.
- [x] 2.3 Update `styles.css` to import `./styles/features/video-projects/index.css` in the same cascade slot; delete old monolith after parity passes.
- [x] 2.4 Update `docs/parity/style-guards.md` and `docs/parity/contract-matrix.md` with CSS rollback and selector contracts.

## Phase 3: Work Unit 2 — Render Seams

- [x] 3.1 RED: add checks for list/detail/editor copy, `data-action`, payload, preview hydration, and video-selector sync.
- [x] 3.2 GREEN: split `js/modules/features/video-projects/render/index.js` into `project-list-view.js`, `setup-view.js`, `editor-shell-view.js`, hydration, preview, selector, and scrub modules.
- [x] 3.3 REFACTOR: keep `render/index.js` and `render.js` as stable facades exporting current contracts.

## Phase 4: Work Unit 3 — Controller Use-Cases

- [x] 4.1 RED: add checks for project loading, row/audio/brand commands, snapshots, preview/export, and state persistence.
- [x] 4.2 GREEN: create `js/modules/features/video-projects/controller/*` modules and delegate from `features/video-projects/index.js` without return-shape changes.
- [x] 4.3 REFACTOR: keep public helpers/export checks on the facade and document rollback scope.

## Phase 5: Work Unit 4/5 — Shell and Renderer Helpers

- [x] 5.1 RED: extend boot/navigation/settings checks for `main.js → composition-root.js → app-shell.js` parity.
- [x] 5.2 GREEN: create `js/modules/app-shell/{index,state,services,navigation,settings,events,render-callbacks,approval-monitor}.js`; make `app-shell.js` facade-only.
- [x] 5.3 RED/GREEN: extract only pure `composition/renderer/{index,dom,frame-math,video-layers,logo-chroma}.js`; do not change playback/audio sequencing.
