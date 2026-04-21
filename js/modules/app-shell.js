import {
  SUBTITLES_AUTOSAVE_INTERVAL_MS,
  SUBTITLES_POLL_INTERVAL_MS,
  SUBTITLES_PHASES,
  SUBTITLES_RENDER_WATCHDOG_MS,
  SUBTITLE_COLOR_PRESETS,
  SUBTITLE_FONT_PRESETS,
  SUBTITLE_SIZE_PRESETS,
  applySubtitleRowPatch,
  createDownloadActionPlan,
  createReadyActionPlan,
  createSaveActionPlan,
  createSnapshotSaveQueue,
  createEmptySubtitleRow,
  createSubtitlesWorkflowMachine,
  getAlignmentButtonState,
  getSubtitlesActionPolicy,
  getSubtitlesPhaseSectionVisibility,
  shouldFailRenderByWatchdog,
  shouldRunAutosave,
  shouldRunStatusPolling,
} from './subtitles-workflow.mjs';
import { renderToast } from './core/ui/toast.js';
import { escapeHtmlCore } from './core/ui/escape-html.js';
import { updateWordCounterCore } from './core/ui/word-count.js';
import { createCustomDropdownController } from './core/ui/custom-dropdowns.js';
import {
  defaultSettingsFactory,
  hydrateSettingsFormValues,
  loadSettingsFromStorage,
  saveSettingsToStorage,
} from './core/state/app-store.js';
import {
  clearSessionStatus,
  isValidCredentials,
  persistSessionStatus,
  readSessionStatus,
} from './core/auth/session-gate.js';
import { bindCoreEvents } from './core/bootstrap.js';
import { createSingleFlightRunner } from './core/async/single-flight.js';
import { createApprovalApiClient } from './core/http/approval-api.js';
import { createTtsApiClient } from './core/http/tts-api.js';
import {
  createApprovalFeature,
  orderApprovalItemsByLowestAvg,
  resolveApprovalSourceLink,
} from './features/approval/index.js';
import { buildApprovalNewsCardMarkup } from './features/approval/cards.js';
import { buildScriptSelectionCardMarkup, createScriptsFeature } from './features/scripts/index.js';
import { createAudioFeature } from './features/audio/index.js';
import { createSubtitlesFeature } from './features/subtitles/index.js';
import {
  createAudioRuntime,
  getAudioStatusClassRuntime,
  getAudioStatusLabelRuntime,
  isTerminalAudioStatus,
  normalizeAudioProgressPercent,
} from './features/audio/runtime/index.js';
import {
  buildSubtitleProcessingMessageRuntime,
  createSubtitlesRuntime,
  describeSubtitleTranslationEngineRuntime,
  extractSubtitleAnalyzeMetadataRuntime,
  extractSubtitleProgressPercentRuntime,
  formatSubtitleDisplayTimeRuntime,
  normalizeSubtitleMetaValueForStateRuntime,
  parseSubtitleTimeToMsRuntime,
  resolveSubtitleProgressPercentRuntime,
} from './features/subtitles/runtime/index.js';
import { getDomSelectors } from './shared/dom/selectors.js';

const storageKey = 'approval-panel-settings-v1';
const sessionKey = 'approval-panel-session-v1';

const AUTH_USER = 'paneladmin';
const AUTH_PASS = 'Guiones2026!';
const APPROVAL_AUTO_REFRESH_INTERVAL_MS = 15000;

function defaultSettings() {
  return defaultSettingsFactory();
}

const state = {
  settings: loadSettings(),
  items: [],
  queue: [],
  selectedCardId: null,
  selectedTopic: null,
  deletingSource: false,
  currentView: 'approval',
  scriptDrafts: [],
  selectedScript: null,
  savingScript: false,
  publishingScript: false,
  audioJobId: null,
  audioPollingTimer: null,
  audioPollingToken: null,
  audioPollingInFlight: false,
  audioPollingErrorStreak: 0,
  audioStreamController: null,
  audioRunning: false,
  audioJobs: {},
  audioJobOrder: [],
  dismissedAudioJobs: new Set(),
  audioQueueSyncTimer: null,
  audioQueueSyncInFlight: false,
  approvalAutoRefreshTimer: null,
  subtitles: {
    machine: createSubtitlesWorkflowMachine(),
    rows: [
      createEmptySubtitleRow({
        id: 'row-1',
        start: '00:00:01.000',
        end: '00:00:02.500',
        phrase: 'Texto inicial',
        size: SUBTITLE_SIZE_PRESETS[0],
        color: SUBTITLE_COLOR_PRESETS[0],
        align: 'left',
      }),
    ],
    selectedFileName: '',
    analysisJobId: null,
    renderJobId: null,
    analyzeStatus: null,
    renderStatus: null,
    analyzeProgressPct: null,
    renderProgressPct: null,
    renderArtifactReady: false,
    renderFailureReason: null,
    renderProcessingStartedAtMs: null,
    renderTerminalRefreshDone: false,
    audioDurationMs: null,
    snapshotVersion: 0,
    dirty: false,
    changeVersion: 0,
    savedVersion: 0,
    pollingTimer: null,
    pollingInFlight: false,
    autosaveTimer: null,
    saveQueue: createSnapshotSaveQueue({
      initialAckVersion: 0,
      persist: persistSubtitleSnapshotRequest,
    }),
    sourceLanguage: 'auto',
    analyzeMetadata: createEmptySubtitleAnalyzeMetadata(),
  },
};

const __testOverrides = {
  ttsGet: null,
  toast: null,
};

let toastTimer = null;

const customDropdowns = createCustomDropdownController({ root: document });

const SUBTITLE_SOURCE_LANGUAGE_ALLOWED = new Set([
  'auto',
  'es',
  'en',
  'fr',
  'pt',
  'de',
  'it',
  'nl',
  'ca',
  'pap',
  'ko',
  'ar',
  'ber',
  'cs',
  'gd',
  'tr',
  'tzm',
  'uz',
]);

const SUBTITLE_MARIAN_LANGS = new Set(['en', 'fr', 'de', 'it', 'nl', 'ca', 'pap', 'ko', 'ar', 'ber']);
const SUBTITLE_FALLBACK_LANGS = new Set(['pt', 'cs', 'gd', 'tr', 'tzm', 'uz']);

const el = getDomSelectors(document);

const store = {
  getState: () => state,
};

const approvalApi = createApprovalApiClient({
  getSettings: () => state.settings,
  fetchImpl: fetch,
});

const approvalFeature = createApprovalFeature({
  api: approvalApi,
  store,
  ui: { toast },
  selectors: el,
  callbacks: {
    renderStats,
    renderCountryFilter,
    renderCards,
    renderQueue,
    renderTopicDetail,
    refreshScriptDrafts,
    confirmDelete: (message) => window.confirm(message),
  },
  helpers: {
    getErrorMessage,
  },
});

const scriptsFeature = createScriptsFeature({
  api: approvalApi,
  store,
  ui: { toast },
  selectors: el,
  callbacks: {
    renderScriptStats,
    renderScriptCards,
    renderSelectedScriptEditor,
  },
});

const runQueueRefresh = createSingleFlightRunner((options) => approvalFeature.refreshQueue(options));
const runScriptDraftsRefresh = createSingleFlightRunner((options) => scriptsFeature.refreshScriptDrafts(options));

const ttsApi = createTtsApiClient({
  getSettings: () => state.settings,
  fetchImpl: fetch,
  btoaImpl: btoa,
});

const audioRuntime = createAudioRuntime({
  hooks: {
    runAudioGeneration,
    startAudioTracking,
    applyAudioJobStatus,
    startAudioStatusStream,
    startAudioPolling,
    stopAudioTracking,
    startAudioQueueSync,
    stopAudioQueueSync,
    syncAudioQueueStatuses,
    renderAudioQueue,
    downloadAudioJob,
    dismissAudioJob,
  },
});

const subtitlesRuntime = createSubtitlesRuntime({
  hooks: {
    onUploadSelected: onSubtitleUploadSelected,
    onSourceLanguageChanged: onSubtitleSourceLanguageChanged,
    onSaveClicked: onSubtitleSaveClicked,
    onReadyClicked: onSubtitleReadyClicked,
    onDownloadClicked: onSubtitleDownloadClicked,
    onTableInput: onSubtitleTableInput,
    onTableClick: onSubtitleTableClick,
    pollStatus: pollSubtitleStatus,
    renderWorkflow: renderSubtitlesWorkflow,
  },
});

const audioFeature = createAudioFeature({
  api: ttsApi,
  store,
  ui: { toast },
  selectors: el,
  handlers: {
    ...audioRuntime,
  },
});

const subtitlesFeature = createSubtitlesFeature({
  api: ttsApi,
  store,
  ui: { toast },
  selectors: el,
  handlers: {
    ...subtitlesRuntime,
  },
});

export function bootApp() {
  bootCompatibilityShell();
}

export function bootCompatibilityShell() {
  bindEvents();
  customDropdowns.mountAll();
  hydrateSettingsForm();
  if (el.runQueueBtn) {
    el.runQueueBtn.textContent = 'Actualizar cola';
  }
  renderSelectedScriptEditor();
  renderSubtitlesWorkflow();
  boot();
}

function boot() {
  const session = readSessionStatus({ storage: localStorage, sessionKey });
  if (session === 'ok') {
    el.authGate.classList.add('hidden');
    el.appShell.classList.remove('hidden');
    setView('approval');
    refreshAll();
    return;
  }
  el.authGate.classList.remove('hidden');
  el.appShell.classList.add('hidden');
}

function loadSettings() {
  return loadSettingsFromStorage({
    storage: localStorage,
    storageKey,
    defaultsFactory: defaultSettings,
  });
}

function saveSettings(next) {
  state.settings = saveSettingsToStorage({
    storage: localStorage,
    storageKey,
    nextSettings: next,
  });
}

function bindEvents() {
  bindCoreEvents({
    el,
    authUser: AUTH_USER,
    authPass: AUTH_PASS,
    isValidCredentials,
    persistSessionStatus: () => persistSessionStatus({ storage: localStorage, sessionKey }),
    clearSessionStatus: () => clearSessionStatus({ storage: localStorage, sessionKey }),
    setView,
    refreshAll,
    refreshQueue,
    runQueue,
    saveSettings,
    defaultSettings,
    toast,
    renderCards,
    reloadPage: () => location.reload(),
  });

  el.closeScriptEditor.addEventListener('click', () => {
    state.selectedScript = null;
    renderScriptCards();
    renderSelectedScriptEditor();
  });

  el.scriptEditedArea.addEventListener('input', () => {
    updateWordCounter(el.scriptEditedArea.value, el.scriptEditedWordCount);
  });

  el.viewOriginalBtn.addEventListener('click', () => {
    if (!state.selectedScript) return;
    el.scriptOriginalTitle.textContent = `${state.selectedScript.jugador || 'Sin jugador'} · ${state.selectedScript.tema_principal || 'Sin tema'} (original)`;
    el.scriptOriginalMeta.textContent = `Estado: ${state.selectedScript.estado || 'borrador_generado'}`;
    el.scriptOriginalArea.value = (state.selectedScript.guion_draft || '').toString();
    updateWordCounter(el.scriptOriginalArea.value, el.scriptOriginalWordCount);
    el.scriptOriginalDialog.showModal();
  });

  el.closeOriginalDialog.addEventListener('click', () => el.scriptOriginalDialog.close());

  el.cancelPublishBtn.addEventListener('click', () => el.publishConfirmDialog.close());
  el.confirmPublishBtn.addEventListener('click', publishSelectedScript);
  el.voiceAiBtn.addEventListener('click', () => {
    const text = (el.scriptEditedArea.value || '').trim();
    if (!text) {
      toast('No hay texto listo para enviar a Voz con IA');
      return;
    }
    el.audioTextArea.value = text;
    updateWordCounter(text, el.audioWordCount);
    setView('audio');
  });
  el.publishDraftBtn.addEventListener('click', () => {
    if (!state.selectedScript) return;
    el.publishConfirmDialog.showModal();
  });

  el.audioTextArea.addEventListener('input', () => {
    updateWordCounter(el.audioTextArea.value, el.audioWordCount);
  });

  el.audioClearBtn.addEventListener('click', () => {
    el.audioTextArea.value = '';
    updateWordCounter('', el.audioWordCount);
  });

  el.audioRunBtn.addEventListener('click', audioFeature.runAudioGeneration);

  el.subtitleUploadInput?.addEventListener('change', subtitlesFeature.onUploadSelected);
  el.subtitleSourceLanguagePicker?.addEventListener('change', subtitlesFeature.onSourceLanguageChanged);
  el.subtitleSaveBtn?.addEventListener('click', subtitlesFeature.onSaveClicked);
  el.subtitleReadyBtn?.addEventListener('click', subtitlesFeature.onReadyClicked);
  el.subtitleDownloadBtn?.addEventListener('click', subtitlesFeature.onDownloadClicked);
  el.subtitleRowsBody?.addEventListener('input', subtitlesFeature.onTableInput);
  el.subtitleRowsBody?.addEventListener('change', subtitlesFeature.onTableInput);
  el.subtitleRowsBody?.addEventListener('click', subtitlesFeature.onTableClick);

  el.audioQueueList?.addEventListener('click', async (ev) => {
    const button = ev.target.closest('button[data-action]');
    if (!button) return;

    const action = button.dataset.action;
    const jobId = (button.dataset.jobId || '').trim();
    if (!jobId) return;

    if (action === 'dismiss-audio-job') {
      audioFeature.dismissAudioJob(jobId);
      return;
    }

    if (action === 'download-audio-job') {
      await audioFeature.downloadAudioJob(jobId);
    }
  });

  el.dialogBody.addEventListener('click', async (ev) => {
    const actionBtn = ev.target.closest('button[data-action]');
    if (!actionBtn) return;

    const action = actionBtn.dataset.action;
    if (action === 'open-source') {
      const encodedUrl = actionBtn.dataset.url || actionBtn.dataset.link || '';
      const url = decodeURIComponent(encodedUrl);
      if (!url) return;
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }

    if (action === 'delete-source') {
      const index = Number(actionBtn.dataset.index || 0);
      const idNoticia = decodeURIComponent(actionBtn.dataset.idNoticia || '');
      const source = (state.selectedTopic?.sources || []).find((s) => {
        if (idNoticia) return (s.id_noticia || '').toString() === idNoticia;
        return Number(s.index) === index;
      });
      if (!source) return;
      await removeSourceFromTopic(source);
      return;
    }

    if (action === 'approve-source') {
      const idNoticia = decodeURIComponent(actionBtn.dataset.idNoticia || '');
      const source = (state.selectedTopic?.sources || []).find((s) => (s.id_noticia || '').toString() === idNoticia);
      if (!source) {
        toast('No encontré la noticia seleccionada. Actualizá y probá de nuevo.');
        return;
      }
      await approveSourceFromTopic(source);
    }
  });
}

function setView(view) {
  const requestedView = typeof view === 'string' ? view.trim() : '';
  const nextView = ['approval', 'audio', 'subtitulos'].includes(requestedView) ? requestedView : 'approval';

  state.currentView = nextView;
  ensureApprovalAutoRefresh();
  const isApproval = nextView === 'approval';
  const isScripts = nextView === 'scripts';
  const isAudio = nextView === 'audio';
  const isSubtitulos = nextView === 'subtitulos';
  el.viewApproval.classList.toggle('hidden', !isApproval);
  el.viewScripts.classList.toggle('hidden', !isScripts);
  el.viewAudio.classList.toggle('hidden', !isAudio);
  el.viewSubtitulos.classList.toggle('hidden', !isSubtitulos);
  el.sidebarNav.querySelectorAll('.nav-item').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === nextView);
  });

  if (isAudio && !state.audioPollingTimer && !state.audioStreamController) {
    const nextTrack = getLatestTrackedJobId();
    if (nextTrack) {
      audioFeature.startAudioTracking(nextTrack);
    }
  }

  if (isAudio) {
    audioFeature.startAudioQueueSync();
  } else {
    audioFeature.stopAudioQueueSync();
  }

  if (isSubtitulos) {
    renderSubtitlesWorkflow();
  }
}

async function onSubtitleUploadSelected() {
  const file = el.subtitleUploadInput?.files?.[0];
  if (!file) return;

  state.subtitles.selectedFileName = file.name;
  resetSubtitlesRunState();
  renderSubtitlesWorkflow();

  try {
    await startSubtitleAnalyze(file);
  } catch (err) {
    console.error(err);
    toast(getErrorMessage(err, 'Error iniciando análisis de subtítulos'));
    resetSubtitlesRunState();
    renderSubtitlesWorkflow();
  }
}

async function onSubtitleSaveClicked() {
  const phase = state.subtitles.machine.getPhase();
  const plan = createSaveActionPlan({
    phase,
    analysisJobId: state.subtitles.analysisJobId,
    snapshotVersion: state.subtitles.snapshotVersion,
  });

  if (!plan.allowed) {
    toast('Transición inválida: Guardar cambios solo en Edicion');
    return;
  }

  if (!state.subtitles.analysisJobId) {
    toast('No hay análisis activo para guardar');
    return;
  }

  if (!state.subtitles.dirty) {
    toast('No hay cambios para guardar');
    return;
  }

  try {
    await enqueueSubtitleSave('manual');
    toast('Cambios guardados');
  } catch (err) {
    console.error(err);
    toast(getErrorMessage(err, 'Error guardando subtítulos'));
  } finally {
    updateSubtitleButtonsByPhase();
  }
}

async function onSubtitleReadyClicked() {
  const phase = state.subtitles.machine.getPhase();
  const plan = createReadyActionPlan({
    phase,
    analysisJobId: state.subtitles.analysisJobId,
    snapshotVersion: state.subtitles.snapshotVersion,
  });

  if (!plan.allowed) {
    toast('Transición inválida: Listo solo en Edicion');
    return;
  }

  if (!state.subtitles.analysisJobId || state.subtitles.snapshotVersion < 1) {
    toast('Guardá un snapshot válido antes de continuar');
    return;
  }

  try {
    if (state.subtitles.dirty) {
      await enqueueSubtitleSave('manual');
    }

    await ttsPost('/api/subtitles/review/approve', {
      analysis_job_id: state.subtitles.analysisJobId,
      snapshot_version: state.subtitles.snapshotVersion,
    });

    const renderRequestId = `sub-render-${Date.now()}`;
    const renderResponse = await ttsPost('/api/subtitles/render', {
      analysis_job_id: state.subtitles.analysisJobId,
      snapshot_version: state.subtitles.snapshotVersion,
      request_id: renderRequestId,
      user_email: resolveSubtitlesUserEmail(),
    });

    const renderJobId = (renderResponse?.job_id || '').toString();
    if (!renderJobId) {
      throw new Error('Render no devolvió job_id');
    }

    state.subtitles.renderJobId = renderJobId;
    state.subtitles.renderStatus = (renderResponse?.status || 'queued').toString();
    state.subtitles.renderProgressPct = extractSubtitleProgressPercentRuntime(renderResponse);
    state.subtitles.renderArtifactReady = Boolean(renderResponse?.artifact?.ready);
    state.subtitles.renderFailureReason = null;
    state.subtitles.renderProcessingStartedAtMs = Date.now();
    state.subtitles.renderTerminalRefreshDone = false;

    if (state.subtitles.renderStatus === 'succeeded') {
      state.subtitles.renderProgressPct = 100;
      state.subtitles.renderArtifactReady = Boolean(renderResponse?.artifact?.ready);
      stopSubtitlePolling();
      transitionSubtitlesPhase('Terminado');
      renderSubtitleDoneCard();
      toast('Render terminado');
      return;
    }

    if (state.subtitles.renderStatus === 'failed') {
      const errorMessage = renderResponse?.error?.message || 'El render falló';
      state.subtitles.renderFailureReason = errorMessage;
      state.subtitles.renderArtifactReady = false;
      transitionSubtitlesPhase('Terminado');
      renderSubtitleDoneCard();
      toast(errorMessage);
      return;
    }

    transitionSubtitlesPhase('Procesando video');
    startSubtitlePolling({ kind: 'render', jobId: renderJobId });
    toast('Render iniciado');
  } catch (err) {
    console.error(err);
    toast(getErrorMessage(err, 'Error iniciando render'));
  } finally {
    updateSubtitleButtonsByPhase();
  }
}

async function onSubtitleDownloadClicked() {
  const phase = state.subtitles.machine.getPhase();
  const plan = createDownloadActionPlan({
    phase,
    renderJobId: state.subtitles.renderJobId,
  });

  if (!plan.allowed) {
    toast('Transición inválida: Descargar video solo en Terminado');
    return;
  }

  try {
    const blob = await ttsGetBlob(plan.path);
    downloadBlob(blob, `${state.subtitles.renderJobId || 'subtitulos-final'}.mp4`);
    toast('Descarga iniciada');
  } catch (err) {
    console.error(err);
    toast(getErrorMessage(err, 'Error descargando video'));
  }
}

function onSubtitleTableInput(ev) {
  const target = ev.target;
  if (!target) return;
  const rowId = target.dataset.rowId;
  if (!rowId) return;

  if (target.dataset.field === 'phrase') {
    patchSubtitleRow(rowId, { phrase: target.value }, { rerender: false });
    return;
  }
  if (target.dataset.field === 'size') {
    patchSubtitleRow(rowId, { size: target.value });
    return;
  }
  if (target.dataset.field === 'color') {
    patchSubtitleRow(rowId, { color: target.value });
    return;
  }
  if (target.dataset.field === 'fontFamily') {
    patchSubtitleRow(rowId, { fontFamily: target.value });
  }
}

function onSubtitleTableClick(ev) {
  const button = ev.target.closest('button[data-field="align"]');
  if (!button) return;
  const rowId = button.dataset.rowId;
  const align = button.dataset.align;
  if (!rowId || !align) return;

  patchSubtitleRow(rowId, { align });
}

function onSubtitleSourceLanguageChanged(ev) {
  const requestedLanguage = (ev.target?.value || 'auto').toString().trim().toLowerCase();
  if (!SUBTITLE_SOURCE_LANGUAGE_ALLOWED.has(requestedLanguage)) return;

  state.subtitles.sourceLanguage = requestedLanguage;
  renderSubtitleSourceLanguagePicker();
}

function patchSubtitleRow(rowId, patch, options = {}) {
  const rerender = options.rerender !== false;
  state.subtitles.rows = state.subtitles.rows.map((row) => {
    if (row.id !== rowId) return row;
    return applySubtitleRowPatch(row, patch);
  });
  state.subtitles.changeVersion += 1;
  state.subtitles.dirty = true;
  if (rerender) {
    renderSubtitlesTable();
  }
  updateSubtitleButtonsByPhase();
  syncSubtitleAutosaveTimer();
}

function transitionSubtitlesPhase(nextPhase) {
  const moved = state.subtitles.machine.transition(nextPhase);
  if (!moved) {
    const current = state.subtitles.machine.getPhase();
    toast(`Transición inválida: ${current} → ${nextPhase}`);
    return false;
  }
  renderSubtitlesWorkflow();
  return true;
}

function renderSubtitlesWorkflow() {
  renderSubtitlesPhaseBar();
  renderSubtitlesPhaseSections();
  renderSubtitleSourceLanguagePicker();
  renderSubtitleAnalyzeMeta();
  renderSubtitleProcessingCard();
  renderSubtitleDoneCard();
  renderSubtitlesTable();
  updateSubtitleUploadMeta();
  updateSubtitleButtonsByPhase();
  syncSubtitleAutosaveTimer();
}

function renderSubtitleDoneCard() {
  const status = (state.subtitles.renderStatus || '').toString().trim().toLowerCase();
  const isSucceeded = status === 'succeeded';
  const isFailed = status === 'failed';

  if (el.subtitleDoneTitle) {
    el.subtitleDoneTitle.textContent = isSucceeded ? 'Video listo' : 'Render fallido';
  }

  if (el.subtitleDoneMessage) {
    if (isSucceeded) {
      el.subtitleDoneMessage.textContent = state.subtitles.renderArtifactReady
        ? 'Tu video ya está listo. Descargalo manualmente cuando quieras.'
        : 'Render terminado, esperando disponibilidad del archivo final.';
    } else if (isFailed) {
      el.subtitleDoneMessage.textContent = state.subtitles.renderFailureReason || 'El render terminó con error. Revisá el motivo y reintentá.';
    } else {
      el.subtitleDoneMessage.textContent = 'Estado final de render.';
    }
  }
}

function renderSubtitleSourceLanguagePicker() {
  if (!el.subtitleSourceLanguagePicker) return;
  const selected = (state.subtitles.sourceLanguage || 'auto').toString().toLowerCase();
  el.subtitleSourceLanguagePicker.value = SUBTITLE_SOURCE_LANGUAGE_ALLOWED.has(selected) ? selected : 'auto';
  customDropdowns.refreshAll();

  if (el.subtitleSourceLanguageEngineHint) {
    el.subtitleSourceLanguageEngineHint.textContent = describeSubtitleTranslationEngineRuntime(
      selected,
      SUBTITLE_MARIAN_LANGS,
      SUBTITLE_FALLBACK_LANGS,
    );
  }
}

function renderSubtitleAnalyzeMeta() {
  if (!el.subtitleAnalyzeMeta) return;

  const metadata = state.subtitles.analyzeMetadata || createEmptySubtitleAnalyzeMetadata();
  const requested = normalizeSubtitleMetaValue(metadata.sourceLanguageRequested);
  const effective = normalizeSubtitleMetaValue(metadata.sourceLanguageEffective);
  const detected = normalizeSubtitleMetaValue(metadata.detectedLanguage);
  const asrModel = normalizeSubtitleMetaValue(metadata.asrModel);
  const mtModel = normalizeSubtitleMetaValue(metadata.mtModel);

  if (el.subtitleMetaRequested) el.subtitleMetaRequested.textContent = requested;
  if (el.subtitleMetaEffective) el.subtitleMetaEffective.textContent = effective;
  if (el.subtitleMetaDetected) el.subtitleMetaDetected.textContent = detected;
  if (el.subtitleMetaAsrModel) el.subtitleMetaAsrModel.textContent = asrModel;
  if (el.subtitleMetaMtModel) el.subtitleMetaMtModel.textContent = mtModel;

  const hasAnyMetadata = [requested, effective, detected, asrModel, mtModel].some((value) => value !== '—');
  el.subtitleAnalyzeMeta.classList.toggle('hidden', !hasAnyMetadata);
}

function renderSubtitlesPhaseSections() {
  const current = state.subtitles.machine.getPhase();
  const visibility = getSubtitlesPhaseSectionVisibility(current);
  el.subtitlePhaseUpload?.classList.toggle('hidden', !visibility.showUpload);
  el.subtitlePhaseProcessing?.classList.toggle('hidden', !visibility.showProcessing);
  el.subtitlePhaseEdition?.classList.toggle('hidden', !visibility.showEdition);
  el.subtitlePhaseDone?.classList.toggle('hidden', !visibility.showDone);
}

function renderSubtitleProcessingCard() {
  const phase = state.subtitles.machine.getPhase();
  const details = getSubtitleProcessingDetails(phase);

  if (el.subtitleProcessingIcon) {
    el.subtitleProcessingIcon.textContent = details.icon;
  }
  if (el.subtitleProcessingTitle) {
    el.subtitleProcessingTitle.textContent = details.title;
  }
  if (el.subtitleProcessingMessage) {
    el.subtitleProcessingMessage.textContent = details.message;
  }

  const percent = details.percent;
  if (el.subtitleProgressFill) {
    el.subtitleProgressFill.style.width = `${percent}%`;
    const progressbar = el.subtitleProgressFill.closest('[role="progressbar"]');
    progressbar?.setAttribute('aria-valuenow', `${percent}`);
  }
  if (el.subtitleProgressPercent) {
    el.subtitleProgressPercent.textContent = `${percent}%`;
  }
}

function getSubtitleProcessingDetails(phase) {
  if (phase === 'Procesando video') {
    const status = state.subtitles.renderStatus;
    const percent = resolveSubtitleProgressPercentRuntime(state.subtitles.renderProgressPct, status);
    return {
      icon: '🎬',
      title: 'Procesando video',
      message: buildSubtitleProcessingMessageRuntime(status, 'Estamos renderizando el video final…'),
      percent,
    };
  }

  const status = state.subtitles.analyzeStatus;
  const percent = resolveSubtitleProgressPercentRuntime(state.subtitles.analyzeProgressPct, status);
  return {
    icon: '🎧',
    title: 'Procesando audio',
    message: buildSubtitleProcessingMessageRuntime(status, 'Estamos analizando el audio…'),
    percent,
  };
}


function renderSubtitlesPhaseBar() {
  const current = state.subtitles.machine.getPhase();
  const currentIndex = SUBTITLES_PHASES.indexOf(current);
  el.subtitlePhaseBar?.querySelectorAll('[data-phase]').forEach((node) => {
    const phase = node.dataset.phase;
    const idx = SUBTITLES_PHASES.indexOf(phase);
    node.classList.toggle('active', idx === currentIndex);
    node.classList.toggle('done', idx > -1 && idx < currentIndex);
  });
}

function renderSubtitlesTable() {
  if (!el.subtitleRowsBody) return;

  const sizeOptions = SUBTITLE_SIZE_PRESETS;
  const fontOptions = SUBTITLE_FONT_PRESETS;
  const colorOptions = [
    { value: '#FFFFFF', label: 'Blanco' },
    { value: '#FFF000', label: 'Amarillo' },
    { value: '#00FF5A', label: 'Verde' },
    { value: '#0CC3F2', label: 'Celeste' },
  ];

  el.subtitleRowsBody.innerHTML = state.subtitles.rows.map((row) => {
    const alignment = getAlignmentButtonState(row.align);
    const startDisplay = formatSubtitleDisplayTimeRuntime(row.start);
    const endDisplay = formatSubtitleDisplayTimeRuntime(row.end);
    const sizeSelectOptions = renderSubtitleSelectOptions(sizeOptions, row.size);
    const fontSelectOptions = renderSubtitleSelectOptions(fontOptions, row.fontFamily);
    const colorSelectOptions = renderSubtitleSelectOptions(colorOptions, row.color);
    return `
      <tr>
        <td><span class="subtitle-time-pill">${escapeHtml(startDisplay)}</span></td>
        <td><span class="subtitle-time-pill">${escapeHtml(endDisplay)}</span></td>
        <td><textarea data-row-id="${row.id}" data-field="phrase" style="font-family:${escapeHtml(row.fontFamily)};">${escapeHtml(row.phrase)}</textarea></td>
        <td>
          <select data-row-id="${row.id}" data-field="size">
            ${sizeSelectOptions}
          </select>
        </td>
        <td>
          <select data-row-id="${row.id}" data-field="fontFamily">
            ${fontSelectOptions}
          </select>
        </td>
        <td>
          <select data-row-id="${row.id}" data-field="color">
            ${colorSelectOptions}
          </select>
        </td>
        <td>
          <div class="subtitle-align-group">
            <button type="button" data-row-id="${row.id}" data-field="align" data-align="left" class="${alignment.left.className}" aria-pressed="${alignment.left.selected}">Izq</button>
            <button type="button" data-row-id="${row.id}" data-field="align" data-align="center" class="${alignment.center.className}" aria-pressed="${alignment.center.selected}">Centro</button>
            <button type="button" data-row-id="${row.id}" data-field="align" data-align="right" class="${alignment.right.className}" aria-pressed="${alignment.right.selected}">Der</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  customDropdowns.refreshAll();
}

function renderSubtitleSelectOptions(options, selectedValue) {
  const selected = (selectedValue || '').toString();
  const normalized = options.map((option) => {
    if (typeof option === 'string') {
      return { value: option, label: option };
    }
    return {
      value: (option?.value || '').toString(),
      label: (option?.label || option?.value || '').toString(),
    };
  });

  if (selected && !normalized.some((option) => option.value === selected)) {
    normalized.push({ value: selected, label: selected });
  }

  return normalized
    .map((option) => {
      const isSelected = option.value === selected;
      return `<option value="${escapeHtml(option.value)}"${isSelected ? ' selected' : ''}>${escapeHtml(option.label)}</option>`;
    })
    .join('');
}

function updateSubtitleUploadMeta() {
  if (!el.subtitleUploadMeta) return;
  const current = state.subtitles.machine.getPhase();
  if (!state.subtitles.selectedFileName) {
    el.subtitleUploadMeta.textContent = `Esperando archivo. Fase: ${current}.`;
    return;
  }

  const jobInfo = state.subtitles.renderJobId || state.subtitles.analysisJobId;
  const suffix = jobInfo ? ` · Job: ${jobInfo}` : '';
  el.subtitleUploadMeta.textContent = `Archivo: ${state.subtitles.selectedFileName} · Fase: ${current}${suffix}.`;
}

function updateSubtitleButtonsByPhase() {
  const current = state.subtitles.machine.getPhase();
  const policy = getSubtitlesActionPolicy(current);
  const renderSucceeded = (state.subtitles.renderStatus || '').toString().trim().toLowerCase() === 'succeeded';
  if (el.subtitleSaveBtn) el.subtitleSaveBtn.disabled = !policy.canSave || !state.subtitles.dirty;
  if (el.subtitleReadyBtn) {
    el.subtitleReadyBtn.disabled = !policy.canReady || !state.subtitles.analysisJobId || state.subtitles.snapshotVersion < 1;
  }
  if (el.subtitleDownloadBtn) {
    el.subtitleDownloadBtn.disabled = !policy.canDownload || !state.subtitles.renderJobId || !renderSucceeded || !state.subtitles.renderArtifactReady;
  }
}

function resetSubtitlesRunState() {
  state.subtitles.machine.reset();
  stopSubtitlePolling();
  stopSubtitleAutosave();
  state.subtitles.analysisJobId = null;
  state.subtitles.renderJobId = null;
  state.subtitles.analyzeStatus = null;
  state.subtitles.renderStatus = null;
  state.subtitles.analyzeProgressPct = null;
  state.subtitles.renderProgressPct = null;
  state.subtitles.renderArtifactReady = false;
  state.subtitles.renderFailureReason = null;
  state.subtitles.renderProcessingStartedAtMs = null;
  state.subtitles.renderTerminalRefreshDone = false;
  state.subtitles.audioDurationMs = null;
  state.subtitles.snapshotVersion = 0;
  state.subtitles.dirty = false;
  state.subtitles.changeVersion = 0;
  state.subtitles.savedVersion = 0;
  state.subtitles.saveQueue.setAckVersion(0);
  state.subtitles.analyzeMetadata = createEmptySubtitleAnalyzeMetadata();
}

async function startSubtitleAnalyze(file) {
  const form = new FormData();
  form.append('file', file);
  form.append('source_language', state.subtitles.sourceLanguage || 'auto');
  form.append('target_language', 'es');
  form.append('request_id', `sub-analyze-${Date.now()}`);
  form.append('user_email', resolveSubtitlesUserEmail());

  const response = await ttsPostForm('/api/subtitles/analyze', form);
  const analyzeJobId = (response?.job_id || '').toString();
  if (!analyzeJobId) {
    throw new Error('Analyze no devolvió job_id');
  }

  state.subtitles.analysisJobId = analyzeJobId;
  state.subtitles.analyzeStatus = (response?.status || 'queued').toString();
  applySubtitleAnalyzeMetadata(response, { source_language_requested: state.subtitles.sourceLanguage || 'auto' });
  transitionSubtitlesPhase('Procesando audio');
  startSubtitlePolling({ kind: 'analyze', jobId: analyzeJobId });
}

function startSubtitlePolling({ kind, jobId }) {
  stopSubtitlePolling();
  state.subtitles.pollingInFlight = false;
  const run = () => pollSubtitleStatus(kind, jobId);
  void run();
  state.subtitles.pollingTimer = setInterval(run, SUBTITLES_POLL_INTERVAL_MS);
}

function stopSubtitlePolling() {
  if (state.subtitles.pollingTimer) {
    clearInterval(state.subtitles.pollingTimer);
    state.subtitles.pollingTimer = null;
  }
}

async function pollSubtitleStatus(kind, jobId) {
  if (state.subtitles.pollingInFlight) return;
  const phase = state.subtitles.machine.getPhase();
  const jobStatus = kind === 'render' ? state.subtitles.renderStatus : state.subtitles.analyzeStatus;
  if (kind === 'render' && shouldFailRenderByWatchdog({
    phase,
    jobStatus,
    processingStartedAtMs: state.subtitles.renderProcessingStartedAtMs,
    nowMs: Date.now(),
    watchdogMs: SUBTITLES_RENDER_WATCHDOG_MS,
  })) {
    stopSubtitlePolling();
    state.subtitles.renderStatus = 'failed';
    state.subtitles.renderArtifactReady = false;
    state.subtitles.renderFailureReason = 'render_watchdog_timeout';
    transitionSubtitlesPhase('Terminado');
    renderSubtitleDoneCard();
    __emitToast('render_watchdog_timeout');
    updateSubtitleButtonsByPhase();
    return;
  }

  const allowTerminalRefresh = kind === 'render'
    && (jobStatus || '').toString().trim().toLowerCase() === 'succeeded'
    && !state.subtitles.renderArtifactReady
    && !state.subtitles.renderTerminalRefreshDone;
  if (!shouldRunStatusPolling({ phase, jobStatus })) {
    if (allowTerminalRefresh) {
      state.subtitles.renderTerminalRefreshDone = true;
    } else {
      stopSubtitlePolling();
      return;
    }
  }

  state.subtitles.pollingInFlight = true;
  try {
    const path = kind === 'render'
      ? `/api/subtitles/render/${jobId}`
      : `/api/subtitles/analyze/${jobId}`;
    const status = await __resolveTtsGet()(path);
    const nextStatus = (status?.status || '').toString();

    if (kind === 'analyze') {
      state.subtitles.analyzeStatus = nextStatus;
      state.subtitles.analyzeProgressPct = extractSubtitleProgressPercentRuntime(status);
      applySubtitleAnalyzeMetadata(status);
      if (Number.isInteger(status?.snapshot_version)) {
        state.subtitles.snapshotVersion = Number(status.snapshot_version);
        state.subtitles.saveQueue.setAckVersion(state.subtitles.snapshotVersion);
      }

      if (nextStatus === 'succeeded') {
        await hydrateSubtitlesFromLatestSnapshot();
        transitionSubtitlesPhase('Edicion');
        stopSubtitlePolling();
      }
      if (nextStatus === 'failed') {
        stopSubtitlePolling();
        const errorMessage = status?.error?.message || 'El análisis falló';
        __emitToast(errorMessage);
      }
    } else {
      state.subtitles.renderStatus = nextStatus;
      state.subtitles.renderProgressPct = extractSubtitleProgressPercentRuntime(status);
      state.subtitles.renderArtifactReady = Boolean(status?.artifact?.ready);
      if (nextStatus === 'processing' || nextStatus === 'queued' || nextStatus === 'running') {
        if (!Number.isFinite(Number(state.subtitles.renderProcessingStartedAtMs))) {
          state.subtitles.renderProcessingStartedAtMs = Date.now();
        }
      }
      if (nextStatus === 'succeeded') {
        transitionSubtitlesPhase('Terminado');
        renderSubtitleDoneCard();
        if (state.subtitles.renderArtifactReady) {
          stopSubtitlePolling();
        } else {
          // Keep one terminal refresh cycle available when artifact isn't ready yet.
        }
      }
      if (nextStatus === 'failed') {
        stopSubtitlePolling();
        const errorMessage = status?.error?.message || 'El render falló';
        state.subtitles.renderFailureReason = errorMessage;
        transitionSubtitlesPhase('Terminado');
        renderSubtitleDoneCard();
        __emitToast(errorMessage);
      }

      const terminalSucceededReady = (state.subtitles.renderStatus || '').toString().trim().toLowerCase() === 'succeeded'
        && state.subtitles.renderArtifactReady;
      if (terminalSucceededReady) {
        stopSubtitlePolling();
      }
    }
  } catch (err) {
    console.error(err);
  } finally {
    state.subtitles.pollingInFlight = false;
    const terminalReady = kind === 'render'
      && state.subtitles.machine.getPhase() === 'Terminado'
      && (state.subtitles.renderStatus || '').toString().trim().toLowerCase() === 'succeeded'
      && state.subtitles.renderArtifactReady;
    if (terminalReady && state.subtitles.pollingTimer) {
      clearInterval(state.subtitles.pollingTimer);
      state.subtitles.pollingTimer = null;
    }
    renderSubtitleAnalyzeMeta();
    renderSubtitleProcessingCard();
    updateSubtitleButtonsByPhase();
    updateSubtitleUploadMeta();
  }
}

async function hydrateSubtitlesFromLatestSnapshot() {
  if (!state.subtitles.analysisJobId) return;
  try {
    const latest = await ttsGet(`/api/subtitles/review/snapshots/${state.subtitles.analysisJobId}/latest`);
    const snapshotVersion = Number(latest?.snapshot_version || 0);
    state.subtitles.snapshotVersion = snapshotVersion;
    state.subtitles.saveQueue.setAckVersion(snapshotVersion);

    const latestAudioDuration = Number(latest?.snapshot_json?.audio_duration_ms || 0);
    state.subtitles.audioDurationMs = Number.isFinite(latestAudioDuration) && latestAudioDuration > 0
      ? Math.round(latestAudioDuration)
      : null;

    const rows = mapSnapshotToRows(latest?.snapshot_json);
    if (rows.length > 0) {
      state.subtitles.rows = rows;
    }

    if (!state.subtitles.audioDurationMs || state.subtitles.audioDurationMs <= 0) {
      const derived = deriveAudioDurationFromRows();
      state.subtitles.audioDurationMs = derived > 0 ? derived : null;
    }

    state.subtitles.savedVersion = state.subtitles.changeVersion;
    state.subtitles.dirty = false;
  } catch {
    // Snapshot may not exist yet; keep local seed row.
  }
}

function syncSubtitleAutosaveTimer() {
  const phase = state.subtitles.machine.getPhase();
  if (shouldRunAutosave({ phase, dirty: state.subtitles.dirty })) {
    if (!state.subtitles.autosaveTimer) {
      state.subtitles.autosaveTimer = setInterval(() => {
        void maybeAutosaveSubtitles();
      }, SUBTITLES_AUTOSAVE_INTERVAL_MS);
    }
    return;
  }
  stopSubtitleAutosave();
}

function stopSubtitleAutosave() {
  if (state.subtitles.autosaveTimer) {
    clearInterval(state.subtitles.autosaveTimer);
    state.subtitles.autosaveTimer = null;
  }
}

async function maybeAutosaveSubtitles() {
  if (!state.subtitles.analysisJobId) return;
  if (!shouldRunAutosave({ phase: state.subtitles.machine.getPhase(), dirty: state.subtitles.dirty })) return;
  try {
    await enqueueSubtitleSave('auto');
  } catch (err) {
    console.error(err);
  }
}

async function enqueueSubtitleSave(saveMode) {
  if (!state.subtitles.analysisJobId) {
    throw new Error('No hay análisis activo para guardar');
  }

  const revision = state.subtitles.changeVersion;
  const snapshotJson = collectCurrentSubtitlesSnapshot();

  const result = await state.subtitles.saveQueue.enqueue({
    analysisJobId: state.subtitles.analysisJobId,
    snapshotJson,
    saveMode,
  });

  state.subtitles.snapshotVersion = result.ackVersion;
  state.subtitles.saveQueue.setAckVersion(result.ackVersion);
  state.subtitles.savedVersion = Math.max(state.subtitles.savedVersion, revision);
  state.subtitles.dirty = state.subtitles.savedVersion < state.subtitles.changeVersion;
  syncSubtitleAutosaveTimer();
  return result;
}

function collectCurrentSubtitlesSnapshot() {
  const audioDurationMs = resolveCurrentSnapshotAudioDurationMs();
  return {
    audio_duration_ms: audioDurationMs,
    segments: state.subtitles.rows.map((row, index) => ({
      segment_id: row.id || `segment-${index + 1}`,
      start_ms: parseSubtitleTimeToMsRuntime(row.start),
      end_ms: parseSubtitleTimeToMsRuntime(row.end),
      source_text: row.sourceText,
      translated_text_es: row.phrase,
      translated_text: row.phrase,
      text: row.phrase,
      style: {
        font_size: row.size,
        font_family: row.fontFamily,
        color: row.color,
        align: row.align,
      },
    })),
  };
}

function mapSnapshotToRows(snapshotJson) {
  const segments = Array.isArray(snapshotJson?.segments) ? snapshotJson.segments : [];
  return segments.map((segment, index) => createEmptySubtitleRow({
    id: (segment?.segment_id || `row-${index + 1}`).toString(),
    start: formatSubtitleDisplayTimeRuntime(segment?.start ?? segment?.start_ms ?? '00:00.00'),
    end: formatSubtitleDisplayTimeRuntime(segment?.end ?? segment?.end_ms ?? '00:02.00'),
    sourceText: (segment?.source_text || '').toString(),
    phrase: (segment?.translated_text_es || segment?.translated_text || segment?.text || '').toString(),
    size: (segment?.style?.font_size || SUBTITLE_SIZE_PRESETS[0]).toString(),
    fontFamily: (segment?.style?.font_family || SUBTITLE_FONT_PRESETS[0]).toString(),
    color: (segment?.style?.color || SUBTITLE_COLOR_PRESETS[0]).toString(),
    align: (segment?.style?.align || 'left').toString(),
  }));
}

function deriveAudioDurationFromRows() {
  if (!Array.isArray(state.subtitles.rows) || state.subtitles.rows.length === 0) return 0;
  let maxEndMs = 0;
  for (const row of state.subtitles.rows) {
    const endMs = parseSubtitleTimeToMsRuntime(row?.end);
    if (Number.isFinite(endMs) && endMs > maxEndMs) {
      maxEndMs = endMs;
    }
  }
  return Math.max(0, Math.round(maxEndMs));
}

function resolveCurrentSnapshotAudioDurationMs() {
  const declared = Number(state.subtitles.audioDurationMs || 0);
  const timeline = deriveAudioDurationFromRows();
  return Math.max(0, Math.round(Math.max(declared, timeline)));
}

function resolveSubtitlesUserEmail() {
  const configured = (state.settings.ttsUserEmail || '').trim();
  return configured || 'reviewer@example.com';
}

function createEmptySubtitleAnalyzeMetadata() {
  return {
    sourceLanguageRequested: null,
    sourceLanguageEffective: null,
    detectedLanguage: null,
    asrModel: null,
    mtModel: null,
  };
}

function applySubtitleAnalyzeMetadata(payload, fallback = null) {
  const extracted = extractSubtitleAnalyzeMetadataRuntime(payload);
  const fallbackExtracted = extractSubtitleAnalyzeMetadataRuntime(fallback);
  const current = state.subtitles.analyzeMetadata || createEmptySubtitleAnalyzeMetadata();
  state.subtitles.analyzeMetadata = {
    sourceLanguageRequested: extracted.sourceLanguageRequested || fallbackExtracted.sourceLanguageRequested || current.sourceLanguageRequested,
    sourceLanguageEffective: extracted.sourceLanguageEffective || fallbackExtracted.sourceLanguageEffective || current.sourceLanguageEffective,
    detectedLanguage: extracted.detectedLanguage || fallbackExtracted.detectedLanguage || current.detectedLanguage,
    asrModel: extracted.asrModel || fallbackExtracted.asrModel || current.asrModel,
    mtModel: extracted.mtModel || fallbackExtracted.mtModel || current.mtModel,
  };
}

function normalizeSubtitleMetaValue(value) {
  if (value == null) return '—';
  const text = value.toString().trim();
  return text || '—';
}

async function persistSubtitleSnapshotRequest(payload) {
  const response = await ttsPost('/api/subtitles/review/snapshots', payload);
  return {
    snapshot_version: Number(response?.snapshot_version || 0),
  };
}

function hydrateSettingsForm() {
  hydrateSettingsFormValues({ el, settings: state.settings });
}

async function refreshAll() {
  await Promise.all([refreshPending(), refreshQueue(), refreshScriptDrafts()]);
}

async function refreshPending() {
  await approvalFeature.refreshPending();
}

async function refreshQueue(options = {}) {
  await runQueueRefresh(options);
}

async function refreshScriptDrafts(options = {}) {
  await runScriptDraftsRefresh(options);
}

function ensureApprovalAutoRefresh() {
  if (state.approvalAutoRefreshTimer) return;

  const run = () => {
    void refreshApprovalMonitorData();
  };

  state.approvalAutoRefreshTimer = setInterval(run, APPROVAL_AUTO_REFRESH_INTERVAL_MS);
}

async function refreshApprovalMonitorData() {
  await Promise.allSettled([
    refreshQueue({ silent: true }),
    refreshScriptDrafts({ silent: true }),
  ]);
}

async function runAudioGeneration() {
  if (state.audioRunning) return;

  const ttsBaseUrl = (state.settings.ttsBaseUrl || '').trim();
  const ttsApiKey = (state.settings.ttsApiKey || '').trim();
  if (!ttsBaseUrl) {
    toast('Configurá Base URL Audio API antes de ejecutar');
    return;
  }
  if (!ttsApiKey) {
    toast('Configurá x-api-key Audio API antes de ejecutar');
    return;
  }

  const text = el.audioTextArea.value.trim();
  if (text.length < 20) {
    toast('El texto es demasiado corto para generar audio');
    return;
  }

  const preset = (el.audioPresetSelect.value || 'balanced_default').trim();
  const requestId = `ui-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    state.audioRunning = true;
    state.audioPollingErrorStreak = 0;
    el.audioRunBtn.disabled = true;

    const data = await ttsPost('/api/tts/jobs', {
      text,
      voice_profile: preset,
      request_id: requestId,
      title: 'manual-ui',
    });

    state.audioJobId = data.job_id;
    ensureAudioJob(data.job_id, {
      status: data.status || 'queued',
      progress: { stage: 'queued', percent: 0 },
      created_at: new Date().toISOString(),
    });
    renderAudioQueue();

    toast('Job enviado. Comienza el procesamiento...');
    startAudioTracking(data.job_id);
  } catch (err) {
    console.error(err);
    toast(getErrorMessage(err, 'Error enviando job de audio'));
  } finally {
    state.audioRunning = false;
    el.audioRunBtn.disabled = false;
  }
}

function startAudioTracking(jobId) {
  const streamStarted = startAudioStatusStream(jobId);
  if (!streamStarted) {
    startAudioPolling(jobId);
  }
}

function applyAudioJobStatus(jobId, data, options = {}) {
  const { stopTrackingOnTerminal = false } = options;
  const status = (data?.status || 'queued').toString().toLowerCase();
  const stage = data?.progress?.stage || status || 'queued';
  const progressPercent = normalizeAudioProgressPercent(status, data?.progress?.percent, stage);
  const isTerminal = isTerminalAudioStatus(status);
  const previousStatus = (state.audioJobs[jobId]?.status || '').toLowerCase();
  const becameTerminalNow = isTerminal && previousStatus !== status;

  ensureAudioJob(jobId, {
    ...data,
    status,
    progress: {
      ...(data?.progress || {}),
      stage,
      percent: progressPercent,
    },
  });
  renderAudioQueue();

  if (status === 'done') {
    if (stopTrackingOnTerminal && jobId === state.audioJobId) {
      stopAudioTracking();
    }
    if (becameTerminalNow) {
      toast('Audio listo para descarga');
    }
    return { terminal: true, status };
  }

  if (status === 'error' || status === 'cancelled') {
    if (stopTrackingOnTerminal && jobId === state.audioJobId) {
      stopAudioTracking();
    }
    if (becameTerminalNow) {
      const msg = data?.error?.message || `El job terminó en estado ${status}`;
      toast(msg);
    }
    return { terminal: true, status };
  }

  return { terminal: false, status };
}

function ensureAudioJob(jobId, payload = {}) {
  const previous = state.audioJobs[jobId] || { job_id: jobId, status: 'queued', progress: { stage: 'queued', percent: 0 } };
  const next = {
    ...previous,
    ...payload,
    job_id: jobId,
  };
  if (!next.progress) {
    next.progress = { stage: next.status || 'queued', percent: 0 };
  }
  if (typeof next.progress.percent !== 'number') {
    next.progress.percent = normalizeAudioProgressPercent(next.status, next.progress.percent, next.progress.stage);
  }
  state.audioJobs[jobId] = next;
  if (!state.audioJobOrder.includes(jobId)) {
    state.audioJobOrder.unshift(jobId);
  }
  state.dismissedAudioJobs.delete(jobId);
}

function getLatestTrackedJobId() {
  for (const jobId of state.audioJobOrder) {
    if (state.dismissedAudioJobs.has(jobId)) continue;
    const status = (state.audioJobs[jobId]?.status || '').toLowerCase();
    if (!isTerminalAudioStatus(status)) return jobId;
  }
  return state.audioJobOrder.find((jobId) => !state.dismissedAudioJobs.has(jobId)) || null;
}

function dismissAudioJob(jobId) {
  state.dismissedAudioJobs.add(jobId);
  if (jobId === state.audioJobId) {
    stopAudioTracking();
    const nextTrack = getLatestTrackedJobId();
    if (nextTrack) {
      startAudioTracking(nextTrack);
    }
  }
  renderAudioQueue();
}

function renderAudioQueue() {
  if (!el.audioQueueList || !el.audioQueueMeta) return;

  const visibleJobs = state.audioJobOrder
    .filter((jobId) => !state.dismissedAudioJobs.has(jobId))
    .map((jobId) => state.audioJobs[jobId])
    .filter(Boolean);

  if (!visibleJobs.length) {
    el.audioQueueMeta.textContent = 'Sin jobs todavía.';
    el.audioQueueList.innerHTML = '<p class="meta">Cuando ejecutes audios, aparecerán acá.</p>';
    return;
  }

  const queuedCount = visibleJobs.filter((j) => (j.status || '').toLowerCase() === 'queued').length;
  const runningCount = visibleJobs.filter((j) => {
    const status = (j.status || '').toLowerCase();
    return status !== 'queued' && !isTerminalAudioStatus(status);
  }).length;
  const doneCount = visibleJobs.filter((j) => (j.status || '').toLowerCase() === 'done').length;
  el.audioQueueMeta.textContent = `${visibleJobs.length} jobs`;

  el.audioQueueList.innerHTML = visibleJobs.map((job) => {
    const status = (job.status || 'queued').toLowerCase();
    const percent = normalizeAudioProgressPercent(status, job?.progress?.percent, job?.progress?.stage);
    const statusLabel = getAudioStatusLabelRuntime(status);
    const statusClass = getAudioStatusClassRuntime(status);
    const progressClass = status === 'done'
      ? 'audio-progress-fill--done'
      : (status === 'error' || status === 'cancelled')
        ? 'audio-progress-fill--error'
        : 'audio-progress-fill--processing';
    const canDownload = status === 'done';

    return `
      <article class="audio-queue-card" data-job-id="${job.job_id}">
        <header class="audio-queue-card-header">
          <div>
            <p class="audio-queue-card-title">${escapeHtml(job.job_id)}</p>
            <p class="meta">${statusLabel}</p>
          </div>
          <button class="audio-card-close" data-action="dismiss-audio-job" data-job-id="${job.job_id}" title="Ocultar job">×</button>
        </header>

        <span class="audio-status-pill ${statusClass}">${statusLabel}</span>

        <p class="audio-progress-meta">Progress ${percent}%</p>
        <div class="audio-progress-track">
          <div class="audio-progress-fill ${progressClass}" style="width:${percent}%"></div>
        </div>

        <div class="audio-queue-actions">
          ${canDownload
            ? `<button class="approve" data-action="download-audio-job" data-job-id="${job.job_id}">Descargar audio</button>`
            : ''}
        </div>
      </article>
    `;
  }).join('');
}

function startAudioStatusStream(jobId) {
  if (typeof AbortController === 'undefined') return false;

  stopAudioTracking();
  state.audioJobId = jobId;
  state.audioPollingErrorStreak = 0;

  const trackingToken = `${jobId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  state.audioPollingToken = trackingToken;

  const controller = new AbortController();
  state.audioStreamController = controller;

  const baseUrl = (state.settings.ttsBaseUrl || '').trim();
  if (!baseUrl) {
    state.audioStreamController = null;
    return false;
  }

  let headers;
  try {
    headers = ttsApi.buildTtsHeaders();
  } catch {
    state.audioStreamController = null;
    return false;
  }

  const url = `${baseUrl}/api/tts/jobs/${encodeURIComponent(jobId)}/events`;

  (async () => {
    let shouldFallbackToPolling = false;
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        shouldFallbackToPolling = true;
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (state.audioPollingToken === trackingToken) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split(/\r?\n\r?\n/);
        buffer = chunks.pop() || '';

        for (const chunk of chunks) {
          const parsed = parseSseEventChunk(chunk);
          if (!parsed) continue;

          if (parsed.event === 'status') {
            try {
              const payload = JSON.parse(parsed.data || '{}');
              const result = applyAudioJobStatus(jobId, payload, { stopTrackingOnTerminal: true });
              if (!result.terminal) {
                state.audioPollingErrorStreak = 0;
              }
            } catch {
              // ignorar evento mal formado
            }
          } else if (parsed.event === 'error') {
            try {
              const payload = JSON.parse(parsed.data || '{}');
              const msg = payload?.message || 'Error en stream de estado';
              toast(msg);
            } catch {
              toast('Error en stream de estado');
            }
            shouldFallbackToPolling = true;
          }
        }
      }

      const currentTracked = state.audioJobs[jobId];
      if (!isTerminalAudioStatus(currentTracked?.status) && state.audioPollingToken === trackingToken) {
        shouldFallbackToPolling = true;
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        console.error(err);
        const currentTracked = state.audioJobs[jobId];
        if (!isTerminalAudioStatus(currentTracked?.status) && state.audioPollingToken === trackingToken) {
          shouldFallbackToPolling = true;
        }
      }
    } finally {
      if (state.audioStreamController === controller) {
        state.audioStreamController = null;
      }

      const currentTracked = state.audioJobs[jobId];
      if (shouldFallbackToPolling && !isTerminalAudioStatus(currentTracked?.status) && state.audioPollingToken === trackingToken) {
        startAudioPolling(jobId);
      }
    }
  })();

  return true;
}

function parseSseEventChunk(chunk) {
  const lines = (chunk || '').split(/\r?\n/);
  let event = 'message';
  const dataParts = [];

  for (const line of lines) {
    if (!line || line.startsWith(':')) continue;
    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim() || 'message';
      continue;
    }
    if (line.startsWith('data:')) {
      dataParts.push(line.slice('data:'.length).trim());
    }
  }

  if (!dataParts.length && event === 'message') return null;
  return { event, data: dataParts.join('\n') };
}

function startAudioPolling(jobId) {
  stopAudioPolling();
  state.audioJobId = jobId;
  state.audioPollingErrorStreak = 0;
  state.audioPollingInFlight = false;

  const pollingToken = `${jobId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  state.audioPollingToken = pollingToken;

  const tick = async () => {
    if (state.audioPollingToken !== pollingToken) return;
    if (state.audioPollingInFlight) return;
    state.audioPollingInFlight = true;

    try {
      const data = await ttsGet(`/api/tts/jobs/${encodeURIComponent(jobId)}`);
      if (state.audioPollingToken !== pollingToken) return;

      const result = applyAudioJobStatus(jobId, data, { stopTrackingOnTerminal: true });
      state.audioPollingErrorStreak = 0;

      if (result.terminal) {
        return;
      }
    } catch (err) {
      if (state.audioPollingToken !== pollingToken) return;

      console.error(err);
      state.audioPollingErrorStreak += 1;

      if (state.audioPollingErrorStreak >= 3) {
        stopAudioPolling();
        toast(getErrorMessage(err, 'No se pudo consultar estado del job (3 intentos fallidos)'));
      }
    } finally {
      state.audioPollingInFlight = false;
    }
  };

  void tick();
  state.audioPollingTimer = setInterval(() => {
    void tick();
  }, 4000);
}

function stopAudioPolling() {
  state.audioPollingInFlight = false;
  if (state.audioPollingTimer) {
    clearInterval(state.audioPollingTimer);
    state.audioPollingTimer = null;
  }
}

function stopAudioStatusStream() {
  if (state.audioStreamController) {
    state.audioStreamController.abort();
    state.audioStreamController = null;
  }
}

function stopAudioTracking() {
  state.audioPollingToken = null;
  state.audioJobId = null;
  stopAudioPolling();
  stopAudioStatusStream();
}

function startAudioQueueSync() {
  if (state.audioQueueSyncTimer) return;

  const tick = async () => {
    if (state.audioQueueSyncInFlight) return;
    state.audioQueueSyncInFlight = true;
    try {
      await syncAudioQueueStatuses();
    } catch (err) {
      console.error(err);
    } finally {
      state.audioQueueSyncInFlight = false;
    }
  };

  void tick();
  state.audioQueueSyncTimer = setInterval(() => {
    void tick();
  }, 6000);
}

function stopAudioQueueSync() {
  if (state.audioQueueSyncTimer) {
    clearInterval(state.audioQueueSyncTimer);
    state.audioQueueSyncTimer = null;
  }
  state.audioQueueSyncInFlight = false;
}

async function syncAudioQueueStatuses() {
  const targetJobIds = state.audioJobOrder.filter((jobId) => !state.dismissedAudioJobs.has(jobId));
  if (!targetJobIds.length) return;

  const checks = await Promise.all(targetJobIds.map(async (jobId) => {
    try {
      const data = await ttsGet(`/api/tts/jobs/${encodeURIComponent(jobId)}`);
      return { jobId, data, ok: true };
    } catch (err) {
      return { jobId, err, ok: false };
    }
  }));

  let hasChanges = false;
  for (const row of checks) {
    if (!row.ok) continue;
    const before = state.audioJobs[row.jobId];
    const beforeJson = before ? JSON.stringify(before) : '';
    applyAudioJobStatus(row.jobId, row.data);
    const after = state.audioJobs[row.jobId];
    const afterJson = after ? JSON.stringify(after) : '';
    if (beforeJson !== afterJson) {
      hasChanges = true;
    }
  }

  if (!hasChanges) {
    renderAudioQueue();
  }
}

async function downloadAudioJob(jobId = null) {
  const targetJobId = (jobId || state.audioJobId || '').trim();
  if (!targetJobId) {
    toast('No hay job para descargar');
    return;
  }

  const knownJob = state.audioJobs[targetJobId];
  const knownStatus = (knownJob?.status || '').toLowerCase();
  if (knownStatus && knownStatus !== 'done') {
    toast('Ese job todavía no está listo para descarga');
    return;
  }

  try {
    const blob = await ttsGetBlob(`/api/tts/jobs/${encodeURIComponent(targetJobId)}/download`);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${targetJobId}.wav`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error(err);
    toast(getErrorMessage(err, 'Error descargando audio'));
  }
}

function renderQueue() {
  const queue = state.queue
    .map((item) => buildQueueMonitorCard(item))
    .filter((item) => item.isVisible);

  el.queueMeta.textContent = queue.length
    ? `${queue.length} job${queue.length === 1 ? '' : 's'} en curso`
    : '';
  el.queueMeta.classList.toggle('hidden', !queue.length);

  if (!queue.length) {
    el.queueList.innerHTML = '<p class="meta queue-list__empty">Sin jobs en curso.</p>';
    return;
  }

  el.queueList.innerHTML = queue.map((item) => `
    <article class="queue-item queue-item--monitor queue-item--${item.tone}">
      <div class="queue-item__header">
        <div class="queue-item__title-group">
          <div class="meta queue-item__eyebrow">${escapeHtml(item.eyebrow)}</div>
          <strong>${escapeHtml(item.title)}</strong>
        </div>
        <span class="queue-status-pill queue-status-pill--${item.tone}">${escapeHtml(item.statusLabel)}</span>
      </div>
      <div class="summary queue-item__summary">${escapeHtml(item.summary)}</div>
      <div class="queue-progress">
        <div class="queue-progress__meta">
          <span>${escapeHtml(item.progressLabel)}</span>
          <span>${item.percent}%</span>
        </div>
        <div class="queue-progress__track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${item.percent}">
          <div class="queue-progress__fill queue-progress__fill--${item.tone}" style="width:${item.percent}%"></div>
        </div>
      </div>
      <div class="queue-item__footer meta">${escapeHtml(item.footer)}</div>
    </article>
  `).join('');
}

function buildQueueMonitorCard(item = {}) {
  const rawStatus = pickFirstNonEmpty(
    item.estado_queue,
    item.estado,
    item.status,
    item.stage,
    item.progress?.stage,
  );
  const normalizedStatus = normalizeQueueStatus(rawStatus);
  const percent = resolveQueueProgressPercent(item, normalizedStatus);
  const title = pickFirstNonEmpty(item.tema_principal, item.titular, item.jugador, item.cluster_id, item.queue_id, 'Job sin título');
  const eyebrow = [pickFirstNonEmpty(item.jugador, 'Sin jugador'), pickFirstNonEmpty(item.fuente, item.seleccion, 'Sin origen')]
    .filter(Boolean)
    .join(' · ');
  const summary = pickFirstNonEmpty(item.titular, item.resumen_cluster, item.summary, 'Esperando actualización del backend para más detalle.');
  const attemptLabel = formatQueueAttempts(item.attempts ?? item.intentos ?? item.retries);
  const footerParts = [attemptLabel, pickFirstNonEmpty(item.last_error, item.error_message, '')].filter(Boolean);

  return {
    title,
    eyebrow,
    summary,
    statusLabel: getQueueStatusLabel(normalizedStatus),
    progressLabel: getQueueProgressLabel(normalizedStatus, percent),
    footer: footerParts.join(' · ') || 'Sin observaciones adicionales.',
    percent,
    tone: getQueueTone(normalizedStatus),
    isVisible: shouldDisplayInQueueMonitor(normalizedStatus),
  };
}

function pickFirstNonEmpty(...values) {
  for (const value of values) {
    const normalized = `${value ?? ''}`.trim();
    if (normalized) return normalized;
  }
  return '';
}

function normalizeQueueStatus(value = '') {
  return value
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_');
}

function resolveQueueProgressPercent(item = {}, normalizedStatus = '') {
  const candidates = [
    item.progress_percent,
    item.progreso_percent,
    item.progress_pct,
    item.progreso_pct,
    item.progress?.percent,
    item.progress?.pct,
    item.progress,
    item.progreso,
  ];

  for (const candidate of candidates) {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed)) {
      return Math.min(100, Math.max(0, Math.round(parsed)));
    }
  }

  const fallbackByStatus = {
    queued: 12,
    pending: 12,
    aprobado: 16,
    approved: 16,
    generating: 48,
    generando: 48,
    processing: 52,
    procesando: 52,
    writing: 68,
    redactando: 68,
    editing: 82,
    en_edicion: 82,
    en_revision: 86,
    ready_for_edit: 92,
    borrador_generado: 92,
    done: 100,
    completed: 100,
    publicado: 100,
    failed: 100,
    error: 100,
  };

  return fallbackByStatus[normalizedStatus] ?? 24;
}

function isQueueTerminalStatus(normalizedStatus = '') {
  return new Set(['done', 'completed', 'published', 'publicado', 'cancelled', 'cancelado']).has(normalizedStatus);
}

function shouldDisplayInQueueMonitor(normalizedStatus = '') {
  if (isQueueTerminalStatus(normalizedStatus)) return false;
  if (normalizedStatus === 'ready_for_edit' || normalizedStatus === 'borrador_generado') return false;
  return true;
}

function getQueueStatusLabel(normalizedStatus = '') {
  const labels = {
    queued: 'En espera',
    pending: 'En espera',
    approved: 'Aprobado',
    aprobado: 'Aprobado',
    generating: 'Generando',
    generando: 'Generando',
    processing: 'Procesando',
    procesando: 'Procesando',
    writing: 'Redactando',
    redactando: 'Redactando',
    editing: 'Editando',
    en_edicion: 'Editando',
    en_revision: 'En revisión',
    ready_for_edit: 'Listo para editar',
    borrador_generado: 'Listo para editar',
    failed: 'Con error',
    error: 'Con error',
  };

  return labels[normalizedStatus] || 'En progreso';
}

function getQueueProgressLabel(normalizedStatus = '', percent = 0) {
  if (normalizedStatus === 'failed' || normalizedStatus === 'error') {
    return 'Requiere revisión';
  }
  if (normalizedStatus === 'ready_for_edit' || normalizedStatus === 'borrador_generado') {
    return 'Draft listo';
  }
  if (percent >= 90) {
    return 'Casi listo';
  }
  if (percent >= 50) {
    return 'Avanzando';
  }
  return 'Iniciando';
}

function getQueueTone(normalizedStatus = '') {
  if (normalizedStatus === 'failed' || normalizedStatus === 'error') return 'error';
  if (normalizedStatus === 'ready_for_edit' || normalizedStatus === 'borrador_generado') return 'warm';
  return 'active';
}

function formatQueueAttempts(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return '';
  return `Intento ${Math.round(parsed)}`;
}

function renderStats() {
  const total = state.items.length;
  const countries = new Set(state.items.map((i) => i.seleccion).filter(Boolean)).size;
  const avgSources = total ? (state.items.reduce((a, b) => a + Number(b.cantidad_fuentes || 0), 0) / total).toFixed(1) : 0;

  el.stats.innerHTML = `
    <div class="stat"><small>Pendientes</small><strong>${total}</strong></div>
    <div class="stat"><small>Países</small><strong>${countries}</strong></div>
    <div class="stat"><small>Promedio fuentes</small><strong>${avgSources}</strong></div>
  `;
}

function renderScriptStats() {
  const total = state.scriptDrafts.length;
  const inReview = state.scriptDrafts.filter((i) => (i.estado || '').toLowerCase() === 'en_revision').length;
  const generated = state.scriptDrafts.filter((i) => (i.estado || '').toLowerCase() === 'borrador_generado').length;

  el.scriptStats.innerHTML = `
    <div class="stat"><small>Pendientes</small><strong>${total}</strong></div>
    <div class="stat"><small>En revisión</small><strong>${inReview}</strong></div>
    <div class="stat"><small>Nuevos</small><strong>${generated}</strong></div>
  `;
}

function renderCountryFilter() {
  const current = el.countryFilter.value;
  const countries = [...new Set(state.items.map((i) => i.seleccion).filter(Boolean))].sort();
  el.countryFilter.innerHTML = '<option value="">Todos los países</option>' +
    countries.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  el.countryFilter.value = current;
  customDropdowns.refreshAll();
}

function filteredItems() {
  const q = el.searchInput.value.trim().toLowerCase();
  const country = el.countryFilter.value;
  const minSources = Number(el.sourcesFilter.value || 0);

  const filtered = state.items.filter((item) => {
    const searchMatch = !q || `${item.jugador} ${item.tema_principal}`.toLowerCase().includes(q);
    const countryMatch = !country || item.seleccion === country;
    const sourcesMatch = Number(item.cantidad_fuentes || 0) >= minSources;
    return searchMatch && countryMatch && sourcesMatch;
  });

  return orderApprovalItemsByLowestAvg(filtered);
}

function renderCards() {
  const list = filteredItems();
  el.cardsMeta.textContent = `${list.length} resultado${list.length === 1 ? '' : 's'}`;

  if (!list.length) {
    el.cards.innerHTML = '<p class="meta">No hay temas para mostrar con esos filtros.</p>';
    return;
  }

  el.cards.innerHTML = list.map((item) => buildApprovalNewsCardMarkup(item)).join('');

  el.cards.querySelectorAll('.card').forEach((card) => {
    card.addEventListener('click', async (ev) => {
      const interactive = ev.target.closest('button, a');
      if (interactive) return;
      const id = decodeURIComponent(card.dataset.cardId);
      await openDetail(id);
    });

    card.addEventListener('keydown', async (ev) => {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      ev.preventDefault();
      const id = decodeURIComponent(card.dataset.cardId);
      await openDetail(id);
    });
  });
}

function renderScriptCards() {
  if (!state.scriptDrafts.length) {
    el.scriptCards.innerHTML = '<p class="meta">No hay guiones pendientes de edición/publicación.</p>';
    return;
  }

  el.scriptCards.innerHTML = state.scriptDrafts.map((item) => {
    const selectedId = state.selectedScript?.draft_id || state.selectedScript?.id_noticia || state.selectedScript?.cluster_id;
    const currentId = item.draft_id || item.id_noticia || item.cluster_id;
    const isSelected = Boolean(selectedId && currentId === selectedId);

    return buildScriptSelectionCardMarkup(item, { selected: isSelected });
  }).join('');

  el.scriptCards.querySelectorAll('.script-selection-card[data-script-id]').forEach((card) => {
    const openSelectedCard = async () => {
      const id = decodeURIComponent(card.dataset.scriptId);
      await openScriptEditor(id);
    };

    card.addEventListener('click', openSelectedCard);
    card.addEventListener('keydown', async (ev) => {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      ev.preventDefault();
      await openSelectedCard();
    });
  });
}

function renderSelectedScriptEditor() {
  const selected = state.selectedScript;
  const hasSelected = Boolean(selected);

  el.scriptEditorTitle.textContent = hasSelected
    ? `${selected.jugador || 'Sin jugador'} · ${selected.tema_principal || 'Sin tema'}`
    : 'Editor de guion';

  el.scriptEditorMeta.textContent = hasSelected
    ? `Estado: ${selected.estado || 'borrador_generado'} · Editá y publicá desde este panel.`
    : 'Seleccioná un borrador desde la columna derecha para editarlo acá.';

  if (!hasSelected) {
    el.scriptEditedArea.value = '';
    el.scriptEditedArea.disabled = true;
    el.viewOriginalBtn.disabled = true;
    el.voiceAiBtn.disabled = true;
    el.publishDraftBtn.disabled = true;
    el.closeScriptEditor.disabled = true;
    updateWordCounter('', el.scriptEditedWordCount);
    return;
  }

  el.scriptEditedArea.disabled = false;
  el.viewOriginalBtn.disabled = false;
  el.voiceAiBtn.disabled = false;
  el.publishDraftBtn.disabled = false;
  el.closeScriptEditor.disabled = false;

  const nextValue = (selected.guion_editado || selected.guion_draft || '').toString();
  if (el.scriptEditedArea.value !== nextValue) {
    el.scriptEditedArea.value = nextValue;
  }

  updateWordCounter(el.scriptEditedArea.value, el.scriptEditedWordCount);
}

async function openDetail(clusterId) {
  await approvalFeature.openDetail(clusterId);
}

function renderTopicDetail() {
  const item = state.selectedTopic;
  if (!item) return;
  const approvingSourceId = (state.approvingSourceId || '').toString();
  const sources = Array.isArray(item.sources) ? item.sources : [];
  const sourcesMarkup = sources.map((s) => {
    const sourceId = (s.id_noticia || '').toString();
    const isApproving = approvingSourceId && approvingSourceId === sourceId;
    const sourceStateClass = isApproving ? ' source-item--approved' : '';

    return `
      <div class="source-item${sourceStateClass}">
        <div class="source-content">
          <div class="source-item__eyebrow">${s.index}. fuente detectada</div>
          <div><strong>${escapeHtml(s.titular || 'Sin titular')}</strong></div>
          <div class="meta">${escapeHtml(s.fuente || 'Sin fuente')}</div>
        </div>
        <div class="source-actions">
          <button
            type="button"
            class="secondary"
            data-action="open-source"
            data-url="${encodeURIComponent(resolveApprovalSourceLink(s))}"
          >Ver fuente</button>
          <button
            type="button"
            class="approve"
            data-action="approve-source"
            data-id-noticia="${encodeURIComponent(s.id_noticia || '')}"
            ${(state.deletingSource || isApproving) ? 'disabled' : ''}
          >${isApproving ? 'Aprobando...' : 'Aprobar'}</button>
          <button
            type="button"
            class="reject"
            data-action="delete-source"
            data-index="${s.index}"
            data-id-noticia="${encodeURIComponent(s.id_noticia || '')}"
            ${(state.deletingSource || isApproving) ? 'disabled' : ''}
          >Eliminar</button>
        </div>
      </div>
    `;
  }).join('');
  const hasSources = sources.length > 0;
  const sourcesContent = hasSources
    ? sourcesMarkup
    : '<div class="queue-list__empty topic-detail-sources__empty">No quedan fuentes pendientes en este tema.</div>';

  el.dialogTitle.textContent = `${item.jugador} · ${item.tema_principal}`;
  el.dialogBody.innerHTML = `
    <section class="topic-detail-summary">
      <h3 class="topic-detail-summary__title">${escapeHtml(item.tema_principal || 'Sin tema')}</h3>
      <div class="topic-detail-summary__eyebrow">Resumen</div>
      <p class="topic-detail-summary__text">${escapeHtml(item.resumen_cluster || 'Sin resumen')}</p>
    </section>
    <section class="topic-detail-sources">
      <header class="topic-detail-sources__header">
        <div>
          <h3>Fuentes detectadas</h3>
          <p class="meta">${hasSources ? 'Cada fuente muestra titular, medio y dos acciones: ver fuente o aprobar.' : 'La aprobación salió bien y este tema quedó sin fuentes pendientes visibles.'}</p>
        </div>
        <div class="topic-detail-sources__meta">${sources.length} fuentes</div>
      </header>
      ${sourcesContent}
    </section>
  `;
}

async function openScriptEditor(clusterId) {
  await scriptsFeature.openScriptEditor(clusterId);
}

async function saveSelectedScript() {
  await scriptsFeature.saveSelectedScript();
}

async function publishSelectedScript() {
  await scriptsFeature.publishSelectedScript();
}

async function removeSourceFromTopic(source) {
  await approvalFeature.removeSourceFromTopic(source);
}

async function approveSourceFromTopic(source) {
  await approvalFeature.approveSourceFromTopic(source);
}

async function decision(clusterId, action) {
  await approvalFeature.decision(clusterId, action, refreshAll);
}

async function runQueue() {
  await approvalFeature.runQueue(refreshAll);
}

async function ttsGet(path) {
  return ttsApi.get(path);
}

function __resolveTtsGet() {
  return __testOverrides.ttsGet || ttsGet;
}

function __emitToast(message) {
  const mock = __testOverrides.toast;
  if (typeof mock === 'function') {
    mock(message);
    return;
  }
  toast(message);
}

function getSubtitlesStateForTesting() {
  return {
    phase: state.subtitles.machine.getPhase(),
    analysisJobId: state.subtitles.analysisJobId,
    renderJobId: state.subtitles.renderJobId,
    analyzeStatus: state.subtitles.analyzeStatus,
    renderStatus: state.subtitles.renderStatus,
    renderProgressPct: state.subtitles.renderProgressPct,
    renderArtifactReady: state.subtitles.renderArtifactReady,
    renderFailureReason: state.subtitles.renderFailureReason,
    renderProcessingStartedAtMs: state.subtitles.renderProcessingStartedAtMs,
    renderTerminalRefreshDone: state.subtitles.renderTerminalRefreshDone,
    pollingTimer: state.subtitles.pollingTimer,
    pollingInFlight: state.subtitles.pollingInFlight,
  };
}

function setSubtitlesStateForTesting(patch = {}) {
  const allowed = [
    'analysisJobId',
    'renderJobId',
    'analyzeStatus',
    'renderStatus',
    'renderProgressPct',
    'renderArtifactReady',
    'renderFailureReason',
    'renderProcessingStartedAtMs',
    'renderTerminalRefreshDone',
    'pollingTimer',
    'pollingInFlight',
  ];
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      state.subtitles[key] = patch[key];
    }
  }
}

function setSubtitlesPhaseForTesting(phase) {
  state.subtitles.machine = createSubtitlesWorkflowMachine(phase);
}

function resetSubtitlesForTesting() {
  resetSubtitlesRunState();
}

function setTtsGetMock(mock) {
  __testOverrides.ttsGet = typeof mock === 'function' ? mock : null;
}

function setToastMock(mock) {
  __testOverrides.toast = typeof mock === 'function' ? mock : null;
}

function clearMocksForTesting() {
  __testOverrides.ttsGet = null;
  __testOverrides.toast = null;
}

export const __testHooks = {
  pollSubtitleStatusForTesting: pollSubtitleStatus,
  getSubtitlesStateForTesting,
  setSubtitlesStateForTesting,
  setSubtitlesPhaseForTesting,
  resetSubtitlesForTesting,
  setTtsGetMock,
  setToastMock,
  clearMocksForTesting,
};

async function ttsPost(path, payload) {
  return ttsApi.post(path, payload);
}

async function ttsPostForm(path, formData) {
  return ttsApi.postForm(path, formData);
}

async function ttsGetBlob(path) {
  return ttsApi.getBlob(path);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function getErrorMessage(err, fallback) {
  const msg = (err?.message || '').toString().trim();
  return msg || fallback;
}

function toast(message) {
  if (!el.toast) return;

  toastTimer = renderToast({
    toastEl: el.toast,
    message,
    existingTimer: toastTimer,
    durationMs: 3000,
  });
}

function updateWordCounter(text, targetEl) {
  updateWordCounterCore(text, targetEl);
}

function escapeHtml(str) {
  return escapeHtmlCore(str);
}
