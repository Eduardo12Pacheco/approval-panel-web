import { createCustomDropdownController } from '../core/ui/custom-dropdowns.js';
import { loadSettingsFromStorage } from '../core/state/app-store.js';
import { createSingleFlightRunner } from '../core/async/single-flight.js';
import { createApprovalApiClient } from '../core/http/approval-api.js';
import { createTtsApiClient } from '../core/http/tts-api.js';
import { createApprovalFeature } from '../features/approval/index.js';
import { createScriptsFeature } from '../features/scripts/index.js';
import { getDomSelectors } from '../shared/dom/selectors.js';
import { createShellState } from './state.js';

// ── Lazy feature wrappers ──────────────────────────────────────────
// Modules for video-projects, audio, subtitles, and radar are NOT
// fetched until the user navigates to the corresponding view.
// This cuts ~60 network requests and ~1.2s of parse time on boot.

let _lazyVideoProjects = null;
let _lazyAudio = null;
let _lazySubtitles = null;
let _lazyRadar = null;
let _lazyTtsApi = null;

function lazyGet(deps) {
  return {
    videoProjects: async () => {
      if (_lazyVideoProjects) return _lazyVideoProjects;
      const [api, feat] = await Promise.all([
        import('../features/video-projects/api.js'),
        import('../features/video-projects/index.js'),
      ]);
      const vpApi = api.createVideoProjectsApiClient({ fetchImpl: deps.fetchImpl });
      _lazyVideoProjects = feat.createVideoProjectsFeature({
        api: vpApi, store: deps.store, ui: deps.ui, selectors: deps.el,
        callbacks: {
          renderVideoProjects: deps.cb.renderVideoProjects,
          renderSelectedVideoProject: deps.cb.renderSelectedVideoProject,
          updateSelectedVideoProjectCompositionPreview: deps.cb.updateSelectedVideoProjectCompositionPreview,
        },
      });
      return _lazyVideoProjects;
    },

    audio: async () => {
      if (_lazyAudio) return _lazyAudio;
      const [tts, idx, ctrl, rt] = await Promise.all([
        import('../core/http/tts-api.js'),
        import('../features/audio/index.js'),
        import('../features/audio/controller.js'),
        import('../features/audio/runtime/index.js'),
      ]);
      if (!_lazyTtsApi) _lazyTtsApi = tts.createTtsApiClient({ getSettings: deps.getSettings, fetchImpl: deps.fetchImpl, btoaImpl: deps.btoaImpl });
      const ac = ctrl.createAudioController({ state: deps.state, el: deps.el, api: _lazyTtsApi, ui: deps.ui, helpers: deps.audioH, browser: deps.audioB });
      const ar = rt.createAudioRuntime({ hooks: {
        runAudioGeneration: ac.runAudioGeneration, runAudioGenerationFromText: ac.runAudioGenerationFromText,
        startAudioTracking: ac.startAudioTracking, applyAudioJobStatus: ac.applyAudioJobStatus,
        startAudioStatusStream: ac.startAudioStatusStream, startAudioPolling: ac.startAudioPolling,
        stopAudioTracking: ac.stopAudioTracking, startAudioQueueSync: ac.startAudioQueueSync, stopAudioQueueSync: ac.stopAudioQueueSync,
        syncAudioQueueStatuses: ac.syncAudioQueueStatuses, renderAudioQueue: ac.renderAudioQueue,
        downloadAudioJob: ac.downloadAudioJob, dismissAudioJob: ac.dismissAudioJob, getLatestTrackedJobId: ac.getLatestTrackedJobId,
      }});
      _lazyAudio = idx.createAudioFeature({ api: _lazyTtsApi, store: deps.store, ui: deps.ui, selectors: deps.el, handlers: { ...ar } });
      return _lazyAudio;
    },

    subtitles: async () => {
      if (_lazySubtitles) return _lazySubtitles;
      const [tts, ctrl, rt] = await Promise.all([
        import('../core/http/tts-api.js'),
        import('../features/subtitles/controller.js'),
        import('../features/subtitles/runtime/index.js'),
      ]);
      if (!_lazyTtsApi) _lazyTtsApi = tts.createTtsApiClient({ getSettings: deps.getSettings, fetchImpl: deps.fetchImpl, btoaImpl: deps.btoaImpl });
      deps.state.subtitles2 = rt.createRemoteSubtitlesState();
      _lazySubtitles = ctrl.createSubtitlesController({ state: deps.state, el: deps.el, api: _lazyTtsApi, ui: deps.ui, helpers: deps.subH, customDropdowns: deps.cd, browser: deps.subB });
      return _lazySubtitles;
    },

    radar: async () => {
      if (_lazyRadar) return _lazyRadar;
      const [apiM, ctrl, stateM] = await Promise.all([
        import('../features/radar/api-client.js'),
        import('../features/radar/controller.js'),
        import('../features/radar/state.js'),
      ]);
      deps.state.radar = stateM.createRadarState();
      _lazyRadar = ctrl.createRadarController({ state: deps.state.radar, el: deps.el, api: apiM.createRadarApiClient({ getSettings: deps.getSettings, fetchImpl: deps.fetchImpl }), ui: deps.ui, browser: deps.radarB });
      return _lazyRadar;
    },

    videoProjectsApi: async () => {
      if (!_lazyVideoProjects) await lazyGet(deps).videoProjects();
      return null; // api is internal to the feature
    },
  };
}

export function createAppShellComposition({
  documentRef, windowRef, storage, storageKey, lastNewsSearchKey,
  fetchImpl, btoaImpl, defaultsFactory, ui, helpers, callbacks, browser,
}) {
  const settings = loadSettingsFromStorage({ storage, storageKey, defaultsFactory });
  const state = createShellState({ settings, lastNewsSearchAt: loadLastNewsSearchAt({ storage, lastNewsSearchKey }) });
  const el = getDomSelectors(documentRef);
  const store = { getState: () => state };
  const customDropdowns = createCustomDropdownController({ root: documentRef });

  const approvalApi = createApprovalApiClient({ getSettings: () => state.settings, fetchImpl });
  const ttsApi = createTtsApiClient({ getSettings: () => state.settings, fetchImpl, btoaImpl });
  const approvalFeature = createApprovalFeature({
    api: approvalApi, store, ui, selectors: el,
    callbacks: {
      renderStats: callbacks.renderStats, renderCountryFilter: callbacks.renderCountryFilter,
      renderCards: callbacks.renderCards, renderQueue: callbacks.renderQueue,
      renderTopicDetail: callbacks.renderTopicDetail, refreshScriptDrafts: callbacks.refreshScriptDrafts,
      confirmDelete: (message) => windowRef.confirm(message),
    },
    helpers: { getErrorMessage: helpers.getErrorMessage },
  });
  const scriptsFeature = createScriptsFeature({
    api: approvalApi, store, ui, selectors: el,
    helpers: { downloadBlob: helpers.downloadBlob },
    callbacks: {
      renderScriptStats: callbacks.renderScriptStats, renderScriptCards: callbacks.renderScriptCards,
      renderSelectedScriptEditor: callbacks.renderSelectedScriptEditor,
    },
  });

  const lazy = lazyGet({
    state, el, store, ui, fetchImpl, btoaImpl, getSettings: () => state.settings, cd: customDropdowns,
    cb: callbacks,
    audioH: { escapeHtml: helpers.escapeHtml, getErrorMessage: helpers.getErrorMessage, resolveTtsGet: helpers.resolveTtsGet, getBlob: helpers.getBlob },
    audioB: { fetchImpl, URL: browser.URL, document: documentRef, AbortController: browser.AbortController, TextDecoder: browser.TextDecoder, setInterval: browser.setInterval, clearInterval: browser.clearInterval },
    subH: { getErrorMessage: helpers.getErrorMessage, downloadBlob: helpers.downloadBlob, escapeHtml: helpers.escapeHtml },
    subB: { URL: browser.URL, window: windowRef, setTimeout: browser.setTimeout, clearTimeout: browser.clearTimeout, clearInterval: browser.clearInterval },
    radarB: { setTimeout: browser.setTimeout, clearTimeout: browser.clearTimeout, clipboard: browser.clipboard },
  });

  return {
    state, el, store, customDropdowns, approvalApi, ttsApi, approvalFeature, scriptsFeature,
    lazy,
    runQueueRefresh: createSingleFlightRunner((options) => approvalFeature.refreshQueue(options)),
    runScriptDraftsRefresh: createSingleFlightRunner((options) => scriptsFeature.refreshScriptDrafts(options)),
  };
}

function loadLastNewsSearchAt({ storage, lastNewsSearchKey }) {
  try {
    return storage.getItem(lastNewsSearchKey) || null;
  } catch {
    return null;
  }
}
