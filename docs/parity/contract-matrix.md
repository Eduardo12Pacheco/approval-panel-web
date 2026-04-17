# Approval Panel Web — Baseline Contract Matrix

## Scope

Baseline parity checkpoints for refactor slices. This matrix freezes user-visible states and network contract expectations for six protected flows.

## Checkpoint Rows

| Checkpoint | Flow | Baseline UI State | Endpoint | Method | Required Headers | Payload Keys |
|---|---|---|---|---|---|---|
| P0 | approval | Cards render + queue dialog behavior unchanged | `/webhook/approval/*` | `GET/POST` | `x-approval-secret` (optional) | `topic_id`, `decision`, `reason` |
| P0 | scripts | Draft list/editor/publish dialogs unchanged | `/webhook/mvp-script-*` | `GET/POST` | `x-approval-secret` (optional) | `topic_id`, `script`, `status`, `notes` |
| P0 | audio | Job queue cards + polling/SSE status unchanged | `/api/tts/*` | `GET/POST` | `x-api-key`, `Authorization`, `x-user-email` (optional) | `preset`, `text`, `job_id`, `status` |
| P0 | subtitles | 5-phase state machine visibility unchanged | `/api/subtitles/*` | `GET/POST` | `x-api-key`, `Authorization`, `x-user-email` (optional) | `job_id`, `rows`, `source_language`, `phase` |
| P0 | auth/session | Auth gate ↔ shell toggle unchanged | local/session bootstrap boundary (no API contract change) | N/A | N/A | `approval-panel-session-v1` |
| P0 | settings | Settings hydration/save flow unchanged | local/settings bootstrap boundary (no API contract change) | N/A | N/A | `approval-panel-settings-v1` |

## Validation Rule

For each checkpoint replay, UI states and network contract columns MUST match this matrix. Any endpoint/method/header/payload-key drift blocks promotion.

## Runtime Behavioral Parity Evidence

| Protected Scenario | Runtime Evidence Type | Drift Detected By |
|---|---|---|
| Approval decision POST preserves URL/method/header/body | Node-executed API client behavior test | `tests/test_phase6_runtime_parity_and_boundaries.py::test_approval_api_runtime_contract_headers_payload_and_error_paths` |
| Approval API rejects HTTP error and business-error payloads | Node-executed negative behavior test | `tests/test_phase6_runtime_parity_and_boundaries.py::test_approval_api_runtime_contract_headers_payload_and_error_paths` |
| TTS API preserves `x-api-key` + `Authorization` + optional `x-user-email` | Node-executed API client behavior test | `tests/test_phase6_runtime_parity_and_boundaries.py::test_tts_api_runtime_contract_headers_and_negative_auth_paths` |
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
- Replay target: `styles.css` import-order/cascade parity and protected selector guards.

## Rollback Scope (Slice-6 CSS)

If P4 fails, rollback MUST revert the CSS split and restore previous `styles.css` behavior.
