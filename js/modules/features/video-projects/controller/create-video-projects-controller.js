import { createAudioSetupCommands } from '../audio/commands.js';
import { buildCompositionPayload } from '../composition/composition-payload.js';
import { createCustomImageCommands } from '../data/custom-image-commands.js';
import { createVideoProjectDetailCache } from '../data/detail-cache.js';
import { createRowImageCommands } from '../data/row-image-commands.js';
import { createRowVideoCommands } from '../data/row-video-commands.js';
import { createSelectionCommands } from '../data/selection-commands.js';
import { normalizeVideoProjectRows } from '../data/video-project-rows.js';
import { resolveVideoProjectKey } from '../domain/project-identity.js';
import { createApprovalSnapshotOperations } from './approval-snapshot-operations.js';
import { createBrandCommands } from './brand-commands.js';
import { createEditorStatePersistence, setVideoProjectStep } from './editor-state-persistence.js';
import { createGlobalAudioCommands } from './audio-commands.js';
import { createPreviewExportCommands } from './preview-export-commands.js';
import { createProjectLoadingCommands } from './project-loading.js';
import { createRowCommands } from './row-commands.js?v=20260520-whip-bugfix';
import { createEditorUndoManager } from './undo-manager.js';

const SAVE_DEBOUNCE_MS = 400;

export function buildCompositionPayloadForCheck(project) {
  return buildCompositionPayload(project);
}

export function createVideoProjectsController({ api, store, ui, callbacks }) {
  const {
    renderVideoProjects = () => {},
    renderSelectedVideoProject = () => {},
    updateSelectedVideoProjectCompositionPreview = () => false,
  } = callbacks || {};

  let saveTimer = null;
  function cancelPendingEditorSave() {
    const hadTimer = saveTimer !== null;
    if (hadTimer) clearTimeout(saveTimer);
    saveTimer = null;
    return hadTimer;
  }

  const timerAccess = {
    getSaveTimer: () => saveTimer,
    setSaveTimer: (timer) => { saveTimer = timer; },
    cancelPendingEditorSave,
    debounceMs: SAVE_DEBOUNCE_MS,
  };
  const undoManager = createEditorUndoManager();

  const detailCache = createVideoProjectDetailCache({
    api,
    store,
    normalizeRows: normalizeVideoProjectRows,
    resolveProjectKey: resolveVideoProjectKey,
  });

  const { persistEditorState } = createEditorStatePersistence({ api, resolveProjectKey: resolveVideoProjectKey });

  const approval = createApprovalSnapshotOperations({
    api,
    store,
    ui,
    persistEditorState,
    renderSelectedVideoProject,
    updateSelectedVideoProjectCompositionPreview,
    debounceMs: SAVE_DEBOUNCE_MS,
  });

  function prepareEditorUndoRestore({ neutralizeApprovalQueue = true } = {}) {
    const canceledEditorSave = cancelPendingEditorSave();
    const approvalCancellation = approval.cancelPendingApprovalDrafts?.({ neutralizeQueue: neutralizeApprovalQueue }) || null;
    return { canceledEditorSave, approvalCancellation };
  }

  function captureEditorUndoCheckpoint(label, project = store.getState().selectedVideoProject) {
    return undoManager.capture(label, project);
  }

  function captureBeforeEditorMutation({ label, project } = {}) {
    return captureEditorUndoCheckpoint(label || 'editor mutation', project);
  }

  async function undoEditorChange() {
    const project = store.getState().selectedVideoProject;
    if (!project || !undoManager.canUndo(project)) return false;
    prepareEditorUndoRestore({ neutralizeApprovalQueue: true });
    const restored = undoManager.undo({ project });
    if (!restored) return false;

    await persistEditorState(project, {
      ...(project.editor_state || {}),
      timed_rows: project._editorRows,
      global_audio: project._globalAudio,
      video_assets: project.video_assets,
      preview_assets: project._previewAssets,
      dirty: project.editor_state?.dirty === true,
      phase: project.editor_state?.phase || 'editing_dirty',
      error: project.editor_state?.error || '',
    });

    if (!updateSelectedVideoProjectCompositionPreview?.({ project })) {
      renderSelectedVideoProject();
    }
    return true;
  }

  const projectLoading = createProjectLoadingCommands({
    api,
    store,
    ui,
    normalizeRows: normalizeVideoProjectRows,
    resolveProjectKey: resolveVideoProjectKey,
    renderVideoProjects,
    renderSelectedVideoProject,
    ...detailCache,
  });

  function parseManualGuionSegments(rawGuion = '') {
    return rawGuion.toString().split('|').map((part) => part.replace(/\s+/g, ' ').trim()).filter(Boolean);
  }

  async function createManualVideoProject(payload = {}) {
    const state = store.getState();
    const title = (payload.title || '').toString().trim();
    const jugador = (payload.jugador || '').toString().trim();
    const seleccion = (payload.seleccion || '').toString().trim();
    const guionPiped = (payload.guion_piped || '').toString().trim();

    if (!title) throw new Error('Poné un título para el proyecto.');
    if (!jugador) throw new Error('Poné el jugador para buscar imágenes.');
    if (!seleccion) throw new Error('Poné la selección o país.');
    if (!guionPiped) throw new Error('Pegá el guion pipeado.');

    const segments = parseManualGuionSegments(guionPiped);
    if (!segments.length) throw new Error('El guion necesita al menos un segmento.');

    const created = await api.createManualVideoProject({
      settings: state.settings,
      payload: {
        title,
        jugador,
        seleccion,
        guion_piped: guionPiped,
        source: 'manual',
      },
    });

    ui.toast('Proyecto creado. Buscando imágenes…');
    await projectLoading.refreshVideoProjects({ silent: true });

    const projectId = created?.project_id || created?.draft_id;
    if (projectId) {
      void (async () => {
        for (let attempt = 0; attempt < 18; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 2500 : 5000));
          await projectLoading.refreshVideoProjects({ silent: true });
          const current = store.getState().videoProjects.find((item) => resolveVideoProjectKey(item) === projectId);
          if (current && current.status !== 'pending') break;
        }
        await projectLoading.openVideoProject(projectId);
      })().catch((err) => console.error(err));
    }
    return created;
  }

  const audioSetup = createAudioSetupCommands({
    api,
    ui,
    getProject: () => store.getState().selectedVideoProject,
    resolveProjectKey: resolveVideoProjectKey,
    renderSelectedVideoProject,
  });

  const { uploadCustomImages } = createCustomImageCommands({
    api,
    ui,
    getProject: () => store.getState().selectedVideoProject,
    resolveProjectKey: resolveVideoProjectKey,
    renderSelectedVideoProject,
  });

  const selection = createSelectionCommands({
    api,
    store,
    resolveProjectKey: resolveVideoProjectKey,
    renderSelectedVideoProject,
    getSaveTimer: timerAccess.getSaveTimer,
    setSaveTimer: timerAccess.setSaveTimer,
    debounceMs: SAVE_DEBOUNCE_MS,
    setVideoProjectStep,
  });

  const { updateRow, swapRowImages } = createRowCommands({
    store,
    ui,
    persistEditorState,
    isApprovalServiceMode: approval.isApprovalServiceMode,
    queueApprovalSnapshotOperations: approval.queueApprovalSnapshotOperations,
    scheduleApprovalMotionPersistence: approval.scheduleApprovalMotionPersistence,
    createMotionDraft: approval.createMotionDraft,
    updateSelectedVideoProjectCompositionPreview,
    renderSelectedVideoProject,
    beforeMutate: captureBeforeEditorMutation,
    ...timerAccess,
  });

  const rowImages = createRowImageCommands({
    api,
    ui,
    getProject: () => store.getState().selectedVideoProject,
    resolveProjectKey: resolveVideoProjectKey,
    renderSelectedVideoProject,
    updateRow,
    beforeMutate: captureBeforeEditorMutation,
    mergeCachedProjectEditorState: detailCache.mergeCachedProjectEditorState,
  });

  const rowVideos = createRowVideoCommands({
    api,
    ui,
    getProject: () => store.getState().selectedVideoProject,
    resolveProjectKey: resolveVideoProjectKey,
    renderSelectedVideoProject,
    updateRow,
    beforeMutate: captureBeforeEditorMutation,
  });

  const previewExport = createPreviewExportCommands({
    api,
    store,
    ui,
    persistEditorState,
    isApprovalServiceMode: approval.isApprovalServiceMode,
    createApprovalServiceClient: approval.createApprovalServiceClient,
    renderSelectedVideoProject,
  });

  const globalAudio = createGlobalAudioCommands({
    store,
    persistEditorState,
    isApprovalServiceMode: approval.isApprovalServiceMode,
    commitApprovalSnapshotOperations: approval.commitApprovalSnapshotOperations,
    createSnapshotDraft: approval.createSnapshotDraft,
    scheduleApprovalMotionPersistence: approval.scheduleApprovalMotionPersistence,
    updateSelectedVideoProjectCompositionPreview,
    renderSelectedVideoProject,
    beforeMutate: captureBeforeEditorMutation,
    ...timerAccess,
  });

  const brand = createBrandCommands({
    store,
    persistEditorState,
    isApprovalServiceMode: approval.isApprovalServiceMode,
    commitApprovalSnapshotOperations: approval.commitApprovalSnapshotOperations,
    createSnapshotDraft: approval.createSnapshotDraft,
    scheduleApprovalMotionPersistence: approval.scheduleApprovalMotionPersistence,
    updateSelectedVideoProjectCompositionPreview,
    renderSelectedVideoProject,
    beforeMutate: captureBeforeEditorMutation,
    ...timerAccess,
  });

  const controller = {
    refreshVideoProjects: projectLoading.refreshVideoProjects,
    openVideoProject: projectLoading.openVideoProject,
    disableVideoProject: projectLoading.disableVideoProject,
    createManualVideoProject,
    prefetchProjectDetail: detailCache.prefetchProjectDetail,
    toggleImageSelection: selection.toggleImageSelection,
    goToAudioStep: selection.goToAudioStep,
    goToImagesStep: selection.goToImagesStep,
    uploadProjectAudio: audioSetup.uploadProjectAudio,
    selectDefaultBackgroundMusic: audioSetup.selectDefaultBackgroundMusic,
    uploadCustomImages,
    preparePreview: previewExport.preparePreview,
    refreshPreview: previewExport.refreshPreview,
    exportFinal: previewExport.exportFinal,
    updateRow,
    swapRowImages,
    assignExistingImageToRow: rowImages.assignExistingImageToRow,
    uploadAndAssignImage: rowImages.uploadAndAssignImage,
    uploadVideoToLibrary: rowVideos.uploadVideoToLibrary,
    assignVideoSegmentToRow: rowVideos.assignVideoSegmentToRow,
    updateGlobalAudio: globalAudio.updateGlobalAudio,
    updateBrandChannel: brand.updateBrandChannel,
    undoEditorChange,
    activate: () => {},  // no-op: video-projects init happens on first view render
  };

  Object.defineProperties(controller, {
    cancelPendingEditorSave: { value: cancelPendingEditorSave },
    prepareEditorUndoRestore: { value: prepareEditorUndoRestore },
    captureEditorUndoCheckpoint: { value: captureEditorUndoCheckpoint },
    captureBeforeEditorMutation: { value: captureBeforeEditorMutation },
  });

  return controller;
}
