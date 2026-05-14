import { createCustomDropdownController } from '../core/ui/custom-dropdowns.js';
import { loadSettingsFromStorage } from '../core/state/app-store.js';
import { createSingleFlightRunner } from '../core/async/single-flight.js';
import { createApprovalApiClient } from '../core/http/approval-api.js';
import { createTtsApiClient } from '../core/http/tts-api.js';
import { createApprovalFeature } from '../features/approval/index.js';
import { createScriptsFeature } from '../features/scripts/index.js';
import { createVideoProjectsApiClient } from '../features/video-projects/api.js';
import { createVideoProjectsFeature } from '../features/video-projects/index.js';
import { createAudioFeature } from '../features/audio/index.js';
import { createAudioController } from '../features/audio/controller.js';
import { createAudioRuntime } from '../features/audio/runtime/index.js';
import { createSubtitlesController } from '../features/subtitles/controller.js';
import { createRemoteSubtitlesState } from '../features/subtitles/runtime/index.js';
import { createRadarApiClient } from '../features/radar/api-client.js';
import { createRadarController } from '../features/radar/controller.js';
import { createRadarState } from '../features/radar/state.js';
import { getDomSelectors } from '../shared/dom/selectors.js';
import { createShellState } from './state.js';

// Shared mutable Sets — populated by navigation guards to track per-view state.
const _cssLoaded = new Set();
const _domInjected = new Set();
const _visited = new Set();

export function createAppShellComposition({
  documentRef,
  windowRef,
  storage,
  storageKey,
  lastNewsSearchKey,
  fetchImpl,
  btoaImpl,
  defaultsFactory,
  ui,
  helpers,
  callbacks,
  browser,
}) {
  const settings = loadSettingsFromStorage({
    storage,
    storageKey,
    defaultsFactory,
  });
  const state = createShellState({
    settings,
    lastNewsSearchAt: loadLastNewsSearchAt({ storage, lastNewsSearchKey }),
    subtitles2: createRemoteSubtitlesState(),
  });
  const el = getDomSelectors(documentRef);
  const store = { getState: () => state };
  const customDropdowns = createCustomDropdownController({ root: documentRef });

  const approvalApi = createApprovalApiClient({
    getSettings: () => state.settings,
    fetchImpl,
  });
  const approvalFeature = createApprovalFeature({
    api: approvalApi,
    store,
    ui,
    selectors: el,
    callbacks: {
      renderStats: callbacks.renderStats,
      renderCountryFilter: callbacks.renderCountryFilter,
      renderCards: callbacks.renderCards,
      renderQueue: callbacks.renderQueue,
      renderTopicDetail: callbacks.renderTopicDetail,
      refreshScriptDrafts: callbacks.refreshScriptDrafts,
      confirmDelete: (message) => windowRef.confirm(message),
    },
    helpers: { getErrorMessage: helpers.getErrorMessage },
  });

  const scriptsFeature = createScriptsFeature({
    api: approvalApi,
    store,
    ui,
    selectors: el,
    helpers: { downloadBlob: helpers.downloadBlob },
    callbacks: {
      renderScriptStats: callbacks.renderScriptStats,
      renderScriptCards: callbacks.renderScriptCards,
      renderSelectedScriptEditor: callbacks.renderSelectedScriptEditor,
    },
  });

  const videoProjectsApi = createVideoProjectsApiClient({ fetchImpl });
  const videoProjectsFeature = createVideoProjectsFeature({
    api: videoProjectsApi,
    store,
    ui,
    selectors: el,
    callbacks: {
      renderVideoProjects: callbacks.renderVideoProjects,
      renderSelectedVideoProject: callbacks.renderSelectedVideoProject,
      updateSelectedVideoProjectCompositionPreview: callbacks.updateSelectedVideoProjectCompositionPreview,
    },
  });

  state.radar = createRadarState();
  const radarApi = createRadarApiClient({
    getSettings: () => state.settings,
    fetchImpl,
  });
  const radarController = createRadarController({
    state: state.radar,
    el,
    api: radarApi,
    ui,
    browser: {
      setTimeout: browser.setTimeout,
      clearTimeout: browser.clearTimeout,
      clipboard: browser.clipboard,
    },
  });

  const ttsApi = createTtsApiClient({
    getSettings: () => state.settings,
    fetchImpl,
    btoaImpl,
  });
  const subtitlesController = createSubtitlesController({
    state,
    el,
    api: ttsApi,
    ui,
    helpers: {
      getErrorMessage: helpers.getErrorMessage,
      downloadBlob: helpers.downloadBlob,
      escapeHtml: helpers.escapeHtml,
    },
    customDropdowns,
    browser: {
      URL: browser.URL,
      window: windowRef,
      setTimeout: browser.setTimeout,
      clearTimeout: browser.clearTimeout,
      clearInterval: browser.clearInterval,
    },
  });

  const audioController = createAudioController({
    state,
    el,
    api: ttsApi,
    ui,
    helpers: {
      escapeHtml: helpers.escapeHtml,
      getErrorMessage: helpers.getErrorMessage,
      resolveTtsGet: helpers.resolveTtsGet,
      getBlob: helpers.getBlob,
    },
    browser: {
      fetchImpl,
      URL: browser.URL,
      document: documentRef,
      AbortController: browser.AbortController,
      TextDecoder: browser.TextDecoder,
      setInterval: browser.setInterval,
      clearInterval: browser.clearInterval,
    },
  });
  const audioRuntime = createAudioRuntime({
    hooks: {
      runAudioGeneration: audioController.runAudioGeneration,
      runAudioGenerationFromText: audioController.runAudioGenerationFromText,
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
      getLatestTrackedJobId: audioController.getLatestTrackedJobId,
    },
  });
  const audioFeature = createAudioFeature({
    api: ttsApi,
    store,
    ui,
    selectors: el,
    handlers: { ...audioRuntime },
  });

  // -----------------------------------------------------------------------
  // Lazy factories — for navigation-guard use.
  // Pattern: _ensure*() returns the feature (same eagerly-created instance).
  // In future phases, these can be converted to dynamic import() with lazy creation
  // while the navigation guard interface remains stable.
  // -----------------------------------------------------------------------
  async function _ensureApprovalFeature() { return approvalFeature; }
  async function _ensureScriptsFeature() { return scriptsFeature; }
  async function _ensureVideoProjectsFeature() { return { feature: videoProjectsFeature, api: videoProjectsApi }; }
  async function _ensureAudioFeature() { return { feature: audioFeature, controller: audioController, runtime: audioRuntime }; }
  async function _ensureSubtitlesFeature() { return subtitlesController; }
  async function _ensureRadarFeature() { return { controller: radarController, api: radarApi }; }

  return {
    // Eager pieces
    state,
    el,
    store,
    customDropdowns,
    approvalApi,
    approvalFeature,
    scriptsFeature,
    videoProjectsFeature,
    radarController,
    subtitlesController,
    audioFeature,
    ttsApi,
    runQueueRefresh: createSingleFlightRunner((options) => approvalFeature.refreshQueue(options)),
    runScriptDraftsRefresh: createSingleFlightRunner((options) => scriptsFeature.refreshScriptDrafts(options)),
    runVideoProjectsRefresh: createSingleFlightRunner((options) => videoProjectsFeature.refreshVideoProjects(options)),

    // Lazy factory interface — used by navigation guards
    _ensureApprovalFeature,
    _ensureScriptsFeature,
    _ensureVideoProjectsFeature,
    _ensureAudioFeature,
    _ensureSubtitlesFeature,
    _ensureRadarFeature,

    // Tracker Sets — populated by navigation guards
    _cssLoaded,
    _domInjected,
    _visited,
  };
}

function loadLastNewsSearchAt({ storage, lastNewsSearchKey }) {
  try {
    return storage.getItem(lastNewsSearchKey) || null;
  } catch {
    return null;
  }
}
