import { createCustomDropdownController } from '../core/ui/custom-dropdowns.js';
import { loadSettingsFromStorage } from '../core/state/app-store.js?v=20260519-project-card-polish';
import { createSingleFlightRunner } from '../core/async/single-flight.js';
import { createApprovalApiClient } from '../core/http/approval-api.js';
import { createApprovalFeature } from '../features/approval/index.js';
import { createScriptsFeature } from '../features/scripts/index.js';
import { createVideoProjectsApiClient } from '../features/video-projects/api.js';
import { createVideoProjectsFeature } from '../features/video-projects/index.js';
import { createRadarApiClient } from '../features/radar/api-client.js';
import { createRadarController } from '../features/radar/controller.js';
import { createRadarState } from '../features/radar/state.js';
import { getDomSelectors } from '../shared/dom/selectors.js';
import { createShellState } from './state.js';

// Audio, Subtitles, and TTS API are lazy-loaded via _ensureAudioFeature() and
// _ensureSubtitlesFeature(). This avoids pulling ~25 modules (TTS API client,
// audio controller/runtime, subtitles controller/state/workflow) at boot when
// the user is on the Scripts or Approval view.
//
// Lightweight stubs are returned eagerly so the composition destructuring in
// runtime.js stays stable. The stubs delegate to real instances after first use.

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
    subtitles2: { previewPlaying: false },
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

  const ttsApi = createTtsApiStub();
  const subtitlesController = createSubtitlesStub();
  const audioFeature = createAudioFeatureStub();

  // -----------------------------------------------------------------------
  // Lazy factories — for navigation-guard use.
  // These replace the old eager construction pattern. Modules are loaded
  // via dynamic import() only when the user first navigates to the view.
  // -----------------------------------------------------------------------
  async function _ensureApprovalFeature() { return approvalFeature; }
  async function _ensureScriptsFeature() { return scriptsFeature; }
  async function _ensureVideoProjectsFeature() { return { feature: videoProjectsFeature, api: videoProjectsApi }; }

  let _audioModules = null;
  async function _ensureAudioFeature() {
    if (_audioModules) return _audioModules;
    const [ttsMod, audioCtrlMod, audioRtMod, audioFeatMod] = await Promise.all([
      import('../core/http/tts-api.js'),
      import('../features/audio/controller.js'),
      import('../features/audio/runtime/index.js'),
      import('../features/audio/index.js'),
    ]);
    // Replace the TTS stub with the real client so subtitles can share it.
    Object.assign(ttsApi, ttsMod.createTtsApiClient({
      getSettings: () => state.settings,
      fetchImpl,
      btoaImpl,
    }));
    ttsApi._init = true;
    const audioController = audioCtrlMod.createAudioController({
      state, el, api: ttsApi, ui,
      helpers: {
        escapeHtml: helpers.escapeHtml,
        getErrorMessage: helpers.getErrorMessage,
        resolveTtsGet: helpers.resolveTtsGet,
        getBlob: helpers.getBlob,
      },
      browser: {
        fetchImpl, URL: browser.URL, document: documentRef,
        AbortController: browser.AbortController,
        TextDecoder: browser.TextDecoder,
        setInterval: browser.setInterval,
        clearInterval: browser.clearInterval,
      },
    });
    const audioRuntime = audioRtMod.createAudioRuntime({
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
    const realFeature = audioFeatMod.createAudioFeature({
      api: ttsApi, store, ui, selectors: el,
      handlers: { ...audioRuntime },
    });
    // Replace stub methods with real implementations.
    Object.assign(audioFeature, realFeature);
    _audioModules = { feature: audioFeature, controller: audioController, runtime: audioRuntime };
    return _audioModules;
  }

  let _subtitlesModules = null;
  async function _ensureSubtitlesFeature() {
    if (_subtitlesModules) return _subtitlesModules;
    const [ttsMod, stCtrlMod, stStateMod] = await Promise.all([
      import('../core/http/tts-api.js'),
      import('../features/subtitles/controller.js'),
      import('../features/subtitles/runtime/index.js'),
    ]);
    // Ensure TTS API is available (may already be loaded by audio).
    if (!ttsApi._init) {
      Object.assign(ttsApi, ttsMod.createTtsApiClient({
        getSettings: () => state.settings,
        fetchImpl,
        btoaImpl,
      }));
      ttsApi._init = true;
    }
    // Merge real subtitles state into the stub.
    const realState = stStateMod.createRemoteSubtitlesState();
    Object.assign(state.subtitles2, realState);
    const realController = stCtrlMod.createSubtitlesController({
      state, el, api: ttsApi, ui,
      helpers: {
        getErrorMessage: helpers.getErrorMessage,
        downloadBlob: helpers.downloadBlob,
        escapeHtml: helpers.escapeHtml,
      },
      customDropdowns,
      browser: {
        URL: browser.URL, window: windowRef,
        setTimeout: browser.setTimeout,
        clearTimeout: browser.clearTimeout,
        clearInterval: browser.clearInterval,
      },
    });
    Object.assign(subtitlesController, realController);
    _subtitlesModules = { controller: subtitlesController };
    return _subtitlesModules;
  }

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

// ---------------------------------------------------------------------------
// Lightweight stubs for lazy-loaded features.
// These are returned eagerly by createAppShellComposition so the destructuring
// in runtime.js stays stable. Methods are no-ops until the real modules are
// loaded via _ensureAudioFeature() / _ensureSubtitlesFeature().
// ---------------------------------------------------------------------------
function createTtsApiStub() {
  const stub = {
    _init: false,
    get() { return Promise.reject(new Error('TTS API not loaded yet')); },
    post() { return Promise.reject(new Error('TTS API not loaded yet')); },
    postForm() { return Promise.reject(new Error('TTS API not loaded yet')); },
    getBlob() { return Promise.reject(new Error('TTS API not loaded yet')); },
  };
  return stub;
}

function createSubtitlesStub() {
  const stub = {
    activate() {},
    refreshRemoteStatus() { return Promise.resolve(null); },
    renderWorkflow() {},
  };
  return stub;
}

function createAudioFeatureStub() {
  const stub = {
    startAudioTracking() {},
    startAudioQueueSync() {},
    stopAudioQueueSync() {},
    getLatestTrackedJobId() { return null; },
    runAudioGenerationFromText() { return Promise.reject(new Error('Audio feature not loaded yet')); },
  };
  return stub;
}

function loadLastNewsSearchAt({ storage, lastNewsSearchKey }) {
  try {
    return storage.getItem(lastNewsSearchKey) || null;
  } catch {
    return null;
  }
}
