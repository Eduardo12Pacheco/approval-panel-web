# Approval Panel Web — Baseline Contract Matrix

## Scope

Baseline parity checkpoints for refactor slices. This matrix freezes user-visible states and network contract expectations for six protected flows.

## Checkpoint Rows

| Checkpoint | Flow | Baseline UI State | Endpoint | Method | Required Headers | Payload Keys |
|---|---|---|---|---|---|---|
| P0 | approval | Cards render + queue dialog behavior unchanged | `/webhook/approval/*` | `GET/POST` | `x-approval-secret` (optional) | `cluster_id`, `action`, `id_noticia`, `tema_principal`, `seleccion`, `jugador`, `link` |
| P0 | scripts | Draft list/editor/publish dialogs unchanged | `/webhook/mvp-script-*` | `GET/POST` | `x-approval-secret` (optional) | `draft_id`, `cluster_id`, `id_noticia`, `guion_editado` |
| P0 | audio | Job queue cards + polling/SSE status unchanged | `/api/tts/*` | `GET/POST` | `x-api-key`, `Authorization` | `preset`, `text`, `job_id`, `status` |
| P0 | subtitles | 5-phase state machine visibility unchanged | `/api/subtitles/*` | `GET/POST/PATCH/DELETE` | `x-api-key`, `Authorization` | `job_id`, `rows`, `source_language`, `phase` |
| P0 | auth/session | Auth gate ↔ shell toggle unchanged | local/session bootstrap boundary (no API contract change) | N/A | N/A | `approval-panel-session-v1` |
| P0 | settings | Settings hydration/save flow unchanged | local/settings bootstrap boundary (no API contract change) | N/A | N/A | `approval-panel-settings-v1` |

## Validation Rule

For each checkpoint replay, UI states and network contract columns MUST match this matrix. Any endpoint/method/header/payload-key drift blocks promotion.

## Unified Service Config First Slice

- The first unified settings slice is Control Panel config/UI only: no Cloudflare tunnel or gateway route migration is included.
- Legacy flat localStorage keys (`baseUrl`, `secret`, `ttsBaseUrl`, subtitles, Radar, Remotion, Approval Pipeline fields) remain preserved for rollback and direct service calls.
- `apiOrigin` is gateway-ready metadata for compatible services; Approval Pipeline remains local/advanced-only until auth, CORS, and runtime-data exposure are explicitly designed.
- Shared credentials may fill compatible TTS/Subtitles/Radar blanks, but service-specific credentials continue to override shared values.

## Runtime Behavioral Parity Evidence

| Protected Scenario | Runtime Evidence Type | Drift Detected By |
|---|---|---|
| CSS guarded selectors keep computed-style contract across split layers (`.sidebar`, `.topbar`, `.card`, `.audio-queue-card`, `.subtitle-phase-bar`) | Node-executed computed-style parity snapshot (import-order aware) | `tests/test_phase5_css_split_parity.py::test_executable_computed_style_parity_evidence_exists_for_guarded_selectors` + `tests/test_phase5_css_split_parity.py::test_computed_style_parity_snapshot_covers_multiple_guarded_selectors` |
| Video Projects CSS facade preserves cascade slot and selector contracts (`.video-projects-layout`, `.video-project-card`, `.composition-stage`) | Import-facade and computed-style parity snapshot | `tests/test_phase5_css_split_parity.py::test_video_projects_css_facade_is_import_only_with_locked_chunk_order` + `tests/test_phase6_runtime_parity_and_boundaries.py::test_architecture_file_size_soft_cap_and_css_facade_guardrails` |
| Video Projects controller facade preserves `createVideoProjectsFeature` API shape while use-cases move behind controller modules | Node-executed controller seam and facade delegation checks | `tests/test_phase6_runtime_parity_and_boundaries.py::test_video_projects_controller_facade_and_use_case_seams` + `js/modules/__checks__/video-projects-controller-seams.check.mjs` |
| Approval decision POST preserves URL/method/header/body | Node-executed API client behavior test | `tests/test_phase6_runtime_parity_and_boundaries.py::test_approval_api_runtime_contract_headers_payload_and_error_paths` |
| Approval API rejects HTTP error and business-error payloads | Node-executed negative behavior test | `tests/test_phase6_runtime_parity_and_boundaries.py::test_approval_api_runtime_contract_headers_payload_and_error_paths` |
| TTS API preserves `x-api-key` + `Authorization` and never sends `x-user-email` | Node-executed API client behavior test | `tests/test_phase6_runtime_parity_and_boundaries.py::test_tts_api_runtime_contract_headers_and_negative_auth_paths` |
| TTS API rejects missing basic-auth credentials | Node-executed negative behavior test | `tests/test_phase6_runtime_parity_and_boundaries.py::test_tts_api_runtime_contract_headers_and_negative_auth_paths` |
| Feature isolation boundary (no forbidden cross-feature imports) | Dependency-boundary negative test | `tests/test_phase6_runtime_parity_and_boundaries.py::test_forbidden_cross_feature_import_boundaries_are_enforced` |

## Executable UI-State Replay

| Flow | Replay Type | Executable Evidence |
|---|---|---|
| auth/session | Runtime state replay | `tests/test_phase7_runtime_ui_replay_and_rollback.py::test_runtime_ui_state_replay_executes_all_protected_flows` |
| settings | Runtime state replay | `tests/test_phase7_runtime_ui_replay_and_rollback.py::test_runtime_ui_state_replay_executes_all_protected_flows` |
| approval | Runtime state + callback replay | `tests/test_phase7_runtime_ui_replay_and_rollback.py::test_runtime_ui_state_replay_executes_all_protected_flows` |
| scripts | Runtime state + dialog replay | `tests/test_phase7_runtime_ui_replay_and_rollback.py::test_runtime_ui_state_replay_executes_all_protected_flows` |
| audio | Runtime delegate replay | `tests/test_phase7_runtime_ui_replay_and_rollback.py::test_runtime_ui_state_replay_executes_all_protected_flows` |
| subtitles | Runtime delegate replay | `tests/test_phase7_runtime_ui_replay_and_rollback.py::test_runtime_ui_state_replay_executes_all_protected_flows` |

## Checkpoint Failure Rollback Enforcement

- Executable rollback-scope validator: `js/modules/__checks__/rollback-scope-validator.js`
- Checkpoint-failure behavior test: `tests/test_phase7_runtime_ui_replay_and_rollback.py::test_rollback_scope_validator_enforces_checkpoint_failure_boundaries`
- Dependency mutation validator test: `tests/test_phase7_runtime_ui_replay_and_rollback.py::test_dependency_boundary_validator_detects_mutated_cross_feature_import_edge`

## Check Organization Manifest

- Source aggregation MUST resolve moved guardrail implementations through `js/modules/__checks__/manifest.js`.
- `facadePath` preserves the old public command/import surface; `implementationPath` identifies the assertion-bearing source to read for inventories.
- Compatibility facades under `js/modules/__checks__/` MUST remain executable, but source inventories SHOULD read `implementationPath` so thin wrappers do not mask skipped assertions.

## Rollback Scope (Slice-0)

Rollback for checkpoint P0 is intentionally narrow: revert bootstrap wiring changes in `js/main.js` and `js/modules/composition-root.js` only.

## Checkpoint P1 (Slice-1)

- Acceptance: parity checklist remains green and auth/settings smoke behavior remains unchanged.
- Replay target: selector/bootstrap parity checklist + session gate + settings hydration/save contracts.

## Rollback Scope (Slice-1)

If P1 fails, rollback MUST revert only `core/*` imports/delegates and keep prior shell logic intact.

## Checkpoint P2 (Slice-2/3)

- Acceptance: approval/scripts parity rows replay green with unchanged endpoint/method/header/payload-key contracts.
- Replay target: approval/scripts flows after feature extraction via `features/approval` and `features/scripts`.

## Rollback Scope (Slice-2/3)

If P2 fails, rollback MUST revert only `features/approval`, `features/scripts`, and `core/http/approval-api.js` changes.

## Checkpoint P3 (Slice-4/5)

- Acceptance: audio/subtitles parity rows replay green with unchanged API/header contracts.
- Replay target: extracted `features/audio`, `features/subtitles`, and `core/http/tts-api.js` boundary.

## Rollback Scope (Slice-4/5)

If P3 fails, rollback MUST revert only `features/audio`, `features/subtitles`, and `core/http/tts-api.js` changes.

## Checkpoint P4 (Slice-6 CSS Split)

- Acceptance: style guards and full parity matrix remain green after CSS split.
- Replay target: `styles.css` import-order/cascade parity, `styles/features/video-projects/index.css` import-only facade order, and protected selector guards.

## Rollback Scope (Slice-6 CSS)

If P4 fails, rollback MUST revert only the Video Projects CSS split, restore the previous `styles.css` import target, and remove `styles/features/video-projects/` extracted chunks. Radar, render, controller, app-shell, and CompositionRenderer behavior remain out of this rollback scope.

## Checkpoint P5 (Video Projects Controller Use-Cases)

- Acceptance: `createVideoProjectsFeature({ api, store, ui, callbacks })` keeps its public return shape, facade helper exports keep resolving, and controller commands preserve project loading, row/audio/brand, snapshot, preview/export, and editor-state persistence behavior.
- Replay target: `js/modules/__checks__/video-projects-controller-seams.check.mjs`, file-size/facade guardrails, Video Segment Picker UX checks, render seam checks, and composition payload checks.

## Rollback Scope (P5 Controller)

If P5 fails, rollback MUST revert only `js/modules/features/video-projects/index.js` and `js/modules/features/video-projects/controller/` changes plus their focused checks. Do not bundle app-shell, Radar, CSS, render, or CompositionRenderer changes into this rollback.

## Checkpoint P6 (App Shell Facade Extraction)

- Acceptance: `main.js → composition-root.js → app-shell.js` remains stable while shell state, settings, navigation, services/events, render callbacks, and approval monitor seams move under `js/modules/app-shell/`.
- Replay target: `js/modules/__checks__/app-shell-seams.check.mjs`, file-size/facade guardrails, boot boundary checks, settings hydration/save checks, and navigation valid-view checks.

## Rollback Scope (P6 App Shell)

If P6 fails, rollback MUST revert only `js/modules/app-shell.js`, `js/modules/app-shell/`, app-shell seam checks, and this P6 documentation. Do not bundle Video Projects CSS/render/controller or `CompositionRenderer` helper changes into this rollback.

## Checkpoint P7 (CompositionRenderer Helper Split)

- Acceptance: `composition-renderer.js` remains the public `CompositionRenderer` facade while pure frame math, DOM builder, video layer planning/sync, and logo chroma helpers resolve from `js/modules/features/video-projects/composition/renderer/`.
- Replay target: `js/modules/__checks__/composition-renderer-helpers.check.mjs`, Video Segment Picker UX checks, composition cover-pan/preload/payload checks, and phase6 file-size/facade guardrails.

## Rollback Scope (P7 CompositionRenderer Helpers)

If P7 fails, rollback MUST revert only `js/modules/features/video-projects/composition/composition-renderer.js`, `js/modules/features/video-projects/composition/renderer/`, `js/modules/__checks__/composition-renderer-helpers.check.mjs`, the Video Segment Picker source-location check update, and this P7 documentation. Do not bundle app-shell, Radar, CSS, render, or controller changes into this rollback.

## Checkpoint G4 (Legacy Archive)

- Acceptance: root `app.js` is archived to `js/legacy/app.js` with explicit `LEGACY ARCHIVE - non-runtime` marker.
- Replay target: dependency/runtime checks enforce **zero runtime references** to `js/legacy/app.js`.

## Rollback Scope (Slice S4 Archive)

If G4 fails, rollback MUST move archived `js/legacy/app.js` back to root `app.js` only, without reverting prior passing checkpoints.
