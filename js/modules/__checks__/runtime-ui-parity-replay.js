import {
  defaultSettingsFactory,
  hydrateSettingsFormValues,
  loadSettingsFromStorage,
  saveSettingsToStorage,
} from '../core/state/app-store.js';
import {
  clearSessionStatus,
  isValidCredentials,
  persistSessionStatus,
  readSessionStatus,
} from '../core/auth/session-gate.js';
import { createApprovalFeature } from '../features/approval/index.js';
import { createScriptsFeature } from '../features/scripts/index.js';
import { createAudioFeature } from '../features/audio/index.js';
import { createSubtitlesFeature } from '../features/subtitles/index.js';

function createMemoryStorage() {
  const data = new Map();
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, value);
    },
    removeItem(key) {
      data.delete(key);
    },
  };
}

function replayAuthSessionScenario() {
  const storage = createMemoryStorage();
  const sessionKey = 'approval-panel-session-v1';

  const valid = isValidCredentials({
    user: 'paneladmin',
    pass: 'Guiones2026!',
    authUser: 'paneladmin',
    authPass: 'Guiones2026!',
  });
  if (!valid) return { ok: false, reason: 'credential validation drift' };

  persistSessionStatus({ storage, sessionKey, value: 'ok' });
  const readAfterPersist = readSessionStatus({ storage, sessionKey });
  if (readAfterPersist !== 'ok') return { ok: false, reason: 'session persist/read drift' };

  clearSessionStatus({ storage, sessionKey });
  const readAfterClear = readSessionStatus({ storage, sessionKey });
  if (readAfterClear !== null) return { ok: false, reason: 'session clear drift' };

  return { ok: true };
}

function replaySettingsScenario() {
  const storage = createMemoryStorage();
  const storageKey = 'approval-panel-settings-v1';
  const defaults = defaultSettingsFactory();

  const loadedDefaults = loadSettingsFromStorage({ storage, storageKey, defaultsFactory: defaultSettingsFactory });
  if (loadedDefaults.baseUrl !== defaults.baseUrl) return { ok: false, reason: 'default settings load drift' };

  const next = {
    ...defaults,
    baseUrl: 'http://localhost:9999',
    secret: 'abc',
  };
  saveSettingsToStorage({ storage, storageKey, nextSettings: next });
  const loadedSaved = loadSettingsFromStorage({ storage, storageKey, defaultsFactory: defaultSettingsFactory });
  if (loadedSaved.baseUrl !== 'http://localhost:9999' || loadedSaved.secret !== 'abc') {
    return { ok: false, reason: 'settings save/load drift' };
  }

  const el = {
    baseUrlInput: { value: '' },
    secretInput: { value: '' },
    ttsBaseUrlInput: { value: '' },
    ttsApiKeyInput: { value: '' },
    ttsBasicUserInput: { value: '' },
    ttsBasicPassInput: { value: '' },
    ttsUserEmailInput: { value: '' },
  };
  hydrateSettingsFormValues({ el, settings: loadedSaved });
  if (el.baseUrlInput.value !== 'http://localhost:9999') {
    return { ok: false, reason: 'settings hydrate drift' };
  }

  return { ok: true };
}

async function replayApprovalScenario() {
  const state = { items: [], queue: [], selectedTopic: null, selectedCardId: null, deletingSource: false };
  const toasts = [];
  const callbacks = { stats: 0, countries: 0, cards: 0, queue: 0, detail: 0 };

  const feature = createApprovalFeature({
    api: {
      async get(path) {
        if (path === '/webhook/approval/pending/supabase/v2') return { items: [{ cluster_id: 'c1', resumen: 'r1' }] };
        if (path === '/webhook/approval/queue/supabase/v2') return { items: [{ cluster_id: 'c1' }] };
        if (path.startsWith('/webhook/approval/topic/supabase/v2')) return { item: { cluster_id: 'c1', tema_principal: 'tema' } };
        return {};
      },
      async post() {
        return { processed: 1, failed: 0 };
      },
    },
    store: { getState: () => state },
    ui: { toast: (msg) => toasts.push(msg) },
    selectors: {
      topicDialog: { showModal() {} },
      runQueueBtn: { disabled: false, textContent: 'Actualizar cola' },
    },
    callbacks: {
      renderStats: () => { callbacks.stats += 1; },
      renderCountryFilter: () => { callbacks.countries += 1; },
      renderCards: () => { callbacks.cards += 1; },
      renderQueue: () => { callbacks.queue += 1; },
      renderTopicDetail: () => { callbacks.detail += 1; },
      confirmDelete: () => false,
    },
    helpers: { getErrorMessage: (err, fallback) => err?.message || fallback },
  });

  await feature.refreshPending();
  await feature.refreshQueue();
  await feature.openDetail('c1');

  if (state.items.length !== 1 || state.queue.length !== 1 || !state.selectedTopic) {
    return { ok: false, reason: 'approval state replay drift' };
  }
  if (callbacks.stats !== 1 || callbacks.queue !== 1 || callbacks.detail !== 1) {
    return { ok: false, reason: 'approval callback replay drift' };
  }

  return { ok: true };
}

async function replayScriptsScenario() {
  const state = {
    scriptDrafts: [],
    selectedScript: null,
    savingScript: false,
    publishingScript: false,
  };
  const toasts = [];
  let showModalCount = 0;

  const selectors = {
    scriptEditorTitle: { textContent: '' },
    scriptEditorMeta: { textContent: '' },
    scriptEditedArea: { value: '' },
    scriptEditedWordCount: { textContent: '' },
    scriptEditorDialog: { showModal() { showModalCount += 1; }, close() {} },
    saveDraftBtn: { disabled: false },
    publishConfirmDialog: { close() {} },
    confirmPublishBtn: { disabled: false },
  };

  const feature = createScriptsFeature({
    api: {
      async get() {
        return {
          items: [{
            cluster_id: 'c1',
            jugador: 'Jugador',
            tema_principal: 'Tema',
            estado: 'borrador_generado',
            guion_draft: 'Texto de guion con suficientes palabras para pasar validación.',
          }],
        };
      },
      async post() {
        return { ok: true };
      },
    },
    store: { getState: () => state },
    ui: { toast: (msg) => toasts.push(msg) },
    selectors,
    callbacks: {
      renderScriptStats() {},
      renderScriptCards() {},
      updateWordCounter(_text, targetEl) { targetEl.textContent = 'Palabras: 9'; },
    },
  });

  await feature.refreshScriptDrafts();
  await feature.openScriptEditor('c1');
  await feature.saveSelectedScript();
  selectors.scriptEditedArea.value = 'Texto de guion editado listo para publicar con suficiente largo.';
  await feature.publishSelectedScript();

  if (state.scriptDrafts.length !== 1 || showModalCount !== 1) {
    return { ok: false, reason: 'scripts replay drift' };
  }

  return { ok: true };
}

function replayAudioScenario() {
  const state = { ran: false, dismissed: false };
  const feature = createAudioFeature({
    api: {},
    store: { getState: () => state },
    ui: {},
    selectors: {},
    handlers: {
      runAudioGeneration() { state.ran = true; },
      startAudioTracking() {},
      applyAudioJobStatus() {},
      startAudioStatusStream() {},
      startAudioPolling() {},
      stopAudioTracking() {},
      startAudioQueueSync() {},
      stopAudioQueueSync() {},
      syncAudioQueueStatuses() {},
      renderAudioQueue() {},
      downloadAudioJob() {},
      dismissAudioJob() { state.dismissed = true; },
    },
  });

  feature.runAudioGeneration();
  feature.dismissAudioJob();
  if (!state.ran || !state.dismissed) return { ok: false, reason: 'audio replay drift' };
  return { ok: true };
}

function replaySubtitlesScenario() {
  const state = { upload: false, ready: false };
  const feature = createSubtitlesFeature({
    api: {},
    store: { getState: () => state },
    ui: {},
    selectors: {},
    handlers: {
      onUploadSelected() { state.upload = true; },
      onSourceLanguageChanged() {},
      onSaveClicked() {},
      onReadyClicked() { state.ready = true; },
      onDownloadClicked() {},
      onTableInput() {},
      onTableClick() {},
      pollStatus() {},
      renderWorkflow() {},
    },
  });

  feature.onUploadSelected();
  feature.onReadyClicked();
  if (!state.upload || !state.ready) return { ok: false, reason: 'subtitles replay drift' };
  return { ok: true };
}

export async function runProtectedFlowsReplay() {
  const scenarios = [
    { name: 'auth/session', run: async () => replayAuthSessionScenario() },
    { name: 'settings', run: async () => replaySettingsScenario() },
    { name: 'approval', run: replayApprovalScenario },
    { name: 'scripts', run: replayScriptsScenario },
    { name: 'audio', run: async () => replayAudioScenario() },
    { name: 'subtitles', run: async () => replaySubtitlesScenario() },
  ];

  const passed = [];
  const failures = [];

  for (const scenario of scenarios) {
    try {
      const result = await scenario.run();
      if (result?.ok) {
        passed.push(scenario.name);
      } else {
        failures.push({ scenario: scenario.name, reason: result?.reason || 'unknown' });
      }
    } catch (err) {
      failures.push({ scenario: scenario.name, reason: err?.message || 'exception' });
    }
  }

  return {
    ok: failures.length === 0,
    passed,
    failures,
  };
}
