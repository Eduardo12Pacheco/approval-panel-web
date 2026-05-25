import { fileURLToPath } from 'node:url';
import { createVideoProjectsFeature } from '../index.js';
import { buildVideoSegmentPreviewLayerPlan } from '../composition/renderer/video-layers.js';
import { createApprovalSnapshotOperations } from '../controller/approval-snapshot-operations.js';
import { createRowVideoCommands, resolveVideoSegmentDurationSeconds } from '../data/row-video-commands.js';
import { syncVideoSelectorPreviewLayers } from '../render/preview-lifecycle.js';

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
  const commands = createRowVideoCommands({
    api: {},
    ui: { toast() {} },
    getProject: () => project,
    resolveProjectKey: () => 'draft-1',
    renderSelectedVideoProject() {},
    updateRow: async (_rowId, patch) => patches.push(patch),
  });

  const assigned = await commands.assignVideoSegmentToRow('seg-007', { id: 'video-1', src: 'clip.mp4' }, 2.084);

  assertEqual(assigned, true, 'Expected video segment assignment to succeed');
  assertEqual(patches[0]?.media?.durationSeconds, 4.56, 'Expected assigned video segment to send canonical Approval duration');
}

export async function runVideoSegmentStabilityCheck() {
  await testStaleVideoSegmentRetriesAgainstLatestSnapshot();
  await testRejectedVideoSegmentDoesNotToastSuccess();
  testPreviewPlanSeparatesSourceTrimFromDecorativeEffects();
  testSelectorPreviewKeepsDecorativeEffectsAtLocalStart();
  testSelectorPreviewDoesNotReseekPlayingDecorativeEffects();
  testVideoSegmentDurationUsesCanonicalApprovalSnapshotRow();
  await testAssignVideoSegmentSendsCanonicalApprovalDuration();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await runVideoSegmentStabilityCheck();
  console.log('video-segment-stability-check: ok');
}
