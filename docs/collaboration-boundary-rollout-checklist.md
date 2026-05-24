# Collaboration Boundary Rollout Checklist

This checklist verifies the Control Panel authenticated gateway boundary. Rule: do not guess deployed settings. Treat Cloudflare Pages and Cloudflare Tunnel configuration as runtime facts to inspect, not values to invent from the repo.

## Before rollout

- Checklist item: verify the deployed Pages project environment in Cloudflare Pages before relying on API origin, cache behavior, branch/environment, or public variables that affect the panel shell.
- Checklist item: verify tunnel ingress points to the gateway before public smoke checks:
  - public host: `api.automatizacionedun8n.me`
  - local gateway target: `http://127.0.0.1:8099`
- Confirm the gateway service is running locally before public tunnel checks.
- Confirm the panel receives `/panel/bootstrap` and `/panel/session` from the authenticated gateway, not from browser-local service origins.
- Do not write tunnel credentials, API keys, service tokens, session cookies, or secret headers into docs, logs, screenshots, or test fixtures.

## Boundary checks

- Unauthenticated direct local service calls are denied for protected reads and mutations.
- Denial and upstream error bodies contain only stable error codes such as `unauthenticated`, `forbidden`, or `upstream_unavailable`.
- Denial and upstream error bodies do not expose secrets, stack traces, or filesystem paths.
- Public liveness endpoints remain limited to health/safe-live checks and must not start generation, rendering, transcription, Radar, YouTube, WebSub, Whisper, Transcript, Monitor jobs, or Voice TTS model work.
- Do not change Voice TTS behavior, presets, refs, segmentation, sample rate, artifacts, runtime paths, or model generation while verifying this boundary.

## Two-browser smoke

This is the manual two-browser smoke plan.

- Browser A and Browser B log in through the panel session flow.
- Both browsers report the same app version and same settings source from `/panel/bootstrap`.
- Browser A creates or updates shared queue/editorial state; Browser B refreshes and sees the same durable state.
- Browser A holds or updates an editable resource; Browser B sees conflict/lease guidance instead of silently overwriting local edits.
- In a private/unauthenticated browser, unauthenticated direct local service calls are denied for protected reads and mutations through `/tts`, `/subtitles`, `/approval`, `/radar`, and `/monitor` with no secrets, stack traces, or filesystem paths.

## Rollback

- If Cloudflare Pages or Tunnel verification does not match the expected runtime boundary, stop rollout and keep the gateway enforcement local-only until the deployed settings are corrected.
- Roll back by restoring the previous tunnel ingress backup or disabling the public route to the gateway; do not change local Voice TTS runtime behavior as part of rollback.
