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
import { createRowCommands } from './row-commands.js';

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
  const timerAccess = {
    getSaveTimer: () => saveTimer,
    setSaveTimer: (timer) => { saveTimer = timer; },
    debounceMs: SAVE_DEBOUNCE_MS,
  };

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
    debounceMs: SAVE_DEBOUNCE_MS,
  });

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

  const { updateRow } = createRowCommands({
    store,
    ui,
    persistEditorState,
    isApprovalServiceMode: approval.isApprovalServiceMode,
    queueApprovalSnapshotOperations: approval.queueApprovalSnapshotOperations,
    scheduleApprovalMotionPersistence: approval.scheduleApprovalMotionPersistence,
    createMotionDraft: approval.createMotionDraft,
    updateSelectedVideoProjectCompositionPreview,
    renderSelectedVideoProject,
    ...timerAccess,
  });

  const rowImages = createRowImageCommands({
    api,
    ui,
    getProject: () => store.getState().selectedVideoProject,
    resolveProjectKey: resolveVideoProjectKey,
    renderSelectedVideoProject,
    updateRow,
    mergeCachedProjectEditorState: detailCache.mergeCachedProjectEditorState,
  });

  const rowVideos = createRowVideoCommands({
    api,
    ui,
    getProject: () => store.getState().selectedVideoProject,
    resolveProjectKey: resolveVideoProjectKey,
    renderSelectedVideoProject,
    updateRow,
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
    ...timerAccess,
  });

  return {
    refreshVideoProjects: projectLoading.refreshVideoProjects,
    openVideoProject: projectLoading.openVideoProject,
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
    assignExistingImageToRow: rowImages.assignExistingImageToRow,
    uploadAndAssignImage: rowImages.uploadAndAssignImage,
    uploadVideoToLibrary: rowVideos.uploadVideoToLibrary,
    assignVideoSegmentToRow: rowVideos.assignVideoSegmentToRow,
    updateGlobalAudio: globalAudio.updateGlobalAudio,
    updateBrandChannel: brand.updateBrandChannel,
    activate: () => {},  // no-op: video-projects init happens on first view render
  };
}
