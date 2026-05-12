import { buildSubtitleControllerContext } from './controller/context.js';
import { createSubtitlePreviewPlayer } from './controller/preview-player.js';
import { createSubtitleRenderCommands } from './controller/render-commands.js';
import { createSubtitleSessionController } from './controller/session.js';
import { createSubtitleTableEditor } from './controller/table-editor.js';
import { createSubtitleWorkflowRenderer } from './controller/render-workflow.js';

export function createSubtitlesController({ state, el, api: ttsApi, ui, helpers, customDropdowns, browser = globalThis }) {
  const ctx = buildSubtitleControllerContext({ state, el, api: ttsApi, ui, helpers, customDropdowns, browser });

  const previewPlayer = createSubtitlePreviewPlayer(ctx, {
    renderTable: () => tableEditor.onTableRender?.() || workflowRenderer.renderTable(),
    renderPreviewOverlay: () => workflowRenderer.renderPreviewOverlay?.(),
    ensureRowsCoverDuration: (durationMs) => tableEditor.ensureRowsCoverDuration(durationMs),
    resolvePreviewDurationMs: () => tableEditor.resolvePreviewDuration(),
  });
  const workflowRenderer = createSubtitleWorkflowRenderer(ctx, {
    hasDraftRows: () => tableEditor.hasDraftRows(),
    getLastNonDraftRowIndex: () => tableEditor.getLastNonDraftRowIndex(),
    renderPreviewPlayer: () => previewPlayer.renderPreviewPlayer(),
    renderPreviewOverlay: () => previewPlayer.renderPreviewOverlay(),
  });
  const tableEditor = createSubtitleTableEditor(ctx, {
    renderWorkflow: () => workflowRenderer.renderWorkflow(),
    renderTable: () => workflowRenderer.renderTable(),
    renderPreviewOverlay: () => previewPlayer.renderPreviewOverlay(),
    updateButtonsByPhase: () => workflowRenderer.updateButtonsByPhase(),
    resolvePreviewDurationMs: () => tableEditor.resolvePreviewDuration(),
  });
  const sessionController = createSubtitleSessionController(ctx, {
    revokePreviewObjectUrl: () => previewPlayer.revokePreviewObjectUrl(),
    loadPreviewVideoBlob: (sessionId) => previewPlayer.loadPreviewVideoBlob(sessionId),
    ensureRowsCoverDuration: (durationMs) => tableEditor.ensureRowsCoverDuration(durationMs),
    resolvePreviewDurationMs: () => tableEditor.resolvePreviewDuration(),
    renderWorkflow: () => workflowRenderer.renderWorkflow(),
    renderHealthBanner: () => workflowRenderer.renderHealthBanner(),
    renderSessionHistory: () => workflowRenderer.renderSessionHistory(),
    renderDoneCard: () => workflowRenderer.renderDoneCard(),
    renderSourceLanguagePicker: () => workflowRenderer.renderSourceLanguagePicker(),
  });
  const renderCommands = createSubtitleRenderCommands(ctx, {
    hasDraftRows: () => tableEditor.hasDraftRows(),
    ensureRowsCoverDuration: () => tableEditor.ensureRowsCoverDuration(),
    refreshRemoteStatus: () => sessionController.refreshRemoteStatus(),
    pollRenderStatus: (sessionId) => sessionController.pollRenderStatus(sessionId),
    transitionPhase: (phase) => sessionController.transitionPhase(phase),
    renderDoneCard: () => workflowRenderer.renderDoneCard(),
    updateButtonsByPhase: () => workflowRenderer.updateButtonsByPhase(),
  });

  const loadSubtitle2PreviewVideoBlob = (sessionId) => previewPlayer.loadPreviewVideoBlob(sessionId);
  const applySubtitle2VideoDuration = () => previewPlayer.applyVideoDuration();
  const onSubtitle2PreviewLoadedMetadata = () => previewPlayer.onLoadedMetadata();
  const ensureSubtitle2RowsCoverDuration = (durationMs) => tableEditor.ensureRowsCoverDuration(durationMs);
  const deleteSubtitle2Row = (rowId) => tableEditor.deleteRow(rowId);
  const nudgeSubtitle2TimingBoundary = (rowId, field, direction) => tableEditor.nudgeTimingBoundary(rowId, field, direction);
  const getLastSubtitle2NonDraftRowIndex = () => tableEditor.getLastNonDraftRowIndex();
  const onSubtitle2DraftDragStart = (ev) => tableEditor.onDraftDragStart(ev);
  const placeSubtitle2DraftBetweenRows = (draftId, targetIndex) => tableEditor.placeDraftBetweenRows(draftId, targetIndex);
  const forceSubtitles2Phase = (phase) => sessionController.forcePhase(phase);
  const setSubtitles2PhaseFromRemoteStatus = (detail) => sessionController.setPhaseFromRemoteStatus(detail);
  const deleteSubtitle2HistorySession = (sessionId) => sessionController.deleteHistorySession(sessionId);
  const pollRemoteSubtitleSessionStatus = (sessionId) => sessionController.pollSessionStatus(sessionId);
  const pollRemoteSubtitleRenderStatus = (sessionId) => sessionController.pollRenderStatus(sessionId);

  void loadSubtitle2PreviewVideoBlob;
  void applySubtitle2VideoDuration;
  void onSubtitle2PreviewLoadedMetadata;
  void ensureSubtitle2RowsCoverDuration;
  void deleteSubtitle2Row;
  void nudgeSubtitle2TimingBoundary;
  void getLastSubtitle2NonDraftRowIndex;
  void placeSubtitle2DraftBetweenRows;
  void forceSubtitles2Phase;

  return {
    pollRemoteSubtitleSessionStatus,
    pollRemoteSubtitleRenderStatus,
    stopPolling: () => sessionController.stopPolling(),
    resetRunState: () => sessionController.resetRunState(),
    renderWorkflow: () => workflowRenderer.renderWorkflow(),
    renderSessionHistory: () => workflowRenderer.renderSessionHistory(),
    renderDoneCard: () => workflowRenderer.renderDoneCard(),
    refreshRemoteStatus: () => sessionController.refreshRemoteStatus(),
    hydrateSession: (sessionId, options) => sessionController.hydrateSession(sessionId, options),
    setPhaseFromRemoteStatus: setSubtitles2PhaseFromRemoteStatus,
    resetEditorForAnotherVideo: () => sessionController.resetEditorForAnotherVideo(),
    onUploadSelected: () => sessionController.onUploadSelected(),
    onSourceLanguageChanged: (ev) => sessionController.onSourceLanguageChanged(ev),
    onSaveClicked: () => renderCommands.onSaveClicked(),
    onReadyClicked: () => renderCommands.onReadyClicked(),
    onDownloadClicked: () => renderCommands.onDownloadClicked(),
    onAddRowClicked: () => tableEditor.onAddRowClicked(),
    onTableInput: (ev) => tableEditor.onTableInput(ev),
    onTableClick: (ev) => tableEditor.onTableClick(ev),
    onDraftDragStart: onSubtitle2DraftDragStart,
    onDraftDragOver: (ev) => tableEditor.onDraftDragOver(ev),
    onDraftDragLeave: (ev) => tableEditor.onDraftDragLeave(ev),
    onDraftDrop: (ev) => tableEditor.onDraftDrop(ev),
    onDraftDragEnd: () => tableEditor.onDraftDragEnd(),
    onPreviewTimeUpdate: () => previewPlayer.onTimeUpdate(),
    onPreviewLoadedMetadata: onSubtitle2PreviewLoadedMetadata,
    onPreviewToggleClicked: () => previewPlayer.onToggleClicked(),
    onPreviewTimelineClick: (ev) => previewPlayer.onTimelineClick(ev),
    onPreviewTimelineDragStart: (ev) => previewPlayer.onTimelineDragStart(ev),
    renameHistorySession: (sessionId, currentName) => sessionController.renameHistorySession(sessionId, currentName),
    deleteHistorySession: deleteSubtitle2HistorySession,
  };
}
