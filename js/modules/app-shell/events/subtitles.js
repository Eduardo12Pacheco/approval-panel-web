export function bindSubtitlesEvents({ state, el, subtitlesController, renderSubtitle2PreviewPlaybackState }) {
  el.subtitle2UploadInput?.addEventListener('change', subtitlesController.onUploadSelected);
  el.subtitle2SourceLanguagePicker?.addEventListener('change', subtitlesController.onSourceLanguageChanged);
  el.subtitle2SaveBtn?.addEventListener('click', subtitlesController.onSaveClicked);
  el.subtitle2ReadyBtn?.addEventListener('click', subtitlesController.onReadyClicked);
  el.subtitle2DownloadBtn?.addEventListener('click', subtitlesController.onDownloadClicked);
  el.subtitle2AddRowBtn?.addEventListener('click', subtitlesController.onAddRowClicked);
  el.subtitle2AnotherVideoBtn?.addEventListener('click', subtitlesController.resetEditorForAnotherVideo);
  el.subtitle2RowsBody?.addEventListener('input', subtitlesController.onTableInput);
  el.subtitle2RowsBody?.addEventListener('change', subtitlesController.onTableInput);
  el.subtitle2RowsBody?.addEventListener('click', subtitlesController.onTableClick);
  el.subtitle2RowsBody?.addEventListener('dragstart', subtitlesController.onDraftDragStart);
  el.subtitle2RowsBody?.addEventListener('dragover', subtitlesController.onDraftDragOver);
  el.subtitle2RowsBody?.addEventListener('dragleave', subtitlesController.onDraftDragLeave);
  el.subtitle2RowsBody?.addEventListener('drop', subtitlesController.onDraftDrop);
  el.subtitle2RowsBody?.addEventListener('dragend', subtitlesController.onDraftDragEnd);
  el.subtitle2PreviewVideo?.addEventListener('timeupdate', subtitlesController.onPreviewTimeUpdate);
  el.subtitle2PreviewVideo?.addEventListener('loadedmetadata', subtitlesController.onPreviewLoadedMetadata);
  el.subtitle2PreviewVideo?.addEventListener('play', () => {
    state.subtitles2.previewPlaying = true;
    renderSubtitle2PreviewPlaybackState();
  });
  el.subtitle2PreviewVideo?.addEventListener('pause', () => {
    state.subtitles2.previewPlaying = false;
    renderSubtitle2PreviewPlaybackState();
  });
  el.subtitle2PreviewPlayBtn?.addEventListener('click', subtitlesController.onPreviewToggleClicked);
  el.subtitle2PreviewTimeline?.addEventListener('click', subtitlesController.onPreviewTimelineClick);
  el.subtitle2PreviewTimelineTrack?.addEventListener('mousedown', subtitlesController.onPreviewTimelineDragStart);
  el.subtitle2SessionHistory?.addEventListener('click', (ev) => {
    const renameButton = ev.target.closest('[data-action="rename-subtitle-session"]');
    if (renameButton) {
      const sessionId = (renameButton.dataset.sessionId || '').trim();
      const currentName = (renameButton.dataset.sessionName || sessionId).trim();
      if (sessionId) void subtitlesController.renameHistorySession(sessionId, currentName);
      return;
    }
    const deleteButton = ev.target.closest('[data-action="delete-subtitle-session"]');
    if (deleteButton) {
      const sessionId = (deleteButton.dataset.sessionId || '').trim();
      if (sessionId) void subtitlesController.deleteHistorySession(sessionId);
      return;
    }
    const button = ev.target.closest('[data-action="resume-subtitle-session"]');
    if (!button) return;
    const sessionId = (button.dataset.sessionId || '').trim();
    if (!sessionId) return;
    void (async () => {
      const detail = await subtitlesController.hydrateSession(sessionId, { render: false });
      subtitlesController.setPhaseFromRemoteStatus(detail);
    })();
  });
}
