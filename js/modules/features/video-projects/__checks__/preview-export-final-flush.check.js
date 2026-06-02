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

test('exportFinal reconciles local video foreground transform before renderFinal when the pending draft queue is empty', async () => {
  const calls = [];
  const localVideoRow = {
    id: 'seg-002',
    rowId: 'seg-002',
    startTime: 10,
    endTime: 13,
    media: {
      kind: 'video-segment',
      sourceVideoAssetId: 'clip-1',
      sourceVideoSrc: 'https://cdn.example.com/clip-1.mp4',
      sourceInSeconds: 31.95,
      durationSeconds: 3,
      foregroundTransform: { x: 180, y: -24, scale: 1.65 },
    },
  };
  const snapshotVideoRow = { ...localVideoRow, media: { kind: 'video-segment', sourceVideoAssetId: 'clip-1', sourceInSeconds: 31.95, durationSeconds: 3 } };
  const project = {
    _editorRows: [localVideoRow],
    editor_state: {
      dirty: false,
      pipeline_provider: 'approval',
      pipeline_base_url: 'http://127.0.0.1:3042',
      approval_contract_snapshot: { contractVersion: 'approval-editor-service-v1', snapshotHash: 'hash-before-video-foreground', rows: [snapshotVideoRow], assets: {} },
      remotion_project_id: 'approval-project-video-foreground',
      snapshot_hash: 'hash-before-video-foreground',
    },
  };
  const store = { getState: () => ({ selectedVideoProject: project, settings: {} }) };
  const client = {
    updateSnapshot: async (projectId, payload) => {
      calls.push({ type: 'updateSnapshot', projectId, payload });
      return { snapshot: { ...project.editor_state.approval_contract_snapshot, snapshotHash: 'hash-after-video-foreground', rows: [{ ...snapshotVideoRow, media: { ...snapshotVideoRow.media, sourceVideoSrc: payload.operations[0].sourceVideoSrc, foregroundTransform: payload.operations[0].foregroundTransform } }] } };
    },
    renderFinal: async (projectId, payload) => {
      calls.push({ type: 'renderFinal', projectId, payload });
      return { render: { status: 'rendered', outputPath: 'output/video-final.mp4' }, lastRenderedSnapshotHash: payload.snapshotHash };
    },
    finalDownloadUrl: () => '/api/projects/approval-project-video-foreground/final',
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
    captureApprovalRenderGeometry: () => ({}),
    renderFinalPollDelayMs: 0,
    renderFinalMaxPolls: 0,
  });

  await commands.exportFinal();

  const updateCall = calls.find((call) => call.type === 'updateSnapshot');
  assert.deepEqual(updateCall.payload, {
    baseSnapshotHash: 'hash-before-video-foreground',
    operations: [{ type: 'setRowVideoSegment', rowId: 'seg-002', sourceVideoAssetId: 'clip-1', sourceVideoSrc: 'https://cdn.example.com/clip-1.mp4', sourceInSeconds: 31.95, durationSeconds: 3, foregroundTransform: { x: 180, y: -24, scale: 1.65 } }],
  });
  const renderCall = calls.find((call) => call.type === 'renderFinal');
  assert.deepEqual(renderCall.payload, { snapshotHash: 'hash-after-video-foreground', async: true });
  const finalPersist = calls.find((call) => call.type === 'persist' && call.phase === 'final_ready');
  assert.equal(finalPersist.lastRenderedHash, 'hash-after-video-foreground');
});

test('refreshPreview reconciles local video foreground transform before marking Approval preview clean', async () => {
  const calls = [];
  const videoRow = {
    id: 'seg-003',
    rowId: 'seg-003',
    startTime: 20,
    endTime: 24,
    media: { kind: 'video-segment', sourceVideoAssetId: 'clip-3', sourceVideoSrc: 'https://cdn.example.com/clip-3.mp4', sourceInSeconds: 8, durationSeconds: 4, foregroundTransform: { x: -90, y: 32, scale: 1.4 } },
  };
  const snapshotVideoRow = { ...videoRow, media: { ...videoRow.media, foregroundTransform: undefined } };
  const project = {
    _editorRows: [videoRow],
    editor_state: {
      dirty: true,
      pipeline_provider: 'approval',
      pipeline_base_url: 'http://127.0.0.1:3042',
      approval_contract_snapshot: { contractVersion: 'approval-editor-service-v1', snapshotHash: 'hash-before-refresh-video-foreground', rows: [snapshotVideoRow], assets: {} },
      remotion_project_id: 'approval-project-refresh-video-foreground',
      snapshot_hash: 'hash-before-refresh-video-foreground',
    },
  };
  const store = { getState: () => ({ selectedVideoProject: project, settings: {} }) };
  const client = {
    updateSnapshot: async (projectId, payload) => {
      calls.push({ type: 'updateSnapshot', projectId, payload });
      return { snapshot: { ...project.editor_state.approval_contract_snapshot, snapshotHash: 'hash-after-refresh-video-foreground', rows: [{ ...snapshotVideoRow, media: { ...snapshotVideoRow.media, foregroundTransform: payload.operations[0].foregroundTransform } }] } };
    },
  };
  const approval = createApprovalSnapshotOperations({
    api: { createApprovalPipelineClient: () => client },
    store,
    ui: { toast() {} },
    persistEditorState: async (persistProject, patch) => {
      calls.push({ type: 'persist', phase: patch.phase, snapshotHash: patch.snapshot_hash, lastPreviewHash: patch.last_preview_hash, error: patch.error });
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
      calls.push({ type: 'persist', phase: patch.phase, snapshotHash: patch.snapshot_hash, lastPreviewHash: patch.last_preview_hash, error: patch.error });
      persistProject.editor_state = { ...persistProject.editor_state, ...patch };
    },
    isApprovalServiceMode: () => true,
    createApprovalServiceClient: () => client,
    renderSelectedVideoProject() {},
    flushPendingApprovalDrafts: approval.flushPendingApprovalDrafts,
  });

  await commands.refreshPreview();

  const updateCall = calls.find((call) => call.type === 'updateSnapshot');
  assert.deepEqual(updateCall.payload.operations, [{ type: 'setRowVideoSegment', rowId: 'seg-003', sourceVideoAssetId: 'clip-3', sourceVideoSrc: 'https://cdn.example.com/clip-3.mp4', sourceInSeconds: 8, durationSeconds: 4, foregroundTransform: { x: -90, y: 32, scale: 1.4 } }]);
  const cleanPersist = calls.find((call) => call.type === 'persist' && call.phase === 'preview_ready' && call.lastPreviewHash);
  assert.equal(cleanPersist.lastPreviewHash, 'hash-after-refresh-video-foreground');
  assert.equal(calls.some((call) => call.phase === 'error'), false);
});

test('exportFinal persists automatic boundary transitions before renderFinal', async () => {
  const calls = [];
  const rows = Array.from({ length: 15 }, (_, index) => {
    const rowNumber = index + 1;
    const rowId = `seg-${String(rowNumber).padStart(3, '0')}`;
    return {
      id: rowId,
      rowId,
      phrase: `Fila ${rowNumber}`,
      selectedAssetId: `https://cdn.example.com/image-${rowNumber}.jpg`,
      media: { kind: 'image' },
      motionPresetId: 'custom',
      motion: { fromX: 0, fromY: 0, toX: 0, toY: 0, fromScale: 1, toScale: 1 },
      ...(rowNumber === 7 ? { paragraphBoundaryAfter: true, nextRowId: 'seg-008', transition: 'glitch-1', transitionSource: 'auto' } : {}),
      ...(rowNumber === 14 ? { paragraphBoundaryAfter: true, nextRowId: 'seg-015', transition: 'glitch-2', transitionSource: 'auto' } : {}),
    };
  });
  const snapshotRows = rows.map(({ transition, transitionSource, transitionConfig, sfx, ...row }) => row);
  const project = {
    _editorRows: rows,
    editor_state: {
      dirty: false,
      pipeline_provider: 'approval',
      pipeline_base_url: 'http://127.0.0.1:3042',
      approval_contract_snapshot: {
        contractVersion: 'approval-editor-service-v1',
        snapshotHash: 'hash-before-auto-boundaries',
        rows: snapshotRows,
        assets: Object.fromEntries(rows.map((row) => [row.selectedAssetId, { assetId: row.selectedAssetId, renderPath: `images/${row.rowId}.jpg`, status: 'ready' }])),
      },
      remotion_project_id: 'approval-project-auto-boundaries',
      snapshot_hash: 'hash-before-auto-boundaries',
    },
  };
  const store = { getState: () => ({ selectedVideoProject: project, settings: {} }) };
  const client = {
    updateSnapshot: async (projectId, payload) => {
      calls.push({ type: 'updateSnapshot', projectId, payload });
      const transitionByRowId = new Map(payload.operations
        .filter((operation) => operation.type === 'setBoundaryTransition')
        .map((operation) => [operation.rowId, operation]));
      return {
        snapshot: {
          ...project.editor_state.approval_contract_snapshot,
          snapshotHash: 'hash-after-auto-boundaries',
          rows: snapshotRows.map((row) => {
            const operation = transitionByRowId.get(row.rowId);
            return operation ? { ...row, paragraphBoundaryAfter: true, nextRowId: operation.nextRowId, transition: operation.transition, transitionSource: operation.transitionSource } : row;
          }),
        },
      };
    },
    renderFinal: async (projectId, payload) => {
      calls.push({ type: 'renderFinal', projectId, payload });
      return { render: { status: 'rendered', outputPath: 'output/video-final.mp4' }, lastRenderedSnapshotHash: payload.snapshotHash };
    },
    finalDownloadUrl: () => '/api/projects/approval-project-auto-boundaries/final',
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
    captureApprovalRenderGeometry: () => Object.fromEntries(rows.map((row) => [row.rowId, {
      imageWidth: 951,
      imageHeight: 1171,
      panViewportWidth: 950.53125,
      panViewportHeight: 533.796875,
    }])),
    renderFinalPollDelayMs: 0,
    renderFinalMaxPolls: 0,
  });

  await commands.exportFinal();

  const updateCall = calls.find((call) => call.type === 'updateSnapshot');
  const boundaryOperations = updateCall.payload.operations.filter((operation) => operation.type === 'setBoundaryTransition');
  assert.deepEqual(boundaryOperations, [
    { type: 'setBoundaryTransition', rowId: 'seg-007', nextRowId: 'seg-008', paragraphBoundaryAfter: true, transition: 'glitch-1', transitionSource: 'auto' },
    { type: 'setBoundaryTransition', rowId: 'seg-014', nextRowId: 'seg-015', paragraphBoundaryAfter: true, transition: 'glitch-2', transitionSource: 'auto' },
  ]);
  const renderCall = calls.find((call) => call.type === 'renderFinal');
  assert.deepEqual(renderCall.payload, { snapshotHash: 'hash-after-auto-boundaries', async: true });
});

test('exportFinal persists browser image geometry for every image row, including non-visible later rows', async () => {
  const calls = [];
  const rows = Array.from({ length: 7 }, (_, index) => {
    const rowNumber = index + 1;
    return {
      id: `seg-00${rowNumber}`,
      rowId: `seg-00${rowNumber}`,
      phrase: `Fila ${rowNumber}`,
      selectedAssetId: `https://cdn.example.com/image-${rowNumber}.jpg`,
      media: { kind: 'image' },
      motionPresetId: 'custom',
      motion: { fromX: 0, fromY: rowNumber * 10, toX: 0, toY: rowNumber * 12, fromScale: 1, toScale: 1.2 },
    };
  });
  const project = {
    _editorRows: rows,
    editor_state: {
      dirty: false,
      pipeline_provider: 'approval',
      pipeline_base_url: 'http://127.0.0.1:3042',
      approval_contract_snapshot: {
        contractVersion: 'approval-editor-service-v1',
        snapshotHash: 'hash-before-many-rows',
        rows: rows.map((row) => ({ ...row })),
        assets: Object.fromEntries(rows.map((row) => [row.selectedAssetId, { assetId: row.selectedAssetId, renderPath: `images/${row.rowId}.jpg`, status: 'ready' }])),
      },
      remotion_project_id: 'approval-project-many-rows',
      snapshot_hash: 'hash-before-many-rows',
    },
  };
  const store = { getState: () => ({ selectedVideoProject: project, settings: {} }) };
  const client = {
    updateSnapshot: async (projectId, payload) => {
      calls.push({ type: 'updateSnapshot', projectId, payload });
      const motionByRowId = new Map(payload.operations.map((operation) => [operation.rowId, operation.motion]));
      return {
        snapshot: {
          ...project.editor_state.approval_contract_snapshot,
          snapshotHash: 'hash-after-many-geometry',
          rows: rows.map((row) => ({ ...row, motion: motionByRowId.get(row.rowId) || row.motion })),
        },
      };
    },
    renderFinal: async (projectId, payload) => {
      calls.push({ type: 'renderFinal', projectId, payload });
      return { render: { status: 'rendered', outputPath: 'output/video-final.mp4' }, lastRenderedSnapshotHash: payload.snapshotHash };
    },
    finalDownloadUrl: () => '/api/projects/approval-project-many-rows/final',
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
      calls.push({ type: 'persist', phase: patch.phase, snapshotHash: patch.snapshot_hash, lastRenderedHash: patch.last_rendered_hash, error: patch.error });
      persistProject.editor_state = { ...persistProject.editor_state, ...patch };
    },
    isApprovalServiceMode: () => true,
    createApprovalServiceClient: () => client,
    renderSelectedVideoProject() {},
    flushPendingApprovalDrafts: approval.flushPendingApprovalDrafts,
    captureApprovalRenderGeometry: async () => Object.fromEntries(rows.map((row, index) => [row.rowId, {
      imageWidth: 900 + index,
      imageHeight: 1200 + index,
      panViewportWidth: 950.53125,
      panViewportHeight: 533.796875,
    }])),
    renderFinalPollDelayMs: 0,
    renderFinalMaxPolls: 0,
  });

  await commands.exportFinal();

  const updateCall = calls.find((call) => call.type === 'updateSnapshot');
  assert.equal(updateCall.payload.operations.length, 7);
  assert.deepEqual(updateCall.payload.operations.map((operation) => operation.rowId), rows.map((row) => row.rowId));
  const rowSixOperation = updateCall.payload.operations.find((operation) => operation.rowId === 'seg-006');
  const rowSevenOperation = updateCall.payload.operations.find((operation) => operation.rowId === 'seg-007');
  assert.equal(rowSixOperation.motion.imageWidth, 905);
  assert.equal(rowSixOperation.motion.panViewportHeight, 533.796875);
  assert.equal(rowSevenOperation.motion.imageHeight, 1206);
  assert.equal(rowSevenOperation.motion.panViewportWidth, 950.53125);
  const renderCall = calls.find((call) => call.type === 'renderFinal');
  assert.deepEqual(renderCall.payload, { snapshotHash: 'hash-after-many-geometry', async: true });
});

test('exportFinal blocks final render when any image row is missing required geometry', async () => {
  const calls = [];
  const rows = [6, 7].map((rowNumber) => ({
    id: `seg-00${rowNumber}`,
    rowId: `seg-00${rowNumber}`,
    phrase: `Fila ${rowNumber}`,
    selectedAssetId: `https://cdn.example.com/image-${rowNumber}.jpg`,
    media: { kind: 'image' },
    motionPresetId: 'custom',
    motion: { fromX: 0, fromY: rowNumber * 10, toX: 0, toY: rowNumber * 12, fromScale: 1, toScale: 1.2 },
  }));
  const project = {
    _editorRows: rows,
    editor_state: {
      dirty: false,
      pipeline_provider: 'approval',
      pipeline_base_url: 'http://127.0.0.1:3042',
      approval_contract_snapshot: { contractVersion: 'approval-editor-service-v1', snapshotHash: 'hash-before-missing-row-7', rows: rows.map((row) => ({ ...row })) },
      remotion_project_id: 'approval-project-missing-row-7',
      snapshot_hash: 'hash-before-missing-row-7',
    },
  };
  const store = { getState: () => ({ selectedVideoProject: project, settings: {} }) };
  const client = {
    updateSnapshot: async (projectId, payload) => {
      calls.push({ type: 'updateSnapshot', projectId, payload });
      return { snapshot: { ...project.editor_state.approval_contract_snapshot, snapshotHash: 'hash-after-missing-row-7' } };
    },
    renderFinal: async (projectId, payload) => {
      calls.push({ type: 'renderFinal', projectId, payload });
      return { render: { status: 'rendered', outputPath: 'output/video-final.mp4' }, lastRenderedSnapshotHash: payload.snapshotHash };
    },
  };
  const approval = createApprovalSnapshotOperations({
    api: { createApprovalPipelineClient: () => client },
    store,
    ui: { toast() {} },
    persistEditorState: async (persistProject, patch) => {
      calls.push({ type: 'persist', phase: patch.phase, error: patch.error });
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
      calls.push({ type: 'persist', phase: patch.phase, error: patch.error });
      persistProject.editor_state = { ...persistProject.editor_state, ...patch };
    },
    isApprovalServiceMode: () => true,
    createApprovalServiceClient: () => client,
    renderSelectedVideoProject() {},
    flushPendingApprovalDrafts: approval.flushPendingApprovalDrafts,
    captureApprovalRenderGeometry: () => ({
      'seg-006': { imageWidth: 951, imageHeight: 1171, panViewportWidth: 950.53125, panViewportHeight: 533.796875 },
    }),
    renderFinalPollDelayMs: 0,
    renderFinalMaxPolls: 0,
  });

  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    await commands.exportFinal();
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(calls.some((call) => call.type === 'renderFinal'), false);
  const errorPersist = calls.find((call) => call.type === 'persist' && call.phase === 'error');
  assert.match(errorPersist.error, /seg-007/);
  assert.match(errorPersist.error, /geometry/i);
});
