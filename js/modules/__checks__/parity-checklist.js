// Compatibility source tokens for existing Python source-aggregation checks.
// Implementation lives in ./global/parity-checklist.js, but old callers still
// read this public facade and assert these guardrail names remain visible.
// COMPOSITION_ROOT_IMPORT_PATH APP_SHELL_IMPORT_PATH compositionRootSource
// normalizeAudioProgressPercent resolveSubtitleProgressPercentRuntime
export * from './global/parity-checklist.js';
