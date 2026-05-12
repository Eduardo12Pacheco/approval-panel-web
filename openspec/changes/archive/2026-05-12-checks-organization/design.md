# Design: Checks Organization

## Technical Approach

Move check implementation files to the module that owns the protected contract, while keeping `js/modules/__checks__/` as the public compatibility surface. Old commands and Python imports continue to target `__checks__`; wrappers delegate to moved checks and preserve CLI output/assertions. Global cross-feature guardrails stay global and are documented in a manifest so aggregation does not silently skip moved checks.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Public entry points | Keep every existing `js/modules/__checks__/*` path as a facade. | Update all callers to new paths. | Spec requires existing commands/imports to keep working. |
| Ownership | Put focused checks under `<owner>/__checks__/`. | Keep one central folder. | Makes Audio/Subtitles/Video Projects/app-shell guardrails discoverable beside protected seams. |
| Global checks | Keep cross-feature/source aggregation checks in `js/modules/__checks__/global/` with root facades. | Hide them under a feature. | Boot, rollback, CSS, replay, and boundary checks span multiple modules. |
| Manifest | Add `js/modules/__checks__/manifest.js`. | Rely on folder globs. | Explicit owner/new-path/facade mapping prevents duplicate or skipped checks. |

## Data Flow

```text
old command/import ──→ js/modules/__checks__/<facade>
                         ├─ node:test facade imports moved test module for side effects
                         ├─ exported helper facade re-exports moved helpers
                         └─ CLI facade calls moved run*Check() and prints same message
```

## File Changes

| File | Action | Description |
|---|---|---|
| `js/modules/features/audio/__checks__/audio-seams.check.mjs` | Move | Audio facade/endpoints/timers/app-shell boundary checks. |
| `js/modules/features/subtitles/__checks__/subtitles-controller-seams.check.mjs` | Move | Subtitles controller/facade/session/table/preview checks. |
| `js/modules/app-shell/__checks__/app-shell-seams.check.mjs` | Move | App-shell facade/navigation/settings/lifecycle checks. |
| `js/modules/features/radar/__checks__/radar-panel-check.js` | Move | Radar API/state/render/controller check. |
| `js/modules/features/video-projects/__checks__/*.js|*.mjs` | Move | Video Projects checks: controller/render seams, editor assets, motion, approval drafts, composition cover/payload/manifest/preload, contract pipeline, segment picker, renderer helpers. |
| `js/modules/__checks__/global/{parity-checklist,dependency-boundary-validator,css-computed-style-parity,rollback-scope-validator,runtime-ui-parity-replay}.js` | Move | Cross-feature selector, boot, CSS, rollback, dependency, and replay helpers. |
| `js/modules/__checks__/approval-editor-service-timings.check.cjs` | Keep | Cross-subproject CJS service timing check remains public/global to avoid CJS wrapper risk. |
| `js/modules/__checks__/<old file>` | Replace | Thin compatibility facade for every moved file. |
| `js/modules/__checks__/manifest.js` | Create | Owner inventory, facade path, implementation path, command kind, and exported helper names. |
| `tests/*.py`, `docs/parity/contract-matrix.md` | Modify only if needed | Prefer unchanged command paths; update any source aggregation expectations to read manifest/moved paths. |

## Interfaces / Contracts

Facade patterns:

```js
// node:test files
export * from '../features/audio/__checks__/audio-seams.check.mjs';
import '../features/audio/__checks__/audio-seams.check.mjs';

// CLI helper files
export { runEditorAssetsTabCheck } from '../features/video-projects/__checks__/editor-assets-tab-check.js';
if (process.argv[1] === fileURLToPath(import.meta.url)) { runEditorAssetsTabCheck(); console.log('editor-assets-tab-check: ok'); }
```

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Compatibility | Every old `node` / `node --test` command still works. | Run existing commands from grep results and archived verification lists. |
| Inventory | Each moved implementation appears once. | Add/verify manifest assertion for facade/implementation existence and no duplicate implementation paths. |
| Assertions | No guardrail lost. | Compare moved file contents mechanically before/after; wrappers contain no assertions. |
| Python callers | Existing test imports still resolve. | Run focused pytest files that import `__checks__` helpers. |

## Migration / Rollout

1. Create owner `__checks__` folders and move implementation files without editing assertions.
2. Fix relative imports in moved files (`../../...` as needed) and run moved files directly.
3. Replace old files with facades preserving exports, CLI logs, and `node:test` side effects.
4. Add manifest and update only aggregation docs/tests that enumerate implementation locations.
5. Run acceptance commands; no build.

## Non-goals

- No app runtime, selector, endpoint, payload, copy, CSS contract, or assertion changes.
- No check weakening, renaming public commands, build, commit, or push.

## Open Questions

None.
