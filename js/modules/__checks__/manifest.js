export const CHECK_MANIFEST = [
  {
    facadePath: 'js/modules/__checks__/audio-seams.check.mjs',
    implementationPath: 'js/modules/features/audio/__checks__/audio-seams.check.mjs',
    owner: 'audio',
    commandKind: 'node-test',
    exportedHelpers: [],
  },
  {
    facadePath: 'js/modules/__checks__/runtime-ui-parity-replay.js',
    implementationPath: 'js/modules/__checks__/global/runtime-ui-parity-replay.js',
    owner: 'global',
    commandKind: 'module-import',
    exportedHelpers: [
      'runProtectedFlowsReplay',
      'runAudioParityReplay',
      'runAppShellLifecycleReplay',
      'runAppShellSetViewReplay',
      'runScriptToAudioVoiceReplay',
    ],
  },
  {
    facadePath: 'js/modules/__checks__/app-shell-seams.check.mjs',
    implementationPath: 'js/modules/app-shell/__checks__/app-shell-seams.check.mjs',
    owner: 'app-shell',
    commandKind: 'node-test',
    exportedHelpers: [],
  },
  {
    facadePath: 'js/modules/__checks__/subtitles-controller-seams.check.mjs',
    implementationPath: 'js/modules/features/subtitles/__checks__/subtitles-controller-seams.check.mjs',
    owner: 'subtitles',
    commandKind: 'node-test',
    exportedHelpers: [],
  },
  {
    facadePath: 'js/modules/__checks__/video-segment-picker-ux.check.mjs',
    implementationPath: 'js/modules/features/video-projects/__checks__/video-segment-picker-ux.check.mjs',
    owner: 'video-projects',
    commandKind: 'node-test',
    exportedHelpers: [],
  },
  {
    facadePath: 'js/modules/__checks__/composition-renderer-helpers.check.mjs',
    implementationPath: 'js/modules/features/video-projects/__checks__/composition-renderer-helpers.check.mjs',
    owner: 'video-projects',
    commandKind: 'node-test',
    exportedHelpers: [],
  },
  {
    facadePath: 'js/modules/__checks__/video-projects-controller-seams.check.mjs',
    implementationPath: 'js/modules/features/video-projects/__checks__/video-projects-controller-seams.check.mjs',
    owner: 'video-projects',
    commandKind: 'node-test',
    exportedHelpers: [],
  },
  {
    facadePath: 'js/modules/__checks__/video-projects-render-seams.check.mjs',
    implementationPath: 'js/modules/features/video-projects/__checks__/video-projects-render-seams.check.mjs',
    owner: 'video-projects',
    commandKind: 'node-test',
    exportedHelpers: [],
  },
  {
    facadePath: 'js/modules/__checks__/editor-assets-tab-check.js',
    implementationPath: 'js/modules/features/video-projects/__checks__/editor-assets-tab-check.js',
    owner: 'video-projects',
    commandKind: 'node-cli',
    exportedHelpers: ['runEditorAssetsTabCheck'],
  },
  {
    facadePath: 'js/modules/__checks__/parity-checklist.js',
    implementationPath: 'js/modules/__checks__/global/parity-checklist.js',
    owner: 'global',
    commandKind: 'module-import',
    exportedHelpers: ['REQUIRED_SELECTOR_IDS', 'SUBTITLE_REMOTE_CUTOVER_GATES', 'runParityChecklist'],
  },
  {
    facadePath: 'js/modules/__checks__/dependency-boundary-validator.js',
    implementationPath: 'js/modules/__checks__/global/dependency-boundary-validator.js',
    owner: 'global',
    commandKind: 'module-import',
    exportedHelpers: [
      'LEGACY_ARCHIVE_PATH',
      'validateDependencyBoundaries',
      'validateNoLegacyArchiveRuntimeReferences',
      'validateNoSiblingFeatureImports',
    ],
  },
  {
    facadePath: 'js/modules/__checks__/css-computed-style-parity.js',
    implementationPath: 'js/modules/__checks__/global/css-computed-style-parity.js',
    owner: 'global',
    commandKind: 'module-import',
    exportedHelpers: ['runComputedStyleParityCheck'],
  },
  {
    facadePath: 'js/modules/__checks__/approval-motion-draft-check.js',
    implementationPath: 'js/modules/features/video-projects/__checks__/approval-motion-draft-check.js',
    owner: 'video-projects',
    commandKind: 'node-cli',
    exportedHelpers: ['runApprovalMotionDraftCheck'],
  },
  {
    facadePath: 'js/modules/__checks__/radar-panel-check.js',
    implementationPath: 'js/modules/features/radar/__checks__/radar-panel-check.js',
    owner: 'radar',
    commandKind: 'node-cli',
    exportedHelpers: ['runRadarPanelCheck'],
  },
  {
    facadePath: 'js/modules/__checks__/composition-cover-pan-check.js',
    implementationPath: 'js/modules/features/video-projects/__checks__/composition-cover-pan-check.js',
    owner: 'video-projects',
    commandKind: 'node-cli',
    exportedHelpers: ['runCompositionCoverPanCheck'],
  },
  {
    facadePath: 'js/modules/__checks__/video-segment-stability-check.js',
    implementationPath: 'js/modules/features/video-projects/__checks__/video-segment-stability-check.js',
    owner: 'video-projects',
    commandKind: 'node-cli',
    exportedHelpers: ['runVideoSegmentStabilityCheck'],
  },
  {
    facadePath: 'js/modules/__checks__/editor-motion-presets-check.js',
    implementationPath: 'js/modules/features/video-projects/__checks__/editor-motion-presets-check.js',
    owner: 'video-projects',
    commandKind: 'node-cli',
    exportedHelpers: ['runEditorMotionPresetsCheck'],
  },
  {
    facadePath: 'js/modules/__checks__/approval-editor-service-timings.check.cjs',
    implementationPath: 'js/modules/__checks__/approval-editor-service-timings.check.cjs',
    owner: 'global',
    commandKind: 'commonjs-test',
    exportedHelpers: [],
  },
  {
    facadePath: 'js/modules/__checks__/contract-pipeline-client-check.js',
    implementationPath: 'js/modules/features/video-projects/__checks__/contract-pipeline-client-check.js',
    owner: 'video-projects',
    commandKind: 'node-cli',
    exportedHelpers: ['runContractPipelineClientCheck'],
  },
  {
    facadePath: 'js/modules/__checks__/composition-renderer-preload-window.check.mjs',
    implementationPath: 'js/modules/features/video-projects/__checks__/composition-renderer-preload-window.check.mjs',
    owner: 'video-projects',
    commandKind: 'node-cli',
    exportedHelpers: ['runCompositionRendererPreloadWindowCheck'],
  },
  {
    facadePath: 'js/modules/__checks__/video-projects-composition-payload.check.mjs',
    implementationPath: 'js/modules/features/video-projects/__checks__/video-projects-composition-payload.check.mjs',
    owner: 'video-projects',
    commandKind: 'node-cli',
    exportedHelpers: ['runVideoProjectsCompositionPayloadCheck'],
  },
  {
    facadePath: 'js/modules/__checks__/video-projects-manifest-resolution.check.mjs',
    implementationPath: 'js/modules/features/video-projects/__checks__/video-projects-manifest-resolution.check.mjs',
    owner: 'video-projects',
    commandKind: 'node-cli',
    exportedHelpers: ['runVideoProjectsManifestResolutionCheck'],
  },
  {
    facadePath: 'js/modules/__checks__/rollback-scope-validator.js',
    implementationPath: 'js/modules/__checks__/global/rollback-scope-validator.js',
    owner: 'global',
    commandKind: 'module-import',
    exportedHelpers: ['evaluateRollbackPlan', 'simulateS4ArchivalRollback'],
  },
];

function findDuplicates(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

export function validateCheckManifestCoverage(entries = CHECK_MANIFEST) {
  const failures = [];
  const facadePaths = entries.map((entry) => entry.facadePath);
  const implementationPaths = entries.map((entry) => entry.implementationPath);
  const duplicateFacades = findDuplicates(facadePaths);
  const duplicateImplementations = findDuplicates(implementationPaths);

  if (duplicateFacades.length) failures.push(`duplicate facade paths: ${duplicateFacades.join(', ')}`);
  if (duplicateImplementations.length) failures.push(`duplicate implementation paths: ${duplicateImplementations.join(', ')}`);

  for (const entry of entries) {
    if (!entry.facadePath?.startsWith('js/modules/__checks__/')) failures.push(`invalid facade path: ${entry.facadePath}`);
    if (!entry.implementationPath?.startsWith('js/modules/')) failures.push(`invalid implementation path: ${entry.implementationPath}`);
    if (!entry.owner) failures.push(`missing owner for ${entry.facadePath}`);
    if (!entry.commandKind) failures.push(`missing command kind for ${entry.facadePath}`);
    if (!Array.isArray(entry.exportedHelpers)) failures.push(`missing exported helper list for ${entry.facadePath}`);
  }

  return {
    ok: failures.length === 0,
    failures,
    summary: {
      total: entries.length,
      facades: new Set(facadePaths).size,
      implementations: new Set(implementationPaths).size,
      owners: [...new Set(entries.map((entry) => entry.owner))].sort(),
    },
  };
}
