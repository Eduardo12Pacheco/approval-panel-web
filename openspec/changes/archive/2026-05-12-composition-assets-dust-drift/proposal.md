# Proposal: Composition Assets Dust Drift

## Intent

Unblock Strict TDD by correcting stale parity expectations for the `composition/assets` replay. Production currently resolves typed `dust-2` overlays through the local approval-editor service URL; exploration found that this matches the service route and default approval pipeline setting, so this proposal preserves production behavior.

## Scope

### In Scope
- Update the `composition/assets` expected `dust-2` URL to `http://127.0.0.1:3042/api/overlays/dust-2.mp4`.
- Update the stale protected replay count expectation from 6 to the current scenario count if it blocks after the asset expectation is fixed.
- Verify the focused replay/Python checks without changing production asset resolution.

### Out of Scope
- Changing `resolveCompositionDustUrl`, `COMPOSITION_LOCAL_OVERLAY_BASE_URL`, or `/api/overlays/` behavior unless new evidence proves the service URL is wrong.
- Skipping, isolating, or weakening the `composition/assets` parity guard.
- Broader Video Projects, Remotion, or asset-serving refactors.

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `control-panel-architecture-refactor`: clarify that runtime parity checks must preserve current protected contracts by keeping expected data aligned with production asset URL semantics and scenario coverage.

## Approach

Make a check-only update: refresh stale expected parity data in the global runtime replay and, if exposed, the Python assertion for protected scenario count. Treat production service-backed overlay resolution as the source of truth unless follow-up verification contradicts exploration evidence.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `js/modules/__checks__/global/runtime-ui-parity-replay.js` | Modified | Replace stale `dust-2` expected URL. |
| `tests/test_phase7_runtime_ui_replay_and_rollback.py` | Modified | Update stale replay count expectation if needed. |
| `js/modules/features/video-projects/composition/*` | Unchanged | Explicitly avoid production resolver changes. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Service URL expectation could mask a downstream direct-path dependency | Low | Run focused composition/replay checks after updating expectations. |
| Scenario count drifts again | Medium | Assert the current protected list intentionally, not an obsolete historical count. |

## Rollback Plan

Revert the expectation-only edits in the replay check and Python test. No production runtime files should need rollback.

## Dependencies

- Exploration artifact `sdd/composition-assets-dust-drift/explore`.
- Existing local overlay service contract in `approval-editor-service/server.js`.

## Success Criteria

- [ ] `composition/assets` replay expects the service-backed `dust-2` URL.
- [ ] Protected replay count expectation matches current scenarios if checked.
- [ ] Focused replay/Python verification passes without production asset-resolution changes.
