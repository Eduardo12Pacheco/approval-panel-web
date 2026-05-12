## Exploration: composition-assets-dust-drift

### Current State
`composition/assets` fails in the global runtime replay because the check still expects `dust-2` to resolve to `../02-Video-Engine/assets/overlays/dust-2.mp4`, while production resolution now returns `http://127.0.0.1:3042/api/overlays/dust-2.mp4`.

Evidence:
- `resolveCompositionDustUrl({}, [{ dust: { enabled: true, type: 'dust-2' } }])` returns `http://127.0.0.1:3042/api/overlays/dust-2.mp4`.
- `approval-editor-service/server.js` exposes `GET /api/overlays/{file}` for `dust-1.mp4`, `dust-2.mp4`, and logo/effect overlays from `02-Video-Engine/assets/overlays`.
- The default approval pipeline setting is also `http://127.0.0.1:3042`, so the current resolver aligns with the local service endpoint instead of direct relative filesystem paths.
- The logo fallback still matches the replay expectation: `./assets/logo-alpha.webm`.

### Affected Areas
- `js/modules/__checks__/global/runtime-ui-parity-replay.js` — contains the stale `dust-2` expected URL and is the immediate blocker for `runProtectedFlowsReplay()`.
- `js/modules/features/video-projects/composition/composition-view-model.js` — production resolver builds `dust-1`/`dust-2` URLs from `COMPOSITION_LOCAL_OVERLAY_BASE_URL` and falls back to `./assets/dust-preview.webm` only when no typed dust URL exists.
- `js/modules/features/video-projects/composition/overlay-assets.js` — defines `COMPOSITION_LOCAL_OVERLAY_BASE_URL = 'http://127.0.0.1:3042/api/overlays'`.
- `approval-editor-service/server.js` — serves the overlay assets through `/api/overlays/`, confirming the service URL is not accidental.
- `tests/test_phase7_runtime_ui_replay_and_rollback.py` — still asserts `result.passed.length === 6`, which is stale because the replay currently passes 9 scenarios before the `composition/assets` failure.

### Approaches
1. **Update expected parity data** — Change the `composition/assets` replay expected dust URL to the service overlay URL, and update the Python replay count to match the current protected scenario list.
   - Pros: Matches current production behavior and unblocks the strict baseline without changing runtime code.
   - Cons: Requires touching stale check expectations in two places.
   - Effort: Low

2. **Correct asset resolution code back to direct relative paths** — Change production dust URL resolution to return `../02-Video-Engine/assets/overlays/dust-2.mp4`.
   - Pros: Would satisfy the old replay expectation.
   - Cons: Conflicts with the local approval-editor service route, default service setting, and current overlay asset serving model; higher behavior-drift risk.
   - Effort: Medium

3. **Isolate the stale check** — Skip or special-case `composition/assets` so unrelated refactors can proceed.
   - Pros: Fast unblock for other work.
   - Cons: Preserves a known false failure and weakens a global parity guard; this is only justified if no owner can update the stale expectation.
   - Effort: Low

### Recommendation
Update expected parity data, not production asset resolution. The current service-backed dust URL is consistent with `approvalPipelineBaseUrl`, `/api/overlays/`, and the approval editor service public overlay allowlist; the replay expectation is stale. Include the stale Python protected-scenario count in the same fix because it will become the next failure after `composition/assets` passes.

### Risks
- If downstream Remotion/browser code still depends on direct relative `../02-Video-Engine/...` URLs, updating the replay expectation could mask a real preview/export mismatch; verify with existing Video Projects composition checks after the expectation update.
- The global replay has grown from 6 to 9 protected scenarios, so stale documentation that says “six protected flows” may remain semantically misleading even if not immediately failing.
- Avoid broad isolation unless the user explicitly accepts weaker global parity coverage.

### Ready for Proposal
Yes — propose a small check-only change that updates the stale global runtime replay expectation and the stale Python scenario count, then reruns focused replay/Python checks without building.
