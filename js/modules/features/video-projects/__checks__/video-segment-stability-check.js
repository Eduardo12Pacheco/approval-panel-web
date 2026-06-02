import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createVideoProjectsFeature } from '../index.js';
import { buildVideoSegmentPreviewLayerPlan } from '../composition/renderer/video-layers.js';
import { createApprovalSnapshotOperations } from '../controller/approval-snapshot-operations.js';
import { createRowVideoCommands, resolveVideoSegmentDurationSeconds } from '../data/row-video-commands.js';
import { syncVideoSelectorPreviewLayers } from '../render/preview-lifecycle.js';
import { hydrateVideoSelectorControls } from '../render/video-selector-hydration.js';

const require = createRequire(import.meta.url);
const { applyContractOperations } = require('../../../../../services/approval-editor/lib/contract-updates.js');

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertDeepEqual(actual, expected, message) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
}

function assertOk(value, message) {
  if (!value) throw new Error(message);
}

function createReadyVideo(layer) {
  return {
    dataset: { layer },
    readyState: 1,
    currentTime: 0,
    muted: false,
    playsInline: false,
    paused: true,
    pause() {
      this.paused = true;
    },
    play() {
      this.paused = false;
      return Promise.resolve();
    },
  };
}

function createApprovalProject({ rows = [] } = {}) {
  return {
    draft_id: 'draft-1',
    editor_state: {
      pipeline_provider: 'approval',
      pipeline_base_url: 'http://approval.local',
      remotion_project_id: 'approval-project-1',
      approval_contract_snapshot: {
        contractVersion: 'approval-editor-service-v1',
        projectId: 'approval-project-1',
        snapshotHash: 'hash-stale',
        rows,
      },
      snapshot_hash: 'hash-stale',
      phase: 'preview_ready',
    },
    _editorRows: rows,
  };
}

function createFakeCommitButton({ rowId, videoId, sourceIn = 0 }) {
  const listeners = new Map();
  return {
    dataset: { rowId, videoId, sourceIn: String(sourceIn) },
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    async click() {
      await listeners.get('click')?.();
    },
  };
}

function createVideoSelectorCommitRoot(commitButton) {
  const body = { querySelector: () => null, appendChild() {}, dataset: {}, classList: { add() {}, remove() {} }, style: {} };
  const doc = {
    body,
    documentElement: { dataset: {}, classList: { add() {}, remove() {} }, style: {} },
    createElement() { return { setAttribute() {}, replaceChildren() {} }; },
    defaultView: { scrollTo() {}, scrollY: 0 },
  };
  return {
    ownerDocument: doc,
    querySelectorAll(selector) {
      if (selector === '[data-action="commit-video-segment"]') return [commitButton];
      return [];
    },
    querySelector() {
      return null;
    },
  };
}

async function testStaleVideoSegmentRetriesAgainstLatestSnapshot() {
  const rows = [{ id: 'seg-002', startTime: 1, endTime: 4, selectedAssetId: 'old-image.jpg', media: { kind: 'image' } }];
  const latestRows = [{ id: 'seg-002', startTime: 1, endTime: 4, selectedAssetId: 'newer-image.jpg', media: { kind: 'image' } }];
  const videoRows = [{ id: 'seg-002', startTime: 1, endTime: 4, selectedAssetId: 'newer-image.jpg', media: { kind: 'video-segment', sourceVideoAssetId: 'clip.mp4', sourceVideoSrc: 'clip.mp4', sourceInSeconds: 2, durationSeconds: 3 } }];
  const project = createApprovalProject({ rows });
  const calls = [];
  const savedStates = [];
  const client = {
    async snapshot() {
      return { snapshot: { ...project.editor_state.approval_contract_snapshot, snapshotHash: 'hash-latest', rows: latestRows } };
    },
    async updateSnapshot(projectId, payload) {
      calls.push({ projectId, payload });
      if (payload.baseSnapshotHash === 'hash-latest') {
        return { snapshot: { ...project.editor_state.approval_contract_snapshot, snapshotHash: 'hash-video', rows: videoRows } };
      }
      const error = new Error('version conflict');
      error.code = 'version_conflict';
      error.details = { expected_version: 2, received_version: 1 };
      throw error;
    },
  };
  const operations = createApprovalSnapshotOperations({
    api: { createApprovalPipelineClient: () => client },
    store: { getState: () => ({ settings: { approvalPipelineBaseUrl: 'http://approval.local' } }) },
    ui: { toast() {} },
    persistEditorState: async (_project, patch) => savedStates.push(patch),
    renderSelectedVideoProject() {},
  });

  await operations.commitApprovalSnapshotOperations(project, [{ type: 'setRowVideoSegment', rowId: 'seg-002', sourceVideoAssetId: 'clip.mp4', sourceVideoSrc: 'clip.mp4', sourceInSeconds: 2, durationSeconds: 3 }]);

  assertEqual(calls.length, 2, 'Expected stale video segment update to retry once over latest snapshot');
  assertEqual(calls[0].payload.baseSnapshotHash, 'hash-stale', 'Expected first write to use local stale hash');
  assertEqual(calls[1].payload.baseSnapshotHash, 'hash-latest', 'Expected retry to use latest canonical hash');
  assertEqual(project.editor_state.snapshot_hash, 'hash-video', 'Expected retried video update to apply returned canonical snapshot hash');
  assertEqual(project._editorRows[0].media?.kind, 'video-segment', 'Expected retried video update to apply canonical video row');
  assertEqual(savedStates.length, 1, 'Expected successful retry to persist editor state once');
}

async function testStaleBoundaryTransitionRetriesAgainstLatestSnapshot() {
  const rows = [
    { id: 'seg-005', rowId: 'seg-005', startTime: 20, endTime: 23, selectedAssetId: 'image-a.jpg', media: { kind: 'image' }, paragraphBoundaryAfter: true, nextRowId: 'seg-006' },
    { id: 'seg-006', rowId: 'seg-006', startTime: 24, endTime: 30, selectedAssetId: 'image-b.jpg', media: { kind: 'image' } },
  ];
  const latestRows = rows.map((row) => ({ ...row }));
  const glitchRows = rows.map((row) => (row.id === 'seg-005'
    ? { ...row, transition: 'glitch-1', transitionConfig: { type: 'overlay-video', assetId: 'glitch-1' } }
    : row));
  const project = createApprovalProject({ rows });
  const calls = [];
  const savedStates = [];
  const client = {
    async snapshot() {
      return { snapshot: { ...project.editor_state.approval_contract_snapshot, snapshotHash: 'hash-latest', rows: latestRows } };
    },
    async updateSnapshot(projectId, payload) {
      calls.push({ projectId, payload });
      if (payload.baseSnapshotHash === 'hash-latest') {
        return { snapshot: { ...project.editor_state.approval_contract_snapshot, snapshotHash: 'hash-glitch', rows: glitchRows } };
      }
      const error = new Error('version conflict');
      error.code = 'version_conflict';
      error.details = { expected_version: 44, received_version: 43 };
      throw error;
    },
  };
  const operations = createApprovalSnapshotOperations({
    api: { createApprovalPipelineClient: () => client },
    store: { getState: () => ({ settings: { approvalPipelineBaseUrl: 'http://approval.local' } }) },
    ui: { toast() {} },
    persistEditorState: async (_project, patch) => savedStates.push(patch),
    renderSelectedVideoProject() {},
  });

  await operations.commitApprovalSnapshotOperations(project, [{ type: 'setBoundaryTransition', rowId: 'seg-005', nextRowId: 'seg-006', paragraphBoundaryAfter: true, transition: 'glitch-1' }]);

  assertEqual(calls.length, 2, 'Expected stale boundary transition update to retry once over latest snapshot');
  assertEqual(calls[0].payload.baseSnapshotHash, 'hash-stale', 'Expected first boundary write to use local stale hash');
  assertEqual(calls[1].payload.baseSnapshotHash, 'hash-latest', 'Expected boundary retry to use latest canonical hash');
  assertEqual(project.editor_state.snapshot_hash, 'hash-glitch', 'Expected retried boundary transition to apply returned canonical snapshot hash');
  assertEqual(project._editorRows[0].transition, 'glitch-1', 'Expected retried boundary transition to apply canonical glitch state');
  assertEqual(savedStates.length, 1, 'Expected successful boundary retry to persist editor state once');
}

async function testRejectedVideoSegmentDoesNotToastSuccess() {
  const toasts = [];
  const project = createApprovalProject({ rows: [{ id: 'seg-002', startTime: 0, endTime: 2, selectedAssetId: 'image.jpg' }] });
  project.video_assets = [{ id: 'video-1', src: 'clip.mp4', durationSeconds: 10 }];
  const feature = createVideoProjectsFeature({
    api: {
      createApprovalPipelineClient() {
        return {
          async updateSnapshot() {
            throw new Error('remote snapshot unavailable');
          },
        };
      },
      async saveVideoProjectEditorState() {},
    },
    store: { getState: () => ({ settings: { approvalPipelineBaseUrl: 'http://approval.local' }, selectedVideoProject: project }) },
    ui: { toast(message) { toasts.push(message); } },
    callbacks: { renderSelectedVideoProject() {}, updateSelectedVideoProjectCompositionPreview() {}, renderVideoProjects() {} },
  });

  const originalConsoleError = console.error;
  console.error = () => {};
  let assigned = false;
  try {
    assigned = await feature.assignVideoSegmentToRow('seg-002', project.video_assets[0], 1).catch(() => false);
  } finally {
    console.error = originalConsoleError;
  }

  assertEqual(assigned, false, 'Expected rejected snapshot update to report assignment failure');
  assertDeepEqual(toasts, ['Error actualizando snapshot'], 'Expected only error toast, never success toast');
  assertEqual(project._editorRows[0].media?.kind, undefined, 'Expected row to remain image-backed after rejected snapshot update');
}

function testPreviewPlanSeparatesSourceTrimFromDecorativeEffects() {
  const plan = buildVideoSegmentPreviewLayerPlan({
    media: { kind: 'video-segment', sourceVideoSrc: 'clip.mp4', sourceInSeconds: 12, durationSeconds: 4 },
    localTime: 1.5,
  });
  const byName = Object.fromEntries(plan.layers.map((layer) => [layer.name, layer]));

  assertEqual(byName['background-video'].currentTimeSeconds, 13.5, 'Expected source background to seek by sourceIn + localTime');
  assertEqual(byName['foreground-video'].currentTimeSeconds, 13.5, 'Expected source foreground to seek by sourceIn + localTime');
  assertEqual(byName['effect-layer-01'].currentTimeSeconds, 1.5, 'Expected decorative effect 01 to use local timeline time');
  assertEqual(byName['effect-layer-02'].currentTimeSeconds, 1.5, 'Expected decorative effect 02 to use local timeline time');
}

function testPreviewPlanAppliesForegroundTransformOnlyToSourceLayer() {
  const plan = buildVideoSegmentPreviewLayerPlan({
    media: {
      kind: 'video-segment',
      sourceVideoSrc: 'clip.mp4',
      sourceInSeconds: 0,
      durationSeconds: 4,
      foregroundTransform: { x: -42, y: 18, scale: 1.35 },
    },
    localTime: 0.5,
  });
  const byName = Object.fromEntries(plan.layers.map((layer) => [layer.name, layer]));

  assertDeepEqual(
    byName['foreground-video'].foregroundTransform,
    { x: -42, y: 18, scale: 1.35 },
    'Expected preview plan to carry the source foreground transform',
  );
  assertEqual(
    byName['foreground-video'].transform,
    'translate(-42px, 18px) scale(1.35)',
    'Expected foreground source video to receive center-origin translate/scale transform',
  );
  assertEqual(byName['background-video'].transform, undefined, 'Expected background video to stay untransformed');
  assertEqual(byName['effect-layer-01'].transform, undefined, 'Expected decorative effect 01 to stay untransformed');
  assertEqual(byName['effect-layer-02'].transform, undefined, 'Expected decorative effect 02 to stay untransformed');
}

function testSelectorPreviewKeepsDecorativeEffectsAtLocalStart() {
  const videos = [
    createReadyVideo('background-video'),
    createReadyVideo('effect-layer-02'),
    createReadyVideo('effect-layer-01'),
    createReadyVideo('foreground-video'),
  ];
  const modal = { querySelectorAll: () => videos };

  assertOk(syncVideoSelectorPreviewLayers({ modal, sourceInSeconds: 9, playing: false }), 'Expected selector preview sync to run');

  assertEqual(videos[0].currentTime, 9, 'Expected background source layer to seek to sourceIn');
  assertEqual(videos[3].currentTime, 9, 'Expected foreground source layer to seek to sourceIn');
  assertEqual(videos[1].currentTime, 0, 'Expected effect layer 02 to stay at decorative local start');
  assertEqual(videos[2].currentTime, 0, 'Expected effect layer 01 to stay at decorative local start');
}

function testSelectorPreviewDoesNotReseekPlayingDecorativeEffects() {
  const effect = createReadyVideo('effect-layer-02');
  effect.currentTime = 2.25;
  effect.paused = false;
  const modal = { querySelectorAll: () => [effect] };

  syncVideoSelectorPreviewLayers({ modal, sourceInSeconds: 9, playing: true });

  assertEqual(effect.currentTime, 2.25, 'Expected playing decorative effects not to be re-seeked during selector drag');
  assertEqual(effect.paused, false, 'Expected playing decorative effect to keep playing');
}

function testVideoSegmentDurationUsesCanonicalApprovalSnapshotRow() {
  const project = createApprovalProject({
    rows: [
      { id: 'seg-007', rowId: 'seg-007', startTime: 30.2, effectiveEndTime: 34.76, endTime: 34.76 },
    ],
  });
  const staleLocalRow = { id: 'seg-007', rowId: 'seg-007', startTime: 30.2, effectiveEndTime: 34.68, endTime: 34.68 };

  assertEqual(
    resolveVideoSegmentDurationSeconds(project, staleLocalRow),
    4.56,
    'Expected video segment duration to use canonical Approval snapshot row duration',
  );
}

async function testAssignVideoSegmentSendsCanonicalApprovalDuration() {
  const project = createApprovalProject({
    rows: [
      { id: 'seg-007', rowId: 'seg-007', startTime: 30.2, effectiveEndTime: 34.76, endTime: 34.76 },
    ],
  });
  project._editorRows = [{ id: 'seg-007', rowId: 'seg-007', startTime: 30.2, effectiveEndTime: 34.68, endTime: 34.68 }];
  const patches = [];
  const updateOptions = [];
  const commands = createRowVideoCommands({
    api: {},
    ui: { toast() {} },
    getProject: () => project,
    resolveProjectKey: () => 'draft-1',
    renderSelectedVideoProject() {},
    updateRow: async (_rowId, patch, options) => { patches.push(patch); updateOptions.push(options); },
  });

  const assigned = await commands.assignVideoSegmentToRow('seg-007', { id: 'video-1', src: 'clip.mp4' }, 2.084);

  assertEqual(assigned, true, 'Expected video segment assignment to succeed');
  assertEqual(patches[0]?.media?.durationSeconds, 4.56, 'Expected assigned video segment to send canonical Approval duration');
  assertEqual(updateOptions[0]?.render, false, 'Expected video segment assignment to avoid a full editor rerender that can reset selection');
  assertDeepEqual(patches[0]?.media?.foregroundTransform, { x: 0, y: 0, scale: 1 }, 'Expected assigned video segment to initialize foreground transform defaults');
}

async function testCommittedVideoSegmentKeepsTargetSelectionAndRefreshesTable() {
  const rows = [
    { id: 'seg-001', startTime: 0, endTime: 2.66, selectedAssetId: 'image-1.jpg', media: { kind: 'image' } },
    { id: 'seg-002', startTime: 2.66, endTime: 5.32, selectedAssetId: 'image-2.jpg', media: { kind: 'image' } },
    { id: 'seg-003', startTime: 7.96, endTime: 10.62, selectedAssetId: 'image-3.jpg', media: { kind: 'image' } },
  ];
  const project = createApprovalProject({ rows });
  project.video_assets = [{ id: 'clip-1', src: 'clip.mp4', durationSeconds: 12 }];
  project._selectedEditorRowId = 'seg-001';
  const commitButton = createFakeCommitButton({ rowId: 'seg-003', videoId: 'clip-1', sourceIn: 7.96 });
  const root = createVideoSelectorCommitRoot(commitButton);
  const refreshCalls = [];
  const renderCalls = [];
  const previewUpdates = [];

  hydrateVideoSelectorControls({
    root,
    project,
    editorRows: rows,
    renderSelectedVideoProject: () => renderCalls.push({ selectedRowId: project._selectedEditorRowId, mediaKind: project._editorRows[2]?.media?.kind }),
    refreshEditorSelectionOnly: (rowId) => refreshCalls.push(rowId),
    assignVideoSegmentToRow: async (rowId, video, sourceInSeconds) => {
      project._editorRows = project._editorRows.map((row) => (row.id === rowId
        ? { ...row, media: { kind: 'video-segment', sourceVideoAssetId: video.id, sourceVideoSrc: video.src, sourceInSeconds, durationSeconds: 2.66, foregroundTransform: { x: 0, y: 0, scale: 1 } } }
        : row));
      return true;
    },
    updateSelectedVideoProjectCompositionPreview: ({ project: updatedProject }) => previewUpdates.push({ selectedRowId: updatedProject._selectedEditorRowId, seekTime: updatedProject._previewSeekTime }),
  });

  await commitButton.click();

  assertEqual(project._selectedEditorRowId, 'seg-003', 'Expected committed video segment to keep target row selected');
  assertEqual(project._previewSeekTime, 7.96, 'Expected committed video segment to seek preview to target row start');
  assertEqual(project._editorRows[2].media.kind, 'video-segment', 'Expected committed row to become a video segment before rendering');
  assertDeepEqual(refreshCalls, [], 'Expected committed video segment not to use selection-only refresh that leaves table thumbnails stale');
  assertDeepEqual(renderCalls, [{ selectedRowId: 'seg-003', mediaKind: 'video-segment' }], 'Expected committed video segment to trigger one full editor/table render for the selected target row');
  assertDeepEqual(previewUpdates, [{ selectedRowId: 'seg-003', seekTime: 7.96 }], 'Expected preview update to stay aligned with the committed target row');
}

function testApprovalSnapshotPersistsVideoForegroundTransform() {
  const snapshot = {
    contractVersion: 'approval-editor-service-v1',
    projectId: 'approval-project-1',
    snapshotHash: 'hash-before',
    assets: {},
    rows: [{ id: 'seg-009', rowId: 'seg-009', startTime: 10, endTime: 13, selectedAssetId: 'image.jpg', media: { kind: 'image' } }],
  };

  const next = applyContractOperations(snapshot, [{
    type: 'setRowVideoSegment',
    rowId: 'seg-009',
    sourceVideoAssetId: 'video-1',
    sourceVideoSrc: 'clip.mp4',
    sourceInSeconds: 2,
    durationSeconds: 3,
    foregroundTransform: { x: -30, y: 14, scale: 1.22 },
  }]);

  assertDeepEqual(
    next.rows[0].media.foregroundTransform,
    { x: -30, y: 14, scale: 1.22 },
    'Expected Approval snapshot video operation to persist foreground transform in row media',
  );
}

export async function runVideoSegmentStabilityCheck() {
  await testStaleVideoSegmentRetriesAgainstLatestSnapshot();
  await testStaleBoundaryTransitionRetriesAgainstLatestSnapshot();
  await testRejectedVideoSegmentDoesNotToastSuccess();
  testPreviewPlanSeparatesSourceTrimFromDecorativeEffects();
  testPreviewPlanAppliesForegroundTransformOnlyToSourceLayer();
  testSelectorPreviewKeepsDecorativeEffectsAtLocalStart();
  testSelectorPreviewDoesNotReseekPlayingDecorativeEffects();
  testVideoSegmentDurationUsesCanonicalApprovalSnapshotRow();
  await testAssignVideoSegmentSendsCanonicalApprovalDuration();
  await testCommittedVideoSegmentKeepsTargetSelectionAndRefreshesTable();
  testApprovalSnapshotPersistsVideoForegroundTransform();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await runVideoSegmentStabilityCheck();
  console.log('video-segment-stability-check: ok');
}
