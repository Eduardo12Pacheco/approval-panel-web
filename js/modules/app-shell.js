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
import {
  createAudioRuntime,
  getAudioStatusClassRuntime,
  getAudioStatusLabelRuntime,
  isTerminalAudioStatus,
  normalizeAudioProgressPercent,
} from './features/audio/runtime/index.js';
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
} from './features/subtitles/runtime/index.js';
import { getDomSelectors } from './shared/dom/selectors.js';

const storageKey = 'approval-panel-settings-v1';
const sessionKey = 'approval-panel-session-v1';

const AUTH_USER = 'paneladmin';
const AUTH_PASS = 'Guiones2026!';
const APPROVAL_AUTO_REFRESH_INTERVAL_MS = 15000;
const SUBTITLE_TIME_NUDGE_MS = 100;
const SUBTITLE_TIMING_GAP_MS = 60;
const SUBTITLE_DRAFT_INSERT_DURATION_MS = 1000;

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
  subtitles2: createRemoteSubtitlesState(),
};

const __testOverrides = {
  ttsGet: null,
  toast: null,
};

let toastTimer = null;
let subtitle2PreviewDragCleanup = null;

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

const audioFeature = createAudioFeature({
  api: ttsApi,
  store,
  ui: { toast },
  selectors: el,
  handlers: {
    ...audioRuntime,
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
    el.scriptOriginalMeta.textContent = '';
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


  el.subtitle2UploadInput?.addEventListener('change', onSubtitle2UploadSelected);
  el.subtitle2SourceLanguagePicker?.addEventListener('change', onSubtitle2SourceLanguageChanged);
  el.subtitle2SaveBtn?.addEventListener('click', onSubtitle2SaveClicked);
  el.subtitle2ReadyBtn?.addEventListener('click', onSubtitle2ReadyClicked);
  el.subtitle2DownloadBtn?.addEventListener('click', onSubtitle2DownloadClicked);
  el.subtitle2AddRowBtn?.addEventListener('click', onSubtitle2AddRowClicked);
  el.subtitle2AnotherVideoBtn?.addEventListener('click', resetSubtitle2EditorForAnotherVideo);
  el.subtitle2RowsBody?.addEventListener('input', onSubtitle2TableInput);
  el.subtitle2RowsBody?.addEventListener('change', onSubtitle2TableInput);
  el.subtitle2RowsBody?.addEventListener('click', onSubtitle2TableClick);
  el.subtitle2RowsBody?.addEventListener('dragstart', onSubtitle2DraftDragStart);
  el.subtitle2RowsBody?.addEventListener('dragover', onSubtitle2DraftDragOver);
  el.subtitle2RowsBody?.addEventListener('dragleave', onSubtitle2DraftDragLeave);
  el.subtitle2RowsBody?.addEventListener('drop', onSubtitle2DraftDrop);
  el.subtitle2RowsBody?.addEventListener('dragend', onSubtitle2DraftDragEnd);
  el.subtitle2PreviewVideo?.addEventListener('timeupdate', onSubtitle2PreviewTimeUpdate);
  el.subtitle2PreviewVideo?.addEventListener('loadedmetadata', onSubtitle2PreviewLoadedMetadata);
  el.subtitle2PreviewVideo?.addEventListener('play', () => {
    state.subtitles2.previewPlaying = true;
    renderSubtitle2PreviewPlaybackState();
  });
  el.subtitle2PreviewVideo?.addEventListener('pause', () => {
    state.subtitles2.previewPlaying = false;
    renderSubtitle2PreviewPlaybackState();
  });
  el.subtitle2PreviewPlayBtn?.addEventListener('click', onSubtitle2PreviewToggleClicked);
  el.subtitle2PreviewTimeline?.addEventListener('click', onSubtitle2PreviewTimelineClick);
  el.subtitle2PreviewTimelineTrack?.addEventListener('mousedown', onSubtitle2PreviewTimelineDragStart);
  el.subtitle2SessionHistory?.addEventListener('click', (ev) => {
    const renameButton = ev.target.closest('[data-action="rename-subtitle-session"]');
    if (renameButton) {
      const sessionId = (renameButton.dataset.sessionId || '').trim();
      const currentName = (renameButton.dataset.sessionName || sessionId).trim();
      if (sessionId) void renameSubtitle2HistorySession(sessionId, currentName);
      return;
    }
    const deleteButton = ev.target.closest('[data-action="delete-subtitle-session"]');
    if (deleteButton) {
      const sessionId = (deleteButton.dataset.sessionId || '').trim();
      if (sessionId) void deleteSubtitle2HistorySession(sessionId);
      return;
    }
    const button = ev.target.closest('[data-action="resume-subtitle-session"]');
    if (!button) return;
    const sessionId = (button.dataset.sessionId || '').trim();
    if (!sessionId) return;
    void (async () => {
      const detail = await hydrateSubtitle2Session(sessionId, { render: false });
      setSubtitles2PhaseFromRemoteStatus(detail);
    })();
  });

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
  const nextView = ['approval', 'scripts', 'audio', 'subtitulos2'].includes(requestedView) ? requestedView : 'approval';

  state.currentView = nextView;
  ensureApprovalAutoRefresh();
  const isApproval = nextView === 'approval';
  const isScripts = nextView === 'scripts';
  const isAudio = nextView === 'audio';
  const isSubtitulos2 = nextView === 'subtitulos2';
  el.viewApproval.classList.toggle('hidden', !isApproval);
  el.viewScripts.classList.toggle('hidden', !isScripts);
  el.viewAudio.classList.toggle('hidden', !isAudio);
  el.viewSubtitulos2?.classList.toggle('hidden', !isSubtitulos2);
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


  if (isSubtitulos2) {
    void refreshSubtitle2RemoteStatus();
    renderSubtitles2Workflow();
  }
}

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
  state.subtitles2.pollingTimer = setTimeout(() => {
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
  state.subtitles2.pollingTimer = setTimeout(() => {
    void pollRemoteSubtitleRenderStatus(sessionId);
  }, SUBTITLES_POLL_INTERVAL_MS);
  renderSubtitles2Workflow();
}

function stopSubtitle2Polling() {
  if (state.subtitles2.pollingTimer) {
    clearTimeout(state.subtitles2.pollingTimer);
    clearInterval(state.subtitles2.pollingTimer);
    state.subtitles2.pollingTimer = null;
  }
}

function resetSubtitles2RunState() {
  revokeSubtitle2PreviewObjectUrl();
  state.subtitles2 = createRemoteSubtitlesState();
}

function revokeSubtitle2PreviewObjectUrl() {
  const objectUrl = state.subtitles2?.previewVideoObjectUrl;
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  if (state.subtitles2) state.subtitles2.previewVideoObjectUrl = '';
}

async function loadSubtitle2PreviewVideoBlob(sessionId) {
  if (!sessionId) return;
  try {
    const blob = await ttsApi.getSubtitlePreviewVideo(sessionId);
    revokeSubtitle2PreviewObjectUrl();
    state.subtitles2.previewVideoObjectUrl = URL.createObjectURL(blob);
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
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  subtitle2PreviewDragCleanup = () => {
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
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
  const confirmed = window.confirm(`¿Eliminar proyecto ${sessionId}? Esta acción no se puede deshacer.`);
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
  const nextName = window.prompt('Nombre del proyecto', currentName || sessionId);
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
    el.audioQueueMeta.textContent = '';
    el.audioQueueList.innerHTML = '<p class="audio-queue-empty">Sin jobs todavía.</p>';
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
          </div>
          <button class="audio-card-close" data-action="dismiss-audio-job" data-job-id="${job.job_id}" title="Ocultar job" aria-label="Ocultar job">
            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
            </svg>
          </button>
        </header>

        <span class="audio-status-pill ${statusClass}">${statusLabel}</span>

        <p class="audio-progress-meta">Progreso ${percent}%</p>
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
      <div class="queue-progress">
        <div class="queue-progress__meta">
          <span>${escapeHtml(item.progressLabel)}</span>
          <span>${item.percent}%</span>
        </div>
        <div class="queue-progress__track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${item.percent}">
          <div class="queue-progress__fill queue-progress__fill--${item.tone}" style="width:${item.percent}%"></div>
        </div>
      </div>
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
  return {
    title,
    eyebrow,
    statusLabel: getQueueStatusLabel(normalizedStatus),
    progressLabel: getQueueProgressLabel(normalizedStatus, percent),
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
    ? ''
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

function renderOriginalScriptDialogMeta(selected) {
  if (!selected) return '';
  return '';
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
    <p class="topic-dialog-summary-label">Resumen</p>
    <p class="topic-dialog-summary">${escapeHtml(item.resumen_cluster || 'Sin resumen')}</p>
    <section class="topic-detail-sources">
      <header class="topic-detail-sources__header">
        <div>
          <h3>Fuentes detectadas</h3>
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
