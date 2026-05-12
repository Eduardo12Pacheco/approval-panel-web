# Design: Composition Assets Dust Drift

## Technical Approach

Make a parity-only repair: refresh stale replay expectations so they match the current production contract. The `dust-2` overlay SHOULD continue resolving through the approval-editor service URL, and the protected replay count SHOULD match the scenario list exported by the replay check. No production resolver, service route, or asset-serving code changes are part of this design.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Source of truth for `dust-2` | Treat `http://127.0.0.1:3042/api/overlays/dust-2.mp4` as expected parity output. | Revert production to `../02-Video-Engine/assets/overlays/dust-2.mp4`. | `COMPOSITION_LOCAL_OVERLAY_BASE_URL` already points at `/api/overlays`, `COMPOSITION_DUST_PREVIEW_URLS['dust-2']` uses it, and `approval-editor-service/server.js` serves `dust-2.mp4` from that route. |
| Scope boundary | Update check/test expectations only. | Change `resolveCompositionDustUrl`, constants, or service route. | The drift is in stale expected data, not production behavior. Preserving production code keeps this a safe TDD unblock. |
| Protected scenario count | Assert the current replay scenario count, currently 10. | Keep historical count 6 or remove the count assertion. | The replay exports 10 protected scenarios. Keeping a count guard preserves coverage while making it accurate. |

## Data Flow

```text
runtime replay row { dust: { enabled, type: 'dust-2' } }
  -> resolveCompositionDustUrl(project, rows)
  -> COMPOSITION_DUST_PREVIEW_URLS['dust-2']
  -> http://127.0.0.1:3042/api/overlays/dust-2.mp4
  -> approval-editor-service /api/overlays/dust-2.mp4
```

The Python test invokes `runProtectedFlowsReplay()` through the wrapper module and verifies both replay success and the expected number of passed scenarios.

## File Changes

| File | Action | Description |
|---|---|---|
| `01-Control-Panel/js/modules/__checks__/global/runtime-ui-parity-replay.js` | Modify | Replace the stale direct-path `dust-2` expected URL with the service-backed overlay URL. |
| `01-Control-Panel/tests/test_phase7_runtime_ui_replay_and_rollback.py` | Modify | Update `result.passed.length` expectation from 6 to 10 if this assertion blocks after the asset expectation is corrected. |
| `01-Control-Panel/js/modules/features/video-projects/composition/*` | Preserve | No production composition resolver changes. |
| `01-Control-Panel/approval-editor-service/server.js` | Preserve | No service route changes; route already allows `dust-2.mp4`. |

## Interfaces / Contracts

No new interfaces. Existing contracts to preserve:

- `resolveCompositionDustUrl({}, [{ dust: { enabled: true, type: 'dust-2' } }])` returns the service-backed `dust-2` URL.
- `runProtectedFlowsReplay()` returns `{ ok, passed, failures }`, with `passed.length === 10` when all current scenarios pass.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Replay check | `composition/assets` accepts the service-backed `dust-2` URL. | Run the focused Node replay used by the Python test. |
| Python guard | Protected replay executes all current scenarios. | Run `tests/test_phase7_runtime_ui_replay_and_rollback.py` focused to the runtime replay test. |
| Regression boundary | Production asset resolution remains untouched. | Review diff: only check/test expectation files should change. |

## Migration / Rollout

No migration required. Rollout is an expectation-only test/check update.

Rollback: revert the expectation edits in `runtime-ui-parity-replay.js` and `test_phase7_runtime_ui_replay_and_rollback.py`. No runtime files should need rollback.

## Open Questions

None.
