import {
  SUBTITLES_POLL_INTERVAL_MS,
  SUBTITLES_PHASES,
  SUBTITLE_COLOR_PRESETS,
  SUBTITLE_FONT_PRESETS,
  SUBTITLE_SIZE_PRESETS,
  applySubtitleRowPatch,
  createEmptySubtitleRow,
  getAlignmentButtonState,
  getSubtitlesActionPolicy,
  getSubtitlesPhaseSectionVisibility,
  resolveSubtitleFontWeight,
} from '../../subtitles-workflow.mjs';
import {
  buildSubtitleHealthRuntime,
  buildSubtitlePreviewPresentationRuntime,
  buildSubtitlePreviewTimelineMarkupRuntime,
  buildSubtitlePreviewUrlRuntime,
  buildSubtitleProcessingMessageRuntime,
  buildSubtitleSessionHistoryMarkupRuntime,
  buildSubtitlesTableRowsMarkupRuntime,
  createEmptySubtitleAnalyzeMetadata,
  createRemoteSubtitlesState,
  describeSubtitleTranslationEngineRuntime,
  formatSubtitleDisplayTimeRuntime,
  getLastSubtitleNonDraftRowIndexRuntime,
  hasSubtitleDraftRowsRuntime,
  mapRemoteSubtitleSegmentsToRowsRuntime,
  normalizeSubtitleMetaValueRuntime,
  parseSubtitleTimeToMsRuntime,
  pickActiveSubtitleCueRuntime,
  resolveSubtitlePreviewDurationMsRuntime,
  resolveSubtitleTimelineSeekMsRuntime,
  resolveSubtitleProgressPercentRuntime,
  validateSubtitleTimingPatchRuntime,
} from './runtime/index.js';

const SUBTITLE_TIME_NUDGE_MS = 100;
const SUBTITLE_TIMING_GAP_MS = 60;
const SUBTITLE_DRAFT_INSERT_DURATION_MS = 1000;

const SUBTITLE_SOURCE_LANGUAGE_ALLOWED = new Set([
  'auto', 'es', 'en', 'fr', 'pt', 'de', 'it', 'nl', 'ca', 'pap', 'ko', 'ar', 'ber', 'cs', 'gd', 'tr', 'tzm', 'uz',
]);

const SUBTITLE_MARIAN_LANGS = new Set(['en', 'fr', 'de', 'it', 'nl', 'ca', 'pap', 'ko', 'ar', 'ber']);
const SUBTITLE_FALLBACK_LANGS = new Set(['pt', 'cs', 'gd', 'tr', 'tzm', 'uz']);

export function createSubtitlesController({ state, el, api: ttsApi, ui, helpers, customDropdowns, browser = globalThis }) {
  const toast = ui.toast;
  const getErrorMessage = helpers.getErrorMessage;
  const downloadBlob = helpers.downloadBlob;
  const escapeHtml = helpers.escapeHtml;
  const URLImpl = browser.URL || globalThis.URL;
  const windowRef = browser.window || globalThis;
  const setTimeoutImpl = browser.setTimeout || globalThis.setTimeout;
  const clearTimeoutImpl = browser.clearTimeout || globalThis.clearTimeout;
  const clearIntervalImpl = browser.clearInterval || globalThis.clearInterval;
  let subtitle2PreviewDragCleanup = null;

  async function pollRemoteSubtitleSessionStatus(sessionId) {
    const detail = await ttsApi.getSubtitleSession(sessionId);
    state.subtitles2.analyzeStatus = (detail?.status || 'processing').toString();
    state.subtitles2.snapshotVersion = Number(detail?.current_snapshot_version || state.subtitles2.snapshotVersion || 0);
    if ((state.subtitles2.analyzeStatus || '').toLowerCase() === 'editing' || state.subtitles2.snapshotVersion > 0) {
      stopSubtitle2Polling();
      const hydratedDetail = await hydrateSubtitle2Session(sessionId, { render: false });
      setSubtitles2PhaseFromRemoteStatus(hydratedDetail || detail);
      return;
    }
    stopSubtitle2Polling();
    state.subtitles2.pollingTimer = setTimeoutImpl(() => {
      void pollRemoteSubtitleSessionStatus(sessionId);
    }, SUBTITLES_POLL_INTERVAL_MS);
    renderSubtitles2Workflow();
  }

  async function pollRemoteSubtitleRenderStatus(sessionId) {
    const payload = await ttsApi.getSubtitleRenderStatus(sessionId);
    state.subtitles2.renderStatus = (payload?.job?.status || state.subtitles2.renderStatus || 'queued').toString();
    state.subtitles2.renderProgressPct = Number(payload?.job?.progress_percent || 0);
    state.subtitles2.renderArtifactReady = Boolean(payload?.download?.ready);
    if ((state.subtitles2.renderStatus || '').toLowerCase() === 'succeeded') {
      stopSubtitle2Polling();
      transitionSubtitles2Phase('Terminado');
      renderSubtitle2DoneCard();
      return;
    }
    if ((state.subtitles2.renderStatus || '').toLowerCase() === 'failed') {
      stopSubtitle2Polling();
      state.subtitles2.renderFailureReason = 'El render remoto falló';
      transitionSubtitles2Phase('Terminado');
      renderSubtitle2DoneCard();
      return;
    }
    stopSubtitle2Polling();
    state.subtitles2.pollingTimer = setTimeoutImpl(() => {
      void pollRemoteSubtitleRenderStatus(sessionId);
    }, SUBTITLES_POLL_INTERVAL_MS);
    renderSubtitles2Workflow();
  }

  function stopSubtitle2Polling() {
    if (state.subtitles2.pollingTimer) {
      clearTimeoutImpl(state.subtitles2.pollingTimer);
      clearIntervalImpl(state.subtitles2.pollingTimer);
      state.subtitles2.pollingTimer = null;
    }
  }

  function resetSubtitles2RunState() {
    revokeSubtitle2PreviewObjectUrl();
    state.subtitles2 = createRemoteSubtitlesState();
  }

  function revokeSubtitle2PreviewObjectUrl() {
    const objectUrl = state.subtitles2?.previewVideoObjectUrl;
    if (objectUrl) URLImpl.revokeObjectURL(objectUrl);
    if (state.subtitles2) state.subtitles2.previewVideoObjectUrl = '';
  }

  async function loadSubtitle2PreviewVideoBlob(sessionId) {
    if (!sessionId) return;
    try {
      const blob = await ttsApi.getSubtitlePreviewVideo(sessionId);
      revokeSubtitle2PreviewObjectUrl();
      state.subtitles2.previewVideoObjectUrl = URLImpl.createObjectURL(blob);
      renderSubtitle2PreviewPlayer();
    } catch (error) {
      console.warn('No se pudo cargar preview autenticado', error);
    }
  }

  function forceSubtitles2Phase(nextPhase) {
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
    renderSubtitles2Workflow();
    return true;
  }

  function resolveSubtitles2PhaseFromRemoteStatus(detail = {}) {
    const status = (detail?.status || state.subtitles2.analyzeStatus || '').toString().trim().toLowerCase();
    const renderStatus = (state.subtitles2.renderStatus || '').toString().trim().toLowerCase();
    const downloadReady = Boolean(detail?.download?.ready || state.subtitles2.renderArtifactReady);
    if (downloadReady || ['succeeded', 'completed', 'complete', 'done', 'finished'].includes(status) || renderStatus === 'succeeded') return 'Terminado';
    if (['rendering', 'render_queued', 'rendering_video', 'processing_video'].includes(status) || ['queued', 'processing', 'running'].includes(renderStatus)) return 'Procesando video';
    if (['processing', 'queued', 'analyzing', 'analysis', 'analyzing_audio', 'processing_audio'].includes(status)) return 'Procesando audio';
    return 'Edicion';
  }

  function setSubtitles2PhaseFromRemoteStatus(detail = {}) {
    return forceSubtitles2Phase(resolveSubtitles2PhaseFromRemoteStatus(detail));
  }

  function transitionSubtitles2Phase(nextPhase) {
    const moved = state.subtitles2.machine.transition(nextPhase);
    if (!moved) {
      toast(`Transición inválida: ${state.subtitles2.machine.getPhase()} → ${nextPhase}`);
      return false;
    }
    renderSubtitles2Workflow();
    return true;
  }

  async function onSubtitle2UploadSelected() {
    const file = el.subtitle2UploadInput?.files?.[0];
    if (!file) return;

    state.subtitles2.selectedFileName = file.name;
    resetSubtitles2RunState();
    state.subtitles2.selectedFileName = file.name;
    transitionSubtitles2Phase('Procesando audio');
    renderSubtitles2Workflow();

    try {
      const form = new FormData();
      form.append('video', file);
      form.append('source_language', state.subtitles2.sourceLanguage || 'auto');
      const response = await ttsApi.createSubtitleSession(form);
      state.subtitles2.sessionId = (response?.session_id || '').toString();
      state.subtitles2.analyzeStatus = (response?.status || 'processing').toString();
      state.subtitles2.previewVideoUrl = buildSubtitlePreviewUrlRuntime(response?.preview?.video_url || '', state.settings.ttsBaseUrl);
      await loadSubtitle2PreviewVideoBlob(state.subtitles2.sessionId);
      await refreshSubtitle2RemoteStatus();
      await pollRemoteSubtitleSessionStatus(state.subtitles2.sessionId);
    } catch (err) {
      console.error(err);
      toast(getErrorMessage(err, 'Error iniciando Subtítulos 2'));
      resetSubtitles2RunState();
      renderSubtitles2Workflow();
    }
  }

  function onSubtitle2SourceLanguageChanged(ev) {
    const requestedLanguage = (ev.target?.value || 'auto').toString().trim().toLowerCase();
    if (!SUBTITLE_SOURCE_LANGUAGE_ALLOWED.has(requestedLanguage)) return;
    state.subtitles2.sourceLanguage = requestedLanguage;
    renderSubtitle2SourceLanguagePicker();
  }

  async function onSubtitle2SaveClicked() {
    if (!state.subtitles2.sessionId) {
      toast('No hay sesión remota activa para guardar');
      return;
    }
    if (!state.subtitles2.dirty) {
      toast('No hay cambios para guardar');
      return;
    }
    if (hasSubtitle2DraftRows()) {
      toast('Ubicá el subtítulo fantasma antes de guardar');
      return;
    }
    try {
      await enqueueSubtitle2Save('manual');
      toast('Cambios guardados');
    } catch (err) {
      console.error(err);
      toast(getErrorMessage(err, 'Error guardando Subtítulos 2'));
    } finally {
      updateSubtitle2ButtonsByPhase();
    }
  }

  async function enqueueSubtitle2Save(saveMode) {
    if (hasSubtitle2DraftRows()) {
      throw new Error('Ubicá el subtítulo fantasma antes de guardar');
    }
    ensureSubtitle2RowsCoverDuration();
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
    await refreshSubtitle2RemoteStatus();
    return response;
  }

  async function onSubtitle2ReadyClicked() {
    if (!state.subtitles2.sessionId || state.subtitles2.snapshotVersion < 1) {
      toast('Necesitás una sesión remota lista antes de renderizar');
      return;
    }
    if (hasSubtitle2DraftRows()) {
      toast('Ubicá el subtítulo fantasma antes de renderizar');
      return;
    }
    if (state.subtitles2.dirty) {
      await enqueueSubtitle2Save('manual');
    }
    transitionSubtitles2Phase('Procesando video');
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
      await pollRemoteSubtitleRenderStatus(state.subtitles2.sessionId);
      await refreshSubtitle2RemoteStatus();
    } catch (error) {
      console.error(error);
      state.subtitles2.renderStatus = 'failed';
      state.subtitles2.renderArtifactReady = false;
      state.subtitles2.renderFailureReason = getErrorMessage(error, 'El render remoto falló');
      transitionSubtitles2Phase('Terminado');
      renderSubtitle2DoneCard();
    }
  }

  async function onSubtitle2DownloadClicked() {
    if (!state.subtitles2.sessionId) {
      toast('No hay sesión remota para descargar');
      return;
    }
    const blob = await ttsApi.downloadSubtitleRender(state.subtitles2.sessionId);
    downloadBlob(blob, `${state.subtitles2.sessionId}.mp4`);
  }

  function patchSubtitle2Row(rowId, patch, options = {}) {
    const rerender = options.rerender !== false;
    state.subtitles2.rows = state.subtitles2.rows.map((row) => (row.id === rowId ? applySubtitleRowPatch(row, patch) : row));
    state.subtitles2.changeVersion += 1;
    state.subtitles2.dirty = true;
    if (rerender) renderSubtitles2Table();
    renderSubtitle2PreviewOverlay();
    updateSubtitle2ButtonsByPhase();
  }

  function hasSubtitle2DraftRows() {
    return hasSubtitleDraftRowsRuntime(state.subtitles2.rows);
  }

  function onSubtitle2TableInput(ev) {
    const target = ev.target;
    if (!target) return;
    const rowId = target.dataset.rowId;
    if (!rowId) return;

    if (target.dataset.field === 'start' || target.dataset.field === 'end') {
      applySubtitle2TimingInput(rowId, target.dataset.field, target.value);
      return;
    }
    if (target.dataset.field === 'phrase') {
      patchSubtitle2Row(rowId, { phrase: target.value }, { rerender: false });
      return;
    }
    if (target.dataset.field === 'maxWidthPx') {
      patchSubtitle2Row(rowId, { maxWidthPx: target.value });
      return;
    }
    if (target.dataset.field === 'size') {
      patchSubtitle2Row(rowId, { size: target.value });
      return;
    }
    if (target.dataset.field === 'color') {
      patchSubtitle2Row(rowId, { color: target.value });
      return;
    }
    if (target.dataset.field === 'fontFamily') {
      patchSubtitle2Row(rowId, { fontFamily: target.value });
    }
  }

  function applySubtitle2TimingInput(rowId, field, rawValue) {
    const valueMs = parseSubtitleTimeToMsRuntime(rawValue);
    const validation = validateSubtitleTimingPatchRuntime({ rows: state.subtitles2.rows, rowId, field, valueMs, gapMs: SUBTITLE_TIMING_GAP_MS });
    if (!validation.accepted) {
      toast(validation.reason || 'Timing inválido');
      renderSubtitles2Table();
      return;
    }
    const index = state.subtitles2.rows.findIndex((row) => row.id === rowId);
    const row = state.subtitles2.rows[index];
    if (!row) return;
    if (field === 'start') {
      patchSubtitle2Row(rowId, { start: formatSubtitleDisplayTimeRuntime(valueMs) });
      return;
    }
    patchSubtitle2Row(rowId, { end: formatSubtitleDisplayTimeRuntime(valueMs) });
    const nextRow = state.subtitles2.rows[index + 1];
    if (nextRow) patchSubtitle2Row(nextRow.id, { start: formatSubtitleDisplayTimeRuntime(valueMs + SUBTITLE_TIMING_GAP_MS) });
  }

  function onSubtitle2TableClick(ev) {
    const nudgeButton = ev.target.closest('button[data-action="nudge-subtitle-time"]');
    if (nudgeButton) {
      nudgeSubtitle2TimingBoundary(nudgeButton.dataset.rowId, nudgeButton.dataset.field, nudgeButton.dataset.direction);
      return;
    }
    const deleteButton = ev.target.closest('button[data-action="delete-subtitle-row"]');
    if (deleteButton) {
      const rowId = deleteButton.dataset.rowId;
      if (rowId) deleteSubtitle2Row(rowId);
      return;
    }
    const button = ev.target.closest('button[data-field="align"]');
    if (!button) return;
    const rowId = button.dataset.rowId;
    const align = button.dataset.align;
    if (!rowId || !align) return;
    patchSubtitle2Row(rowId, { align });
  }

  function nudgeSubtitle2TimingBoundary(rowId, field, direction) {
    const index = state.subtitles2.rows.findIndex((row) => row.id === rowId);
    const row = state.subtitles2.rows[index];
    if (!row || row.isDraft) return;
    if (field === 'end' && index === getLastSubtitle2NonDraftRowIndex()) {
      toast('El END de la última frase debe durar hasta el final del video');
      return;
    }
    const delta = direction === 'up' ? -SUBTITLE_TIME_NUDGE_MS : SUBTITLE_TIME_NUDGE_MS;
    const currentStartMs = parseSubtitleTimeToMsRuntime(row.start);
    const currentEndMs = parseSubtitleTimeToMsRuntime(row.end);

    if (field === 'start') {
      if (index === 0) {
        toast('El START de la primera frase es fijo en 00:00.00');
        return;
      }
      const previous = state.subtitles2.rows[index - 1];
      const previousStartMs = parseSubtitleTimeToMsRuntime(previous.start);
      const nextStartMs = currentStartMs + delta;
      const previousEndMs = nextStartMs - SUBTITLE_TIMING_GAP_MS;
      if (previousEndMs <= previousStartMs || nextStartMs >= currentEndMs - SUBTITLE_TIMING_GAP_MS) {
        toast('No hay margen suficiente para mover el START');
        return;
      }
      state.subtitles2.rows = state.subtitles2.rows.map((item, itemIndex) => {
        if (itemIndex === index - 1) return applySubtitleRowPatch(item, { end: formatSubtitleDisplayTimeRuntime(previousEndMs) });
        if (itemIndex === index) return applySubtitleRowPatch(item, { start: formatSubtitleDisplayTimeRuntime(nextStartMs) });
        return item;
      });
      state.subtitles2.changeVersion += 1;
      state.subtitles2.dirty = true;
      renderSubtitles2Table();
      renderSubtitle2PreviewOverlay();
      updateSubtitle2ButtonsByPhase();
      return;
    }

    if (field !== 'end') return;
    const next = state.subtitles2.rows[index + 1] || null;
    const nextEndMs = next ? parseSubtitleTimeToMsRuntime(next.end) : null;
    const nextEndBoundaryMs = currentEndMs + delta;
    const nextStartMs = nextEndBoundaryMs + SUBTITLE_TIMING_GAP_MS;
    if (nextEndBoundaryMs <= currentStartMs + SUBTITLE_TIMING_GAP_MS || (next && nextStartMs >= nextEndMs)) {
      toast('No hay margen suficiente para mover el END');
      return;
    }
    state.subtitles2.rows = state.subtitles2.rows.map((item, itemIndex) => {
      if (itemIndex === index) return applySubtitleRowPatch(item, { end: formatSubtitleDisplayTimeRuntime(nextEndBoundaryMs) });
      if (next && itemIndex === index + 1) return applySubtitleRowPatch(item, { start: formatSubtitleDisplayTimeRuntime(nextStartMs) });
      return item;
    });
    state.subtitles2.changeVersion += 1;
    state.subtitles2.dirty = true;
    renderSubtitles2Table();
    renderSubtitle2PreviewOverlay();
    updateSubtitle2ButtonsByPhase();
  }

  function deleteSubtitle2Row(rowId) {
    const index = state.subtitles2.rows.findIndex((row) => row.id === rowId);
    if (index <= 0) {
      toast('La primera frase no se puede eliminar');
      return;
    }
    const deletedRow = state.subtitles2.rows[index];
    if (deletedRow?.isDraft) {
      state.subtitles2.rows = state.subtitles2.rows.filter((row) => row.id !== rowId);
      state.subtitles2.changeVersion += 1;
      state.subtitles2.dirty = true;
      renderSubtitles2Workflow();
      return;
    }
    const previousRow = state.subtitles2.rows[index - 1];
    const nextRows = state.subtitles2.rows.filter((row) => row.id !== rowId);
    nextRows[index - 1] = {
      ...previousRow,
      end: deletedRow.end,
    };
    state.subtitles2.rows = nextRows;
    state.subtitles2.changeVersion += 1;
    state.subtitles2.dirty = true;
    renderSubtitles2Workflow();
  }

  function onSubtitle2AddRowClicked() {
    if (hasSubtitle2DraftRows()) {
      toast('Ya hay un subtítulo fantasma para ubicar');
      return;
    }
    const row = createEmptySubtitleRow({
      id: `draft-${Date.now()}`,
      start: '',
      end: '',
      phrase: '',
      isDraft: true,
    });
    state.subtitles2.rows = [...state.subtitles2.rows, row];
    state.subtitles2.changeVersion += 1;
    state.subtitles2.dirty = true;
    renderSubtitles2Workflow();
  }

  function onSubtitle2DraftDragStart(ev) {
    const rowEl = ev.target.closest('tr[data-row-id]');
    if (!rowEl || rowEl.dataset.draft !== 'true') return;
    state.subtitles2.draggingDraftRowId = rowEl.dataset.rowId;
    ev.dataTransfer.effectAllowed = 'move';
    ev.dataTransfer.setData('text/plain', rowEl.dataset.rowId);
    rowEl.classList.add('is-dragging');
  }

  function onSubtitle2DraftDragOver(ev) {
    const draftId = state.subtitles2.draggingDraftRowId;
    if (!draftId) return;
    const rowEl = ev.target.closest('tr[data-row-id]');
    if (!rowEl || rowEl.dataset.draft === 'true') return;
    const targetIndex = state.subtitles2.rows.findIndex((row) => row.id === rowEl.dataset.rowId);
    if (targetIndex <= 0 || targetIndex >= getLastSubtitle2NonDraftRowIndex()) return;
    ev.preventDefault();
    clearSubtitle2DropTargets();
    rowEl.classList.add('is-drop-before');
  }

  function onSubtitle2DraftDragLeave(ev) {
    const rowEl = ev.target.closest('tr[data-row-id]');
    if (!rowEl || rowEl.contains(ev.relatedTarget)) return;
    rowEl.classList.remove('is-drop-before');
  }

  function onSubtitle2DraftDrop(ev) {
    const draftId = state.subtitles2.draggingDraftRowId;
    if (!draftId) return;
    const rowEl = ev.target.closest('tr[data-row-id]');
    if (!rowEl || rowEl.dataset.draft === 'true') return;
    ev.preventDefault();
    const targetIndex = state.subtitles2.rows.findIndex((row) => row.id === rowEl.dataset.rowId);
    if (targetIndex <= 0 || targetIndex >= getLastSubtitle2NonDraftRowIndex()) {
      toast('Soltá el subtítulo entre dos frases intermedias');
      return;
    }
    placeSubtitle2DraftBetweenRows(draftId, targetIndex);
  }

  function getLastSubtitle2NonDraftRowIndex() {
    return getLastSubtitleNonDraftRowIndexRuntime(state.subtitles2.rows);
  }

  function onSubtitle2DraftDragEnd() {
    clearSubtitle2DropTargets();
    state.subtitles2.draggingDraftRowId = null;
  }

  function clearSubtitle2DropTargets() {
    el.subtitle2RowsBody?.querySelectorAll('.is-drop-before, .is-dragging').forEach((node) => {
      node.classList.remove('is-drop-before', 'is-dragging');
    });
  }

  function placeSubtitle2DraftBetweenRows(draftId, targetIndex) {
    const rows = state.subtitles2.rows;
    const draft = rows.find((row) => row.id === draftId && row.isDraft);
    const previous = rows[targetIndex - 1];
    const next = rows[targetIndex];
    if (!draft || !previous || !next || previous.isDraft || next.isDraft) return;
    const previousEndMs = parseSubtitleTimeToMsRuntime(previous.end);
    const nextStartMs = parseSubtitleTimeToMsRuntime(next.start);
    const nextEndMs = parseSubtitleTimeToMsRuntime(next.end);
    const draftStartMs = nextStartMs;
    const draftEndMs = draftStartMs + SUBTITLE_DRAFT_INSERT_DURATION_MS;
    const adjustedNextStartMs = draftEndMs + SUBTITLE_TIMING_GAP_MS;
    if (draftStartMs < previousEndMs + SUBTITLE_TIMING_GAP_MS || adjustedNextStartMs >= nextEndMs) {
      toast('No hay espacio suficiente para insertar el subtítulo');
      renderSubtitles2Workflow();
      return;
    }
    const placedDraft = {
      ...draft,
      start: formatSubtitleDisplayTimeRuntime(draftStartMs),
      end: formatSubtitleDisplayTimeRuntime(draftEndMs),
      isDraft: false,
    };
    const withoutDraft = rows.filter((row) => row.id !== draftId);
    const adjustedTargetIndex = withoutDraft.findIndex((row) => row.id === next.id);
    withoutDraft[adjustedTargetIndex] = {
      ...next,
      start: formatSubtitleDisplayTimeRuntime(adjustedNextStartMs),
    };
    state.subtitles2.rows = [
      ...withoutDraft.slice(0, adjustedTargetIndex),
      placedDraft,
      ...withoutDraft.slice(adjustedTargetIndex),
    ];
    state.subtitles2.changeVersion += 1;
    state.subtitles2.dirty = true;
    state.subtitles2.draggingDraftRowId = null;
    renderSubtitles2Workflow();
  }

  function renderSubtitles2Workflow() {
    renderSubtitle2HealthBanner();
    renderSubtitle2SessionHistory();
    renderSubtitle2PreviewPlayer();
    renderSubtitle2PreviewOverlay();
    renderSubtitles2PhaseBar();
    renderSubtitles2PhaseSections();
    renderSubtitle2SourceLanguagePicker();
    renderSubtitle2AnalyzeMeta();
    renderSubtitle2ProcessingCard();
    renderSubtitle2DoneCard();
    renderSubtitles2Table();
    updateSubtitle2ButtonsByPhase();
  }

  function renderSubtitle2HealthBanner() {
    if (!el.subtitle2ServiceHealthBanner) return;
    const resolved = buildSubtitleHealthRuntime(state.subtitles2.serviceHealth, 'remote-core');
    el.subtitle2ServiceHealthBanner.textContent = resolved.banner;
    el.subtitle2ServiceHealthBanner.classList.toggle('is-online', resolved.tone === 'online');
    el.subtitle2ServiceHealthBanner.classList.toggle('is-offline', resolved.tone !== 'online');
  }

  function renderSubtitle2SessionHistory() {
    if (!el.subtitle2SessionHistory) return;
    el.subtitle2SessionHistory.innerHTML = buildSubtitleSessionHistoryMarkupRuntime({
      items: state.subtitles2.sessionHistory,
      activeSessionId: state.subtitles2.sessionId,
      escapeHtml,
    });
  }

  function renderSubtitle2PreviewPlayer() {
    if (!el.subtitle2PreviewVideo) return;
    const src = (state.subtitles2.previewVideoObjectUrl || state.subtitles2.previewVideoUrl || '').trim();
    const hasPreview = Boolean(src);
    el.subtitle2PreviewStage?.classList.toggle('is-empty', !hasPreview);
    el.subtitle2PreviewEmpty?.classList.toggle('hidden', hasPreview);
    if (el.subtitle2PreviewPlayBtn) {
      el.subtitle2PreviewPlayBtn.disabled = !hasPreview;
    }
    if (!src) {
      el.subtitle2PreviewVideo.removeAttribute('src');
      el.subtitle2PreviewVideo.pause();
      state.subtitles2.previewPlaying = false;
      renderSubtitle2PreviewPlaybackState();
      renderSubtitle2PreviewOverlay();
      return;
    }
    if (el.subtitle2PreviewVideo.getAttribute('src') !== src) {
      el.subtitle2PreviewVideo.src = src;
    }
    renderSubtitle2PreviewPlaybackState();
  }

  function renderSubtitle2PreviewOverlay() {
    const activeCue = pickActiveSubtitleCueRuntime(state.subtitles2.rows, state.subtitles2.previewCurrentMs);
    if (!el.subtitle2PreviewCue) return;
    const stageRect = el.subtitle2PreviewStage?.getBoundingClientRect?.() || { width: 0, height: 0 };
    const presentation = buildSubtitlePreviewPresentationRuntime({
      activeCue,
      currentMs: state.subtitles2.previewCurrentMs,
      durationMs: resolveSubtitle2PreviewDurationMs(),
      stageWidth: stageRect.width,
      stageHeight: stageRect.height,
    });
    if (el.subtitle2PreviewOverlay) {
      el.subtitle2PreviewOverlay.style.justifyContent = presentation.justifyContent;
    }
    if (!activeCue) {
      el.subtitle2PreviewCue.classList.add('hidden');
      el.subtitle2PreviewCue.textContent = '';
      el.subtitle2PreviewCue.removeAttribute('style');
    } else {
      el.subtitle2PreviewCue.classList.remove('hidden');
      el.subtitle2PreviewCue.textContent = presentation.text;
      el.subtitle2PreviewCue.style.color = presentation.color;
      el.subtitle2PreviewCue.style.fontFamily = presentation.fontFamily;
      el.subtitle2PreviewCue.style.fontWeight = presentation.fontWeight;
      el.subtitle2PreviewCue.style.fontSize = `${presentation.fontSizePx}px`;
      el.subtitle2PreviewCue.style.width = `${presentation.cueWidthPx}px`;
    }
    renderSubtitle2PreviewTimeline();
  }

  function renderSubtitle2PreviewTimeline() {
    const durationMs = resolveSubtitle2PreviewDurationMs();
    if (el.subtitle2PreviewTimelineTrack) {
      el.subtitle2PreviewTimelineTrack.innerHTML = buildSubtitlePreviewTimelineMarkupRuntime({
        rows: state.subtitles2.rows,
        durationMs,
        currentMs: state.subtitles2.previewCurrentMs,
      });
    }
    if (el.subtitle2PreviewTimecode) {
      el.subtitle2PreviewTimecode.textContent = formatSubtitleDisplayTimeRuntime(state.subtitles2.previewCurrentMs);
    }
  }

  function applySubtitle2VideoDuration(durationSeconds) {
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return false;
    const durationMs = Math.round(durationSeconds * 1000);
    if (!durationMs || durationMs === state.subtitles2.audioDurationMs) return false;
    state.subtitles2.audioDurationMs = durationMs;
    return ensureSubtitle2RowsCoverDuration(durationMs);
  }

  function ensureSubtitle2RowsCoverDuration(durationMs = resolveSubtitle2PreviewDurationMs()) {
    const safeDurationMs = Math.max(0, Number(durationMs) || 0);
    if (!safeDurationMs || hasSubtitle2DraftRows()) return false;
    const lastIndex = state.subtitles2.rows.length - 1;
    const lastRow = state.subtitles2.rows[lastIndex];
    if (!lastRow) return false;
    const lastEndMs = parseSubtitleTimeToMsRuntime(lastRow.end);
    if (lastEndMs >= safeDurationMs) return false;
    state.subtitles2.rows = state.subtitles2.rows.map((row, index) => (
      index === lastIndex ? applySubtitleRowPatch(row, { end: formatSubtitleDisplayTimeRuntime(safeDurationMs) }) : row
    ));
    state.subtitles2.changeVersion += 1;
    state.subtitles2.dirty = true;
    return true;
  }

  function onSubtitle2PreviewLoadedMetadata(ev) {
    const adjusted = applySubtitle2VideoDuration(ev.target?.duration);
    if (adjusted) renderSubtitles2Table();
    renderSubtitle2PreviewOverlay();
  }

  function onSubtitle2PreviewTimeUpdate(ev) {
    state.subtitles2.previewCurrentMs = Math.round((ev.target?.currentTime || 0) * 1000);
    const adjusted = applySubtitle2VideoDuration(ev.target?.duration);
    if (adjusted) renderSubtitles2Table();
    renderSubtitle2PreviewOverlay();
  }

  function onSubtitle2PreviewTimelineClick(ev) {
    seekSubtitle2PreviewFromClientX(ev.clientX);
  }

  function renderSubtitle2PreviewPlaybackState() {
    if (!el.subtitle2PreviewPlayBtn) return;
    const isPlaying = Boolean(state.subtitles2.previewPlaying);
    el.subtitle2PreviewPlayBtn.textContent = isPlaying ? '❚❚' : '▶';
    el.subtitle2PreviewPlayBtn.setAttribute('aria-label', isPlaying ? 'Pausar preview' : 'Reproducir preview');
    el.subtitle2PreviewPlayBtn.setAttribute('title', isPlaying ? 'Pausar' : 'Reproducir');
  }

  function onSubtitle2PreviewToggleClicked() {
    if (!el.subtitle2PreviewVideo || !(state.subtitles2.previewVideoUrl || '').trim()) return;
    if (el.subtitle2PreviewVideo.paused) {
      void el.subtitle2PreviewVideo.play().catch(() => undefined);
      return;
    }
    el.subtitle2PreviewVideo.pause();
  }

  function resolveSubtitle2PreviewDurationMs() {
    return resolveSubtitlePreviewDurationMsRuntime({
      audioDurationMs: state.subtitles2.audioDurationMs,
      rows: state.subtitles2.rows,
    });
  }

  function seekSubtitle2PreviewToMs(nextMs) {
    const durationMs = resolveSubtitle2PreviewDurationMs();
    const bounded = Math.max(0, Math.min(Number(nextMs) || 0, durationMs || 0));
    state.subtitles2.previewCurrentMs = bounded;
    if (el.subtitle2PreviewVideo) el.subtitle2PreviewVideo.currentTime = bounded / 1000;
    renderSubtitle2PreviewOverlay();
  }

  function seekSubtitle2PreviewFromClientX(clientX) {
    const timeline = el.subtitle2PreviewTimelineTrack;
    if (!timeline) return;
    const rect = timeline.getBoundingClientRect();
    const durationMs = resolveSubtitle2PreviewDurationMs();
    const nextMs = resolveSubtitleTimelineSeekMsRuntime({
      clientX,
      rectLeft: rect.left,
      rectWidth: rect.width,
      durationMs,
    });
    seekSubtitle2PreviewToMs(nextMs);
  }

  function cleanupSubtitle2PreviewDrag() {
    subtitle2PreviewDragCleanup?.();
    subtitle2PreviewDragCleanup = null;
  }

  function onSubtitle2PreviewTimelineDragStart(ev) {
    if (ev.button !== 0) return;
    ev.preventDefault();
    cleanupSubtitle2PreviewDrag();
    seekSubtitle2PreviewFromClientX(ev.clientX);
    const onMouseMove = (moveEv) => {
      seekSubtitle2PreviewFromClientX(moveEv.clientX);
    };
    const onMouseUp = () => {
      cleanupSubtitle2PreviewDrag();
    };
    windowRef.addEventListener('mousemove', onMouseMove);
    windowRef.addEventListener('mouseup', onMouseUp);
    subtitle2PreviewDragCleanup = () => {
      windowRef.removeEventListener('mousemove', onMouseMove);
      windowRef.removeEventListener('mouseup', onMouseUp);
    };
  }

  function renderSubtitles2PhaseBar() {
    const current = state.subtitles2.machine.getPhase();
    const currentIndex = SUBTITLES_PHASES.indexOf(current);
    el.subtitle2PhaseBar?.querySelectorAll('[data-phase]').forEach((node) => {
      const idx = SUBTITLES_PHASES.indexOf(node.dataset.phase);
      node.classList.toggle('active', idx === currentIndex);
      node.classList.toggle('done', idx > -1 && idx < currentIndex);
    });
  }

  function renderSubtitles2PhaseSections() {
    const visibility = getSubtitlesPhaseSectionVisibility(state.subtitles2.machine.getPhase());
    el.subtitle2PhaseUpload?.classList.toggle('hidden', !visibility.showUpload);
    el.subtitle2PhaseProcessing?.classList.toggle('hidden', !visibility.showProcessing);
    el.subtitle2PhaseEdition?.classList.toggle('hidden', !visibility.showEdition);
    el.subtitle2PhaseDone?.classList.toggle('hidden', !visibility.showDone);
  }

  function renderSubtitle2SourceLanguagePicker() {
    if (!el.subtitle2SourceLanguagePicker) return;
    const selected = (state.subtitles2.sourceLanguage || 'auto').toString().toLowerCase();
    el.subtitle2SourceLanguagePicker.value = SUBTITLE_SOURCE_LANGUAGE_ALLOWED.has(selected) ? selected : 'auto';
    customDropdowns.refreshAll();
    if (el.subtitle2SourceLanguageEngineHint) {
      el.subtitle2SourceLanguageEngineHint.textContent = describeSubtitleTranslationEngineRuntime(selected, SUBTITLE_MARIAN_LANGS, SUBTITLE_FALLBACK_LANGS);
    }
  }

  function renderSubtitle2AnalyzeMeta() {
    if (!el.subtitle2AnalyzeMeta) return;
    const metadata = state.subtitles2.analyzeMetadata || createEmptySubtitleAnalyzeMetadata();
    const requested = normalizeSubtitleMetaValueRuntime(metadata.sourceLanguageRequested);
    const effective = normalizeSubtitleMetaValueRuntime(metadata.sourceLanguageEffective);
    const detected = normalizeSubtitleMetaValueRuntime(metadata.detectedLanguage);
    const asrModel = normalizeSubtitleMetaValueRuntime(metadata.asrModel);
    const mtModel = normalizeSubtitleMetaValueRuntime(metadata.mtModel);
    if (el.subtitle2MetaRequested) el.subtitle2MetaRequested.textContent = requested;
    if (el.subtitle2MetaEffective) el.subtitle2MetaEffective.textContent = effective;
    if (el.subtitle2MetaDetected) el.subtitle2MetaDetected.textContent = detected;
    if (el.subtitle2MetaAsrModel) el.subtitle2MetaAsrModel.textContent = asrModel;
    if (el.subtitle2MetaMtModel) el.subtitle2MetaMtModel.textContent = mtModel;
    el.subtitle2AnalyzeMeta.classList.toggle('hidden', ![requested, effective, detected, asrModel, mtModel].some((value) => value !== '—'));
  }

  function renderSubtitle2ProcessingCard() {
    const phase = state.subtitles2.machine.getPhase();
    const details = phase === 'Procesando video'
      ? {
        icon: '🎬',
        title: 'Procesando video',
        message: buildSubtitleProcessingMessageRuntime(state.subtitles2.renderStatus, 'Estamos renderizando el video final…'),
        percent: resolveSubtitleProgressPercentRuntime(state.subtitles2.renderProgressPct, state.subtitles2.renderStatus),
      }
      : {
        icon: '🎧',
        title: 'Procesando audio',
        message: buildSubtitleProcessingMessageRuntime(state.subtitles2.analyzeStatus, 'Estamos analizando tu archivo…'),
        percent: resolveSubtitleProgressPercentRuntime(state.subtitles2.analyzeProgressPct, state.subtitles2.analyzeStatus),
      };

    if (el.subtitle2ProcessingIcon) el.subtitle2ProcessingIcon.textContent = details.icon;
    if (el.subtitle2ProcessingTitle) el.subtitle2ProcessingTitle.textContent = details.title;
    if (el.subtitle2ProcessingMessage) el.subtitle2ProcessingMessage.textContent = details.message;
    if (el.subtitle2ProgressFill) el.subtitle2ProgressFill.style.width = `${details.percent}%`;
    if (el.subtitle2ProgressPercent) el.subtitle2ProgressPercent.textContent = `${details.percent}%`;
  }

  function renderSubtitle2DoneCard() {
    const status = (state.subtitles2.renderStatus || '').toString().trim().toLowerCase();
    if (el.subtitle2DoneTitle) el.subtitle2DoneTitle.textContent = status === 'succeeded' ? 'Video listo' : 'Render fallido';
    if (el.subtitle2DoneMessage) {
      el.subtitle2DoneMessage.textContent = status === 'succeeded'
        ? (state.subtitles2.renderArtifactReady ? 'Tu video ya está listo. Descargalo manualmente cuando quieras.' : 'Render terminado, esperando disponibilidad del archivo final.')
        : (state.subtitles2.renderFailureReason || 'Estado final de render.');
    }
  }

  function renderSubtitles2Table() {
    if (!el.subtitle2RowsBody) return;
    const sizeOptions = SUBTITLE_SIZE_PRESETS;
    const fontOptions = SUBTITLE_FONT_PRESETS;
    const colorOptions = [
      { value: '#FFFFFF', label: 'Blanco' },
      { value: '#FFF000', label: 'Amarillo' },
      { value: '#00FF5A', label: 'Verde' },
      { value: '#0CC3F2', label: 'Celeste' },
    ];
    el.subtitle2RowsBody.innerHTML = buildSubtitlesTableRowsMarkupRuntime({
      rows: state.subtitles2.rows,
      sizeOptions,
      fontOptions,
      colorOptions,
      lastNonDraftRowIndex: getLastSubtitle2NonDraftRowIndex(),
      escapeHtml,
      formatDisplayTime: formatSubtitleDisplayTimeRuntime,
      getAlignmentButtonState,
      resolveFontWeight: resolveSubtitleFontWeight,
    });
    customDropdowns.refreshAll();
  }

  function updateSubtitle2ButtonsByPhase() {
    const current = state.subtitles2.machine.getPhase();
    const policy = getSubtitlesActionPolicy(current);
    const renderSucceeded = (state.subtitles2.renderStatus || '').toString().trim().toLowerCase() === 'succeeded';
    const hasDraft = hasSubtitle2DraftRows();
    if (el.subtitle2SaveBtn) el.subtitle2SaveBtn.disabled = !policy.canSave || !state.subtitles2.dirty || hasDraft;
    if (el.subtitle2ReadyBtn) el.subtitle2ReadyBtn.disabled = !policy.canReady || !state.subtitles2.sessionId || state.subtitles2.snapshotVersion < 1 || hasDraft;
    if (el.subtitle2DownloadBtn) el.subtitle2DownloadBtn.disabled = !policy.canDownload || !state.subtitles2.sessionId || !renderSucceeded || !state.subtitles2.renderArtifactReady;
    if (el.subtitle2AnotherVideoBtn) el.subtitle2AnotherVideoBtn.disabled = current !== 'Terminado';
  }

  async function refreshSubtitle2RemoteStatus() {
    try {
      const [health, sessions] = await Promise.all([ttsApi.getSubtitlesHealth(), ttsApi.listSubtitleSessions(20)]);
      state.subtitles2.serviceHealth = { status: (health?.status || 'online').toString(), message: 'Servicio remoto disponible.' };
      state.subtitles2.sessionHistory = Array.isArray(sessions?.items) ? sessions.items : [];
    } catch (error) {
      state.subtitles2.serviceHealth = { status: 'offline', message: getErrorMessage(error, 'No se pudo alcanzar el servicio remoto.') };
    }
    renderSubtitle2HealthBanner();
    renderSubtitle2SessionHistory();
  }

  async function hydrateSubtitle2Session(sessionId, { render = true } = {}) {
    const [detail, segments] = await Promise.all([ttsApi.getSubtitleSession(sessionId), ttsApi.getSubtitleSegments(sessionId)]);
    state.subtitles2.sessionId = sessionId;
    state.subtitles2.analyzeStatus = (detail?.status || 'editing').toString();
    state.subtitles2.renderStatus = (detail?.render?.status || detail?.render_status || '').toString();
    state.subtitles2.renderArtifactReady = Boolean(detail?.download?.ready);
    state.subtitles2.previewVideoUrl = buildSubtitlePreviewUrlRuntime(detail?.preview?.video_url || `/api/subtitles/sessions/${encodeURIComponent(sessionId)}/preview/video`, state.settings.ttsBaseUrl);
    await loadSubtitle2PreviewVideoBlob(sessionId);
    state.subtitles2.snapshotVersion = Number(segments?.version || 0);
    state.subtitles2.rows = mapRemoteSubtitleSegmentsToRowsRuntime({
      segments: segments?.segments || [],
      createRow: createEmptySubtitleRow,
      formatTime: formatSubtitleDisplayTimeRuntime,
      sizePresets: SUBTITLE_SIZE_PRESETS,
      fontPresets: SUBTITLE_FONT_PRESETS,
      colorPresets: SUBTITLE_COLOR_PRESETS,
    });
    state.subtitles2.audioDurationMs = Math.max(0, Number(detail?.preview?.duration_ms || 0)) || resolveSubtitle2PreviewDurationMs();
    const durationAdjusted = ensureSubtitle2RowsCoverDuration(state.subtitles2.audioDurationMs);
    state.subtitles2.savedVersion = state.subtitles2.changeVersion;
    state.subtitles2.dirty = durationAdjusted;
    if (render) renderSubtitles2Workflow();
    return detail;
  }

  function resetSubtitle2EditorForAnotherVideo() {
    resetSubtitles2RunState();
    if (el.subtitle2UploadInput) el.subtitle2UploadInput.value = '';
    renderSubtitles2Workflow();
    toast('Listo para subtitular otro video');
  }

  async function deleteSubtitle2HistorySession(sessionId) {
    const confirmed = windowRef.confirm(`¿Eliminar proyecto ${sessionId}? Esta acción no se puede deshacer.`);
    if (!confirmed) return;
    try {
      await ttsApi.deleteSubtitleSession(sessionId);
      state.subtitles2.sessionHistory = state.subtitles2.sessionHistory.filter((item) => item?.id !== sessionId);
      if (state.subtitles2.sessionId === sessionId) {
        resetSubtitles2RunState();
      }
      renderSubtitles2Workflow();
      await refreshSubtitle2RemoteStatus();
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

  async function renameSubtitle2HistorySession(sessionId, currentName = '') {
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
      renderSubtitle2SessionHistory();
      await refreshSubtitle2RemoteStatus();
      toast('Proyecto renombrado');
    } catch (error) {
      console.error(error);
      toast(getErrorMessage(error, 'No se pudo renombrar el proyecto'));
    }
  }


  return {
    pollRemoteSubtitleSessionStatus,
    pollRemoteSubtitleRenderStatus,
    stopPolling: stopSubtitle2Polling,
    resetRunState: resetSubtitles2RunState,
    renderWorkflow: renderSubtitles2Workflow,
    renderSessionHistory: renderSubtitle2SessionHistory,
    renderDoneCard: renderSubtitle2DoneCard,
    refreshRemoteStatus: refreshSubtitle2RemoteStatus,
    hydrateSession: hydrateSubtitle2Session,
    setPhaseFromRemoteStatus: setSubtitles2PhaseFromRemoteStatus,
    resetEditorForAnotherVideo: resetSubtitle2EditorForAnotherVideo,
    onUploadSelected: onSubtitle2UploadSelected,
    onSourceLanguageChanged: onSubtitle2SourceLanguageChanged,
    onSaveClicked: onSubtitle2SaveClicked,
    onReadyClicked: onSubtitle2ReadyClicked,
    onDownloadClicked: onSubtitle2DownloadClicked,
    onAddRowClicked: onSubtitle2AddRowClicked,
    onTableInput: onSubtitle2TableInput,
    onTableClick: onSubtitle2TableClick,
    onDraftDragStart: onSubtitle2DraftDragStart,
    onDraftDragOver: onSubtitle2DraftDragOver,
    onDraftDragLeave: onSubtitle2DraftDragLeave,
    onDraftDrop: onSubtitle2DraftDrop,
    onDraftDragEnd: onSubtitle2DraftDragEnd,
    onPreviewTimeUpdate: onSubtitle2PreviewTimeUpdate,
    onPreviewLoadedMetadata: onSubtitle2PreviewLoadedMetadata,
    onPreviewToggleClicked: onSubtitle2PreviewToggleClicked,
    onPreviewTimelineClick: onSubtitle2PreviewTimelineClick,
    onPreviewTimelineDragStart: onSubtitle2PreviewTimelineDragStart,
    renameHistorySession: renameSubtitle2HistorySession,
    deleteHistorySession: deleteSubtitle2HistorySession,
  };
}
