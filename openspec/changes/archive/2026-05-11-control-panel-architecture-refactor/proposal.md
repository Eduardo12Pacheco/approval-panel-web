# Proposal: Control Panel Architecture Refactor

## Intent

Refactor `01-Control-Panel` to make the vanilla JS/CSS architecture easier for humans and agents to navigate while preserving current behavior. The main problem is not the stack: it is a few files acting as mini-apps (`video-projects.css`, Video Projects render/controller files, `app-shell.js`) that slow safe changes.

## Scope

### In Scope
- Split high-risk large files behind compatibility facades; keep public imports/selectors stable.
- Start with Video Projects CSS and render/controller boundaries, then app-shell extraction.
- Add/update guardrails for file-size budgets, CSS import parity, selector contracts, and behavior parity.

### Out of Scope
- Framework rewrite, templating conversion, build pipeline changes, endpoint/payload/selector renames.
- Radar functional fix; it appears dormant/partially wired and should be tracked separately.
- Commits, pushes, or builds.

## Capabilities

### New Capabilities
- None — this is a parity-preserving architecture refactor.

### Modified Capabilities
- None — runtime requirements should not change.

## Approach

Use a targeted high-ROI modular split. Preserve behavior by moving code into focused modules while retaining facade entry points (`app-shell.js`, `features/video-projects/index.js`, render facades) until tests prove parity. Split CSS with an import-only `styles/features/video-projects/index.css` and preserve `styles.css` cascade position.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `styles/features/video-projects.css` | Modified | Split by concern under `styles/features/video-projects/`. |
| `js/modules/features/video-projects/render/index.js` | Modified | Separate view builders, hydration, and preview lifecycle. |
| `js/modules/features/video-projects/index.js` | Modified | Extract controller/use-case modules; keep factory API stable. |
| `js/modules/app-shell.js` | Modified | Extract state, services, navigation, settings, events behind facade. |
| `js/modules/features/video-projects/composition/composition-renderer.js` | Modified | Later cautious split of pure helpers before playback sequencing. |
| `tests/`, `js/modules/__checks__/` | Modified | Update parity and boundary checks for new module layout. |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| CSS cascade drift | Med | Import facade; preserve order; computed-style parity checks. |
| Preview lifecycle regression | High | Split hydration first; keep playback sequencing stable until protected. |
| App boot/order regression | Med | Keep facade and verify auth → setView → refresh/render ordering. |

## Rollback Plan

Revert by slice: restore the previous facade/import target for the failing area, then remove only the extracted modules from that slice. Avoid mixing CSS, render, controller, and app-shell changes in one rollback unit.

## Dependencies

- Existing OpenSpec directory can be created by this hybrid change.
- Existing Python/JS parity checks should be reused and updated; no build required.

## Success Criteria

- [ ] Behavior, selector IDs, endpoint names, payload keys, copy, and asset URL semantics remain unchanged.
- [ ] Largest Video Projects CSS/render/controller/app-shell files are split into discoverable concern modules.
- [ ] Facades stay stable until downstream imports/tests are intentionally migrated.
- [ ] Guardrails document file-size targets and catch boundary/cascade regressions.
