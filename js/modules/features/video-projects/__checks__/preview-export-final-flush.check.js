import test from 'node:test';
import assert from 'node:assert/strict';

import { createPreviewExportCommands } from '../controller/preview-export-commands.js';
import { createApprovalSnapshotOperations } from '../controller/approval-snapshot-operations.js';

test('exportFinal flushes pending approval drafts before renderFinal and uses the updated snapshot hash', async () => {
  const calls = [];
  const project = {
    editor_state: {
      dirty: false,
      pipeline_provider: 'approval',
      approval_contract_snapshot: { snapshotHash: 'hash-before' },
      remotion_project_id: 'approval-project-1',
      snapshot_hash: 'hash-before',
    },
  };
  const store = { getState: () => ({ selectedVideoProject: project, settings: {} }) };
  const client = {
    renderFinal: async (projectId, payload) => {
      calls.push({ type: 'renderFinal', projectId, payload });
      return { render: { status: 'rendered', outputPath: 'output/video-final.mp4' }, lastRenderedSnapshotHash: payload.snapshotHash };
    },
    finalDownloadUrl: () => '/api/projects/approval-project-1/final',
  };
  const flushPendingApprovalDrafts = async (flushProject) => {
    calls.push({ type: 'flush', snapshotHash: flushProject.editor_state.snapshot_hash });
    flushProject.editor_state.snapshot_hash = 'hash-after';
    flushProject.editor_state.approval_contract_snapshot.snapshotHash = 'hash-after';
    return { flushedOperations: 1, snapshotHash: 'hash-after' };
  };

  const commands = createPreviewExportCommands({
    api: {},
    store,
    ui: { toast() {} },
    persistEditorState: async (persistProject, patch) => {
      calls.push({ type: 'persist', phase: patch.phase, lastRenderedHash: patch.last_rendered_hash });
      persistProject.editor_state = { ...persistProject.editor_state, ...patch };
    },
    isApprovalServiceMode: () => true,
    createApprovalServiceClient: () => client,
    renderSelectedVideoProject() {},
    flushPendingApprovalDrafts,
    renderFinalPollDelayMs: 0,
    renderFinalMaxPolls: 0,
  });

  await commands.exportFinal();

  assert.equal(calls[0].type, 'flush');
  const renderCall = calls.find((call) => call.type === 'renderFinal');
  assert.deepEqual(renderCall, {
    type: 'renderFinal',
    projectId: 'approval-project-1',
    payload: { snapshotHash: 'hash-after', async: true },
  });
  const finalPersist = calls.find((call) => call.type === 'persist' && call.phase === 'final_ready');
  assert.equal(finalPersist.lastRenderedHash, 'hash-after');
});

test('exportFinal persists browser image geometry through setRowMotion when no approval draft is pending', async () => {
  const calls = [];
  const project = {
    _editorRows: [{
      id: 'seg-001',
      rowId: 'seg-001',
      phrase: 'Fila con paneo',
      selectedAssetId: 'https://cdn.example.com/image.jpg',
      media: { kind: 'image' },
      motionPresetId: 'custom',
      motion: { fromX: 0, fromY: 267, toX: 0, toY: 341, fromScale: 1, toScale: 1.27 },
    }],
    editor_state: {
      dirty: false,
      pipeline_provider: 'approval',
      pipeline_base_url: 'http://127.0.0.1:3042',
      approval_contract_snapshot: {
        contractVersion: 'approval-editor-service-v1',
        snapshotHash: 'hash-before',
        rows: [{
          rowId: 'seg-001',
          phrase: 'Fila con paneo',
          selectedAssetId: 'https://cdn.example.com/image.jpg',
          media: { kind: 'image' },
          motionPresetId: 'custom',
          motion: { fromX: 0, fromY: 267, toX: 0, toY: 341, fromScale: 1, toScale: 1.27 },
        }],
        assets: { 'https://cdn.example.com/image.jpg': { assetId: 'https://cdn.example.com/image.jpg', renderPath: 'images/image.jpg', status: 'ready' } },
      },
      remotion_project_id: 'approval-project-1',
      snapshot_hash: 'hash-before',
    },
  };
  const store = { getState: () => ({ selectedVideoProject: project, settings: {} }) };
  const client = {
    updateSnapshot: async (projectId, payload) => {
      calls.push({ type: 'updateSnapshot', projectId, payload });
      const motion = payload.operations[0].motion;
      return {
        snapshot: {
          ...project.editor_state.approval_contract_snapshot,
          snapshotHash: 'hash-after-geometry',
          rows: [{ ...project.editor_state.approval_contract_snapshot.rows[0], motion }],
        },
      };
    },
    renderFinal: async (projectId, payload) => {
      calls.push({ type: 'renderFinal', projectId, payload });
      return { render: { status: 'rendered', outputPath: 'output/video-final.mp4' }, lastRenderedSnapshotHash: payload.snapshotHash };
    },
    finalDownloadUrl: () => '/api/projects/approval-project-1/final',
  };
  const approval = createApprovalSnapshotOperations({
    api: { createApprovalPipelineClient: () => client },
    store,
    ui: { toast() {} },
    persistEditorState: async (persistProject, patch) => {
      calls.push({ type: 'persist', phase: patch.phase, snapshotHash: patch.snapshot_hash, lastRenderedHash: patch.last_rendered_hash });
      persistProject.editor_state = { ...persistProject.editor_state, ...patch };
    },
    renderSelectedVideoProject() {},
    updateSelectedVideoProjectCompositionPreview: () => false,
    debounceMs: 0,
  });

  const commands = createPreviewExportCommands({
    api: {},
    store,
    ui: { toast() {} },
    persistEditorState: async (persistProject, patch) => {
      calls.push({ type: 'persist', phase: patch.phase, snapshotHash: patch.snapshot_hash, lastRenderedHash: patch.last_rendered_hash });
      persistProject.editor_state = { ...persistProject.editor_state, ...patch };
    },
    isApprovalServiceMode: () => true,
    createApprovalServiceClient: () => client,
    renderSelectedVideoProject() {},
    flushPendingApprovalDrafts: approval.flushPendingApprovalDrafts,
    captureApprovalRenderGeometry: () => ({
      'seg-001': { imageWidth: 951, imageHeight: 1171, panViewportWidth: 950.53125, panViewportHeight: 533.796875 },
    }),
    renderFinalPollDelayMs: 0,
    renderFinalMaxPolls: 0,
  });

  await commands.exportFinal();

  const updateCall = calls.find((call) => call.type === 'updateSnapshot');
  assert.deepEqual(updateCall.payload, {
    baseSnapshotHash: 'hash-before',
    operations: [{
      type: 'setRowMotion',
      rowId: 'seg-001',
      motionPresetId: 'custom',
      motion: { fromX: 0, fromY: 267, toX: 0, toY: 341, fromScale: 1, toScale: 1.27, imageWidth: 951, imageHeight: 1171, panViewportWidth: 950.53125, panViewportHeight: 533.796875 },
    }],
  });
  const renderCall = calls.find((call) => call.type === 'renderFinal');
  assert.deepEqual(renderCall.payload, { snapshotHash: 'hash-after-geometry', async: true });
  const finalPersist = calls.find((call) => call.type === 'persist' && call.phase === 'final_ready');
  assert.equal(finalPersist.lastRenderedHash, 'hash-after-geometry');
});
