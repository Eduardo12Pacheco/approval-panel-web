# Design: Approval Feature Normalization

## Decision
Use a facade-first normalization. `features/approval/index.js` remains the public entrypoint and re-exports Approval render helpers currently defined in `cards.js`, `detail-dialog.js`, and `queue-monitor.js`. App-shell code should consume Approval helpers through that facade, while `createApprovalFeature(...)` keeps its current dependency-injected callbacks.

## Architecture
- `features/approval/index.js`: public facade for all Approval named exports, command factory, and re-exported render helpers.
- Optional internal modules under `features/approval/`: focused pure helper files for ordering/source links, queue payload normalization, decision payload construction, and optimistic updates.
- Existing render files remain Approval-owned implementation modules; they are not app-shell API surfaces after normalization.
- `app-shell/runtime.js`: imports Approval helpers from `features/approval/index.js` only.
- `app-shell/composition.js`: continues injecting render callbacks and `refreshScriptDrafts`; no direct cross-feature dependency is introduced inside Approval.
- `app-shell/events/approval-dialog.js`: remains owner of DOM event delegation and keeps consuming existing dataset contracts.

## Behavior Preservation Rules
- Preserve current named exports from `features/approval/index.js` exactly.
- Preserve v2 endpoints: `/webhook/approval/pending/supabase/v2`, `/webhook/approval/queue/supabase/v2`, `/webhook/approval/topic/supabase/v2`, `/webhook/approval/decision/supabase/v2`.
- Preserve approval success sequence: render optimistic state, toast, then settled refreshes for pending, queue, and injected script drafts.
- Preserve failure rollback state and render/toast order.
- Preserve `data-action` and dataset names/encoding in topic detail and queue monitor markup.

## Verification Strategy
Use focused existing Node/Python parity checks only; do not run a build. Update static import/boundary assertions if needed so they prove the facade boundary and keep current behavioral assertions.

## Risks and Mitigations
- Static parity checks may look for old import tokens; mitigate by updating checks/comments without weakening assertions.
- Callback/render order is observable; mitigate by extracting only pure helpers first and keeping command method bodies semantically identical.
- Dataset contracts are fragile; mitigate with explicit assertions for rendered markup action names and encoded dataset fields.

## Acceptance Scenarios
- App-shell uses one Approval facade import surface without losing helper access.
- Existing Approval unit/parity checks pass with equivalent assertions.
- No Approval module imports Scripts/Audio/Subtitles/TTS directly.
