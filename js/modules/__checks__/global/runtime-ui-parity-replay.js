import {
  defaultSettingsFactory,
  hydrateSettingsFormValues,
  loadSettingsFromStorage,
  saveSettingsToStorage,
} from '../../core/state/app-store.js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  clearSessionStatus,
  isValidCredentials,
  persistSessionStatus,
  readSessionStatus,
} from '../../core/auth/session-gate.js';
import { createApprovalFeature } from '../../features/approval/index.js';
import * as scriptsFacade from '../../features/scripts/index.js';
import { createAudioFeature } from '../../features/audio/index.js';
import { createSubtitlesFeature } from '../../features/subtitles/index.js';
import {
  resolveCompositionDustUrl,
  resolveCompositionLogoUrl,
} from '../../features/video-projects/composition/composition-view-model.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODULES_ROOT = path.resolve(__dirname, '..', '..');
const { createScriptsFeature } = scriptsFacade;

async function readModuleSource(relativePath) {
  return readFile(path.join(MODULES_ROOT, relativePath), 'utf8');
}

function assertContainsAll(source, tokens, reason) {
  const missing = tokens.filter((token) => !source.includes(token));
  if (missing.length) {
    return { ok: false, reason: `${reason}: missing ${missing.join(', ')}` };
  }
  return { ok: true };
}

function assertTokenOrder(source, tokens, reason) {
  let previousIndex = -1;
  for (const token of tokens) {
    const nextIndex = source.indexOf(token, previousIndex + 1);
    if (nextIndex === -1) {
      return { ok: false, reason: `${reason}: missing or reordered ${token}` };
    }
    previousIndex = nextIndex;
  }
  return { ok: true };
}

async function readOptionalModuleSource(relativePath) {
  try {
    return await readModuleSource(relativePath);
  } catch (err) {
    return '';
  }
}

function assertExportInventory(moduleNamespace, exportNames, reason) {
  const missing = exportNames.filter((name) => typeof moduleNamespace[name] !== 'function');
  if (missing.length) {
    return { ok: false, reason: `${reason}: missing ${missing.join(', ')}` };
  }
  return { ok: true };
}

function assertAllAbsent(sourceByPath, tokens, reason) {
  const hits = [];
  for (const [sourcePath, source] of Object.entries(sourceByPath)) {
    for (const token of tokens) {
      if ((source || '').includes(token)) hits.push(`${sourcePath} -> ${token}`);
    }
  }
  if (hits.length) return { ok: false, reason: `${reason}: ${hits.join(', ')}` };
  return { ok: true };
}

function extractFunctionSource(source, functionName) {
  const signaturePattern = new RegExp(`(?:async\\s+)?function\\s+${functionName}\\s*\\(`, 'g');
  const match = signaturePattern.exec(source);
  if (!match) return '';
  const start = match.index;
  const paramsStart = source.indexOf('(', start);
  if (paramsStart === -1) return '';
  let paramsDepth = 0;
  let paramsEnd = -1;
  for (let index = paramsStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '(') paramsDepth += 1;
    if (char === ')') {
      paramsDepth -= 1;
      if (paramsDepth === 0) {
        paramsEnd = index;
        break;
      }
    }
  }
  if (paramsEnd === -1) return '';
  const bodyStart = source.indexOf('{', paramsEnd);
  if (bodyStart === -1) return '';
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  return '';
}

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
  if (loadedDefaults.approvalPipelineBaseUrl !== 'http://127.0.0.1:3042') return { ok: false, reason: 'default approval pipeline setting drift' };

  const next = {
    ...defaults,
    baseUrl: 'http://localhost:9999',
    secret: 'abc',
    remotionApiUrl: 'http://127.0.0.1:3037',
    approvalPipelineBaseUrl: ' https://approval.local ',
  };
  saveSettingsToStorage({ storage, storageKey, nextSettings: next });
  const loadedSaved = loadSettingsFromStorage({ storage, storageKey, defaultsFactory: defaultSettingsFactory });
  if (loadedSaved.baseUrl !== 'http://localhost:9999' || loadedSaved.secret !== 'abc' || loadedSaved.remotionApiUrl !== 'http://127.0.0.1:3037') {
    return { ok: false, reason: 'settings save/load drift' };
  }
  if (loadedSaved.approvalPipelineBaseUrl !== 'https://approval.local') {
    return { ok: false, reason: 'settings approval pipeline save/load drift' };
  }

  const el = {
    baseUrlInput: { value: '' },
    secretInput: { value: '' },
    ttsBaseUrlInput: { value: '' },
    ttsApiKeyInput: { value: '' },
    ttsBasicUserInput: { value: '' },
    ttsBasicPassInput: { value: '' },
    remotionApiUrlInput: { value: '' },
    approvalPipelineBaseUrlInput: { value: '' },
  };
  hydrateSettingsFormValues({ el, settings: loadedSaved });
  if (el.baseUrlInput.value !== 'http://localhost:9999' || el.remotionApiUrlInput.value !== 'http://127.0.0.1:3037') {
    return { ok: false, reason: 'settings hydrate drift' };
  }
  if (el.approvalPipelineBaseUrlInput.value !== 'https://approval.local') {
    return { ok: false, reason: 'settings approval pipeline hydrate drift' };
  }

  const elWithEmptyRemotion = {
    baseUrlInput: { value: '' },
    secretInput: { value: '' },
    ttsBaseUrlInput: { value: '' },
    ttsApiKeyInput: { value: '' },
    ttsBasicUserInput: { value: '' },
    ttsBasicPassInput: { value: '' },
    remotionApiUrlInput: { value: '' },
    approvalPipelineBaseUrlInput: { value: '' },
  };
  hydrateSettingsFormValues({ el: elWithEmptyRemotion, settings: { ...loadedSaved, remotionApiUrl: '', approvalPipelineBaseUrl: '   ' } });
  if (elWithEmptyRemotion.remotionApiUrlInput.value !== 'https://remotion-api.automatizacionedun8n.me') {
    return { ok: false, reason: 'settings remotion fallback drift' };
  }
  if (elWithEmptyRemotion.approvalPipelineBaseUrlInput.value !== '') {
    return { ok: false, reason: 'settings blank approval pipeline normalize drift' };
  }

  return { ok: true };
}

function replayCompositionAssetsScenario() {
  const dustOneUrl = resolveCompositionDustUrl({}, [{ dust: { enabled: true, type: 'dust-1' } }]);
  if (dustOneUrl !== './assets/dust-1.webm') return { ok: false, reason: 'dust-1 preview asset drift' };

  const dustUrl = resolveCompositionDustUrl({}, [{ dust: { enabled: true, type: 'dust-2' } }]);
  if (dustUrl !== './assets/dust-2.webm') return { ok: false, reason: 'dust-2 preview asset drift' };

  const missingLogoUrl = resolveCompositionLogoUrl({
    editor_state: {
      approval_contract_snapshot: {
        globalLayers: { logo: { enabled: true, source: 'logo-alpha.webm' } },
      },
    },
  });
  if (missingLogoUrl !== './assets/logo-alpha.webm') return { ok: false, reason: 'local logo fallback drift' };

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
    dismissedProcessedScripts: new Set(),
  };
  const toasts = [];
  const posts = [];
  const blobs = [];
  const downloads = [];
  let showModalCount = 0;
  let publishMode = 'sync';

  const selectors = {
    scriptEditorTitle: { textContent: '' },
    scriptEditorMeta: { textContent: '' },
    scriptEditedArea: { value: '' },
    scriptEditedWordCount: { textContent: '' },
    scriptEditorDialog: { showModal() { showModalCount += 1; }, close() {} },
    saveDraftBtn: { disabled: false },
    downloadDraftBtn: { disabled: false },
    publishConfirmDialog: { close() {} },
    confirmPublishBtn: { disabled: false },
  };

  const feature = createScriptsFeature({
    api: {
      async get() {
        return {
          items: [
            {
              cluster_id: 'c1',
              jugador: 'Jugador',
              tema_principal: 'Tema',
              estado: 'borrador_generado',
              guion_draft: 'Texto de guion con suficientes palabras para pasar validación.',
            },
            {
              draft_id: 'processed-1',
              jugador: 'Procesado',
              tema_principal: 'Tema procesado',
              estado_guion: 'publicado',
              doc_id: 'doc-1',
              guion_editado: 'Texto procesado con suficiente longitud para descargar.',
            },
          ],
        };
      },
      async post(endpoint, payload) {
        posts.push({ endpoint, payload });
        if (endpoint === '/webhook/mvp-script-publish/supabase/v2' && publishMode === 'async-failed') {
          return { job_id: 'job-failed', status: 'queued', stage: 'queued' };
        }
        if (endpoint === '/webhook/mvp-script-publish-status/supabase/v1') {
          return { status: 'failed', stage: 'failed', error: 'Falló desde replay' };
        }
        if (endpoint === '/webhook/mvp-script-publish/supabase/v2') {
          return { doc_id: 'doc-sync', doc_url: 'https://docs.local/doc-sync', estado_guion: 'publicado' };
        }
        return { ok: true };
      },
      async postBlob(endpoint, payload) {
        blobs.push({ endpoint, payload });
        return { blob: { size: 1 }, filename: '' };
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
    helpers: {
      downloadBlob(blob, filename) { downloads.push({ blob, filename }); },
    },
  });

  await feature.refreshScriptDrafts();
  await feature.openScriptEditor('c1');
  await feature.saveSelectedScript();
  selectors.scriptEditedArea.value = 'Texto de guion editado listo para publicar con suficiente largo.';
  await feature.publishSelectedScript();
  const saveThenPublish = assertTokenOrder(
    posts.map((entry) => entry.endpoint).join('\n'),
    [
      '/webhook/mvp-script-draft-save/supabase/v2',
      '/webhook/mvp-script-publish/supabase/v2',
    ],
    'scripts save-before-publish endpoint order drift',
  );
  if (!saveThenPublish.ok) return saveThenPublish;

  state.selectedScript = {
    draft_id: 'docx-fallback',
    jugador: 'Jugador Ágil',
    tema_principal: 'Título con acento',
    doc_id: 'doc-sync',
  };
  await feature.downloadSelectedScriptDocx();
  if (blobs[0]?.endpoint !== '/webhook/mvp-script-download-doc/supabase/v1') return { ok: false, reason: 'scripts DOCX endpoint drift' };
  if (blobs[0]?.payload?.format !== 'docx' || blobs[0]?.payload?.draft_id !== 'docx-fallback') return { ok: false, reason: 'scripts DOCX payload drift' };
  if (downloads[0]?.filename !== 'Jugador Agil - Titulo con acento.docx') return { ok: false, reason: 'scripts DOCX filename fallback drift' };

  await feature.dismissProcessedScript('processed-1');
  const dismissPost = posts.find((entry) => entry.payload?.action === 'dismiss_processed');
  if (!dismissPost || dismissPost.endpoint !== '/webhook/mvp-script-draft-save/supabase/v2') return { ok: false, reason: 'scripts processed dismiss contract drift' };
  if (state.scriptDrafts.some((row) => row.draft_id === 'processed-1')) return { ok: false, reason: 'scripts processed dismiss list drift' };

  publishMode = 'async-failed';
  state.selectedScript = state.scriptDrafts.find((row) => row.cluster_id === 'c1');
  selectors.scriptEditedArea.value = 'Texto de guion editado listo para publicar con suficiente largo.';
  await feature.publishSelectedScript();
  await Promise.resolve();
  await Promise.resolve();
  if (state.scriptPublishJob?.status !== 'failed') return { ok: false, reason: 'scripts failed publish job state drift' };
  if (!state.scriptPublishJob?.error || !toasts.includes('Falló desde replay')) return { ok: false, reason: 'scripts failed publish toast drift' };

  if (state.scriptDrafts.length !== 1 || showModalCount !== 1) {
    return { ok: false, reason: 'scripts replay drift' };
  }

  return { ok: true };
}

async function replayScriptsFacadeParityScenario() {
  const publicExports = [
    'getScriptPublishStageMeta',
    'normalizeScriptDraftRows',
    'buildScriptSelectionCardMarkup',
    'resolveScriptListKey',
    'resolveScriptTitle',
    'isScriptProcessed',
    'resolveScriptIdentity',
    'scriptPublishJobMatchesRow',
    'resolveScriptPublishCardState',
    'buildScriptDocxFilename',
    'createScriptsFeature',
  ];
  const exportInventory = assertExportInventory(scriptsFacade, publicExports, 'scripts facade export inventory drift');
  if (!exportInventory.ok) return exportInventory;

  const [
    indexSource,
    renderSource,
    domainSource,
    publishStatusSource,
    cardsSource,
    clientSource,
    pollingSource,
    controllerSource,
    compositionSource,
    runtimeSource,
    eventsSource,
    voiceSource,
  ] = await Promise.all([
    readModuleSource('features/scripts/index.js'),
    readModuleSource('features/scripts/render.js'),
    readModuleSource('features/scripts/domain.js'),
    readModuleSource('features/scripts/publish-status.js'),
    readModuleSource('features/scripts/cards.js'),
    readModuleSource('features/scripts/client.js'),
    readModuleSource('features/scripts/polling.js'),
    readModuleSource('features/scripts/controller.js'),
    readModuleSource('app-shell/composition.js'),
    readModuleSource('app-shell/runtime.js'),
    readModuleSource('app-shell/events/scripts.js'),
    readModuleSource('app-shell/voice/script-to-audio.js'),
  ]);

  const facadeContract = assertContainsAll(
    indexSource,
    publicExports.map((name) => `export { ${name} }`).concat([
      "from './domain.js'",
      "from './publish-status.js'",
      "from './cards.js'",
      "from './controller.js'",
    ]),
    'scripts facade re-export contract drift',
  );
  if (!facadeContract.ok) return facadeContract;

  const appShellBoundary = assertAllAbsent(
    {
      'app-shell/composition.js': compositionSource,
      'app-shell/runtime.js': runtimeSource,
      'app-shell/events/scripts.js': eventsSource,
      'app-shell/voice/script-to-audio.js': voiceSource,
    },
    [
      'features/scripts/domain.js',
      'features/scripts/publish-status.js',
      'features/scripts/cards.js',
      'features/scripts/client.js',
      'features/scripts/polling.js',
      'features/scripts/controller.js',
      '../features/scripts/domain.js',
      '../features/scripts/publish-status.js',
      '../features/scripts/cards.js',
      '../features/scripts/client.js',
      '../features/scripts/polling.js',
      '../features/scripts/controller.js',
      '../../features/scripts/domain.js',
      '../../features/scripts/publish-status.js',
      '../../features/scripts/cards.js',
      '../../features/scripts/client.js',
      '../../features/scripts/polling.js',
      '../../features/scripts/controller.js',
    ],
    'app-shell imported scripts internals',
  );
  if (!appShellBoundary.ok) return appShellBoundary;

  const source = [domainSource, publishStatusSource, cardsSource, clientSource, pollingSource, controllerSource].join('\n');
  const staticContracts = assertContainsAll(
    source,
    [
      '/webhook/mvp-script-drafts-pending/supabase/v2',
      '/webhook/mvp-script-draft-save/supabase/v2',
      '/webhook/mvp-script-publish/supabase/v2',
      '/webhook/mvp-script-publish-status/supabase/v1',
      '/webhook/mvp-script-download-doc/supabase/v1',
      'SCRIPT_PUBLISH_POLL_INTERVAL_MS = 3000',
      'guion_editado',
      'dismiss_processed',
      'format: \'docx\'',
      'ERROR',
      'Ocultar guion procesado',
      'Guion ocultado del panel',
      'await saveScriptDraft',
      'await publishScriptDraft',
      'buildScriptDocxFilename',
    ],
    'scripts static endpoint/payload/copy contract drift',
  );
  if (!staticContracts.ok) return staticContracts;

  const renderBoundary = assertAllAbsent(
    { 'features/scripts/render.js': renderSource },
    ["from './index.js'"],
    'scripts render imports facade instead of siblings',
  );
  if (!renderBoundary.ok) return renderBoundary;

  return { ok: true };
}

export async function runAudioParityReplay() {
  const state = {
    ran: false,
    dismissed: false,
    settings: { ttsBaseUrl: 'https://tts.local', ttsApiKey: 'tts-key' },
    audioRunning: false,
    audioJobs: {},
    audioJobOrder: [],
    dismissedAudioJobs: new Set(),
    audioJobId: null,
    audioPollingToken: null,
    audioPollingTimer: null,
    audioPollingErrorStreak: 0,
    audioPollingInFlight: false,
    audioStreamController: null,
    audioQueueSyncTimer: null,
    audioQueueSyncInFlight: false,
  };
  const featureCalls = [];
  const feature = createAudioFeature({
    api: {},
    store: { getState: () => state },
    ui: {},
    selectors: {},
    handlers: {
      runAudioGeneration() { state.ran = true; featureCalls.push('run'); },
      runAudioGenerationFromText(payload) { featureCalls.push(['run-text', payload]); },
      startAudioTracking(jobId) { featureCalls.push(['track', jobId]); },
      applyAudioJobStatus() {},
      startAudioStatusStream() {},
      startAudioPolling() {},
      stopAudioTracking() {},
      startAudioQueueSync() {},
      stopAudioQueueSync() {},
      syncAudioQueueStatuses() {},
      renderAudioQueue() {},
      downloadAudioJob(jobId) { featureCalls.push(['download', jobId]); },
      dismissAudioJob(jobId) { state.dismissed = true; featureCalls.push(['dismiss', jobId]); },
      getLatestTrackedJobId() { featureCalls.push('latest'); return 'job-latest'; },
    },
  });

  feature.runAudioGeneration();
  feature.dismissAudioJob('job-dismiss');
  const latest = feature.getLatestTrackedJobId();
  if (!state.ran || !state.dismissed) return { ok: false, reason: 'audio replay drift' };
  if (latest !== 'job-latest') return { ok: false, reason: 'audio facade latest tracked job drift' };
  if (JSON.stringify(featureCalls) !== JSON.stringify(['run', ['dismiss', 'job-dismiss'], 'latest'])) {
    return { ok: false, reason: 'audio facade call order drift' };
  }

  const audioParityResult = await replayAudioControllerParityScenario();
  if (!audioParityResult.ok) return audioParityResult;
  return { ok: true };
}

async function replayAudioControllerParityScenario() {
  const { createAudioController } = await import('../../features/audio/controller.js');
  const toasts = [];
  const ttsGetPaths = [];
  const blobPaths = [];
  const fetchUrls = [];
  const intervalDelays = [];
  const clickedDownloads = [];
  const state = {
    settings: { ttsBaseUrl: 'https://tts.local', ttsApiKey: 'tts-key' },
    audioRunning: false,
    audioJobs: {
      'job-done': { job_id: 'job-done', title: 'Audio final', status: 'done', progress: { stage: 'done', percent: 100 } },
      'job-running': { job_id: 'job-running', title: 'Audio running', status: 'processing', progress: { stage: 'synthesizing', percent: 55 } },
    },
    audioJobOrder: ['job-running', 'job-done'],
    dismissedAudioJobs: new Set(),
    audioJobId: null,
    audioPollingToken: null,
    audioPollingTimer: null,
    audioPollingErrorStreak: 0,
    audioPollingInFlight: false,
    audioStreamController: null,
    audioQueueSyncTimer: null,
    audioQueueSyncInFlight: false,
  };

  const audioQueueList = {
    innerHTML: '',
    classList: {
      values: new Set(),
      add(value) { this.values.add(value); },
      remove(value) { this.values.delete(value); },
    },
  };
  const documentRef = {
    body: { appendChild() {} },
    createElement(tag) {
      return {
        tag,
        href: '',
        download: '',
        click() { clickedDownloads.push(this.download); },
        remove() {},
      };
    },
  };
  const intervals = new Map();
  let nextIntervalId = 1;
  let deferredJobAFetch;
  let deferredJobBFetch;

  class FakeAbortController {
    constructor() { this.signal = { aborted: false }; }
    abort() { this.signal.aborted = true; }
  }

  const controller = createAudioController({
    state,
    el: {
      audioPresetSelect: { value: 'balanced_default' },
      audioTextArea: { value: 'Texto suficientemente largo para generar audio de prueba.' },
      audioRunBtn: { disabled: false },
      audioQueueList,
      audioQueueMeta: { textContent: '' },
    },
    api: {
      buildTtsHeaders() { return { 'x-api-key': 'tts-key' }; },
      async post() { return { job_id: 'job-created', status: 'queued' }; },
    },
    ui: { toast: (message) => toasts.push(message) },
    helpers: {
      escapeHtml(value) {
        return (value || '').toString().replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
      },
      getErrorMessage(err, fallback) { return err?.message || fallback; },
      resolveTtsGet: () => async (path) => {
        ttsGetPaths.push(path);
        return { status: path.includes('job-b') ? 'done' : 'processing', progress: { stage: 'done', percent: 100 } };
      },
      getBlob: async (path) => { blobPaths.push(path); return { type: 'audio/wav' }; },
    },
    browser: {
      fetchImpl: async (url) => {
        fetchUrls.push(url);
        if (url.includes('job-a')) {
          return new Promise((resolve) => { deferredJobAFetch = resolve; });
        }
        if (url.includes('job-b')) {
          return new Promise((resolve) => { deferredJobBFetch = resolve; });
        }
        return { ok: false, body: null };
      },
      URL: {
        createObjectURL() { return 'blob://audio'; },
        revokeObjectURL() {},
      },
      document: documentRef,
      AbortController: FakeAbortController,
      TextDecoder,
      setInterval(fn, delay) {
        const id = nextIntervalId;
        nextIntervalId += 1;
        intervalDelays.push(delay);
        intervals.set(id, { fn, delay });
        return id;
      },
      clearInterval(id) { intervals.delete(id); },
    },
  });

  controller.renderAudioQueue();
  if (!audioQueueList.innerHTML.includes('data-action="dismiss-audio-job"')) {
    return { ok: false, reason: 'audio queue dismiss action drift' };
  }
  if (!audioQueueList.innerHTML.includes('data-action="download-audio-job"')) {
    return { ok: false, reason: 'audio queue download action drift' };
  }

  await controller.downloadAudioJob('job-done');
  if (blobPaths[0] !== '/api/tts/jobs/job-done/download' || clickedDownloads[0] !== 'job-done.wav') {
    return { ok: false, reason: 'audio download contract drift' };
  }

  controller.dismissAudioJob('job-running');
  if (!state.dismissedAudioJobs.has('job-running') || !audioQueueList.innerHTML.includes('job-done')) {
    return { ok: false, reason: 'audio dismiss render drift' };
  }

  controller.startAudioTracking('job-a');
  controller.startAudioTracking('job-b');
  deferredJobAFetch?.({ ok: false, body: null });
  await Promise.resolve();
  await Promise.resolve();
  if (ttsGetPaths.some((path) => path.includes('job-a'))) {
    return { ok: false, reason: 'stale audio token triggered polling' };
  }

  deferredJobBFetch?.({ ok: false, body: null });
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  if (!fetchUrls.includes('https://tts.local/api/tts/jobs/job-b/events')) {
    return { ok: false, reason: 'audio SSE endpoint drift' };
  }
  if (!ttsGetPaths.includes('/api/tts/jobs/job-b')) {
    return { ok: false, reason: 'audio SSE fallback polling drift' };
  }
  if (state.audioJobId !== null || state.audioPollingToken !== null || state.audioPollingTimer !== null) {
    return { ok: false, reason: 'audio terminal polling cleanup drift' };
  }
  if (!intervalDelays.includes(4000)) return { ok: false, reason: 'audio polling timer drift' };

  state.audioJobOrder = ['job-done'];
  state.dismissedAudioJobs.clear();
  await controller.syncAudioQueueStatuses();
  if (!ttsGetPaths.includes('/api/tts/jobs/job-done')) {
    return { ok: false, reason: 'audio queue status sync drift' };
  }

  controller.startAudioQueueSync();
  if (!intervalDelays.includes(6000)) return { ok: false, reason: 'audio queue sync timer drift' };
  controller.stopAudioQueueSync();

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

export async function runAppShellLifecycleReplay() {
  const [facadeSource, indexSource, runtimeSource, lifecycleSource] = await Promise.all([
    readModuleSource('app-shell.js'),
    readModuleSource('app-shell/index.js'),
    readModuleSource('app-shell/runtime.js'),
    readModuleSource('app-shell/lifecycle.js'),
  ]);

  const publicContract = assertContainsAll(
    `${facadeSource}\n${indexSource}\n${runtimeSource}\n${lifecycleSource}`,
    [
      'export function bootApp()',
      'export function bootCompatibilityShell()',
      'export const __testHooks',
      'setTtsGetMock',
      'setToastMock',
      'clearMocksForTesting',
      "export { bootApp, bootCompatibilityShell, __testHooks } from './runtime.js';",
      'createAppShellLifecycle',
    ],
    'app-shell public boot contract drift',
  );
  if (!publicContract.ok) return publicContract;

  const bootCompatibilityShell = extractFunctionSource(lifecycleSource, 'bootCompatibilityShell');
  const bootOrder = assertTokenOrder(
    bootCompatibilityShell,
    [
      'bindEvents();',
      'customDropdowns.mountAll();',
      'hydrateSettingsForm();',
      "el.runQueueBtn.textContent = 'Actualizar cola';",
      'renderSearchRefreshState();',
      'renderSelectedScriptEditor();',
      'renderSelectedVideoProject();',
      'boot();',
    ],
    'app-shell boot order drift',
  );
  if (!bootOrder.ok) return bootOrder;

  const bootSource = extractFunctionSource(lifecycleSource, 'boot');
  const authToggle = assertTokenOrder(
    bootSource,
    [
      'readSessionStatus({ storage, cookieJar, sessionKey })',
      "el.authGate.classList.add('hidden');",
      "el.appShell.classList.remove('hidden');",
      "setView('approval');",
      'refreshAll();',
      "el.authGate.classList.remove('hidden');",
      "el.appShell.classList.add('hidden');",
    ],
    'app-shell auth/app shell toggle drift',
  );
  if (!authToggle.ok) return authToggle;

  const settingsHydration = assertContainsAll(
    runtimeSource,
    [
      'hydrateSettingsForm: settingsController.hydrateSettingsForm',
      'function refreshAll()',
      'refreshPending()',
      'refreshQueue()',
      'refreshScriptDrafts()',
      'refreshVideoProjects({ silent: true })',
    ],
    'app-shell settings hydration or initial refresh drift',
  );
  if (!settingsHydration.ok) return settingsHydration;

  return { ok: true };
}

export async function runAppShellSetViewReplay() {
  const navigationSource = await readModuleSource('app-shell/views/navigation.js');
  const setViewSource = extractFunctionSource(navigationSource, 'setView');
  if (!setViewSource) return { ok: false, reason: 'app-shell setView missing' };

  const navAndViews = assertContainsAll(
    setViewSource,
    [
      'const nextView = normalizeShellView(view);',
      'state.currentView = nextView;',
      'ensureApprovalAutoRefresh();',
      "el.viewApproval.classList.toggle('hidden', !isApproval);",
      "el.viewScripts.classList.toggle('hidden', !isScripts);",
      "el.viewAudio.classList.toggle('hidden', !isAudio);",
      "el.viewRadar?.classList.toggle('hidden', !isRadar);",
      "el.viewSubtitulos2?.classList.toggle('hidden', !isSubtitulos2);",
      "btn.classList.toggle('active', btn.dataset.view === nextView);",
    ],
    'app-shell navigation/view activation drift',
  );
  if (!navAndViews.ok) return navAndViews;

  const sideEffects = assertContainsAll(
    setViewSource,
    [
      'audioFeature.getLatestTrackedJobId()',
      'audioFeature.startAudioTracking(nextTrack)',
      'audioFeature.startAudioQueueSync();',
      'audioFeature.stopAudioQueueSync();',
      'refreshVideoProjects({ silent: true })',
      'renderSelectedVideoProject();',
      'subtitlesController.refreshRemoteStatus()',
      'subtitlesController.renderWorkflow();',
      'radarController.render();',
      'radarController.refreshHealth()',
      'radarController.refreshHistory()',
      'radarController.stopPolling();',
    ],
    'app-shell setView side effect drift',
  );
  if (!sideEffects.ok) return sideEffects;

  const audioOrder = assertTokenOrder(
    setViewSource,
    [
      'audioFeature.getLatestTrackedJobId()',
      'audioFeature.startAudioTracking(nextTrack)',
      'audioFeature.startAudioQueueSync();',
    ],
    'app-shell Audio view tracking/queue order drift',
  );
  if (!audioOrder.ok) return audioOrder;

  return { ok: true };
}

export async function runScriptToAudioVoiceReplay() {
  const voiceSource = await readModuleSource('app-shell/voice/script-to-audio.js');
  const readyStateSource = extractFunctionSource(voiceSource, 'getVoiceAiReadyState');
  const flowSource = extractFunctionSource(voiceSource, 'runVoiceAiFromSelectedScript');
  const titleSource = extractFunctionSource(voiceSource, 'buildVoiceAiJobTitle');
  if (!readyStateSource || !flowSource || !titleSource) {
    return { ok: false, reason: 'Script to Audio voice flow function missing' };
  }

  const guards = assertContainsAll(
    readyStateSource,
    [
      'Seleccioná un guion antes de generar voz',
      'Primero procesá el guion para usar la versión con pronunciación.',
      'Tenés cambios sin procesar. Procesá de nuevo antes de generar voz.',
      'selected.guion_pronunciacion',
      'Este guion no tiene versión de pronunciación. Procesalo de nuevo para generar voz.',
      'return { selected, pronunciationText };',
    ],
    'Script to Audio ready-state guard drift',
  );
  if (!guards.ok) return guards;

  const syncOrder = assertTokenOrder(
    flowSource,
    [
      'const ready = getVoiceAiReadyState();',
      'const { selected, pronunciationText } = ready;',
      'const preset = (voiceProfile || el.audioPresetSelect.value || \'balanced_default\').trim();',
      'el.audioTextArea.value = pronunciationText;',
      'el.audioPresetSelect.value = preset;',
      "el.audioPresetSelect.dispatchEvent(new Event('change', { bubbles: true }));",
      'updateWordCounter(pronunciationText, el.audioWordCount);',
      "setView('audio');",
      'await audioFeature.runAudioGenerationFromText({',
      'text: pronunciationText,',
      'voiceProfile: preset,',
      'title: buildVoiceAiJobTitle(selected)',
    ],
    'Script to Audio state sync or generation order drift',
  );
  if (!syncOrder.ok) return syncOrder;

  const titleContract = assertContainsAll(
    titleSource,
    ['script.jugador', 'resolveScriptTitle(script, \'\')', '.slice(0, 120)', 'voz-ia-guion'],
    'Script to Audio job title contract drift',
  );
  if (!titleContract.ok) return titleContract;

  return { ok: true };
}

export async function runProtectedFlowsReplay() {
  const scenarios = [
    { name: 'auth/session', run: async () => replayAuthSessionScenario() },
    { name: 'settings', run: async () => replaySettingsScenario() },
    { name: 'composition/assets', run: async () => replayCompositionAssetsScenario() },
    { name: 'approval', run: replayApprovalScenario },
    { name: 'scripts', run: replayScriptsScenario },
    { name: 'scripts/facade-parity', run: replayScriptsFacadeParityScenario },
    { name: 'audio', run: runAudioParityReplay },
    { name: 'subtitles', run: async () => replaySubtitlesScenario() },
    { name: 'app-shell/lifecycle', run: runAppShellLifecycleReplay },
    { name: 'app-shell/set-view', run: runAppShellSetViewReplay },
    { name: 'script-to-audio/voice', run: runScriptToAudioVoiceReplay },
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
