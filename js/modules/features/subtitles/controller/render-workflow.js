import {
  SUBTITLES_PHASES,
  SUBTITLE_FONT_PRESETS,
  SUBTITLE_SIZE_PRESETS,
  getAlignmentButtonState,
  getSubtitlesActionPolicy,
  getSubtitlesPhaseSectionVisibility,
  resolveSubtitleFontWeight,
} from '../../../subtitles-workflow.mjs';
import {
  buildGlobalRowMarkupRuntime,
  buildSubtitleHealthRuntime,
  buildSubtitleProcessingMessageRuntime,
  buildSubtitleSessionHistoryMarkupRuntime,
  buildSubtitlesTableRowsMarkupRuntime,
  createEmptySubtitleAnalyzeMetadata,
  describeSubtitleTranslationEngineRuntime,
  formatSubtitleDisplayTimeRuntime,
  normalizeSubtitleMetaValueRuntime,
  resolveSubtitleProgressPercentRuntime,
} from '../runtime/index.js';

const SUBTITLE_SOURCE_LANGUAGE_ALLOWED = new Set([
  'auto', 'es', 'en', 'fr', 'pt', 'de', 'it', 'nl', 'ca', 'pap', 'ko', 'ar', 'ber', 'cs', 'gd', 'tr', 'tzm', 'uz',
]);

const SUBTITLE_MARIAN_LANGS = new Set(['en', 'fr', 'de', 'it', 'nl', 'ca', 'pap', 'ko', 'ar', 'ber']);
const SUBTITLE_FALLBACK_LANGS = new Set(['pt', 'cs', 'gd', 'tr', 'tzm', 'uz']);

export function createSubtitleWorkflowRenderer(ctx, collaborators = {}) {
  const { state, el, helpers, customDropdowns } = ctx;
  const escapeHtml = helpers.escapeHtml;
  const hasDraftRows = collaborators.hasDraftRows || (() => false);
  const getLastNonDraftRowIndex = collaborators.getLastNonDraftRowIndex || (() => -1);
  const renderPreviewPlayer = collaborators.renderPreviewPlayer || (() => {});
  const renderPreviewOverlay = collaborators.renderPreviewOverlay || (() => {});

  function renderWorkflow() {
    renderHealthBanner();
    renderSessionHistory();
    renderPreviewPlayer();
    renderPreviewOverlay();
    renderPhaseBar();
    renderPhaseSections();
    renderSourceLanguagePicker();
    renderAnalyzeMeta();
    renderProcessingCard();
    renderDoneCard();
    renderTable();
    renderPresenceWarning();
    updateButtonsByPhase();
  }

  function renderHealthBanner() {
    if (!el.subtitle2ServiceHealthBanner) return;
    const resolved = buildSubtitleHealthRuntime(state.subtitles2.serviceHealth, 'remote-core');
    el.subtitle2ServiceHealthBanner.textContent = resolved.banner;
    el.subtitle2ServiceHealthBanner.classList.toggle('is-online', resolved.tone === 'online');
    el.subtitle2ServiceHealthBanner.classList.toggle('is-offline', resolved.tone !== 'online');
  }

  function renderSessionHistory() {
    if (!el.subtitle2SessionHistory) return;
    el.subtitle2SessionHistory.innerHTML = buildSubtitleSessionHistoryMarkupRuntime({
      items: state.subtitles2.sessionHistory,
      activeSessionId: state.subtitles2.sessionId,
      escapeHtml,
    });
  }

  function renderPhaseBar() {
    const current = state.subtitles2.machine.getPhase();
    const visibleCurrent = current === 'Procesando video' || current === 'Terminado' ? 'Edicion' : current;
    const currentIndex = SUBTITLES_PHASES.indexOf(visibleCurrent);
    el.subtitle2PhaseBar?.querySelectorAll('[data-phase]').forEach((node) => {
      const idx = SUBTITLES_PHASES.indexOf(node.dataset.phase);
      node.classList.toggle('active', idx === currentIndex);
      node.classList.toggle('done', idx > -1 && idx < currentIndex);
    });
  }

  function renderPhaseSections() {
    const visibility = getSubtitlesPhaseSectionVisibility(state.subtitles2.machine.getPhase());
    el.subtitle2PhaseUpload?.classList.toggle('hidden', !visibility.showUpload);
    el.subtitle2PhaseProcessing?.classList.toggle('hidden', !visibility.showProcessing);
    el.subtitle2PhaseEdition?.classList.toggle('hidden', !visibility.showEdition);
    el.subtitle2PhaseDone?.classList.toggle('hidden', !visibility.showDone);
  }

  function renderSourceLanguagePicker() {
    if (!el.subtitle2SourceLanguagePicker) return;
    const selected = (state.subtitles2.sourceLanguage || 'auto').toString().toLowerCase();
    el.subtitle2SourceLanguagePicker.value = SUBTITLE_SOURCE_LANGUAGE_ALLOWED.has(selected) ? selected : 'auto';
    customDropdowns.refreshAll();
    if (el.subtitle2SourceLanguageEngineHint) {
      el.subtitle2SourceLanguageEngineHint.textContent = describeSubtitleTranslationEngineRuntime(selected, SUBTITLE_MARIAN_LANGS, SUBTITLE_FALLBACK_LANGS);
    }
  }

  function renderAnalyzeMeta() {
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

  function renderProcessingCard() {
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

  function renderDoneCard() {
    const status = (state.subtitles2.renderStatus || '').toString().trim().toLowerCase();
    const progressPct = resolveSubtitleProgressPercentRuntime(state.subtitles2.renderProgressPct, state.subtitles2.renderStatus);
    const rendering = ['queued', 'processing', 'running', 'rendering'].includes(status);
    const failed = status === 'failed';
    const succeeded = status === 'succeeded';
    if (el.subtitle2DoneTitle) {
      el.subtitle2DoneTitle.textContent = rendering
        ? 'Renderizando video'
        : failed
          ? 'Render fallido'
          : succeeded
            ? 'Video listo'
            : 'Renderizar video';
    }
    if (el.subtitle2DoneMessage) {
      el.subtitle2DoneMessage.textContent = rendering
        ? `Estamos renderizando el video final… ${progressPct}%`
        : failed
          ? (state.subtitles2.renderFailureReason || 'El render remoto falló. Revisá los cambios y reintentá sin perder la edición.')
          : succeeded
            ? (state.subtitles2.renderArtifactReady
              ? 'Tu video ya está listo para descargar; podés seguir editando y renderizar de nuevo.'
              : 'Render terminado, esperando disponibilidad del archivo final. Podés seguir editando mientras tanto.')
            : 'Cuando la tabla esté lista, renderizá el video desde acá sin salir del editor.';
    }
    if (el.subtitle2ReadyBtn) {
      el.subtitle2ReadyBtn.textContent = failed
        ? 'Reintentar render'
        : succeeded
          ? 'Renderizar de nuevo'
          : 'Renderizar video';
    }
  }

  function renderTable() {
    if (!el.subtitle2RowsBody) return;
    const sizeOptions = SUBTITLE_SIZE_PRESETS;
    const fontOptions = SUBTITLE_FONT_PRESETS;
    const colorOptions = [
      { value: '#FFFFFF', label: 'Blanco' },
      { value: '#FFF000', label: 'Amarillo' },
      { value: '#00FF5A', label: 'Verde' },
      { value: '#0CC3F2', label: 'Celeste' },
    ];
    const firstRow = state.subtitles2.rows[0] || {};
    const globalValues = {
      size: firstRow.size || '110',
      maxWidthPx: firstRow.maxWidthPx || 1080,
      fontFamily: firstRow.fontFamily || 'Khand',
      color: firstRow.color || '#FFFFFF',
      align: firstRow.align || 'left',
      showStripes: firstRow.showStripes !== false,
    };
    const globalRowMarkup = buildGlobalRowMarkupRuntime({
      sizeOptions,
      fontOptions,
      colorOptions,
      escapeHtml,
      getAlignmentButtonState,
      resolveFontWeight: resolveSubtitleFontWeight,
      globalValues,
    });
    const rowsMarkup = buildSubtitlesTableRowsMarkupRuntime({
      rows: state.subtitles2.rows,
      sizeOptions,
      fontOptions,
      colorOptions,
      activeRowId: state.subtitles2.activeRowId || '',
      lastNonDraftRowIndex: getLastNonDraftRowIndex(),
      escapeHtml,
      formatDisplayTime: formatSubtitleDisplayTimeRuntime,
      getAlignmentButtonState,
      resolveFontWeight: resolveSubtitleFontWeight,
    });
    el.subtitle2RowsBody.innerHTML = globalRowMarkup + rowsMarkup;
    customDropdowns.refreshAll();
  }

  function renderPresenceWarning() {
    if (!el.subtitle2PresenceWarning) return;
    const warning = state.subtitles2.presenceWarning;
    el.subtitle2PresenceWarning.hidden = !warning?.message;
    el.subtitle2PresenceWarning.textContent = warning?.message || '';
  }

  function updateButtonsByPhase() {
    const current = state.subtitles2.machine.getPhase();
    const policy = getSubtitlesActionPolicy(current);
    const renderSucceeded = (state.subtitles2.renderStatus || '').toString().trim().toLowerCase() === 'succeeded';
    const renderInFlight = ['queued', 'processing', 'running', 'rendering'].includes((state.subtitles2.renderStatus || '').toString().trim().toLowerCase());
    const hasDraft = hasDraftRows();
    if (el.subtitle2SaveBtn) el.subtitle2SaveBtn.disabled = !policy.canSave || !state.subtitles2.dirty || hasDraft;
    if (el.subtitle2ReadyBtn) el.subtitle2ReadyBtn.disabled = !policy.canReady || renderInFlight || !state.subtitles2.sessionId || state.subtitles2.snapshotVersion < 1 || hasDraft;
    if (el.subtitle2DownloadBtn) el.subtitle2DownloadBtn.disabled = !policy.canDownload || !state.subtitles2.sessionId || !renderSucceeded || !state.subtitles2.renderArtifactReady;
    if (el.subtitle2AnotherVideoBtn) el.subtitle2AnotherVideoBtn.disabled = current !== 'Terminado';
  }

  return {
    renderWorkflow,
    renderHealthBanner,
    renderSessionHistory,
    renderPhaseBar,
    renderPhaseSections,
    renderSourceLanguagePicker,
    renderAnalyzeMeta,
    renderProcessingCard,
    renderDoneCard,
    renderTable,
    renderPresenceWarning,
    updateButtonsByPhase,
  };
}
