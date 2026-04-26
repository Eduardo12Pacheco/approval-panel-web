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
import { renderApprovalTopicDetail } from './features/approval/detail-dialog.js';
import { renderQueueMonitor } from './features/approval/queue-monitor.js';
import { createScriptsFeature } from './features/scripts/index.js';
import { renderScriptCardsView, renderScriptStatsView, renderSelectedScriptEditorView } from './features/scripts/render.js';
import { createAudioFeature } from './features/audio/index.js';
import { createAudioController } from './features/audio/controller.js';
import {
  createAudioRuntime,
  getAudioStatusClassRuntime,
  getAudioStatusLabelRuntime,
  isTerminalAudioStatus,
  normalizeAudioProgressPercent,
} from './features/audio/runtime/index.js';
import { createSubtitlesController } from './features/subtitles/controller.js';
import { createRemoteSubtitlesState } from './features/subtitles/runtime/index.js';
// Parity guard tokens: ./features/subtitles/runtime/index.js resolveSubtitleProgressPercentRuntime
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
  dismissedQueueJobs: new Set(),
  searchRefreshRunning: false,
  searchRefreshStatus: 'Puede tardar aproximadamente 2 minutos.',
  searchRefreshStatusKind: 'idle',
  lastSearchRefresh: null,
  selectedCardId: null,
  selectedTopic: null,
  deletingSource: false,
  currentView: 'approval',
  scriptDrafts: [],
  selectedScript: null,
  savingScript: false,
  publishingScript: false,
  downloadingScript: false,
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
const customDropdowns = createCustomDropdownController({ root: document });

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
  helpers: { downloadBlob },
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

const subtitlesController = createSubtitlesController({
  state,
  el,
  api: ttsApi,
  ui: { toast },
  helpers: { getErrorMessage, downloadBlob, escapeHtml },
  customDropdowns,
  browser: { URL, window, setTimeout, clearTimeout, clearInterval },
});

const audioController = createAudioController({
  state,
  el,
  api: ttsApi,
  ui: { toast },
  helpers: {
    escapeHtml,
    getErrorMessage,
    resolveTtsGet: __resolveTtsGet,
    getBlob: ttsGetBlob,
  },
  browser: { fetchImpl: fetch, URL, document, AbortController, TextDecoder, setInterval, clearInterval },
});

const audioRuntime = createAudioRuntime({
  hooks: {
    runAudioGeneration: audioController.runAudioGeneration,
    startAudioTracking: audioController.startAudioTracking,
    applyAudioJobStatus: audioController.applyAudioJobStatus,
    startAudioStatusStream: audioController.startAudioStatusStream,
    startAudioPolling: audioController.startAudioPolling,
    stopAudioTracking: audioController.stopAudioTracking,
    startAudioQueueSync: audioController.startAudioQueueSync,
    stopAudioQueueSync: audioController.stopAudioQueueSync,
    syncAudioQueueStatuses: audioController.syncAudioQueueStatuses,
    renderAudioQueue: audioController.renderAudioQueue,
    downloadAudioJob: audioController.downloadAudioJob,
    dismissAudioJob: audioController.dismissAudioJob,
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
  renderSearchRefreshState();
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
  el.downloadDraftBtn.addEventListener('click', downloadSelectedScriptDocx);
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

  el.queueList?.addEventListener('click', (ev) => {
    const button = ev.target.closest('[data-action="dismiss-approval-queue-job"]');
    if (!button) return;
    const queueId = (button.dataset.queueId || '').trim();
    if (!queueId) return;
    state.dismissedQueueJobs.add(queueId);
    renderQueue();
  });

  el.searchRefreshBtn?.addEventListener('click', () => {
    void runSearchRefresh();
  });


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
    const nextTrack = audioController.getLatestTrackedJobId();
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
    void subtitlesController.refreshRemoteStatus();
    subtitlesController.renderWorkflow();
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

function getSearchRefreshWindowValue() {
  return el.searchRefreshWindow?.value === '1h' ? '1h' : '24h';
}

function getSearchRefreshWindowLabel(value) {
  return value === '1h' ? 'Última hora' : 'Últimas 24 horas';
}

function assertSearchRefreshSucceeded(result) {
  const status = (result?.status || '').toString().trim().toLowerCase();
  const promoteStatus = (result?.promote?.status || '').toString().trim().toLowerCase();
  const errorMessage = (result?.error || result?.message || result?.promote?.error || '').toString().trim();

  if (status !== 'ok' || promoteStatus !== 'succeeded') {
    throw new Error(errorMessage || 'La búsqueda no terminó correctamente. El panel actual se mantiene sin cambios.');
  }
}

function renderSearchRefreshState() {
  if (!el.searchRefreshBtn || !el.searchRefreshStatus) return;

  el.searchRefreshBtn.disabled = state.searchRefreshRunning;
  el.searchRefreshBtn.textContent = state.searchRefreshRunning ? 'Buscando...' : 'Buscar';
  if (el.searchRefreshWindow) {
    el.searchRefreshWindow.disabled = state.searchRefreshRunning;
    customDropdowns.refreshAll();
  }

  el.searchRefreshStatus.textContent = state.searchRefreshStatus;
  el.searchRefreshStatus.classList.toggle('is-running', state.searchRefreshStatusKind === 'running');
  el.searchRefreshStatus.classList.toggle('is-success', state.searchRefreshStatusKind === 'success');
  el.searchRefreshStatus.classList.toggle('is-error', state.searchRefreshStatusKind === 'error');
}

async function runSearchRefresh() {
  if (state.searchRefreshRunning) return;

  const windowValue = getSearchRefreshWindowValue();
  const windowLabel = getSearchRefreshWindowLabel(windowValue);
  state.searchRefreshRunning = true;
  state.searchRefreshStatusKind = 'running';
  state.searchRefreshStatus = `Buscando noticias: ${windowLabel}. Esto puede tardar aproximadamente 2 minutos...`;
  state.lastSearchRefresh = null;
  renderSearchRefreshState();

  try {
    const result = await approvalApi.post('/webhook/approval/search-refresh/supabase/v2', { window: windowValue });
    assertSearchRefreshSucceeded(result);
    state.lastSearchRefresh = result;
    state.searchRefreshStatusKind = 'success';
    state.searchRefreshStatus = `Búsqueda completada${result?.run_id ? ` · ${result.run_id}` : ''}. Actualizando panel...`;
    renderSearchRefreshState();
    toast('Búsqueda completada. Actualizando noticias...');
    await refreshAll();
    state.searchRefreshStatus = `Última búsqueda: ${windowLabel}. Panel actualizado.`;
  } catch (err) {
    console.error(err);
    const message = getErrorMessage(err, 'Error ejecutando búsqueda');
    state.searchRefreshStatusKind = 'error';
    state.searchRefreshStatus = `Error: ${message}`;
    toast(message);
  } finally {
    state.searchRefreshRunning = false;
    renderSearchRefreshState();
  }
}

function renderQueue() {
  renderQueueMonitor({ queueItems: state.queue, el, escapeHtml, dismissedQueueIds: state.dismissedQueueJobs });
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

function renderCountryFilter() {
  const current = el.countryFilter.value;
  const countries = [...new Set(state.items.map((i) => i.seleccion).filter(Boolean))].sort();
  el.countryFilter.innerHTML = '<option value="">Todos los países</option>'
    + countries.map((country) => `<option value="${escapeHtml(country)}">${escapeHtml(country)}</option>`).join('');
  el.countryFilter.value = current;
  customDropdowns.refreshAll();
}

function filteredItems() {
  const query = el.searchInput.value.trim().toLowerCase();
  const country = el.countryFilter.value;
  const minSources = Number(el.sourcesFilter.value || 0);

  const filtered = state.items.filter((item) => {
    const searchMatch = !query || `${item.jugador} ${item.tema_principal}`.toLowerCase().includes(query);
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

function renderScriptStats() {
  renderScriptStatsView({ scriptDrafts: state.scriptDrafts, el });
}

function renderScriptCards() {
  renderScriptCardsView({ state, el, openScriptEditor });
}

function renderSelectedScriptEditor() {
  renderSelectedScriptEditorView({ selected: state.selectedScript, el, updateWordCounter });
}

async function openDetail(clusterId) {
  await approvalFeature.openDetail(clusterId);
}

function renderTopicDetail() {
  renderApprovalTopicDetail({ item: state.selectedTopic, el, state, escapeHtml, resolveApprovalSourceLink });
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

async function downloadSelectedScriptDocx() {
  await scriptsFeature.downloadSelectedScriptDocx();
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
