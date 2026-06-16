import { buildSubtitleControllerContext } from './controller/context.js';
import { createSubtitlePreviewPlayer } from './controller/preview-player.js';
import { createSubtitleRenderCommands } from './controller/render-commands.js';
import { createSubtitleSessionController } from './controller/session.js';
import { createSubtitleTableEditor } from './controller/table-editor.js';
import { createSubtitleWorkflowRenderer } from './controller/render-workflow.js';
import { createSubtitleAutoSaveController } from './controller/auto-save.js';
import { resolvePresenceAdvisory, resolveSubtitlePresence } from './presence.js';

export function createSubtitlesController({ state, el, api: ttsApi, ui, helpers, customDropdowns, browser = globalThis }) {
  const ctx = buildSubtitleControllerContext({ state, el, api: ttsApi, ui, helpers, customDropdowns, browser });
  let subtitlePresenceWarning = null;
  let autoSaveController = null;
  let keyboardShortcutsActive = false;

  async function reportSubtitlePresence({ mode, currentSessionId } = {}) {
    const payload = resolveSubtitlePresence({
      sessionId: state.subtitles2.sessionId,
      dirty: state.subtitles2.dirty,
      mode,
    });
    if (!payload) return null;
    try {
      await ttsApi.reportPresence?.(payload);
      const snapshot = await ttsApi.readPresence?.();
      subtitlePresenceWarning = resolvePresenceAdvisory({ snapshot, resource: payload, currentSessionId });
      state.subtitles2.presenceWarning = subtitlePresenceWarning;
      return subtitlePresenceWarning;
    } catch {
      return subtitlePresenceWarning;
    }
  }

  function getSubtitlePresenceWarning() {
    return subtitlePresenceWarning;
  }

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
    onRowsChanged: () => autoSaveController?.requestAutoSave(),
    onSeekPreviewToRow: (rowId) => previewPlayer.seekPreviewToRow(rowId),
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
    clearUndoHistory: () => tableEditor.clearUndoHistory(),
  });
  const renderCommands = createSubtitleRenderCommands(ctx, {
    hasDraftRows: () => tableEditor.hasDraftRows(),
    ensureRowsCoverDuration: () => tableEditor.ensureRowsCoverDuration(),
    refreshRemoteStatus: () => sessionController.refreshRemoteStatus(),
    pollRenderStatus: (sessionId) => sessionController.pollRenderStatus(sessionId),
    transitionPhase: (phase) => sessionController.transitionPhase(phase),
    renderDoneCard: () => workflowRenderer.renderDoneCard(),
    updateButtonsByPhase: () => workflowRenderer.updateButtonsByPhase(),
    reportPresence: reportSubtitlePresence,
  });
  autoSaveController = createSubtitleAutoSaveController(ctx, {
    enqueueSave: (saveMode) => renderCommands.enqueueSave(saveMode),
    hasDraftRows: () => tableEditor.hasDraftRows(),
    updateButtonsByPhase: () => workflowRenderer.updateButtonsByPhase(),
    reportPresence: reportSubtitlePresence,
  });

  const loadSubtitle2PreviewVideoBlob = (sessionId) => previewPlayer.loadPreviewVideoBlob(sessionId);
  const applySubtitle2VideoDuration = () => previewPlayer.applyVideoDuration();
  const onSubtitle2PreviewLoadedMetadata = (ev) => previewPlayer.onLoadedMetadata(ev);
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

  function onTableInputWithPresence(ev) {
    const result = tableEditor.onTableInput(ev);
    void reportSubtitlePresence({ mode: 'editing' });
    return result;
  }

  function onSubtitleEditorKeydown(ev) {
    const key = (ev.key || '').toLowerCase();
    if (!(key === 'z' && (ev.ctrlKey || ev.metaKey) && !ev.shiftKey && !ev.altKey)) return;
    const target = ev.target;
    const inSubtitlesEditor = el.viewSubtitulos2?.contains?.(target) || el.subtitle2RowsBody?.contains?.(target);
    if (!inSubtitlesEditor) return;
    if (!tableEditor.undoLastRowsChange()) return;
    ev.preventDefault?.();
    void reportSubtitlePresence({ mode: 'editing' });
  }

  function activate() {
    autoSaveController?.activate();
    if (keyboardShortcutsActive) return;
    keyboardShortcutsActive = true;
    ctx.windowRef?.addEventListener?.('keydown', onSubtitleEditorKeydown);
  }

  return {
    pollRemoteSubtitleSessionStatus,
    pollRemoteSubtitleRenderStatus,
    stopPolling: () => sessionController.stopPolling(),
    resetRunState: () => sessionController.resetRunState(),
    renderWorkflow: () => workflowRenderer.renderWorkflow(),
    renderPreviewPlaybackState: () => previewPlayer.renderPreviewPlaybackState(),
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
    onTableInput: onTableInputWithPresence,
    onTableClick: (ev) => tableEditor.onTableClick(ev),
    onTablePointerDown: (ev) => tableEditor.onTablePointerDown(ev),
    onDraftDragStart: onSubtitle2DraftDragStart,
    onDraftDragOver: (ev) => tableEditor.onDraftDragOver(ev),
    onDraftDragLeave: (ev) => tableEditor.onDraftDragLeave(ev),
    onDraftDrop: (ev) => tableEditor.onDraftDrop(ev),
    onDraftDragEnd: () => tableEditor.onDraftDragEnd(),
    onPreviewTimeUpdate: (ev) => previewPlayer.onTimeUpdate(ev),
    onPreviewLoadedMetadata: onSubtitle2PreviewLoadedMetadata,
    onPreviewToggleClicked: () => previewPlayer.onToggleClicked(),
    onPreviewTimelineClick: (ev) => previewPlayer.onTimelineClick(ev),
    onPreviewTimelineDragStart: (ev) => previewPlayer.onTimelineDragStart(ev),
    seekPreviewToRow: (rowId) => previewPlayer.seekPreviewToRow(rowId),
    renameHistorySession: (sessionId, currentName) => sessionController.renameHistorySession(sessionId, currentName),
    deleteHistorySession: deleteSubtitle2HistorySession,
    reportSubtitlePresence,
    getSubtitlePresenceWarning,
    activate,
  };
}
