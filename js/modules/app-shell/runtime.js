import { renderToast } from '../core/ui/toast.js';
import { escapeHtmlCore } from '../core/ui/escape-html.js';
import { updateWordCounterCore } from '../core/ui/word-count.js';
import {
  defaultSettingsFactory,
  shouldSkipApprovalBackgroundRefresh,
  shouldSkipApprovalInitialBootRefresh,
} from '../core/state/app-store.js';
import {
  clearSessionStatus,
  isValidCredentials,
  persistSessionStatus,
  readSessionStatus,
} from '../core/auth/session-gate.js';
import { bindCoreEvents } from '../core/bootstrap.js';
import {
  buildApprovalNewsCardMarkup,
  orderApprovalItemsByLowestAvg,
  renderApprovalTopicDetail,
  renderQueueMonitor,
  resolveApprovalSourceLink,
} from '../features/approval/index.js';
import { isScriptProcessed } from '../features/scripts/index.js';
import { renderScriptCardsView, renderScriptStatsView, renderSelectedScriptEditorView } from '../features/scripts/render.js';
// Video Projects render (~60 modules) — loaded on first use, not at boot.
let _renderVideoProjectsListView = null;
let _renderSelectedVideoProjectView = null;
let _updateSelectedVideoProjectCompositionPreviewView = null;
async function _ensureVideoProjectsRender() {
  if (_renderVideoProjectsListView) return;
  const mod = await import('../features/video-projects/render.js');
  _renderVideoProjectsListView = mod.renderVideoProjectsListView;
  _renderSelectedVideoProjectView = mod.renderSelectedVideoProjectView;
  _updateSelectedVideoProjectCompositionPreviewView = mod.updateSelectedVideoProjectCompositionPreview;
}
function renderVideoProjectsListView(...args) { return _renderVideoProjectsListView?.(...args); }
function renderSelectedVideoProjectView(...args) { return _renderSelectedVideoProjectView?.(...args); }
function updateSelectedVideoProjectCompositionPreviewView(...args) { return _updateSelectedVideoProjectCompositionPreviewView?.(...args); }
// Audio runtime helpers (~8 modules) — loaded on first use.
let _audioRuntime = null;
async function _ensureAudioRuntime() {
  if (_audioRuntime) return _audioRuntime;
  _audioRuntime = await import('../features/audio/runtime/index.js');
  return _audioRuntime;
}
function getAudioStatusClassRuntime(...args) { return _audioRuntime?.getAudioStatusClassRuntime?.(...args); }
function getAudioStatusLabelRuntime(...args) { return _audioRuntime?.getAudioStatusLabelRuntime?.(...args); }
function isTerminalAudioStatus(...args) { return _audioRuntime?.isTerminalAudioStatus?.(...args); }
function normalizeAudioProgressPercent(...args) { return _audioRuntime?.normalizeAudioProgressPercent?.(...args); }
// Parity guard tokens: ./features/subtitles/runtime/index.js resolveSubtitleProgressPercentRuntime
import { createSettingsController } from './settings.js';
import { createAppShellComposition } from './composition.js';
import { createAppShellLifecycle } from './lifecycle.js';
import { bindShellEvents } from './events/index.js';
import { bindScriptEvents } from './events/scripts.js';
import { bindAudioEvents } from './events/audio.js';
import { bindSubtitlesEvents } from './events/subtitles.js';
import { bindApprovalDialogEvents } from './events/approval-dialog.js';
import { createShellNavigationController } from './views/navigation.js';
import { createApprovalSearchController } from './views/approval-search.js';
import { createShellRenderers } from './views/renderers.js';
import { createScriptToAudioVoiceController } from './voice/script-to-audio.js';

const storageKey = 'approval-panel-settings-v1';
const sessionKey = 'approval-panel-session-v1';
const lastNewsSearchKey = 'approval-panel-last-news-search-at-v1';

const AUTH_USER = 'paneladmin';
const AUTH_PASS = 'Guiones2026!';
const APPROVAL_AUTO_REFRESH_INTERVAL_MS = 30000;

function waitForNextFrame() {
  return new Promise((resolve) => {
    const requestFrame = globalThis.requestAnimationFrame;
    if (typeof requestFrame === 'function') {
      requestFrame(resolve);
      return;
    }
    resolve();
  });
}

function defaultSettings() {
  return defaultSettingsFactory();
}

const __testOverrides = {
  ttsGet: null,
  toast: null,
};

let toastTimer = null;

const composition = createAppShellComposition({
  documentRef: document,
  windowRef: window,
  storage: localStorage,
  storageKey,
  lastNewsSearchKey,
  fetchImpl: fetch,
  btoaImpl: btoa,
  defaultsFactory: defaultSettings,
  ui: { toast },
  helpers: {
    escapeHtml,
    getErrorMessage,
    downloadBlob,
    resolveTtsGet: __resolveTtsGet,
    getBlob: ttsGetBlob,
  },
  callbacks: {
    renderStats,
    renderCountryFilter,
    renderCards,
    renderQueue,
    renderTopicDetail,
    refreshScriptDrafts,
    renderScriptStats,
    renderScriptCards,
    renderSelectedScriptEditor,
    renderVideoProjects,
    renderSelectedVideoProject,
    updateSelectedVideoProjectCompositionPreview,
  },
  browser: { URL, AbortController, TextDecoder, setTimeout, clearTimeout, setInterval, clearInterval, clipboard: globalThis.navigator?.clipboard },
});

const {
  state,
  el,
  customDropdowns,
  approvalApi,
  approvalFeature,
  scriptsFeature,
  videoProjectsFeature,
  radarController,
  subtitlesController,
  audioFeature,
  ttsApi,
  runQueueRefresh,
  runScriptDraftsRefresh,
  runVideoProjectsRefresh,
} = composition;

const settingsController = createSettingsController({
  state,
  el,
  storage: localStorage,
  storageKey,
  lastNewsSearchKey,
  defaultsFactory: defaultSettings,
});

const approvalSearch = createApprovalSearchController({
  state,
  el,
  customDropdowns,
  approvalApi,
  refreshAll,
  renderCards,
  saveLastNewsSearchAt: settingsController.saveLastNewsSearchAt,
  toast,
  getErrorMessage,
});

const navigation = createShellNavigationController({
  state,
  el,
  audioFeature,
  subtitlesController,
  radarController,
  ensureApprovalAutoRefresh,
  refreshVideoProjects,
  renderSelectedVideoProject,
});
const { setView } = navigation;

const voiceController = createScriptToAudioVoiceController({
  state,
  el,
  customDropdowns,
  audioFeature,
  toast,
  updateWordCounter,
  setView,
});

const renderers = createShellRenderers({
  renderQueue,
  renderStats,
  renderCountryFilter,
  renderCards,
  renderScriptStats,
  renderScriptCards,
  renderSelectedScriptEditor,
  renderVideoProjects,
  renderSelectedVideoProject,
  updateSelectedVideoProjectCompositionPreview,
});

const lifecycle = createAppShellLifecycle({
  bindEvents,
  customDropdowns,
  hydrateSettingsForm: settingsController.hydrateSettingsForm,
  el,
  readSessionStatus,
  storage: localStorage,
  cookieJar: document,
  sessionKey,
  setView,
  refreshAll,
  renderSearchRefreshState: approvalSearch.renderSearchRefreshState,
  renderSelectedScriptEditor: renderers.renderSelectedScriptEditor,
  renderSelectedVideoProject: renderers.renderSelectedVideoProject,
});

export function bootApp() {
  lifecycle.bootApp();
}

export function bootCompatibilityShell() {
  lifecycle.bootCompatibilityShell();
}

function renderSubtitle2PreviewPlaybackState() {
  subtitlesController.renderPreviewPlaybackState?.();
}

function bindEvents() {
  bindShellEvents({
    bindCore: () => bindCoreEvents({
      el,
      authUser: AUTH_USER,
      authPass: AUTH_PASS,
      isValidCredentials,
      persistSessionStatus: () => persistSessionStatus({ storage: localStorage, cookieJar: document, sessionKey }),
      clearSessionStatus: () => clearSessionStatus({ storage: localStorage, cookieJar: document, sessionKey }),
      setView,
      refreshAll,
      refreshQueue,
      runQueue,
      saveSettings: settingsController.saveSettings,
      defaultSettings,
      toast,
      renderCards,
      reloadPage: () => location.reload(),
    }),
    bindRadar: () => radarController.bindEvents(),
    bindScripts: () => bindScriptEvents({
      state,
      el,
      updateWordCounter,
      renderScriptCards,
      renderSelectedScriptEditor,
      publishSelectedScript,
      openVoiceAiPresetDialog: voiceController.openVoiceAiPresetDialog,
      confirmVoiceAiPresetSelection: voiceController.confirmVoiceAiPresetSelection,
      downloadSelectedScriptDocx,
      refreshVideoProjects,
    }),
    bindAudio: () => bindAudioEvents({ el, audioFeature, updateWordCounter }),
    bindSubtitles: () => bindSubtitlesEvents({ state, el, subtitlesController, renderSubtitle2PreviewPlaybackState }),
    bindApprovalDialog: () => bindApprovalDialogEvents({
      state,
      el,
      renderQueue,
      removeSourceFromTopic,
      approveSourceFromTopic,
      runSearchRefresh: approvalSearch.runSearchRefresh,
      toast,
      windowRef: window,
    }),
  });
}

function legacyBindEvents() {
  bindCoreEvents({
    el,
    authUser: AUTH_USER,
    authPass: AUTH_PASS,
    isValidCredentials,
    persistSessionStatus: () => persistSessionStatus({ storage: localStorage, cookieJar: document, sessionKey }),
    clearSessionStatus: () => clearSessionStatus({ storage: localStorage, cookieJar: document, sessionKey }),
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

  radarController.bindEvents();

  el.closeScriptEditor.addEventListener('click', () => {
    state.selectedScript = null;
    state.scriptEditorDirty = false;
    renderScriptCards();
    renderSelectedScriptEditor();
  });

  el.scriptEditedArea.addEventListener('input', () => {
    if (state.selectedScript) {
      const baseline = (state.selectedScript.guion_editado || state.selectedScript.guion_draft || '').toString();
      state.scriptEditorDirty = el.scriptEditedArea.value !== baseline;
    }
    updateWordCounter(el.scriptEditedArea.value, el.scriptEditedWordCount);
  });

  el.viewOriginalBtn.addEventListener('click', () => {
    if (!state.selectedScript) return;
    el.scriptOriginalTitle.textContent = `${state.selectedScript.jugador || 'Sin jugador'} · ${resolveScriptTitle(state.selectedScript)} (original)`;
    el.scriptOriginalMeta.textContent = '';
    el.scriptOriginalArea.value = (state.selectedScript.guion_draft || '').toString();
    updateWordCounter(el.scriptOriginalArea.value, el.scriptOriginalWordCount);
    el.scriptOriginalDialog.showModal();
  });

  el.closeOriginalDialog.addEventListener('click', () => el.scriptOriginalDialog.close());

  el.cancelPublishBtn.addEventListener('click', () => el.publishConfirmDialog.close());
  el.confirmPublishBtn.addEventListener('click', publishSelectedScript);
  el.voiceAiBtn.addEventListener('click', () => {
    openVoiceAiPresetDialog();
  });
  el.cancelVoicePresetBtn.addEventListener('click', () => el.voicePresetDialog.close());
  el.confirmVoicePresetBtn.addEventListener('click', () => {
    void confirmVoiceAiPresetSelection();
  });
  el.downloadDraftBtn.addEventListener('click', downloadSelectedScriptDocx);
  el.publishDraftBtn.addEventListener('click', () => {
    if (!state.selectedScript) return;
    el.publishConfirmDialog.showModal();
  });

  el.videoProjectsRefreshBtn?.addEventListener('click', () => {
    void refreshVideoProjects();
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

function legacySetView(view) {
  const nextView = normalizeShellView(view);

  state.currentView = nextView;
  ensureApprovalAutoRefresh();
  const isApproval = nextView === 'approval';
  const isScripts = nextView === 'scripts';
  const isAudio = nextView === 'audio';
  const isRadar = nextView === 'radar';
  const isSubtitulos2 = nextView === 'subtitulos2';
  el.viewApproval.classList.toggle('hidden', !isApproval);
  el.viewScripts.classList.toggle('hidden', !isScripts);
  el.viewAudio.classList.toggle('hidden', !isAudio);
  el.viewRadar?.classList.toggle('hidden', !isRadar);
  el.viewSubtitulos2?.classList.toggle('hidden', !isSubtitulos2);
  el.sidebarNav.querySelectorAll('.nav-item').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === nextView);
  });

  if (isAudio && !state.audioPollingTimer && !state.audioStreamController) {
    const nextTrack = audioFeature.getLatestTrackedJobId();
    if (nextTrack) {
      audioFeature.startAudioTracking(nextTrack);
    }
  }

  if (isAudio) {
    audioFeature.startAudioQueueSync();
  } else {
    audioFeature.stopAudioQueueSync();
  }

  if (isScripts) {
    void refreshVideoProjects({ silent: true });
    renderSelectedVideoProject();
  }

  if (isSubtitulos2) {
    void subtitlesController.refreshRemoteStatus();
    subtitlesController.renderWorkflow();
  }

  if (isRadar) {
    radarController.render();
    void radarController.refreshHealth();
    void radarController.refreshHistory();
  } else {
    radarController.stopPolling();
  }

}

function hydrateSettingsForm() {
  hydrateSettingsFormValues({ el, settings: state.settings });
}

const MIN_REFRESH_INTERVAL_MS = 5000;
let lastRefreshAllTime = 0;

async function refreshAll(options = {}) {
  if (shouldSkipApprovalInitialBootRefresh({
    baseUrl: state.settings?.baseUrl,
    locationLike: globalThis.location,
    refreshOptions: options,
  })) {
    await refreshVideoProjects({ silent: true });
    return;
  }

  const now = Date.now();
  if (now - lastRefreshAllTime < MIN_REFRESH_INTERVAL_MS) return;
  lastRefreshAllTime = now;

  await Promise.all([refreshPending(), refreshQueue(), refreshScriptDrafts(), refreshVideoProjects({ silent: true })]);
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

async function refreshVideoProjects(options = {}) {
  await runVideoProjectsRefresh(options);
}

function ensureApprovalAutoRefresh(start = true) {
  if (!start) {
    if (state.approvalAutoRefreshTimer) {
      clearInterval(state.approvalAutoRefreshTimer);
      state.approvalAutoRefreshTimer = null;
    }
    return;
  }
  if (state.approvalAutoRefreshTimer) return;

  const run = () => {
    void refreshApprovalMonitorData();
  };

  state.approvalAutoRefreshTimer = setInterval(run, APPROVAL_AUTO_REFRESH_INTERVAL_MS);
}

let lastMonitorRefreshTime = 0;

async function refreshApprovalMonitorData() {
  if (shouldSkipApprovalBackgroundRefresh({ baseUrl: state.settings?.baseUrl, locationLike: globalThis.location })) {
    return;
  }
  const now = Date.now();
  if (now - lastMonitorRefreshTime < MIN_REFRESH_INTERVAL_MS) return;
  lastMonitorRefreshTime = now;
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

function formatNewsSearchTimestamp(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (input) => String(input).padStart(2, '0');
  return `${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function assertSearchRefreshSucceeded(result) {
  const status = (result?.status || '').toString().trim().toLowerCase();
  const promoteStatus = (result?.promote?.status || '').toString().trim().toLowerCase();
  const errorMessage = (result?.error || result?.message || result?.promote?.error || '').toString().trim();

  if (status !== 'ok' || promoteStatus !== 'succeeded') {
    throw new Error(errorMessage || 'La búsqueda no terminó correctamente. El panel actual se mantiene sin cambios.');
  }
}

function resolveSearchRefreshCompletionMessage(result, windowLabel) {
  const promote = result?.promote || {};
  const promoted = promote.promoted ?? result?.promoted;
  const noPromoteReason = (promote.no_promote_reason || result?.no_promote_reason || '').toString().trim();

  if (promoted === false) {
    const reasonCopy = noPromoteReason === 'no_staged_clusters'
      ? 'No hubo clusters nuevos para publicar.'
      : 'No se publicaron cambios nuevos.';
    return `Última elección: ${windowLabel}. ${reasonCopy}`;
  }

  return `Última elección: ${windowLabel}. Panel actualizado.`;
}

function renderSearchRefreshState() {
  if (!el.searchRefreshBtn || !el.searchRefreshStatus) return;

  el.searchRefreshBtn.disabled = state.searchRefreshRunning;
  el.searchRefreshBtn.textContent = state.searchRefreshRunning ? 'Actualizando...' : 'Actualizar noticias de hoy';
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
    state.searchRefreshStatus = 'Búsqueda completada. Actualizando panel...';
    renderSearchRefreshState();
    toast('Búsqueda completada. Actualizando noticias...');
    await refreshAll();
    state.lastNewsSearchAt = new Date().toISOString();
    saveLastNewsSearchAt(state.lastNewsSearchAt);
    renderCards();
    state.searchRefreshStatus = resolveSearchRefreshCompletionMessage(result, windowLabel);
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
  renderLastNewsSearchMeta();

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

function renderLastNewsSearchMeta() {
  if (!el.lastNewsSearchMeta) return;
  const formatted = formatNewsSearchTimestamp(state.lastNewsSearchAt);
  el.lastNewsSearchMeta.hidden = !formatted;
  el.lastNewsSearchMeta.textContent = formatted ? `Última actualización: ${formatted}` : '';
}

function renderScriptStats() {
  renderScriptStatsView({ scriptDrafts: state.scriptDrafts, el });
}

function renderScriptCards() {
  renderScriptCardsView({
    state,
    el,
    openScriptEditor,
    dismissProcessedScript: scriptsFeature.dismissProcessedScript,
  });
}

function renderSelectedScriptEditor() {
  if (!state.selectedScript) {
    state.scriptEditorDirty = false;
  }
  renderSelectedScriptEditorView({
    selected: state.selectedScript,
    el,
    updateWordCounter,
    preserveCurrentValue: Boolean(state.selectedScript && state.scriptEditorDirty),
  });
}

async function renderVideoProjects() {
  await _ensureVideoProjectsRender();
  renderVideoProjectsListView({
    state,
    el,
    openVideoProject,
    prefetchProjectDetail: videoProjectsFeature.prefetchProjectDetail,
  });
}

async function renderSelectedVideoProject() {
  await _ensureVideoProjectsRender();
  renderSelectedVideoProjectView({
    state,
    el,
    closeVideoProject,
    toggleImageSelection: videoProjectsFeature.toggleImageSelection,
    goToAudioStep: videoProjectsFeature.goToAudioStep,
    goToImagesStep: videoProjectsFeature.goToImagesStep,
    uploadProjectAudio: videoProjectsFeature.uploadProjectAudio,
    selectDefaultBackgroundMusic: videoProjectsFeature.selectDefaultBackgroundMusic,
    uploadCustomImages: videoProjectsFeature.uploadCustomImages,
    preparePreview: videoProjectsFeature.preparePreview,
    refreshPreview: videoProjectsFeature.refreshPreview,
    exportFinal: videoProjectsFeature.exportFinal,
    updateRow: videoProjectsFeature.updateRow,
    assignExistingImageToRow: videoProjectsFeature.assignExistingImageToRow,
    uploadAndAssignImage: videoProjectsFeature.uploadAndAssignImage,
    uploadVideoToLibrary: videoProjectsFeature.uploadVideoToLibrary,
    assignVideoSegmentToRow: videoProjectsFeature.assignVideoSegmentToRow,
    updateGlobalAudio: videoProjectsFeature.updateGlobalAudio,
    updateBrandChannel: videoProjectsFeature.updateBrandChannel,
    renderSelectedVideoProject,
    updateSelectedVideoProjectCompositionPreview,
    showToast: toast,
  });
}

async function updateSelectedVideoProjectCompositionPreview({ project } = {}) {
  await _ensureVideoProjectsRender();
  return updateSelectedVideoProjectCompositionPreviewView({ project: project || state.selectedVideoProject });
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

async function openVideoProject(projectId) {
  await videoProjectsFeature.openVideoProject(projectId);
  await waitForNextFrame();
  el.viewScripts?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
}

function closeVideoProject() {
  state.selectedVideoProject = null;
  state.videoProjectDetailLoading = false;
  state.videoProjectDetailImagesPreparing = false;
  renderVideoProjects();
  renderSelectedVideoProject();
}

async function saveSelectedScript() {
  await scriptsFeature.saveSelectedScript();
}

async function publishSelectedScript() {
  await scriptsFeature.publishSelectedScript();
  if (state.selectedScript && isScriptProcessed(state.selectedScript)) {
    await refreshVideoProjects({ silent: true });
  }
}

async function downloadSelectedScriptDocx() {
  await scriptsFeature.downloadSelectedScriptDocx();
}

function buildVoiceAiJobTitle(script = {}) {
  return [script.jugador, resolveScriptTitle(script, '')]
    .map((part) => (part || '').toString().trim())
    .filter(Boolean)
    .join(' · ')
    .slice(0, 120)
    || script.draft_id
    || script.id_noticia
    || script.cluster_id
    || 'voz-ia-guion';
}

function getVoiceAiReadyState() {
  const selected = state.selectedScript;
  if (!selected) {
    toast('Seleccioná un guion antes de generar voz');
    return null;
  }

  if (!isScriptProcessed(selected)) {
    toast('Primero procesá el guion para usar la versión con pronunciación.');
    return null;
  }

  if (state.scriptEditorDirty) {
    toast('Tenés cambios sin procesar. Procesá de nuevo antes de generar voz.');
    return null;
  }

  const pronunciationText = (selected.guion_pronunciacion || '').toString().trim();
  if (!pronunciationText) {
    toast('Este guion no tiene versión de pronunciación. Procesalo de nuevo para generar voz.');
    return null;
  }

  return { selected, pronunciationText };
}

function syncVoicePresetOptions() {
  const currentPreset = (el.audioPresetSelect.value || 'balanced_default').trim();
  el.voicePresetSelect.innerHTML = '';
  Array.from(el.audioPresetSelect.options).forEach((option) => {
    el.voicePresetSelect.appendChild(option.cloneNode(true));
  });
  el.voicePresetSelect.value = currentPreset;
  if (!el.voicePresetSelect.value && el.voicePresetSelect.options.length) {
    el.voicePresetSelect.value = el.voicePresetSelect.options[0].value;
  }
}

function openVoiceAiPresetDialog() {
  if (!getVoiceAiReadyState()) return;
  syncVoicePresetOptions();
  customDropdowns.refreshAll();
  el.voicePresetDialog.showModal();
}

async function confirmVoiceAiPresetSelection() {
  const voiceProfile = (el.voicePresetSelect.value || el.audioPresetSelect.value || 'balanced_default').trim();
  el.voicePresetDialog.close();
  await runVoiceAiFromSelectedScript({ voiceProfile });
}

async function legacyRunVoiceAiFromSelectedScript({ voiceProfile = null } = {}) {
  const ready = getVoiceAiReadyState();
  if (!ready) return;

  const { selected, pronunciationText } = ready;
  const preset = (voiceProfile || el.audioPresetSelect.value || 'balanced_default').trim();

  el.audioTextArea.value = pronunciationText;
  el.audioPresetSelect.value = preset;
  el.audioPresetSelect.dispatchEvent(new Event('change', { bubbles: true }));
  updateWordCounter(pronunciationText, el.audioWordCount);
  setView('audio');

  await audioFeature.runAudioGenerationFromText({
    text: pronunciationText,
    voiceProfile: preset,
    title: buildVoiceAiJobTitle(selected),
  });
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
