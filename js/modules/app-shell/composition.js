import { createCustomDropdownController } from '../core/ui/custom-dropdowns.js';
import { loadSettingsFromStorage } from '../core/state/app-store.js';
import { createSingleFlightRunner } from '../core/async/single-flight.js';
import { createApprovalApiClient } from '../core/http/approval-api.js';
import { createApprovalFeature } from '../features/approval/index.js';
import { createScriptsFeature } from '../features/scripts/index.js';
import { createVideoProjectsApiClient } from '../features/video-projects/api.js';
import { getDomSelectors } from '../shared/dom/selectors.js';
import { versionedModule } from '../core/versioning/asset-version.js';
import { createShellState } from './state.js';

// Video-projects (~60 modules), radar (~4 modules), audio (~25 modules),
// and subtitles (~3 modules) are lazy-loaded via _ensure*Feature() factories.
// This avoids pulling ~90 modules at boot when the user is on the Approval
// view. The critical path drops from 1,878ms to ~700ms.
//
// Lightweight stubs are returned eagerly so the composition destructuring in
// runtime.js stays stable. The stubs delegate to real instances after first use
// via Object.assign, which preserves object identity for existing references.

// Shared mutable Sets — populated by navigation guards to track per-view state.
const _cssLoaded = new Set(['approval']);
const _domInjected = new Set();
const _visited = new Set();

export function createAppShellComposition({
  documentRef,
  windowRef,
  storage,
  storageKey,
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
    lastNewsSearchAt: null,
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
  const videoProjectsFeature = createVideoProjectsStub();

  state.radar = { _stub: true };
  const radarController = createRadarStub();
  state.aiRescue = { _stub: true };
  const aiRescueController = createAiRescueStub();

  const ttsApi = createTtsApiStub();
  const subtitlesController = createSubtitlesStub();
  const audioFeature = createAudioFeatureStub();

  // -----------------------------------------------------------------------
  // Lazy factories — for navigation-guard use.
  // These replace the old eager construction pattern. Modules are loaded
  // via dynamic import() only when the user first navigates to the view.
  // -----------------------------------------------------------------------
  async function _ensureApprovalFeature() { return approvalFeature; }

  let _scriptsResolved = false;
  async function _ensureScriptsFeature() {
    if (_scriptsResolved) return scriptsFeature;
    await _ensureVideoProjectsFeature();
    _scriptsResolved = true;
    return scriptsFeature;
  }

  let _videoProjectsModules = null;
  async function _ensureVideoProjectsFeature() {
    if (_videoProjectsModules) return _videoProjectsModules;
    const mod = await import(versionedModule('../features/video-projects/index.js', import.meta.url));
    const realFeature = mod.createVideoProjectsFeature({
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
    Object.assign(videoProjectsFeature, realFeature);
    _videoProjectsModules = { feature: videoProjectsFeature, api: videoProjectsApi };
    return _videoProjectsModules;
  }

  let _audioModules = null;
  async function _ensureAudioFeature() {
    if (_audioModules) return _audioModules;
    const [ttsMod, audioCtrlMod, audioRtMod, audioFeatMod] = await Promise.all([
      import(versionedModule('../core/http/tts-api.js', import.meta.url)),
      import(versionedModule('../features/audio/controller.js', import.meta.url)),
      import(versionedModule('../features/audio/runtime/index.js', import.meta.url)),
      import(versionedModule('../features/audio/index.js', import.meta.url)),
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
      import(versionedModule('../core/http/tts-api.js', import.meta.url)),
      import(versionedModule('../features/subtitles/controller.js', import.meta.url)),
      import(versionedModule('../features/subtitles/runtime/index.js', import.meta.url)),
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

  let _radarModules = null;
  async function _ensureRadarFeature() {
    if (_radarModules) return _radarModules;
    const [stateMod, apiMod, ctrlMod] = await Promise.all([
      import(versionedModule('../features/radar/state.js', import.meta.url)),
      import(versionedModule('../features/radar/api-client.js', import.meta.url)),
      import(versionedModule('../features/radar/controller.js', import.meta.url)),
    ]);
    const realState = stateMod.createRadarState();
    Object.assign(state.radar, realState);
    const radarApi = apiMod.createRadarApiClient({
      getSettings: () => state.settings,
      fetchImpl,
    });
    const realController = ctrlMod.createRadarController({
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
    Object.assign(radarController, realController);
    _radarModules = { controller: radarController, api: radarApi };
    return _radarModules;
  }

  let _aiRescueModules = null;
  async function _ensureAiRescueFeature() {
    if (_aiRescueModules) return _aiRescueModules;
    const [stateMod, apiMod, ctrlMod] = await Promise.all([
      import(versionedModule('../features/ai-rescue/state.js', import.meta.url)),
      import(versionedModule('../features/ai-rescue/api-client.js', import.meta.url)),
      import(versionedModule('../features/ai-rescue/controller.js', import.meta.url)),
    ]);
    const realState = stateMod.createAiRescueState();
    Object.assign(state.aiRescue, realState);
    const aiRescueApi = apiMod.createAiRescueApiClient({
      getSettings: () => state.settings,
      fetchImpl,
    });
    const realController = ctrlMod.createAiRescueController({
      state: state.aiRescue,
      el,
      api: aiRescueApi,
      ui,
      browser: {
        setInterval: browser.setInterval,
        clearInterval: browser.clearInterval,
        window: windowRef,
      },
    });
    Object.assign(aiRescueController, realController);
    _aiRescueModules = { controller: aiRescueController, api: aiRescueApi };
    return _aiRescueModules;
  }

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
    aiRescueController,
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
    _ensureAiRescueFeature,

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
// loaded via _ensureVideoProjectsFeature() / _ensureRadarFeature() /
// _ensureAudioFeature() / _ensureSubtitlesFeature().
// ---------------------------------------------------------------------------
function createVideoProjectsStub() {
  return {
    refreshVideoProjects() { return Promise.resolve(); },
    createManualVideoProject() { return Promise.reject(new Error('Video projects not loaded yet')); },
    prefetchProjectDetail() {},
    disableVideoProject() {},
    openVideoProject() { return Promise.reject(new Error('Video projects not loaded yet')); },
    closeVideoProject() {},
    toggleImageSelection() {},
    goToAudioStep() {},
    goToImagesStep() {},
    uploadProjectAudio() {},
    selectDefaultBackgroundMusic() {},
    uploadCustomImages() {},
    preparePreview() {},
    refreshPreview() {},
    exportFinal() {},
    updateRow() {},
    swapRowImages() {},
    assignExistingImageToRow() {},
    uploadAndAssignImage() {},
    uploadVideoToLibrary() {},
    assignVideoSegmentToRow() {},
    updateGlobalAudio() {},
    updateBrandChannel() {},
  };
}

function createRadarStub() {
  return {
    bindEvents() {},
    activate() {},
    stopPolling() {},
  };
}
function createAiRescueStub() {
  return {
    bindEvents() {},
    activate() { return Promise.resolve(); },
    deactivate() {},
    render() {},
  };
}
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
