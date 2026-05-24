import { resolveSubtitleFontWeight } from '../../../subtitles-workflow.mjs?v=20260524-subtitles-controls';
import { parseSubtitleTimeToMsRuntime } from '../runtime/index.js?v=20260524-subtitles-controls';

export function createSubtitleRenderCommands(ctx, callbacks = {}) {
  const { state, api: ttsApi, ui, helpers } = ctx;
  const toast = ui.toast;
  const getErrorMessage = helpers.getErrorMessage;
  const downloadBlob = helpers.downloadBlob;
  const hasDraftRows = callbacks.hasDraftRows || (() => false);
  const ensureRowsCoverDuration = callbacks.ensureRowsCoverDuration || (() => false);
  const refreshRemoteStatus = callbacks.refreshRemoteStatus || (() => {});
  const pollRenderStatus = callbacks.pollRenderStatus || (() => {});
  const transitionPhase = callbacks.transitionPhase || (() => false);
  const renderDoneCard = callbacks.renderDoneCard || (() => {});
  const updateButtonsByPhase = callbacks.updateButtonsByPhase || (() => {});

  async function onSaveClicked() {
    if (!state.subtitles2.sessionId) {
      toast('No hay sesión remota activa para guardar');
      return;
    }
    if (!state.subtitles2.dirty) {
      toast('No hay cambios para guardar');
      return;
    }
    if (hasDraftRows()) {
      toast('Ubicá el subtítulo fantasma antes de guardar');
      return;
    }
    try {
      await enqueueSave('manual');
      toast('Cambios guardados');
    } catch (err) {
      console.error(err);
      toast(getErrorMessage(err, 'Error guardando Subtítulos 2'));
    } finally {
      updateButtonsByPhase();
    }
  }

  async function enqueueSave(saveMode) {
    if (hasDraftRows()) {
      throw new Error('Ubicá el subtítulo fantasma antes de guardar');
    }
    ensureRowsCoverDuration();
    const response = await ttsApi.updateSubtitleSegments(state.subtitles2.sessionId, {
      base_version: state.subtitles2.snapshotVersion,
      save_mode: saveMode,
      segments: state.subtitles2.rows.map((row) => ({
        id: row.id,
        start_ms: parseSubtitleTimeToMsRuntime(row.start),
        end_ms: parseSubtitleTimeToMsRuntime(row.end),
        source_text: row.sourceText,
        translated_text: row.phrase,
        style: {
          font_size: Number(row.size),
          font_family: row.fontFamily,
          font_weight: row.fontWeight || resolveSubtitleFontWeight(row.fontFamily),
          color: row.color,
          align: row.align,
          max_width_px: Number(row.maxWidthPx || 1080),
        },
      })),
    });
    state.subtitles2.snapshotVersion = Number(response?.version || 0);
    state.subtitles2.savedVersion = Math.max(state.subtitles2.savedVersion, state.subtitles2.changeVersion);
    state.subtitles2.dirty = false;
    await refreshRemoteStatus();
    return response;
  }

  async function onReadyClicked() {
    if (!state.subtitles2.sessionId || state.subtitles2.snapshotVersion < 1) {
      toast('Necesitás una sesión remota lista antes de renderizar');
      return;
    }
    if (hasDraftRows()) {
      toast('Ubicá el subtítulo fantasma antes de renderizar');
      return;
    }
    if (state.subtitles2.dirty) {
      await enqueueSave('manual');
    }
    transitionPhase('Procesando video');
    state.subtitles2.renderStatus = 'queued';
    state.subtitles2.renderProgressPct = 0;
    state.subtitles2.renderArtifactReady = false;
    try {
      const response = await ttsApi.startSubtitleRender(state.subtitles2.sessionId, {
        base_version: state.subtitles2.snapshotVersion,
        request_id: `sub-render-${Date.now()}`,
      });
      state.subtitles2.renderJobId = (response?.job?.id || '').toString();
      state.subtitles2.renderStatus = (response?.job?.status || 'queued').toString();
      state.subtitles2.renderArtifactReady = Boolean(response?.download?.ready);
      await pollRenderStatus(state.subtitles2.sessionId);
      await refreshRemoteStatus();
    } catch (error) {
      console.error(error);
      state.subtitles2.renderStatus = 'failed';
      state.subtitles2.renderArtifactReady = false;
      state.subtitles2.renderFailureReason = getErrorMessage(error, 'El render remoto falló');
      transitionPhase('Terminado');
      renderDoneCard();
    }
  }

  async function onDownloadClicked() {
    if (!state.subtitles2.sessionId) {
      toast('No hay sesión remota para descargar');
      return;
    }
    const blob = await ttsApi.downloadSubtitleRender(state.subtitles2.sessionId);
    downloadBlob(blob, `${state.subtitles2.sessionId}.mp4`);
  }

  return {
    onSaveClicked,
    enqueueSave,
    onReadyClicked,
    onDownloadClicked,
  };
}
