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
import { createEditorStatePersistence } from '../controller/editor-state-persistence.js';
import { createApprovalSnapshotOperations } from '../controller/approval-snapshot-operations.js';
import { createPreviewExportCommands } from '../controller/preview-export-commands.js';
import { mergeLocalEditorRowPatch as mergeRowPatchFromSplitModule } from '../controller/row-commands.js';
import { hydrateProjectListCards } from '../events/project-list-events.js';

const EXPECTED_FEATURE_API = [
  'refreshVideoProjects',
  'openVideoProject',
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
  'assignExistingImageToRow',
  'uploadAndAssignImage',
  'uploadVideoToLibrary',
  'assignVideoSegmentToRow',
  'updateGlobalAudio',
  'updateBrandChannel',
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
