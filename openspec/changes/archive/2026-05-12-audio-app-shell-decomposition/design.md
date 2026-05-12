# Design: Audio App Shell Decomposition

## Technical Approach

Do this as two ordered, behavior-preserving work streams. First shrink `js/modules/features/audio/controller.js` behind the existing `createAudioFeature()` facade. Then shrink `js/modules/app-shell/runtime.js` around the cleaner Audio contract while keeping `bootApp`, `bootCompatibilityShell`, and `__testHooks` stable.

## Ordered Work Streams

1. **Audio controller seams first**: keep `controller.js` as the wiring/facade and move command, job-state, tracking, transport, polling, queue rendering, and download concerns into `features/audio/controller/`.
2. **App-shell runtime seams second**: keep `runtime.js` as composition bootstrap and move lifecycle, event binding, view side effects, render adapters, approval search refresh, and Script → Audio voice bridge into `app-shell/` modules.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Refactor order | Audio first, app-shell second | Shell first; combined rewrite | Shell reaches into Audio tracking and Script → Audio flow. Audio-first reduces coupling before shell extraction. |
| Public contracts | Preserve current facades and hooks during migration | Tighten API immediately | Existing checks and app-shell imports depend on broad Audio methods; tightening waits until parity is proven. |
| File size | Treat line count as review guidance | Force small files by arbitrary splits | Cohesive renderer/event modules may remain larger if their responsibility is clear and documented. |

## Data Flow

Audio generation/tracking:

```text
Audio UI/App-shell -> createAudioFeature -> controller facade
  -> commands -> jobs -> queue-renderer
  -> tracking -> status-stream --fallback--> polling
  -> runtime/services normalize status/progress
```

Script voice flow after shell split:

```text
Scripts editor -> voice/script-to-audio
  -> mutate audio textarea + preset + change event
  -> views/navigation.setView('audio')
  -> audioFeature.runAudioGenerationFromText()
```

## Target Folder Structure

```text
js/modules/features/audio/
  index.js
  controller.js
  controller/{context.js,commands.js,jobs.js,tracking.js,status-stream.js,polling.js,queue-renderer.js,download.js}
  runtime/services.js

js/modules/app-shell/
  runtime.js
  composition.js
  lifecycle.js
  events/{index.js,scripts.js,audio.js,subtitles.js,approval-dialog.js}
  views/{navigation.js,approval-search.js,renderers.js}
  voice/script-to-audio.js
  {state.js,settings.js,services.js,approval-monitor.js,render-callbacks.js,index.js}
```

## File Changes

| File | Action | Description |
|---|---|---|
| `js/modules/features/audio/controller.js` | Modify | Become Audio controller wiring/facade only. |
| `js/modules/features/audio/controller/*.js` | Create | Extract Audio internals without changing DOM, endpoints, payloads, timers, or copy. |
| `js/modules/features/audio/index.js` | Modify | Keep broad handler facade temporarily; document internal-ish methods. |
| `js/modules/app-shell/runtime.js` | Modify | Become shell composition bootstrap after Audio is stable. |
| `js/modules/app-shell/composition.js` | Create | Own API, feature, controller, runner construction. |
| `js/modules/app-shell/lifecycle.js` | Create | Own `bootApp`, `bootCompatibilityShell`, session boot order. |
| `js/modules/app-shell/events/*` | Create/Modify | Move event binding by responsibility. |
| `js/modules/app-shell/views/*` | Create/Modify | Move navigation side effects, search refresh, render adapters. |
| `js/modules/app-shell/voice/script-to-audio.js` | Create | Preserve voice preset dialog and Audio handoff. |
| `js/modules/__checks__/*.mjs` | Modify/Create | Add parity and boundary checks before each extraction. |

## Interfaces / Contracts

Audio public contract during migration: `runAudioGeneration`, `runAudioGenerationFromText`, `startAudioTracking`, `stopAudioTracking`, `startAudioQueueSync`, `stopAudioQueueSync`, `downloadAudioJob`, `dismissAudioJob`, `getLatestTrackedJobId`. Compatibility methods remain callable until checks migrate: `applyAudioJobStatus`, `startAudioStatusStream`, `startAudioPolling`, `syncAudioQueueStatuses`, `renderAudioQueue`.

App-shell public contract remains exactly: `bootApp`, `bootCompatibilityShell`, `__testHooks.{setTtsGetMock,setToastMock,clearMocksForTesting}`.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Static checks | Facades, forbidden imports, expected method contracts | Extend `app-shell-seams.check.mjs`; add Audio seam check. |
| Unit-like replay | Audio queue/status and shell protected flows | Extend `runtime-ui-parity-replay.js` for SSE fallback, polling terminal cleanup, queue sync, voice handoff. |
| Manual smoke | Login, navigation, Audio generation/download, Script → Audio | Run targeted browser smoke; no build per project rule. |

## Migration / Rollout

No data migration required. Phase 1 adds Audio checks, extracts Audio modules, then verifies existing facade behavior. Phase 2 adds shell checks, extracts composition/lifecycle/events/views/voice, then verifies boot/session/navigation/search/voice flows.

## Non-Goals

- No framework, class hierarchy, endpoint, payload, DOM ID, `data-action`, copy, timer, or storage-key changes.
- No Radar/Subtitles/Video Projects refactor beyond preserving shell wiring.
- No deletion of compatibility facades or test hooks during this change.

## Open Questions

None.
