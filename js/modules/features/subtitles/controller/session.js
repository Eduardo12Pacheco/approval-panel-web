import {
  SUBTITLES_POLL_INTERVAL_MS,
  SUBTITLE_COLOR_PRESETS,
  SUBTITLE_FONT_PRESETS,
  SUBTITLE_SIZE_PRESETS,
  createEmptySubtitleRow,
} from '../../../subtitles-workflow.mjs';
import {
  buildSubtitlePreviewUrlRuntime,
  createRemoteSubtitlesState,
  formatSubtitleDisplayTimeRuntime,
  mapRemoteSubtitleSegmentsToRowsRuntime,
  resolveHydratedSubtitleRenderStateRuntime,
  resolveSubtitlePreviewDurationMsRuntime,
} from '../runtime/index.js';

const SUBTITLE_SOURCE_LANGUAGE_ALLOWED = new Set([
  'auto', 'es', 'en', 'fr', 'pt', 'de', 'it', 'nl', 'ca', 'pap', 'ko', 'ar', 'ber', 'cs', 'gd', 'tr', 'tzm', 'uz',
]);

export function createSubtitleSessionController(ctx, callbacks = {}) {
  const { state, el, api: ttsApi, ui, windowRef, timers } = ctx;
  const toast = ui.toast;
  const getErrorMessage = ctx.helpers.getErrorMessage;
  const loadPreviewVideoBlob = callbacks.loadPreviewVideoBlob || (() => {});
  const ensureRowsCoverDuration = callbacks.ensureRowsCoverDuration || (() => false);
  const resolvePreviewDurationMs = callbacks.resolvePreviewDurationMs || (() => resolveSubtitlePreviewDurationMsRuntime({
    audioDurationMs: state.subtitles2.audioDurationMs,
    rows: state.subtitles2.rows,
  }));
  const renderWorkflow = callbacks.renderWorkflow || (() => ctx.renderCallbacks.renderWorkflow?.());
  const renderHealthBanner = callbacks.renderHealthBanner || (() => ctx.renderCallbacks.renderHealthBanner?.());
  const renderSessionHistory = callbacks.renderSessionHistory || (() => ctx.renderCallbacks.renderSessionHistory?.());
  const renderDoneCard = callbacks.renderDoneCard || (() => ctx.renderCallbacks.renderDoneCard?.());
  const renderSourceLanguagePicker = callbacks.renderSourceLanguagePicker || (() => ctx.renderCallbacks.renderSourceLanguagePicker?.());

  async function pollSessionStatus(sessionId) {
    const detail = await ttsApi.getSubtitleSession(sessionId);
    if (isStaleSession(sessionId)) return;
    state.subtitles2.analyzeStatus = (detail?.status || 'processing').toString();
    state.subtitles2.snapshotVersion = Number(detail?.current_snapshot_version || state.subtitles2.snapshotVersion || 0);
    if ((state.subtitles2.analyzeStatus || '').toLowerCase() === 'editing' || state.subtitles2.snapshotVersion > 0) {
      stopPolling();
      const hydratedDetail = await hydrateSession(sessionId, { render: false });
      setPhaseFromRemoteStatus(hydratedDetail || detail);
      return;
    }
    stopPolling();
    state.subtitles2.pollingTimer = timers.setTimeout(() => {
      void pollSessionStatus(sessionId);
    }, SUBTITLES_POLL_INTERVAL_MS);
    renderWorkflow();
  }

  async function pollRenderStatus(sessionId) {
    const payload = await ttsApi.getSubtitleRenderStatus(sessionId);
    if (isStaleSession(sessionId)) return;
    state.subtitles2.renderStatus = (payload?.job?.status || state.subtitles2.renderStatus || 'queued').toString();
    state.subtitles2.renderProgressPct = Number(payload?.job?.progress_percent || 0);
    state.subtitles2.renderArtifactReady = Boolean(payload?.download?.ready);
    if ((state.subtitles2.renderStatus || '').toLowerCase() === 'succeeded') {
      stopPolling();
      transitionPhase('Terminado');
      renderDoneCard();
      return;
    }
    if ((state.subtitles2.renderStatus || '').toLowerCase() === 'failed') {
      stopPolling();
      state.subtitles2.renderFailureReason = 'El render remoto falló';
      transitionPhase('Terminado');
      renderDoneCard();
      return;
    }
    stopPolling();
    state.subtitles2.pollingTimer = timers.setTimeout(() => {
      void pollRenderStatus(sessionId);
    }, SUBTITLES_POLL_INTERVAL_MS);
    renderWorkflow();
  }

  function stopPolling() {
    if (state.subtitles2.pollingTimer) {
      timers.clearTimeout(state.subtitles2.pollingTimer);
      timers.clearInterval(state.subtitles2.pollingTimer);
      state.subtitles2.pollingTimer = null;
    }
  }

  function resetRunState() {
    const previous = state.subtitles2 || {};
    callbacks.revokePreviewObjectUrl?.();
    const next = createRemoteSubtitlesState();
    next.sessionHistory = Array.isArray(previous.sessionHistory) ? previous.sessionHistory : next.sessionHistory;
    next.serviceHealth = previous.serviceHealth || next.serviceHealth;
    next.sourceLanguage = previous.sourceLanguage || next.sourceLanguage;
    state.subtitles2 = next;
  }

  function forcePhase(nextPhase) {
    const phasePath = {
      Carga: [],
      'Procesando audio': ['Procesando audio'],
      Edicion: ['Procesando audio', 'Edicion'],
      'Procesando video': ['Procesando audio', 'Edicion', 'Procesando video'],
      Terminado: ['Procesando audio', 'Edicion', 'Procesando video', 'Terminado'],
    }[nextPhase];
    if (!phasePath) return false;
    state.subtitles2.machine.reset();
    for (const phase of phasePath) {
      state.subtitles2.machine.transition(phase);
    }
    renderWorkflow();
    return true;
  }

  function resolvePhaseFromRemoteStatus(detail = {}) {
    const status = (detail?.status || state.subtitles2.analyzeStatus || '').toString().trim().toLowerCase();
    const renderStatus = (state.subtitles2.renderStatus || '').toString().trim().toLowerCase();
    const downloadReady = Boolean(detail?.download?.ready || state.subtitles2.renderArtifactReady);
    if (downloadReady || ['succeeded', 'completed', 'complete', 'done', 'finished'].includes(status) || renderStatus === 'succeeded') return 'Terminado';
    if (['rendering', 'render_queued', 'rendering_video', 'processing_video'].includes(status) || ['queued', 'processing', 'running'].includes(renderStatus)) return 'Procesando video';
    if (['processing', 'queued', 'analyzing', 'analysis', 'analyzing_audio', 'processing_audio'].includes(status)) return 'Procesando audio';
    return 'Edicion';
  }

  function setPhaseFromRemoteStatus(detail = {}) {
    return forcePhase(resolvePhaseFromRemoteStatus(detail));
  }

  function transitionPhase(nextPhase) {
    const moved = state.subtitles2.machine.transition(nextPhase);
    if (!moved) {
      toast(`Transición inválida: ${state.subtitles2.machine.getPhase()} → ${nextPhase}`);
      return false;
    }
    renderWorkflow();
    return true;
  }

  async function onUploadSelected() {
    const file = el.subtitle2UploadInput?.files?.[0];
    if (!file) return;

    state.subtitles2.selectedFileName = file.name;
    resetRunState();
    state.subtitles2.selectedFileName = file.name;
    transitionPhase('Procesando audio');
    renderWorkflow();

    try {
      const form = new FormData();
      form.append('video', file);
      form.append('source_language', state.subtitles2.sourceLanguage || 'auto');
      const response = await ttsApi.createSubtitleSession(form);
      state.subtitles2.sessionId = (response?.session_id || '').toString();
      state.subtitles2.analyzeStatus = (response?.status || 'processing').toString();
      state.subtitles2.previewVideoUrl = buildSubtitlePreviewUrlRuntime(response?.preview?.video_url || '', state.settings.ttsBaseUrl);
      await loadPreviewVideoBlob(state.subtitles2.sessionId);
      await refreshRemoteStatus();
      await pollSessionStatus(state.subtitles2.sessionId);
    } catch (err) {
      console.error(err);
      toast(getErrorMessage(err, 'Error iniciando Subtítulos 2'));
      resetRunState();
      renderWorkflow();
    }
  }

  function onSourceLanguageChanged(ev) {
    const requestedLanguage = (ev.target?.value || 'auto').toString().trim().toLowerCase();
    if (!SUBTITLE_SOURCE_LANGUAGE_ALLOWED.has(requestedLanguage)) return;
    state.subtitles2.sourceLanguage = requestedLanguage;
    renderSourceLanguagePicker();
  }

  async function refreshRemoteStatus() {
    try {
      const [health, sessions] = await Promise.all([ttsApi.getSubtitlesHealth(), ttsApi.listSubtitleSessions(20)]);
      state.subtitles2.serviceHealth = { status: (health?.status || 'online').toString(), message: 'Servicio remoto disponible.' };
      state.subtitles2.sessionHistory = Array.isArray(sessions?.items) ? sessions.items : [];
    } catch (error) {
      state.subtitles2.serviceHealth = { status: 'offline', message: getErrorMessage(error, 'No se pudo alcanzar el servicio remoto.') };
    }
    renderHealthBanner();
    renderSessionHistory();
  }

  async function hydrateSession(sessionId, { render = true } = {}) {
    const [detail, segments] = await Promise.all([ttsApi.getSubtitleSession(sessionId), ttsApi.getSubtitleSegments(sessionId)]);
    if (isStaleSession(sessionId)) return detail;
    const hydratedRender = resolveHydratedSubtitleRenderStateRuntime(detail);
    state.subtitles2.sessionId = sessionId;
    state.subtitles2.analyzeStatus = (detail?.status || 'editing').toString();
    state.subtitles2.renderStatus = hydratedRender.status;
    state.subtitles2.renderArtifactReady = hydratedRender.artifactReady;
    state.subtitles2.previewVideoUrl = buildSubtitlePreviewUrlRuntime(detail?.preview?.video_url || `/api/subtitles/sessions/${encodeURIComponent(sessionId)}/preview/video`, state.settings.ttsBaseUrl);
    await loadPreviewVideoBlob(sessionId);
    state.subtitles2.snapshotVersion = Number(segments?.version || 0);
    state.subtitles2.rows = mapRemoteSubtitleSegmentsToRowsRuntime({
      segments: segments?.segments || [],
      createRow: createEmptySubtitleRow,
      formatTime: formatSubtitleDisplayTimeRuntime,
      sizePresets: SUBTITLE_SIZE_PRESETS,
      fontPresets: SUBTITLE_FONT_PRESETS,
      colorPresets: SUBTITLE_COLOR_PRESETS,
    });
    state.subtitles2.audioDurationMs = Math.max(0, Number(detail?.preview?.duration_ms || 0)) || resolvePreviewDurationMs();
    const durationAdjusted = ensureRowsCoverDuration(state.subtitles2.audioDurationMs);
    state.subtitles2.savedVersion = state.subtitles2.changeVersion;
    state.subtitles2.dirty = durationAdjusted;
    if (render) renderWorkflow();
    return detail;
  }

  function resetEditorForAnotherVideo() {
    resetRunState();
    if (el.subtitle2UploadInput) el.subtitle2UploadInput.value = '';
    renderWorkflow();
    toast('Listo para subtitular otro video');
  }

  async function deleteHistorySession(sessionId) {
    const confirmed = windowRef.confirm(`¿Eliminar proyecto ${sessionId}? Esta acción no se puede deshacer.`);
    if (!confirmed) return;
    try {
      await ttsApi.deleteSubtitleSession(sessionId);
      state.subtitles2.sessionHistory = state.subtitles2.sessionHistory.filter((item) => item?.id !== sessionId);
      if (state.subtitles2.sessionId === sessionId) {
        resetRunState();
      }
      renderWorkflow();
      await refreshRemoteStatus();
      toast('Proyecto eliminado');
    } catch (error) {
      console.error(error);
      const message = getErrorMessage(error, 'No se pudo eliminar el proyecto');
      const isNetworkDeleteFailure = /failed to fetch|networkerror|load failed/i.test(message);
      toast(isNetworkDeleteFailure
        ? 'No se pudo eliminar: el servicio remoto no tiene DELETE/CORS actualizado.'
        : message);
    }
  }

  async function renameHistorySession(sessionId, currentName = '') {
    const nextName = windowRef.prompt('Nombre del proyecto', currentName || sessionId);
    if (nextName == null) return;
    const displayName = nextName.trim();
    if (!displayName) {
      toast('El nombre no puede estar vacío');
      return;
    }
    try {
      const renamed = await ttsApi.renameSubtitleSession(sessionId, displayName);
      state.subtitles2.sessionHistory = state.subtitles2.sessionHistory.map((item) => (
        item?.id === sessionId
          ? { ...item, display_name: renamed?.display_name || displayName }
          : item
      ));
      renderSessionHistory();
      await refreshRemoteStatus();
      toast('Proyecto renombrado');
    } catch (error) {
      console.error(error);
      toast(getErrorMessage(error, 'No se pudo renombrar el proyecto'));
    }
  }

  function isStaleSession(sessionId) {
    return Boolean(state.subtitles2.sessionId && state.subtitles2.sessionId !== sessionId);
  }

  return {
    pollSessionStatus,
    pollRenderStatus,
    stopPolling,
    resetRunState,
    forcePhase,
    resolvePhaseFromRemoteStatus,
    setPhaseFromRemoteStatus,
    transitionPhase,
    onUploadSelected,
    onSourceLanguageChanged,
    refreshRemoteStatus,
    hydrateSession,
    resetEditorForAnotherVideo,
    deleteHistorySession,
    renameHistorySession,
  };
}
