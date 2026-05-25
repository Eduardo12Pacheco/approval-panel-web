import {
  createEditorUndoManager,
  isEditableUndoTarget,
  shouldHandleEditorUndoKey,
} from '../controller/undo-manager.js';
import { createApprovalSnapshotOperations } from '../controller/approval-snapshot-operations.js';
import { createVideoProjectsController } from '../controller/create-video-projects-controller.js';
import { hydrateEditorUndoShortcut } from '../render/editor-hydration.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

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

function createFakeTimers() {
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const timers = new Map();
  let nextId = 1;

  globalThis.setTimeout = (callback, delay = 0) => {
    const id = nextId;
    nextId += 1;
    timers.set(id, { callback, delay, cleared: false });
    return id;
  };

  globalThis.clearTimeout = (id) => {
    const timer = timers.get(id);
    if (timer) timer.cleared = true;
  };

  return {
    runPending() {
      const pending = Array.from(timers.values());
      timers.clear();
      pending.forEach((timer) => {
        if (!timer.cleared) timer.callback();
      });
    },
    restore() {
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
    },
  };
}

function flushMicrotasks() {
  return new Promise((resolve) => {
    const enqueue = typeof queueMicrotask === 'function'
      ? queueMicrotask
      : (callback) => Promise.resolve().then(callback);
    enqueue(() => enqueue(resolve));
  });
}

function makeProject(overrides = {}) {
  return {
    draft_id: 'draft-undo-1',
    selected_images: [{ image_id: 'img-original', url: './uploads/original.jpg' }],
    selected_count: 1,
    image_candidates: [{ image_id: 'img-original', url: './uploads/original.jpg' }],
    video_assets: [{ id: 'video-original', src: './uploads/original.mp4' }],
    _selectedEditorRowId: 'row-1',
    _editorEffectTab: 'assets',
    _motionEditorTab: 'manual',
    _previewSeekTime: 4.25,
    _editorRows: [
      {
        id: 'row-1',
        selectedAssetId: 'img-original',
        media: { kind: 'image', assetId: 'img-original', url: './uploads/original.jpg' },
        motion: { fromX: 0, toX: 10 },
      },
    ],
    _globalAudio: { voice: { volume: 1, muted: false }, music: { volume: 0.4, muted: false } },
    editor_state: {
      phase: 'preview_ready',
      dirty: false,
      snapshot_id: 'snapshot-original',
      snapshot_hash: 'hash-original',
      composition_hash: 'composition-original',
      last_preview_hash: 'composition-original',
      error: '',
      brandChannel: 'pelotazo-ecuador',
      brand_channel: 'pelotazo-ecuador',
      timed_rows: [
        {
          id: 'row-1',
          selectedAssetId: 'img-original',
          media: { kind: 'image', assetId: 'img-original', url: './uploads/original.jpg' },
          motion: { fromX: 0, toX: 10 },
        },
      ],
      global_audio: { voice: { volume: 1, muted: false }, music: { volume: 0.4, muted: false } },
      approval_contract_snapshot: {
        snapshotId: 'snapshot-original',
        snapshotHash: 'hash-original',
        brandChannel: 'pelotazo-ecuador',
        rows: [
          { id: 'row-1', selectedAssetId: 'img-original', media: { kind: 'image', assetId: 'img-original', url: './uploads/original.jpg' } },
        ],
        assets: {
          'img-original': { assetId: 'img-original', previewUrl: './uploads/original.jpg' },
        },
      },
      video_assets: [{ id: 'video-original', src: './uploads/original.mp4' }],
      preview_assets: { images: [{ id: 'img-original', url: './uploads/original.jpg' }] },
      updated_at: '2026-05-23T00:00:00.000Z',
    },
    ...overrides,
  };
}

function mutateProject(project, suffix) {
  project._editorRows[0].selectedAssetId = `img-${suffix}`;
  project._editorRows[0].media.assetId = `img-${suffix}`;
  project._editorRows[0].media.url = `./uploads/${suffix}.jpg`;
  project._globalAudio.music.volume = 0.9;
  project.selected_images[0] = { image_id: `img-${suffix}`, url: `./uploads/${suffix}.jpg`, upload: { fileName: `${suffix}.jpg` } };
  project.selected_count = 2;
  project.image_candidates.push({ image_id: `img-${suffix}`, url: `./uploads/${suffix}.jpg`, upload: { fileName: `${suffix}.jpg` } });
  project.video_assets.push({ id: `video-${suffix}`, src: `./uploads/${suffix}.mp4`, upload: { fileName: `${suffix}.mp4` } });
  project._selectedEditorRowId = 'row-2';
  project._editorEffectTab = 'videos';
  project._motionEditorTab = 'presets';
  project._previewSeekTime = 8;
  project.editor_state = {
    ...project.editor_state,
    phase: 'editing_dirty',
    dirty: true,
    snapshot_id: `snapshot-${suffix}`,
    snapshot_hash: `hash-${suffix}`,
    composition_hash: `composition-${suffix}`,
    last_preview_hash: `composition-${suffix}`,
    error: `error-${suffix}`,
    brandChannel: 'pelotazo-colombia',
    brand_channel: 'pelotazo-colombia',
    timed_rows: project._editorRows,
    global_audio: project._globalAudio,
    video_assets: project.video_assets,
    preview_assets: { images: [{ id: `img-${suffix}`, url: `./uploads/${suffix}.jpg` }] },
    approval_contract_snapshot: {
      ...project.editor_state.approval_contract_snapshot,
      snapshotId: `snapshot-${suffix}`,
      snapshotHash: `hash-${suffix}`,
      brandChannel: 'pelotazo-colombia',
      rows: project._editorRows,
    },
  };
}

function runCaptureRestoreDeepCloneCheck() {
  const manager = createEditorUndoManager({ maxEntries: 5, now: () => 1234 });
  const project = makeProject();
  const originalRows = JSON.parse(JSON.stringify(project._editorRows));

  assertEqual(manager.capture('before image change', project), true, 'Expected first meaningful capture to be accepted');
  mutateProject(project, 'uploaded');

  const restored = manager.undo({ project });

  assert(restored, 'Expected undo to return the restored snapshot');
  assertDeepEqual(project._editorRows, originalRows, 'Expected undo to restore previous editor rows');
  assertDeepEqual(project.editor_state.timed_rows, originalRows, 'Expected editor_state timed rows to stay in sync with restored rows');
  assertEqual(project._globalAudio.music.volume, 0.4, 'Expected undo to restore global audio');
  assertEqual(project.editor_state.snapshot_hash, 'hash-original', 'Expected undo to restore snapshot metadata');
  assertEqual(project.editor_state.brandChannel, 'pelotazo-ecuador', 'Expected undo to restore brand metadata');
  assertEqual(project._editorEffectTab, 'assets', 'Expected undo to restore UI effect tab');

  project._editorRows[0].media.assetId = 'mutated-after-restore';
  assertEqual(restored.editorRows[0].media.assetId, 'img-original', 'Expected restored snapshot to be isolated from later project mutations');
}

function runCheckpointNoopAndSourceIsolationCheck() {
  const manager = createEditorUndoManager({ maxEntries: 5, now: () => 2222 });
  const project = makeProject();

  const noopResult = manager.checkpoint('noop patch', project, () => {
    project._editorRows[0].selectedAssetId = 'img-original';
  });

  assertEqual(noopResult.changed, false, 'Expected checkpoint to identify unchanged state');
  assertEqual(manager.canUndo(project), false, 'Expected no-op checkpoint not to leave undo entries');

  manager.capture('before nested change', project);
  project._editorRows[0].media.assetId = 'changed-after-capture';
  project.editor_state.approval_contract_snapshot.assets['img-original'].previewUrl = './uploads/changed.jpg';
  manager.undo({ project });

  assertEqual(project._editorRows[0].media.assetId, 'img-original', 'Expected capture to deep clone source row objects');
  assertEqual(project.editor_state.approval_contract_snapshot.assets['img-original'].previewUrl, './uploads/original.jpg', 'Expected capture to deep clone source snapshot assets');
}

function runRedoClearingAndBoundsCheck() {
  const manager = createEditorUndoManager({ maxEntries: 2, now: () => 3333 });
  const project = makeProject();

  manager.capture('state 1', project);
  mutateProject(project, 'two');
  manager.capture('state 2', project);
  mutateProject(project, 'three');
  manager.capture('state 3', project);
  mutateProject(project, 'four');

  assertEqual(manager.undoDepth(project), 2, 'Expected undo stack to respect configured max entries');
  manager.undo({ project });
  assertEqual(manager.canRedo(project), true, 'Expected undo to retain redo-compatible current-state snapshot');

  manager.capture('state after undo', project);

  assertEqual(manager.canRedo(project), false, 'Expected new capture after undo to clear redo stack');
}

function runUploadMetadataStateOnlyCheck() {
  const deletedAssets = [];
  const manager = createEditorUndoManager({ maxEntries: 5, now: () => 4444 });
  const project = makeProject({
    deleteUploadedFile(assetId) {
      deletedAssets.push(assetId);
    },
  });

  manager.capture('before upload assignment', project);
  mutateProject(project, 'upload-kept');
  manager.undo({ project });

  assertEqual(deletedAssets.length, 0, 'Expected undo restore not to call project upload deletion hooks');
  assertDeepEqual(project.selected_images, [{ image_id: 'img-original', url: './uploads/original.jpg' }], 'Expected undo to restore selected image metadata only');
  assertDeepEqual(project.video_assets, [{ id: 'video-original', src: './uploads/original.mp4' }], 'Expected undo to restore video asset references only');
}

function runKeyboardGuardHelperCheck() {
  assertEqual(isEditableUndoTarget({ tagName: 'INPUT' }), true, 'Expected input targets to keep native undo');
  assertEqual(isEditableUndoTarget({ tagName: 'TEXTAREA' }), true, 'Expected textarea targets to keep native undo');
  assertEqual(isEditableUndoTarget({ tagName: 'DIV', isContentEditable: true }), true, 'Expected contenteditable targets to keep native undo');
  assertEqual(isEditableUndoTarget({ tagName: 'DIV', getAttribute: (name) => (name === 'role' ? 'textbox' : '') }), true, 'Expected textbox role targets to keep native undo');
  assertEqual(shouldHandleEditorUndoKey({ key: 'z', ctrlKey: true, shiftKey: false, target: { tagName: 'DIV' } }, { editorActive: true }), true, 'Expected editor Ctrl+Z outside inputs to be handled');
  assertEqual(shouldHandleEditorUndoKey({ key: 'z', metaKey: true, shiftKey: false, target: { tagName: 'INPUT' } }, { editorActive: true }), false, 'Expected native input undo not to be intercepted');
  assertEqual(shouldHandleEditorUndoKey({ key: 'z', ctrlKey: true, shiftKey: true, target: { tagName: 'DIV' } }, { editorActive: true }), false, 'Expected redo shortcut not to be exposed in this slice');
  assertEqual(shouldHandleEditorUndoKey({ key: 'z', ctrlKey: true, shiftKey: false, target: { tagName: 'DIV' } }, { editorActive: false }), false, 'Expected inactive editor not to handle undo');
}

async function runPendingEditorSaveCancellationCheck() {
  const timers = createFakeTimers();
  const savedStates = [];
  const project = makeProject();
  const controller = createVideoProjectsController({
    api: {
      async saveVideoProjectEditorState(payload) {
        savedStates.push(payload.editorState);
      },
    },
    store: { getState: () => ({ settings: {}, selectedVideoProject: project }) },
    ui: { toast() {} },
    callbacks: {
      renderVideoProjects() {},
      renderSelectedVideoProject() {},
      updateSelectedVideoProjectCompositionPreview() { return true; },
    },
  });

  try {
    await controller.updateRow('row-1', { selectedAssetId: 'img-later' });
    assertEqual(controller.cancelPendingEditorSave(), true, 'Expected pending editor save cancellation to report a cleared debounce');
    timers.runPending();
    await flushMicrotasks();

    assertEqual(savedStates.length, 0, 'Expected canceled editor save debounce not to persist stale row state');
  } finally {
    timers.restore();
  }
}

async function runUndoRestoreCancelsStaleSaveAndPersistsOnceCheck() {
  const timers = createFakeTimers();
  const savedStates = [];
  const previewUpdates = [];
  let selectedProjectRenders = 0;
  const remoteRenderCalls = [];
  const project = makeProject();
  const originalRows = JSON.parse(JSON.stringify(project._editorRows));
  const controller = createVideoProjectsController({
    api: {
      async saveVideoProjectEditorState(payload) {
        savedStates.push(payload.editorState);
      },
      createRemotionClient() {
        return {
          async renderPreview(payload) {
            remoteRenderCalls.push(payload);
            return { status: 'queued' };
          },
        };
      },
    },
    store: { getState: () => ({ settings: {}, selectedVideoProject: project }) },
    ui: { toast() {} },
    callbacks: {
      renderVideoProjects() {},
      renderSelectedVideoProject() { selectedProjectRenders += 1; },
      updateSelectedVideoProjectCompositionPreview({ project: previewProject } = {}) {
        previewUpdates.push(previewProject);
        return true;
      },
    },
  });

  try {
    assertEqual(controller.captureEditorUndoCheckpoint('before local row edit'), true, 'Expected controller undo checkpoint to capture the pre-edit state');
    await controller.updateRow('row-1', { selectedAssetId: 'img-later' });
    assertEqual(project._editorRows[0].selectedAssetId, 'img-later', 'Expected row update to mutate editor state before undo restore');
    selectedProjectRenders = 0;

    assertEqual(await controller.undoEditorChange(), true, 'Expected controller undo restore helper to apply captured state');
    timers.runPending();
    await flushMicrotasks();

    assertDeepEqual(project._editorRows, originalRows, 'Expected undo restore helper to restore captured rows');
    assertEqual(savedStates.length, 1, 'Expected undo restore helper to persist restored state exactly once');
    assertDeepEqual(savedStates[0].timed_rows, originalRows, 'Expected persisted state to contain restored rows, not stale debounced rows');
    assertEqual(previewUpdates.length, 1, 'Expected undo restore helper to refresh browser-local composition preview exactly once');
    assertEqual(previewUpdates[0], project, 'Expected undo preview refresh to use the restored selected project');
    assertEqual(selectedProjectRenders, 1, 'Expected undo restore helper to fully render selected project details even when lightweight preview succeeds');
    assertEqual(remoteRenderCalls.length, 0, 'Expected undo preview refresh not to request a remote MP4 preview render');
  } finally {
    timers.restore();
  }
}

async function runApprovalDraftInvalidationCheck() {
  const timers = createFakeTimers();
  const updateSnapshotCalls = [];
  const savedStates = [];
  const project = makeProject({
    editor_state: {
      ...makeProject().editor_state,
      pipeline_provider: 'approval',
      pipeline_base_url: 'http://approval.local',
      remotion_project_id: 'remotion-1',
      approval_contract_snapshot: {
        contractVersion: 'approval-editor-service-v1',
        projectId: 'remotion-1',
        snapshotId: 'snapshot-base',
        snapshotHash: 'hash-base',
        rows: [{ id: 'row-1', selectedAssetId: 'img-original' }],
        audio: { voice: { volume: 1, muted: false }, music: { volume: 0.4, muted: false } },
        assets: {},
      },
      snapshot_hash: 'hash-base',
    },
  });
  const operations = createApprovalSnapshotOperations({
    api: {
      createApprovalPipelineClient() {
        return {
          async updateSnapshot(projectId, payload) {
            updateSnapshotCalls.push({ projectId, payload });
            return {
              snapshot: {
                contractVersion: 'approval-editor-service-v1',
                projectId,
                snapshotId: 'snapshot-stale',
                snapshotHash: 'hash-stale',
                rows: [{ id: 'row-1', selectedAssetId: 'img-stale' }],
                audio: {},
              },
            };
          },
        };
      },
    },
    store: { getState: () => ({ settings: { approvalPipelineBaseUrl: 'http://approval.local' } }) },
    ui: { toast() {} },
    persistEditorState(_project, editorState) { savedStates.push(editorState); },
    renderSelectedVideoProject() {},
    updateSelectedVideoProjectCompositionPreview() { return true; },
    debounceMs: 1,
  });

  try {
    operations.createSnapshotDraft('row-1:image', { type: 'setRowImage', rowId: 'row-1', asset: { assetId: 'img-stale' } }, (snapshot) => ({
      ...snapshot,
      snapshotHash: 'hash-stale-draft',
      rows: [{ id: 'row-1', selectedAssetId: 'img-stale' }],
    }));
    operations.scheduleApprovalMotionPersistence(project);
    assertEqual(operations.cancelPendingApprovalDrafts({ neutralizeQueue: true }).invalidated, true, 'Expected Approval draft cancellation to invalidate queued work');
    timers.runPending();
    await flushMicrotasks();
    operations.applyCanonicalSnapshot(project, {
      contractVersion: 'approval-editor-service-v1',
      projectId: 'remotion-1',
      snapshotId: 'snapshot-restored',
      snapshotHash: 'hash-restored',
      rows: [{ id: 'row-1', selectedAssetId: 'img-restored' }],
      audio: {},
    });

    assertEqual(updateSnapshotCalls.length, 0, 'Expected invalidated Approval debounce not to call snapshot update');
    assertEqual(savedStates.length, 0, 'Expected invalidated Approval debounce not to persist stale snapshot state');
    assertEqual(project.editor_state.snapshot_hash, 'hash-restored', 'Expected canonical apply after invalidation to use restored snapshot hash');
    assertEqual(project._editorRows[0].selectedAssetId, 'img-restored', 'Expected cleared draft maps not to reapply stale row metadata');
  } finally {
    timers.restore();
  }
}

async function runCommandMutationCaptureCheck() {
  const timers = createFakeTimers();
  const project = makeProject({
    _globalAudio: { voice: { volume: 1, muted: false }, music: { volume: 0.25, muted: false } },
    editor_state: {
      ...makeProject().editor_state,
      global_audio: { voice: { volume: 1, muted: false }, music: { volume: 0.25, muted: false } },
      brandChannel: 'pelotazo-ecuador',
      brand_channel: 'pelotazo-ecuador',
    },
  });
  const controller = createVideoProjectsController({
    api: { async saveVideoProjectEditorState() {} },
    store: { getState: () => ({ settings: {}, selectedVideoProject: project }) },
    ui: { toast() {} },
    callbacks: {
      renderVideoProjects() {},
      renderSelectedVideoProject() {},
      updateSelectedVideoProjectCompositionPreview() { return true; },
    },
  });

  try {
    await controller.updateRow('row-1', { selectedAssetId: 'img-row-later' });
    assertEqual(project._editorRows[0].selectedAssetId, 'img-row-later', 'Expected row command to mutate image assignment before undo');
    assertEqual(await controller.undoEditorChange(), true, 'Expected row mutation to be undoable without explicit test capture');
    assertEqual(project._editorRows[0].selectedAssetId, 'img-original', 'Expected undo to restore pre-row-mutation image assignment');

    await controller.updateGlobalAudio('music', { volume: 0.75 });
    assertEqual(project._globalAudio.music.volume, 0.75, 'Expected global audio command to mutate before undo');
    assertEqual(await controller.undoEditorChange(), true, 'Expected global audio mutation to be undoable');
    assertEqual(project._globalAudio.music.volume, 0.25, 'Expected undo to restore pre-audio global state');

    await controller.updateBrandChannel('pelotazo-colombia');
    assertEqual(project.editor_state.brandChannel, 'pelotazo-colombia', 'Expected brand command to mutate before undo');
    assertEqual(await controller.undoEditorChange(), true, 'Expected brand mutation to be undoable');
    assertEqual(project.editor_state.brandChannel, 'pelotazo-ecuador', 'Expected undo to restore pre-brand state');

    await controller.updateRow('row-1', { selectedAssetId: 'img-original' });
    assertEqual(await controller.undoEditorChange(), false, 'Expected no-op row command not to create a new undo checkpoint');
  } finally {
    timers.restore();
  }
}

async function runUploadAssignmentCaptureCheck() {
  const timers = createFakeTimers();
  const originalUrl = globalThis.URL;
  const originalImage = globalThis.Image;
  const savedStates = [];
  const project = makeProject();
  const originalVideoAssets = JSON.parse(JSON.stringify(project.video_assets));
  const originalImageCandidates = JSON.parse(JSON.stringify(project.image_candidates));
  const originalSelectedImages = JSON.parse(JSON.stringify(project.selected_images));
  const uploadedVideoFile = { name: 'new-video.mp4', type: 'video/mp4', size: 1024 };
  const uploadedImageFile = { name: 'new-image.png', type: 'image/png', size: 512 };
  globalThis.URL = {
    createObjectURL() { return 'blob://new-image'; },
    revokeObjectURL() {},
  };
  globalThis.Image = class FakeImage {
    constructor() {
      this.naturalWidth = 640;
      this.naturalHeight = 360;
      this.onload = null;
    }

    set src(_value) {
      queueMicrotask(() => this.onload?.());
    }
  };
  const controller = createVideoProjectsController({
    api: {
      async uploadProjectVideoFile() {
        return { assetId: 'video-uploaded', public_url: './uploads/new-video.mp4', storage_path: 'projects/draft-undo-1/new-video.mp4' };
      },
      async saveVideoProjectEditorState(payload) {
        savedStates.push(payload.editorState);
      },
      async uploadCustomImageFile() {
        return { storage_public_url: './uploads/new-image.png', storage_path: 'projects/draft-undo-1/new-image.png', storage_bucket: 'project-assets', project_storage_key: 'draft-undo-1/new-image.png' };
      },
      async addVideoProjectCustomImages() {
        return {
          image_candidates: [...originalImageCandidates, { image_id: 'img-uploaded', url: './uploads/new-image.png' }],
          selected_images: [...originalSelectedImages, { image_id: 'img-uploaded', url: './uploads/new-image.png' }],
        };
      },
    },
    store: { getState: () => ({ settings: {}, selectedVideoProject: project }) },
    ui: { toast() {} },
    callbacks: {
      renderVideoProjects() {},
      renderSelectedVideoProject() {},
      updateSelectedVideoProjectCompositionPreview() { return true; },
    },
  });

  try {
    const uploadedVideo = await controller.uploadVideoToLibrary('row-1', uploadedVideoFile);
    assertEqual(uploadedVideo.id, 'video-uploaded', 'Expected video upload to add the new library asset');
    assertEqual(project.video_assets.length, 2, 'Expected upload to mutate project video asset references');
    assertEqual(await controller.undoEditorChange(), true, 'Expected upload library mutation to be undoable');
    assertDeepEqual(project.video_assets, originalVideoAssets, 'Expected undo to restore video assignment/library references without deleting uploaded files');

    await controller.uploadAndAssignImage('row-1', uploadedImageFile);
    assertEqual(project.image_candidates.length, 2, 'Expected image upload to add the new image candidate reference');
    assertEqual(project._editorRows[0].selectedAssetId, './uploads/new-image.png', 'Expected uploaded image to be assigned to the row before undo');
    assertEqual(await controller.undoEditorChange(), true, 'Expected uploaded image assignment mutation to be undoable');
    assertEqual(project._editorRows[0].selectedAssetId, 'img-original', 'Expected undo to restore the previous row image assignment');
    assertEqual(project.image_candidates.length, 2, 'Expected undo to keep uploaded image library metadata instead of deleting uploaded files');
    assertEqual(project.selected_images.length, 2, 'Expected undo to keep uploaded selected image metadata instead of deleting uploaded files');
    assertEqual(savedStates.length >= 1, true, 'Expected upload/undo path to persist editor state without storage deletion calls');
  } finally {
    timers.restore();
    globalThis.URL = originalUrl;
    globalThis.Image = originalImage;
  }
}

async function runApprovalVideoUndoSyncCheck() {
  const savedStates = [];
  const updateSnapshotCalls = [];
  const imageRow = {
    id: 'row-1',
    rowId: 'row-1',
    startTime: 0,
    endTime: 4,
    selectedAssetId: 'img-original',
    media: { kind: 'image', assetId: 'img-original', url: './uploads/original.jpg' },
  };
  const project = makeProject({
    _editorRows: [JSON.parse(JSON.stringify(imageRow))],
    editor_state: {
      ...makeProject().editor_state,
      pipeline_provider: 'approval',
      pipeline_base_url: 'http://approval.local',
      remotion_project_id: 'approval-project-undo',
      snapshot_hash: 'hash-original',
      timed_rows: [JSON.parse(JSON.stringify(imageRow))],
      approval_contract_snapshot: {
        contractVersion: 'approval-editor-service-v1',
        projectId: 'approval-project-undo',
        snapshotId: 'snapshot-original',
        snapshotHash: 'hash-original',
        rows: [JSON.parse(JSON.stringify(imageRow))],
        assets: {
          'img-original': { assetId: 'img-original', previewUrl: './uploads/original.jpg', renderPath: './uploads/original.jpg' },
        },
      },
    },
  });
  const videoRow = {
    ...imageRow,
    media: { kind: 'video-segment', sourceVideoAssetId: 'video-1', sourceVideoSrc: './uploads/video.mp4', sourceInSeconds: 1, durationSeconds: 4 },
  };
  const restoredImageRow = JSON.parse(JSON.stringify(imageRow));
  const controller = createVideoProjectsController({
    api: {
      createApprovalPipelineClient() {
        return {
          async updateSnapshot(_projectId, payload) {
            updateSnapshotCalls.push(payload);
            const operation = payload.operations[0];
            if (operation.type === 'setRowVideoSegment') {
              return { snapshot: { ...project.editor_state.approval_contract_snapshot, snapshotId: 'snapshot-video', snapshotHash: 'hash-video', rows: [JSON.parse(JSON.stringify(videoRow))] } };
            }
            if (operation.type === 'setRowImage') {
              return { snapshot: { ...project.editor_state.approval_contract_snapshot, snapshotId: 'snapshot-restored', snapshotHash: 'hash-restored', rows: [JSON.parse(JSON.stringify(restoredImageRow))] } };
            }
            throw new Error(`unexpected operation ${operation.type}`);
          },
        };
      },
      async saveVideoProjectEditorState(payload) {
        savedStates.push(payload.editorState);
      },
    },
    store: { getState: () => ({ settings: { approvalPipelineBaseUrl: 'http://approval.local' }, selectedVideoProject: project }) },
    ui: { toast() {} },
    callbacks: {
      renderVideoProjects() {},
      renderSelectedVideoProject() {},
      updateSelectedVideoProjectCompositionPreview() { return true; },
    },
  });

  await controller.updateRow('row-1', { media: videoRow.media });
  assertEqual(project._editorRows[0].media.kind, 'video-segment', 'Expected Approval row update to apply canonical video snapshot before undo');
  assertEqual(project.editor_state.snapshot_hash, 'hash-video', 'Expected video assignment to advance canonical snapshot hash');

  assertEqual(await controller.undoEditorChange(), true, 'Expected Approval video assignment to be undoable');

  assertEqual(updateSnapshotCalls.length, 2, 'Expected undo to send one inverse Approval snapshot update after video assignment');
  assertEqual(updateSnapshotCalls[1].baseSnapshotHash, 'hash-video', 'Expected inverse undo write to use current server snapshot hash, not restored stale hash');
  assertEqual(updateSnapshotCalls[1].operations[0].type, 'setRowImage', 'Expected video undo to restore row image in Approval snapshot');
  assertEqual(project._editorRows[0].media.kind, 'image', 'Expected undo to restore local row image media');
  assertEqual(project.editor_state.snapshot_hash, 'hash-restored', 'Expected undo to apply canonical restored snapshot hash');
  assertEqual(savedStates.length >= 2, true, 'Expected video assignment and undo to persist editor state');
}

async function runKeyboardShortcutHydrationCheck() {
  const listeners = new Map();
  const root = {
    isConnected: true,
    querySelector() { return null; },
    querySelectorAll() { return []; },
    ownerDocument: {
      addEventListener(type, handler) { listeners.set(type, handler); },
      removeEventListener(type, handler) {
        if (listeners.get(type) === handler) listeners.delete(type);
      },
    },
  };
  let undoCalls = 0;
  let prevented = 0;
  const cleanup = hydrateEditorUndoShortcut({
    root,
    editorPhase: 'editing_dirty',
    undoEditorChange: () => { undoCalls += 1; return true; },
  });
  const keydown = listeners.get('keydown');
  assert(typeof keydown === 'function', 'Expected editor undo shortcut hydration to register a keydown handler');

  await keydown({ key: 'z', ctrlKey: true, target: { tagName: 'DIV' }, preventDefault() { prevented += 1; } });
  await keydown({ key: 'z', ctrlKey: true, target: { tagName: 'INPUT' }, preventDefault() { prevented += 1; } });
  await keydown({ key: 'z', ctrlKey: true, shiftKey: true, target: { tagName: 'DIV' }, preventDefault() { prevented += 1; } });

  assertEqual(undoCalls, 1, 'Expected Ctrl+Z to call editor undo only outside editable targets and non-redo chords');
  assertEqual(prevented, 1, 'Expected only handled editor undo shortcut to prevent default');
  cleanup?.();
  assertEqual(listeners.has('keydown'), false, 'Expected shortcut cleanup to remove the document keydown handler');
}

runCaptureRestoreDeepCloneCheck();
runCheckpointNoopAndSourceIsolationCheck();
runRedoClearingAndBoundsCheck();
runUploadMetadataStateOnlyCheck();
runKeyboardGuardHelperCheck();
await runPendingEditorSaveCancellationCheck();
await runUndoRestoreCancelsStaleSaveAndPersistsOnceCheck();
await runApprovalDraftInvalidationCheck();
await runCommandMutationCaptureCheck();
await runUploadAssignmentCaptureCheck();
await runApprovalVideoUndoSyncCheck();
await runKeyboardShortcutHydrationCheck();

console.log('editor undo manager checks passed');
