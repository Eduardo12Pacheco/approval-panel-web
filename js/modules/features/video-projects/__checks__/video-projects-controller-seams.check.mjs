import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  createVideoProjectsFeature,
  mergeLocalEditorRowPatch,
  shouldFallbackApprovalSnapshotOperationError,
} from '../index.js';
import { createVideoProjectsController } from '../controller/create-video-projects-controller.js';
import { createProjectLoadingCommands } from '../controller/project-loading.js';
import { createEditorStatePersistence, hydrateSelectedProjectState } from '../controller/editor-state-persistence.js';
import { createApprovalSnapshotOperations } from '../controller/approval-snapshot-operations.js';
import { createPreviewExportCommands } from '../controller/preview-export-commands.js';
import { mergeLocalEditorRowPatch as mergeRowPatchFromSplitModule } from '../controller/row-commands.js?v=20260520-newspaper-effect';
import { hydrateProjectListCards } from '../events/project-list-events.js';

const EXPECTED_FEATURE_API = [
  'refreshVideoProjects',
  'openVideoProject',
  'disableVideoProject',
  'createManualVideoProject',
  'prefetchProjectDetail',
  'toggleImageSelection',
  'goToAudioStep',
  'goToImagesStep',
  'uploadProjectAudio',
  'selectDefaultBackgroundMusic',
  'uploadCustomImages',
  'preparePreview',
  'refreshPreview',
  'exportFinal',
  'updateRow',
  'swapRowImages',
  'assignExistingImageToRow',
  'uploadAndAssignImage',
  'uploadVideoToLibrary',
  'assignVideoSegmentToRow',
  'updateGlobalAudio',
  'updateBrandChannel',
  'undoEditorChange',
  'activate',
];

function createMinimalDependencies(overrides = {}) {
  const state = {
    videoProjects: [],
    selectedVideoProject: null,
    settings: {},
    ...overrides.state,
  };
  const calls = { renders: [], toasts: [], saved: [], listed: 0 };
  return {
    calls,
    api: {
      async listVideoProjects() {
        calls.listed += 1;
        return overrides.listProjectsResult ?? [];
      },
      async saveVideoProjectEditorState(payload) {
        calls.saved.push(payload);
        return { ok: true };
      },
      createRemotionClient: () => ({
        async status() { return { project: { rows: [] } }; },
      }),
      ...overrides.api,
    },
    store: { getState: () => state },
    ui: { toast: (message) => calls.toasts.push(message) },
    callbacks: {
      renderVideoProjects: () => calls.renders.push('list'),
      renderSelectedVideoProject: () => calls.renders.push('detail'),
      updateSelectedVideoProjectCompositionPreview: () => true,
      ...overrides.callbacks,
    },
  };
}

test('video projects facade keeps public API shape while delegating to controller factory', () => {
  assert.equal(typeof createVideoProjectsController, 'function');

  const dependencies = createMinimalDependencies();
  const feature = createVideoProjectsFeature(dependencies);

  assert.deepEqual(Object.keys(feature), EXPECTED_FEATURE_API);

  const facadeSource = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  assert.match(facadeSource, /createVideoProjectsController\(\{ api, store, ui, callbacks \}\)/);
  assert.doesNotMatch(facadeSource, /async function refreshVideoProjects/);
});

test('project loading command preserves list refresh render order and selected editor state without eager detail prefetch', async () => {
  const priorEditorState = { phase: 'preview_ready', timed_rows: [{ id: 'row-1' }] };
  const dependencies = createMinimalDependencies({
    state: {
      selectedVideoProject: { draft_id: 'draft-1', editor_state: priorEditorState },
    },
    listProjectsResult: [{ draft_id: 'draft-1', title: 'Fresh row' }],
  });

  const commands = createProjectLoadingCommands({
    ...dependencies,
    normalizeRows: (rows) => rows,
    resolveProjectKey: (project) => project?.draft_id || '',
    renderVideoProjects: dependencies.callbacks.renderVideoProjects,
    renderSelectedVideoProject: dependencies.callbacks.renderSelectedVideoProject,
    prefetchListedVideoProjects: () => dependencies.calls.renders.push('prefetch'),
  });

  await commands.refreshVideoProjects();

  const state = dependencies.store.getState();
  assert.equal(state.videoProjectsLoading, false);
  assert.equal(state.videoProjects[0].title, 'Fresh row');
  assert.equal(state.selectedVideoProject.title, 'Fresh row');
  assert.deepEqual(state.selectedVideoProject.editor_state.timed_rows, [{ id: 'row-1' }]);
  assert.deepEqual(dependencies.calls.renders, ['list', 'list', 'detail', 'list']);
});

test('project list cards still prefetch details from direct user intent events', () => {
  const listeners = new Map();
  const card = {
    dataset: { projectId: encodeURIComponent('draft-1') },
    addEventListener(type, listener, options) {
      listeners.set(type, { listener, options });
    },
    querySelector() { return null; },
  };
  const calls = [];

  hydrateProjectListCards({
    root: { querySelectorAll: () => [card] },
    openVideoProject: () => calls.push('open'),
    prefetchProjectDetail: (projectId) => calls.push(`prefetch:${projectId}`),
  });

  assert.deepEqual([...listeners.keys()], ['mouseenter', 'focusin', 'touchstart', 'click']);
  assert.equal(listeners.get('mouseenter').options.once, true);
  listeners.get('mouseenter').listener();
  listeners.get('focusin').listener();
  assert.deepEqual(calls, ['prefetch:draft-1', 'prefetch:draft-1']);
});

test('controller split modules preserve state persistence, snapshot fallback, preview/export and row helpers', async () => {
  const project = { draft_id: 'draft-1', editor_state: { phase: 'editing_dirty' } };
  const dependencies = createMinimalDependencies({ state: { selectedVideoProject: project } });
  const persistence = createEditorStatePersistence({ api: dependencies.api, resolveProjectKey: (item) => item?.draft_id || '' });

  await persistence.persistEditorState(project, { dirty: false, phase: 'preview_ready' });

  assert.equal(project.editor_state.phase, 'preview_ready');
  assert.equal(dependencies.calls.saved[0].draftId, 'draft-1');
  assert.equal(dependencies.calls.saved[0].editorState.dirty, false);

  assert.equal(
    shouldFallbackApprovalSnapshotOperationError(
      { message: 'unsupported operation: setRowVideoSegment' },
      'setRowVideoSegment',
    ),
    true,
  );
  assert.equal(mergeLocalEditorRowPatch, mergeRowPatchFromSplitModule);

  const approval = createApprovalSnapshotOperations({
    api: dependencies.api,
    store: dependencies.store,
    ui: dependencies.ui,
    persistEditorState: persistence.persistEditorState,
    renderSelectedVideoProject: dependencies.callbacks.renderSelectedVideoProject,
  });
  assert.equal(typeof approval.queueApprovalSnapshotOperations, 'function');

  const previewExport = createPreviewExportCommands({
    api: dependencies.api,
    store: dependencies.store,
    ui: dependencies.ui,
    persistEditorState: persistence.persistEditorState,
    isApprovalServiceMode: () => false,
    renderSelectedVideoProject: dependencies.callbacks.renderSelectedVideoProject,
  });
  assert.equal(typeof previewExport.preparePreview, 'function');
  assert.equal(typeof previewExport.refreshPreview, 'function');
  assert.equal(typeof previewExport.exportFinal, 'function');
});

test('approval row media mode save refreshes cached project detail before reopening', async () => {
  const originalSnapshot = {
    contractVersion: 'approval-editor-service-v1',
    projectId: 'approval-project-1',
    snapshotId: 'snapshot-1',
    snapshotHash: 'hash-1',
    rows: [
      { rowId: 'row-1', id: 'row-1', index: 0, phrase: 'Luis diaz', startTime: 0, endTime: 1, selectedAssetId: 'asset-1', mediaMode: 'image', media: { kind: 'image' } },
    ],
    assets: {
      'asset-1': { assetId: 'asset-1', previewUrl: 'https://cdn.example.com/luis.jpg', renderPath: 'https://cdn.example.com/luis.jpg' },
    },
  };
  const staleDetail = {
    draft_id: 'draft-1',
    title: 'Luis diaz',
    editor_state: {
      phase: 'preview_ready',
      pipeline_provider: 'approval',
      pipeline_base_url: 'https://approval.local',
      remotion_project_id: 'approval-project-1',
      approval_contract_snapshot: originalSnapshot,
      snapshot_id: originalSnapshot.snapshotId,
      snapshot_hash: originalSnapshot.snapshotHash,
      timed_rows: originalSnapshot.rows.map((row) => ({ ...row })),
    },
  };
  let detailFetches = 0;
  const savedEditorStates = [];
  const dependencies = createMinimalDependencies({
    listProjectsResult: [{ draft_id: 'draft-1', title: 'Luis diaz' }],
    api: {
      async getVideoProject() {
        detailFetches += 1;
        return { data: [JSON.parse(JSON.stringify(staleDetail))] };
      },
      async saveVideoProjectEditorState({ editorState }) {
        savedEditorStates.push(editorState);
        return { ok: true };
      },
      createApprovalPipelineClient() {
        return {
          async updateSnapshot(projectId, payload) {
            assert.equal(projectId, 'approval-project-1');
            assert.equal(payload.operations[0].type, 'setRowMediaMode');
            const next = JSON.parse(JSON.stringify(originalSnapshot));
            next.rows[0].mediaMode = 'newspaper';
            next.rows[0].media = { kind: 'image' };
            next.rows[0].motionPresetId = 'Zoom 125';
            next.rows[0].motion = { fromScale: 1, toScale: 1.25, fromX: 0, fromY: 0, toX: 0, toY: 0, easing: 'linear' };
            next.snapshotId = 'snapshot-2';
            next.snapshotHash = 'hash-2';
            return { snapshot: next };
          },
        };
      },
    },
  });
  dependencies.store.getState().settings = { approvalPipelineBaseUrl: 'https://approval.local' };
  const feature = createVideoProjectsFeature(dependencies);

  await feature.openVideoProject('draft-1');
  await feature.updateRow('row-1', { mediaMode: 'newspaper', media: { kind: 'image' } });
  dependencies.store.getState().selectedVideoProject = null;
  await feature.openVideoProject('draft-1');

  assert.equal(detailFetches, 1, 'Expected second open to use cached detail within TTL');
  assert.equal(savedEditorStates.at(-1).timed_rows[0].mediaMode, 'newspaper');
  assert.equal(dependencies.store.getState().selectedVideoProject._editorRows[0].mediaMode, 'newspaper');
  assert.equal(dependencies.store.getState().selectedVideoProject.editor_state.approval_contract_snapshot.rows[0].mediaMode, 'newspaper');
});

test('editor hydration keeps persisted timed row media mode over stale snapshot rows', () => {
  const project = {
    draft_id: 'draft-1',
    editor_state: {
      timed_rows: [
        { id: 'row-1', rowId: 'row-1', phrase: 'Luis diaz', startTime: 0, endTime: 1, selectedAssetId: 'asset-1', mediaMode: 'newspaper', media: { kind: 'image' } },
      ],
      approval_contract_snapshot: {
        contractVersion: 'approval-editor-service-v1',
        rows: [
          { id: 'row-1', rowId: 'row-1', phrase: 'Luis diaz', startTime: 0, endTime: 1, selectedAssetId: 'asset-1', mediaMode: 'image', media: { kind: 'image' } },
        ],
      },
    },
  };

  hydrateSelectedProjectState(project);

  assert.equal(project._editorRows[0].mediaMode, 'newspaper');
  assert.deepEqual(project._editorRows[0].media, { kind: 'image' });
});
