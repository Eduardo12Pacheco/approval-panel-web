# Proposal: Checks Organization

## Intent

Reorganize `js/modules/__checks__` so guardrails live near the feature or contract they protect, while preserving the same check behavior, command entry points, imports, and coverage. This is organization only: the app must work exactly as before.

## Scope

### In Scope
- Move or facade checks into feature-owned locations or a clearer check hierarchy.
- Preserve existing check execution, public check command names, and import compatibility.
- Keep all current guardrails at least as strong for boot, selectors, API contracts, CSS parity, rollback scope, composition, audio, subtitles, app-shell, and Video Projects.

### Out of Scope
- Runtime app behavior changes, selector/copy/API/payload changes, or feature redesigns.
- Weakening/removing checks to make the move easier.
- Build, commit, or push work.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `control-panel-architecture-refactor`: clarify guardrail-check organization while preserving the existing “Tests and Checks Preserve Contracts” and behavior-parity requirements.

## Approach

Create a small compatibility layer if needed under `js/modules/__checks__/`, then relocate focused checks near owning areas or into explicit subfolders. Update internal relative imports and any check manifests so existing commands still execute the same assertions. Review path: first verify wrappers/entry points, then moved feature checks, then parity checklist coverage.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `js/modules/__checks__/` | Modified | Becomes compatibility facade or clearer top-level index for existing checks. |
| `js/modules/features/audio/` | Modified | Owns audio tracking/queue guardrails if moved. |
| `js/modules/features/subtitles/` | Modified | Owns subtitles polling, preview, table, and facade guardrails if moved. |
| `js/modules/features/video-projects/` | Modified | Owns editor, composition, assets, contract, CSS parity guardrails if moved. |
| `js/modules/app-shell*` | Modified | Owns boot/view lifecycle checks if hierarchy supports it. |
| `openspec/changes/checks-organization/` | New | SDD artifacts for this refactor. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Check runner misses moved files | Medium | Keep stable facades/manifests and verify every existing check entry point. |
| Relative imports break after moves | Medium | Update imports mechanically and preserve compatibility wrappers where cheaper. |
| Coverage weakens accidentally | Low | Compare checklist before/after; do not delete assertions. |

## Rollback Plan

Revert the checks directory and any moved check files/import updates from this change. Because runtime code must not change, rollback is limited to check organization and SDD artifacts.

## Dependencies

- Existing `control-panel-architecture-refactor` spec and current `js/modules/__checks__/` guardrails.

## Success Criteria

- [ ] Existing check commands/import paths still work or have equivalent facades.
- [ ] All prior guardrail assertions remain present and mapped to owners.
- [ ] No runtime feature behavior, selectors, endpoints, payload keys, copy, or CSS contracts change.
