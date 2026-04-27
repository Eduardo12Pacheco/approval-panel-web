import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CONTRACT_MATRIX_PATH = ROOT / "docs" / "parity" / "contract-matrix.md"
MAIN_JS_PATH = ROOT / "js" / "main.js"
COMPOSITION_ROOT_PATH = ROOT / "js" / "modules" / "composition-root.js"


def _run_node(script: str):
    return subprocess.run(
        ["node", "--experimental-default-type=module", "-e", script],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )


def test_contract_matrix_includes_runtime_behavioral_parity_evidence_section():
    source = CONTRACT_MATRIX_PATH.read_text(encoding="utf-8")
    assert "Runtime Behavioral Parity Evidence" in source
    assert "Protected Scenario" in source


def test_approval_api_runtime_contract_headers_payload_and_error_paths():
    script = r"""
import { createApprovalApiClient } from './js/modules/core/http/approval-api.js';

const calls = [];
const api = createApprovalApiClient({
  getSettings: () => ({ baseUrl: 'http://localhost:5678', secret: 's3cr3t' }),
  fetchImpl: async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith('/http-error')) {
      return {
        ok: false,
        status: 500,
        text: async () => JSON.stringify({ message: 'boom' }),
        json: async () => ({ message: 'boom' }),
      };
    }
    if (url.endsWith('/business-error')) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ status: 'error', message: 'business' }),
        json: async () => ({ status: 'error', message: 'business' }),
      };
    }
    if (url.endsWith('/download-docx')) {
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        blob: async () => ({ kind: 'docx-blob' }),
      };
    }
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true }),
      json: async () => ({ ok: true }),
    };
  },
});

await api.get('/webhook/approval/queue/supabase/v2');
const getCall = calls[0];
if (getCall.url !== 'http://localhost:5678/webhook/approval/queue/supabase/v2') throw new Error('get url drift');
if (getCall.options.headers['x-approval-secret'] !== 's3cr3t') throw new Error('get secret header drift');

await api.post('/webhook/approval/decision/v2', { cluster_id: 'c-1', action: 'approve' });
const postCall = calls[1];
if (postCall.url !== 'http://localhost:5678/webhook/approval/decision/v2') throw new Error('url drift');
if (postCall.options.method !== 'POST') throw new Error('method drift');
if (postCall.options.headers['Content-Type'] !== 'application/json') throw new Error('content-type drift');
if (postCall.options.headers['x-approval-secret'] !== 's3cr3t') throw new Error('secret header drift');

const body = JSON.parse(postCall.options.body);
if (body.cluster_id !== 'c-1' || body.action !== 'approve') throw new Error('payload drift');

const blobResult = await api.postBlob('/download-docx', { draft_id: 'draft-1' });
const blobCall = calls[2];
if (blobCall.options.method !== 'POST') throw new Error('postBlob method drift');
if (blobCall.options.headers['x-approval-secret'] !== 's3cr3t') throw new Error('postBlob secret header drift');
if (blobResult.blob.kind !== 'docx-blob') throw new Error('postBlob blob drift');
if (blobResult.filename !== '') throw new Error('postBlob should tolerate missing Content-Disposition');

let httpErrorCaught = false;
try {
  await api.post('/http-error', { a: 1 });
} catch (err) {
  httpErrorCaught = String(err?.message || '').includes('boom');
}
if (!httpErrorCaught) throw new Error('http error path not enforced');

let businessErrorCaught = false;
try {
  await api.post('/business-error', { a: 1 });
} catch (err) {
  businessErrorCaught = String(err?.message || '').includes('business');
}
if (!businessErrorCaught) throw new Error('business error path not enforced');
"""
    result = _run_node(script)
    assert result.returncode == 0, result.stderr


def test_tts_api_runtime_contract_headers_and_negative_auth_paths():
    script = r"""
import { createTtsApiClient } from './js/modules/core/http/tts-api.js';

const calls = [];
const api = createTtsApiClient({
  getSettings: () => ({
    ttsBaseUrl: 'http://localhost:8088',
    ttsApiKey: 'api-key-1',
    ttsBasicUser: 'user',
    ttsBasicPass: 'pass',
  }),
  btoaImpl: (value) => Buffer.from(value).toString('base64'),
  fetchImpl: async (url, options = {}) => {
    calls.push({ url, options });
    return { ok: true, status: 200, text: async () => JSON.stringify({ status: 'queued' }) };
  },
});

await api.post('/api/tts/jobs', { text: 'hola', voice_profile: 'balanced_default' });
const postCall = calls[0];
if (postCall.url !== 'http://localhost:8088/api/tts/jobs') throw new Error('tts url drift');
if (postCall.options.headers['x-api-key'] !== 'api-key-1') throw new Error('x-api-key drift');
if (!String(postCall.options.headers['Authorization'] || '').startsWith('Basic ')) throw new Error('basic auth drift');
if ('x-user-email' in postCall.options.headers) throw new Error('x-user-email should not be sent');

await api.deleteSubtitleSession('session-1');
const deleteCall = calls[1];
if (deleteCall.url !== 'http://localhost:8088/api/subtitles/sessions/session-1') throw new Error('subtitle delete url drift');
if (deleteCall.options.method !== 'DELETE') throw new Error('subtitle delete method drift');
if (deleteCall.options.headers['x-api-key'] !== 'api-key-1') throw new Error('subtitle delete auth drift');

const apiMissingCreds = createTtsApiClient({
  getSettings: () => ({ ttsBaseUrl: 'http://localhost:8088', ttsApiKey: 'k', ttsBasicUser: '', ttsBasicPass: '' }),
  fetchImpl: async () => ({ ok: true, status: 200, text: async () => '{}' }),
});

let missingCredsCaught = false;
try {
  await apiMissingCreds.get('/api/tts/jobs/x');
} catch (err) {
  missingCredsCaught = String(err?.message || '').includes('Configurá usuario y contraseña de Audio API');
}
if (!missingCredsCaught) throw new Error('missing creds path not enforced');
"""
    result = _run_node(script)
    assert result.returncode == 0, result.stderr


def test_audio_controller_can_create_named_job_from_canonical_script_text():
    script = r"""
import { createAudioController } from './js/modules/features/audio/controller.js';

const posted = [];
const toasts = [];
const classTokens = new Set();
const state = {
  settings: {
    ttsBaseUrl: 'http://localhost:8088',
    ttsApiKey: 'api-key-1',
    ttsBasicUser: 'user',
    ttsBasicPass: 'pass',
  },
  audioRunning: false,
  audioJobId: null,
  audioPollingTimer: null,
  audioPollingToken: null,
  audioPollingInFlight: false,
  audioPollingErrorStreak: 0,
  audioStreamController: null,
  audioJobs: {},
  audioJobOrder: [],
  dismissedAudioJobs: new Set(),
};

const el = {
  audioRunBtn: { disabled: false },
  audioPresetSelect: { value: 'balanced_default' },
  audioTextArea: { value: '' },
  audioQueueMeta: { textContent: '' },
  audioQueueList: {
    innerHTML: '',
    classList: {
      add(token) { classTokens.add(token); },
      remove(token) { classTokens.delete(token); },
    },
  },
};

const controller = createAudioController({
  state,
  el,
  api: {
    async post(path, payload) {
      posted.push({ path, payload });
      return { job_id: 'job-voice-1', status: 'queued' };
    },
  },
  ui: { toast(message) { toasts.push(message); } },
  helpers: {
    escapeHtml(value) { return String(value); },
    getErrorMessage(err, fallback) { return err?.message || fallback; },
    resolveTtsGet() {
      return async () => ({ job_id: 'job-voice-1', status: 'done', progress: { stage: 'done', percent: 100 } });
    },
    getBlob() { throw new Error('not used'); },
  },
  browser: {
    fetchImpl: async () => ({ ok: false, body: null }),
    AbortController: class { constructor() { this.signal = {}; } abort() {} },
    setInterval() { return 0; },
    clearInterval() {},
    URL: { createObjectURL() { return ''; }, revokeObjectURL() {} },
    document: { createElement() { return {}; }, body: { appendChild() {}, removeChild() {} } },
  },
});

await controller.runAudioGenerationFromText({
  text: 'Texto canónico de pronunciación suficientemente largo para generar audio.',
  voiceProfile: 'voz_balanceada',
  title: 'Jugador · Tema procesado',
});

if (posted[0]?.path !== '/api/tts/jobs') throw new Error(`unexpected tts path ${posted[0]?.path}`);
if (posted[0].payload.text !== 'Texto canónico de pronunciación suficientemente largo para generar audio.') {
  throw new Error(`text drift ${JSON.stringify(posted[0].payload)}`);
}
if (posted[0].payload.voice_profile !== 'voz_balanceada') throw new Error('voice profile drift');
if (posted[0].payload.title !== 'Jugador · Tema procesado') throw new Error('title drift');
if (state.audioJobOrder[0] !== 'job-voice-1') throw new Error(`job was not inserted into queue ${JSON.stringify(state.audioJobOrder)}`);
if (!el.audioQueueList.innerHTML.includes('Jugador · Tema procesado')) throw new Error('queue should render human title');
if (!toasts.includes('Job enviado. Comienza el procesamiento...')) throw new Error(`missing queued toast ${JSON.stringify(toasts)}`);
"""
    result = _run_node(script)
    assert result.returncode == 0, result.stderr


def test_approval_feature_runtime_uses_v2_workflows_and_refreshes_scripts_after_approve_without_false_negative_toast():
    script = r"""
import { createApprovalFeature, orderApprovalItemsByLowestAvg } from './js/modules/features/approval/index.js';

const state = {
  queue: [],
  items: [{ cluster_id: 'cluster-1', cantidad_fuentes: 1, cantidad_fuentes_total: 1, seleccion: 'AR', jugador: 'Jugador', tema_principal: 'Tema' }],
  selectedCardId: null,
  deletingSource: false,
  selectedTopic: {
    cluster_id: 'cluster-1',
    tema_principal: 'Tema',
    seleccion: 'AR',
    jugador: 'Jugador',
    approved_sources_count: 0,
    cantidad_fuentes_total: 1,
    sources: [{
      id_noticia: 'news-1',
      titular: 'Titular',
      fuente: 'Fuente',
      link: 'https://example.com',
      snippet: 'Snippet',
      estado_revision: 'pendiente',
      queue_id: 'queue-1',
      estado_queue: 'queued',
      attempts: 0,
    }],
  },
};

const calls = [];
const toasts = [];
let refreshScriptDraftsCount = 0;

const feature = createApprovalFeature({
  api: {
    async get(path) {
      calls.push({ kind: 'get', path });
      if (path === '/webhook/approval/queue/supabase/v2') throw new Error('queue refresh failed after success');
      if (path === '/webhook/approval/pending/supabase/v2') return { items: [] };
      if (path.startsWith('/webhook/approval/topic/supabase/v2')) return { item: state.selectedTopic };
      throw new Error(`unexpected get ${path}`);
    },
    async post(path, payload) {
      calls.push({ kind: 'post', path, payload });
      return { ok: true };
    },
  },
  store: { getState: () => state },
  ui: { toast(msg) { toasts.push(msg); } },
  selectors: {
    topicDialog: { showModal() {} },
    runQueueBtn: { disabled: false, textContent: 'Actualizar cola' },
  },
  callbacks: {
    renderStats() {},
    renderCountryFilter() {},
    renderCards() {},
    renderQueue() {},
    renderTopicDetail() {},
    refreshScriptDrafts() { refreshScriptDraftsCount += 1; return Promise.resolve(); },
    confirmDelete() { return false; },
  },
  helpers: { getErrorMessage: (err, fallback) => err?.message || fallback },
});

await feature.approveSourceFromTopic(state.selectedTopic.sources[0]);

const decisionCall = calls.find((entry) => entry.kind === 'post');
if (!decisionCall) throw new Error('missing decision call');
if (decisionCall.path !== '/webhook/approval/decision/supabase/v2') throw new Error(`decision path drift: ${decisionCall.path}`);
if (refreshScriptDraftsCount !== 1) throw new Error(`expected script drafts refresh after approve, got ${refreshScriptDraftsCount}`);
if (!calls.some((entry) => entry.kind === 'get' && entry.path === '/webhook/approval/queue/supabase/v2')) {
  throw new Error('missing queue v2 refresh after approve');
}
if (toasts.length !== 1 || toasts[0] !== 'Noticia aprobada y encolada para guion') {
  throw new Error(`approve success should not be followed by false-negative toast: ${JSON.stringify(toasts)}`);
}
if (state.selectedTopic.sources.length !== 0) throw new Error('approved source should disappear from detail immediately');
if (state.items.length !== 0) throw new Error('approved topic should disappear from pending list after refresh payload empties it');

const orderedIds = orderApprovalItemsByLowestAvg([
  { cluster_id: 'c-1', tema_principal: 'Tema 1', avg: 3.2 },
  { cluster_id: 'c-2', tema_principal: 'Tema 2', promedio_score: 1.4 },
  { cluster_id: 'c-3', tema_principal: 'Tema 3', rolling_average_score: 2.1 },
  { cluster_id: 'c-4', tema_principal: 'Tema 4' },
]).map((item) => item.cluster_id).join(',');

if (orderedIds !== 'c-2,c-3,c-1,c-4') {
  throw new Error(`lowest-avg ordering drift: ${orderedIds}`);
}

calls.length = 0;
await feature.runQueue(async () => {
  calls.push({ kind: 'refresh-all' });
});

if (calls.some((entry) => entry.kind === 'post' && entry.path === '/webhook/approval/run-queue/v1')) {
  throw new Error('manual queue execution endpoint should not be used');
}
if (!calls.some((entry) => entry.kind === 'refresh-all')) {
  throw new Error('manual queue action should reuse refresh path');
}
"""
    result = _run_node(script)
    assert result.returncode == 0, result.stderr


def test_scripts_feature_accepts_v2_polling_rows_from_items_envelope_and_deselects_missing_rows():
    script = r"""
import { createScriptsFeature } from './js/modules/features/scripts/index.js';

const state = {
  scriptDrafts: [],
  selectedScript: { draft_id: 'draft-missing', cluster_id: 'cluster-missing' },
  savingScript: false,
  publishingScript: false,
};

const selectors = {
  scriptEditedArea: {
    value: '',
    focus() {},
    scrollIntoView() {},
  },
  scriptEditorDialog: { showModal() {} },
  publishConfirmDialog: { close() {} },
  confirmPublishBtn: { disabled: false },
};

let renderStatsCount = 0;
let renderCardsCount = 0;
let renderEditorCount = 0;

const feature = createScriptsFeature({
  api: {
    async get(path) {
      if (path !== '/webhook/mvp-script-drafts-pending/supabase/v2') throw new Error(`unexpected get ${path}`);
      return {
        items: [{
          draft_id: 'draft-1',
          cluster_id: 'cluster-1',
          jugador: 'Jugador',
          tema_principal: 'Tema',
          estado: 'borrador_generado',
          guion_draft: 'Texto suficientemente largo para validar la carga desde polling.',
        }],
      };
    },
    async post() {
      return { ok: true };
    },
  },
  store: { getState: () => state },
  ui: { toast() {} },
  selectors,
  callbacks: {
    renderScriptStats() { renderStatsCount += 1; },
    renderScriptCards() { renderCardsCount += 1; },
    renderSelectedScriptEditor() { renderEditorCount += 1; },
  },
});

await feature.refreshScriptDrafts();

if (state.scriptDrafts.length !== 1) throw new Error(`expected 1 draft from items envelope, got ${state.scriptDrafts.length}`);
if (state.scriptDrafts[0].draft_id !== 'draft-1') throw new Error('items envelope identity drift');
if (state.selectedScript !== null) throw new Error('missing draft should be deselected after polling refresh');
if (renderStatsCount !== 1 || renderCardsCount !== 1 || renderEditorCount !== 1) {
  throw new Error(`render drift ${renderStatsCount}/${renderCardsCount}/${renderEditorCount}`);
}
"""
    result = _run_node(script)
    assert result.returncode == 0, result.stderr


def test_scripts_refresh_preserves_dirty_editor_text_during_auto_polling():
    script = r"""
import { createScriptsFeature } from './js/modules/features/scripts/index.js';
import { renderSelectedScriptEditorView } from './js/modules/features/scripts/render.js';

const state = {
  scriptDrafts: [],
  selectedScript: {
    draft_id: 'draft-1',
    cluster_id: 'cluster-1',
    jugador: 'Jugador',
    tema_principal: 'Tema',
    guion_editado: 'Texto viejo que viene desde Supabase y no debe pisar edición local.',
  },
  scriptEditorDirty: true,
};

const selectors = {
  scriptEditorTitle: { textContent: '' },
  scriptEditorMeta: { textContent: '' },
  scriptEditedArea: {
    value: 'Texto local editado con un párrafo borrado que debe sobrevivir al polling.',
    disabled: false,
  },
  viewOriginalBtn: { disabled: false },
  voiceAiBtn: { disabled: false },
  downloadDraftBtn: { disabled: false },
  publishDraftBtn: { disabled: false },
  closeScriptEditor: { disabled: false },
  scriptEditedWordCount: { textContent: '' },
};

let renderEditorCount = 0;
const feature = createScriptsFeature({
  api: {
    async get(path) {
      if (path !== '/webhook/mvp-script-drafts-pending/supabase/v2') throw new Error(`unexpected get ${path}`);
      return {
        items: [{
          draft_id: 'draft-1',
          cluster_id: 'cluster-1',
          jugador: 'Jugador',
          tema_principal: 'Tema',
          guion_editado: 'Texto viejo que viene desde Supabase y no debe pisar edición local.',
        }],
      };
    },
  },
  store: { getState: () => state },
  ui: { toast() {} },
  selectors,
  callbacks: {
    renderScriptStats() {},
    renderScriptCards() {},
    renderSelectedScriptEditor() {
      renderEditorCount += 1;
      renderSelectedScriptEditorView({
        selected: state.selectedScript,
        el: selectors,
        updateWordCounter(value, target) { target.textContent = `Palabras: ${value.split(/\s+/).filter(Boolean).length}`; },
        preserveCurrentValue: Boolean(state.selectedScript && state.scriptEditorDirty),
      });
    },
  },
});

await feature.refreshScriptDrafts({ silent: true });

if (renderEditorCount !== 1) throw new Error(`editor should render once, got ${renderEditorCount}`);
if (selectors.scriptEditedArea.value !== 'Texto local editado con un párrafo borrado que debe sobrevivir al polling.') {
  throw new Error(`dirty editor text was overwritten: ${selectors.scriptEditedArea.value}`);
}
if (state.selectedScript?.draft_id !== 'draft-1') throw new Error('selected script should remain matched after refresh');
if (selectors.scriptEditedWordCount.textContent !== 'Palabras: 12') {
  throw new Error(`word count should use preserved local text: ${selectors.scriptEditedWordCount.textContent}`);
}
"""
    result = _run_node(script)
    assert result.returncode == 0, result.stderr


def test_script_voice_button_requires_processed_script_contract():
    script = r"""
import { renderSelectedScriptEditorView } from './js/modules/features/scripts/render.js';

function makeSelectors() {
  return {
    scriptEditorTitle: { textContent: '' },
    scriptEditorMeta: { textContent: '' },
    scriptEditedArea: { value: '', disabled: false },
    viewOriginalBtn: { disabled: false },
    voiceAiBtn: { disabled: false, title: '' },
    downloadDraftBtn: { disabled: false },
    publishDraftBtn: { disabled: false, classList: { toggle() {} } },
    closeScriptEditor: { disabled: false },
    scriptEditedWordCount: { textContent: '' },
  };
}

const unprocessed = makeSelectors();
renderSelectedScriptEditorView({
  selected: { draft_id: 'draft-1', jugador: 'Jugador', tema_principal: 'Tema', guion_editado: 'Texto válido sin procesar todavía.' },
  el: unprocessed,
  updateWordCounter(value, target) { target.textContent = value; },
});
if (unprocessed.voiceAiBtn.disabled !== true) throw new Error('voice should be disabled before processing');
if (!unprocessed.voiceAiBtn.title.includes('Primero procesá')) throw new Error(`missing disabled hint ${unprocessed.voiceAiBtn.title}`);

const processed = makeSelectors();
renderSelectedScriptEditorView({
  selected: { draft_id: 'draft-1', doc_id: 'doc-1', estado_guion: 'publicado', jugador: 'Jugador', tema_principal: 'Tema', guion_editado: 'Texto procesado.' },
  el: processed,
  updateWordCounter(value, target) { target.textContent = value; },
});
if (processed.voiceAiBtn.disabled !== false) throw new Error('voice should be enabled after processing');
if (!processed.voiceAiBtn.title.includes('versión procesada con pronunciación')) throw new Error(`missing processed hint ${processed.voiceAiBtn.title}`);
"""
    result = _run_node(script)
    assert result.returncode == 0, result.stderr


def test_app_shell_voice_ai_uses_processed_pronunciation_guards():
    source = (ROOT / "js" / "modules" / "app-shell.js").read_text(encoding="utf-8")
    audio_runtime_source = (ROOT / "js" / "modules" / "features" / "audio" / "runtime" / "services.js").read_text(encoding="utf-8")

    assert "runVoiceAiFromSelectedScript" in source
    assert "isScriptProcessed(selected)" in source
    assert "Tenés cambios sin procesar" in source
    assert "selected.guion_pronunciacion" in source
    assert "runAudioGenerationFromText" in source
    assert "runAudioGenerationFromText: audioController.runAudioGenerationFromText" in source
    assert "runAudioGenerationFromText: hooks.runAudioGenerationFromText" in audio_runtime_source


def test_scripts_feature_downloads_published_google_doc_as_docx_blob():
    script = r"""
import { createScriptsFeature } from './js/modules/features/scripts/index.js';

const state = {
  selectedScript: {
    draft_id: 'draft-1',
    id_noticia: 'news-1',
    cluster_id: 'cluster-1',
    doc_id: 'doc-1',
    jugador: 'Ángel',
    tema_principal: 'Tema raro / prueba',
  },
  downloadingScript: false,
};

const selectors = {
  downloadDraftBtn: { disabled: false },
};

let posted = null;
let downloaded = null;
let renderCount = 0;
const toasts = [];

const feature = createScriptsFeature({
  api: {
    async postBlob(path, payload) {
      posted = { path, payload };
      return { blob: { size: 123 }, filename: '' };
    },
  },
  store: { getState: () => state },
  ui: { toast(message) { toasts.push(message); } },
  selectors,
  helpers: {
    downloadBlob(blob, filename) {
      downloaded = { blob, filename };
    },
  },
  callbacks: {
    renderSelectedScriptEditor() { renderCount += 1; },
  },
});

await feature.downloadSelectedScriptDocx();

if (posted?.path !== '/webhook/mvp-script-download-doc/supabase/v1') {
  throw new Error(`unexpected download endpoint: ${posted?.path}`);
}
if (posted.payload.draft_id !== 'draft-1' || posted.payload.id_noticia !== 'news-1' || posted.payload.cluster_id !== 'cluster-1') {
  throw new Error(`identity payload drift: ${JSON.stringify(posted.payload)}`);
}
if (posted.payload.format !== 'docx') throw new Error('missing docx format marker');
if (downloaded?.filename !== 'Angel - Tema raro prueba.docx') {
  throw new Error(`fallback filename drift: ${JSON.stringify(downloaded)}`);
}
if (state.downloadingScript !== false || renderCount !== 1) {
  throw new Error(`download state did not reset/render: ${state.downloadingScript}/${renderCount}`);
}
if (!toasts.includes('Descarga DOCX iniciada')) {
  throw new Error(`missing success toast: ${JSON.stringify(toasts)}`);
}

state.selectedScript = { draft_id: 'draft-2' };
posted = null;
await feature.downloadSelectedScriptDocx();
if (posted !== null) throw new Error('download should not call API without doc_id');
if (!toasts.includes('Primero publicá el guion para poder descargarlo.')) {
  throw new Error(`missing unpublished guard toast: ${JSON.stringify(toasts)}`);
}
"""
    result = _run_node(script)
    assert result.returncode == 0, result.stderr


def test_scripts_feature_keeps_published_doc_selected_for_immediate_download():
    script = r"""
import { createScriptsFeature } from './js/modules/features/scripts/index.js';

const state = {
  scriptDrafts: [{ draft_id: 'draft-1' }],
  selectedScript: {
    draft_id: 'draft-1',
    id_noticia: 'news-1',
    cluster_id: 'cluster-1',
    guion_draft: 'Texto original suficientemente largo para publicar sin errores.',
    jugador: 'Jugador',
    tema_principal: 'Tema',
  },
  publishingScript: false,
};

const selectors = {
  scriptEditedArea: { value: 'Texto editado suficientemente largo para publicar y descargar después.' },
  publishConfirmDialog: { closed: false, close() { this.closed = true; } },
  confirmPublishBtn: { disabled: false },
};

const postPaths = [];
let renderCardsCount = 0;
let renderEditorCount = 0;

const feature = createScriptsFeature({
  api: {
    async get(path) {
      if (path !== '/webhook/mvp-script-drafts-pending/supabase/v2') throw new Error(`unexpected get ${path}`);
      return { items: [] };
    },
    async post(path, payload) {
      postPaths.push({ path, payload });
      if (path === '/webhook/mvp-script-publish/supabase/v2') {
        return { ok: true, draft_id: 'draft-1', id_noticia: 'news-1', cluster_id: 'cluster-1', estado_guion: 'publicado', doc_id: 'doc-1', doc_url: 'https://docs.example/doc-1' };
      }
      return { ok: true };
    },
  },
  store: { getState: () => state },
  ui: { toast() {} },
  selectors,
  callbacks: {
    renderScriptStats() {},
    renderScriptCards() { renderCardsCount += 1; },
    renderSelectedScriptEditor() { renderEditorCount += 1; },
  },
});

await feature.publishSelectedScript();

if (!selectors.publishConfirmDialog.closed) throw new Error('publish confirm dialog was not closed');
if (postPaths.map((entry) => entry.path).join('|') !== '/webhook/mvp-script-draft-save/supabase/v2|/webhook/mvp-script-publish/supabase/v2') {
  throw new Error(`publish post sequence drift: ${JSON.stringify(postPaths)}`);
}
if (postPaths[0].payload.guion_editado !== selectors.scriptEditedArea.value.trim()) {
  throw new Error(`process should save current textarea value before publishing: ${JSON.stringify(postPaths[0].payload)}`);
}
if (state.selectedScript?.doc_id !== 'doc-1' || state.selectedScript?.estado_guion !== 'publicado') {
  throw new Error(`published selection not preserved for download: ${JSON.stringify(state.selectedScript)}`);
}
if (state.publishingScript !== false || selectors.confirmPublishBtn.disabled !== false) {
  throw new Error('publish state did not reset');
}
if (renderCardsCount < 2 || renderEditorCount < 2) {
  throw new Error(`expected refresh and restore renders, got cards=${renderCardsCount} editor=${renderEditorCount}`);
}
"""
    result = _run_node(script)
    assert result.returncode == 0, result.stderr


def test_processed_script_cards_persist_dismissal_before_hiding_locally():
    script = r"""
import { createScriptsFeature } from './js/modules/features/scripts/index.js';
import { renderScriptCardsView, renderScriptStatsView } from './js/modules/features/scripts/render.js';

const state = {
  scriptDrafts: [
    { draft_id: 'processed-1', estado_guion: 'publicado', doc_id: 'doc-1', seleccion: 'Argentina', jugador: 'Messi', tema_principal: 'Procesado' },
    { draft_id: 'draft-1', estado_guion: 'borrador_generado', seleccion: 'Ecuador', jugador: 'Caicedo', tema_principal: 'Pendiente' },
  ],
  selectedScript: { draft_id: 'processed-1', estado_guion: 'publicado', doc_id: 'doc-1' },
  dismissedProcessedScripts: new Set(),
};

let renderCardsCount = 0;
let renderEditorCount = 0;
let renderStatsCount = 0;
const postCalls = [];
const toasts = [];

const feature = createScriptsFeature({
  api: {
    async post(path, payload) {
      postCalls.push({ path, payload });
      return { ok: true, draft_id: payload.draft_id, estado_guion: 'publicado' };
    },
  },
  store: { getState: () => state },
  ui: { toast(message) { toasts.push(message); } },
  selectors: {},
  callbacks: {
    renderScriptStats() { renderStatsCount += 1; },
    renderScriptCards() { renderCardsCount += 1; },
    renderSelectedScriptEditor() { renderEditorCount += 1; },
  },
});

await feature.dismissProcessedScript('processed-1');

if (postCalls.length !== 1) throw new Error(`expected one backend dismissal call, got ${postCalls.length}`);
if (postCalls[0].path !== '/webhook/mvp-script-draft-save/supabase/v2') {
  throw new Error(`dismiss endpoint drift: ${postCalls[0].path}`);
}
if (postCalls[0].payload.action !== 'dismiss_processed') {
  throw new Error(`missing persistent dismiss action: ${JSON.stringify(postCalls[0].payload)}`);
}
if (postCalls[0].payload.draft_id !== 'processed-1') {
  throw new Error(`missing persistent dismiss identity: ${JSON.stringify(postCalls[0].payload)}`);
}

if (!state.dismissedProcessedScripts.has('processed-1')) {
  throw new Error('processed script dismiss id was not stored locally');
}
if (state.scriptDrafts.some((item) => item.draft_id === 'processed-1')) {
  throw new Error(`persisted dismissed script should be removed from local list: ${JSON.stringify(state.scriptDrafts)}`);
}
if (state.selectedScript !== null) throw new Error('selected processed script should close when dismissed');
if (renderCardsCount !== 1 || renderEditorCount !== 1 || renderStatsCount !== 1) {
  throw new Error(`dismiss render drift ${renderCardsCount}/${renderEditorCount}/${renderStatsCount}`);
}

const cardsEl = { innerHTML: '', querySelectorAll: () => [] };
renderScriptCardsView({ state, el: { scriptCards: cardsEl }, openScriptEditor() {} });
if (cardsEl.innerHTML.includes('Procesado')) throw new Error(`dismissed processed card is still visible: ${cardsEl.innerHTML}`);
if (!cardsEl.innerHTML.includes('Pendiente')) throw new Error(`pending card should remain visible: ${cardsEl.innerHTML}`);

const statsEl = { innerHTML: '' };
renderScriptStatsView({ scriptDrafts: state.scriptDrafts, el: { scriptStats: statsEl } });
if (!statsEl.innerHTML.includes('<small>Pendientes</small><strong>1</strong>')) throw new Error(`pending stat drift: ${statsEl.innerHTML}`);
if (!statsEl.innerHTML.includes('<small>Procesados</small><strong>0</strong>')) throw new Error(`processed stat drift: ${statsEl.innerHTML}`);
if (!toasts.includes('Guion ocultado del panel')) throw new Error(`missing dismiss toast: ${JSON.stringify(toasts)}`);
"""
    result = _run_node(script)
    assert result.returncode == 0, result.stderr


def test_approval_source_link_resolution_supports_link_and_url_and_app_shell_uses_it():
    script = r"""
import { resolveApprovalSourceLink } from './js/modules/features/approval/index.js';

const fromLink = resolveApprovalSourceLink({ link: 'https://example.com/from-link' });
if (fromLink !== 'https://example.com/from-link') throw new Error(`link resolution drift: ${fromLink}`);

const fromUrl = resolveApprovalSourceLink({ url: 'https://example.com/from-url' });
if (fromUrl !== 'https://example.com/from-url') throw new Error(`url resolution drift: ${fromUrl}`);

const blank = resolveApprovalSourceLink({ link: '   ', url: '' });
if (blank !== '') throw new Error('blank link resolution drift');
"""
    result = _run_node(script)
    assert result.returncode == 0, result.stderr

    app_shell_source = (ROOT / "js" / "modules" / "app-shell.js").read_text(encoding="utf-8")
    assert "resolveApprovalSourceLink" in app_shell_source
    assert "actionBtn.dataset.url || actionBtn.dataset.link || ''" in app_shell_source


def test_single_flight_runner_reuses_inflight_promise_for_poll_refreshes():
    script = r"""
import { createSingleFlightRunner } from './js/modules/core/async/single-flight.js';

let runs = 0;
let release;
const blocker = new Promise((resolve) => {
  release = resolve;
});

const runner = createSingleFlightRunner(async () => {
  runs += 1;
  await blocker;
  return runs;
});

const first = runner();
const second = runner();
if (first !== second) throw new Error('expected in-flight promise reuse');

release();
const [firstResult, secondResult] = await Promise.all([first, second]);
if (runs !== 1 || firstResult !== 1 || secondResult !== 1) {
  throw new Error(`single-flight execution drift: runs=${runs} results=${firstResult}/${secondResult}`);
}

const thirdResult = await runner();
if (runs !== 2 || thirdResult !== 2) {
  throw new Error(`expected runner reset after completion, got runs=${runs} result=${thirdResult}`);
}
"""
    result = _run_node(script)
    assert result.returncode == 0, result.stderr


def test_forbidden_cross_feature_import_boundaries_are_enforced():
    forbidden_patterns = {
        "js/modules/features/approval/index.js": [
            "features/scripts",
            "core/http/tts-api",
            "features/audio",
            "features/subtitles",
        ],
        "js/modules/features/scripts/index.js": [
            "features/approval",
            "core/http/tts-api",
            "features/audio",
            "features/subtitles",
        ],
        "js/modules/features/audio/index.js": [
            "features/subtitles",
            "core/http/approval-api",
            "features/approval",
            "features/scripts",
        ],
        "js/modules/features/subtitles/index.js": [
            "features/audio",
            "core/http/approval-api",
            "features/approval",
            "features/scripts",
        ],
    }

    for relative_path, forbidden_imports in forbidden_patterns.items():
        source = (ROOT / relative_path).read_text(encoding="utf-8")
        for token in forbidden_imports:
            assert token not in source, f"Forbidden cross-feature dependency found: {relative_path} -> {token}"


def test_bootstrap_boundary_invariance_and_runtime_helper_delegation_contract():
    main_source = MAIN_JS_PATH.read_text(encoding="utf-8")
    composition_source = COMPOSITION_ROOT_PATH.read_text(encoding="utf-8")
    app_shell_source = (ROOT / "js" / "modules" / "app-shell.js").read_text(encoding="utf-8")
    parity_checklist_source = (ROOT / "js" / "modules" / "__checks__" / "parity-checklist.js").read_text(encoding="utf-8")

    assert "./modules/composition-root.js" in main_source
    assert "./app-shell.js" in composition_source
    assert "bootApp" in composition_source

    # RED guardrail for this change-set: pure helper mapping must be delegated out of app-shell.
    assert "normalizeAudioProgressPercent" in app_shell_source
    assert "resolveSubtitleProgressPercentRuntime" in app_shell_source
    assert "normalizeAudioProgressPercent" in parity_checklist_source
    assert "resolveSubtitleProgressPercentRuntime" in parity_checklist_source


def test_parity_checklist_enforces_runtime_helper_import_boundaries_in_app_shell():
    script = r"""
import { runParityChecklist } from './js/modules/__checks__/parity-checklist.js';

const baseline = runParityChecklist({
  indexHtmlSource: '<div id="authGate"></div><div id="appShell"></div><form id="authForm"></form><input id="searchInput"><select id="countryFilter"></select><select id="sourcesFilter"></select><div id="cards"></div><dialog id="queueDialog"></dialog><dialog id="settingsDialog"></dialog><nav id="sidebarNav"></nav><section id="viewApproval"></section><section id="viewScripts"></section><section id="viewAudio"></section><section id="viewSubtitulos2"></section><button id="audioRunBtn"></button><tbody id="subtitle2RowsBody"></tbody><section id="subtitle2ServiceHealthBanner"></section><section id="subtitle2SessionHistory"></section><section id="subtitle2PreviewStage"></section><video id="subtitle2PreviewVideo"></video><section id="subtitle2PreviewOverlay"></section><section id="subtitle2PreviewCue"></section><section id="subtitle2PreviewTimeline"></section><button id="subtitle2AddRowBtn"></button><button id="subtitle2AnotherVideoBtn"></button>',
  mainJsSource: "import './modules/composition-root.js'; bootCompositionRoot();",
  compositionRootSource: "import { bootApp } from './app-shell.js'; bootApp();",
  appShellSource: "import { normalizeAudioProgressPercent } from './features/audio/runtime/index.js'; import { resolveSubtitleProgressPercentRuntime } from './features/subtitles/runtime/index.js';",
});

if (!baseline.pass) {
  throw new Error(`expected baseline parity-checklist pass, got ${JSON.stringify(baseline.failures)}`);
}

const mutated = runParityChecklist({
  indexHtmlSource: '<div id="authGate"></div><div id="appShell"></div><form id="authForm"></form><input id="searchInput"><select id="countryFilter"></select><select id="sourcesFilter"></select><div id="cards"></div><dialog id="queueDialog"></dialog><dialog id="settingsDialog"></dialog><nav id="sidebarNav"></nav><section id="viewApproval"></section><section id="viewScripts"></section><section id="viewAudio"></section><section id="viewSubtitulos2"></section><button id="audioRunBtn"></button><tbody id="subtitle2RowsBody"></tbody><section id="subtitle2ServiceHealthBanner"></section><section id="subtitle2SessionHistory"></section><section id="subtitle2PreviewStage"></section><video id="subtitle2PreviewVideo"></video><section id="subtitle2PreviewOverlay"></section><section id="subtitle2PreviewCue"></section><section id="subtitle2PreviewTimeline"></section><button id="subtitle2AddRowBtn"></button><button id="subtitle2AnotherVideoBtn"></button>',
  mainJsSource: "import './modules/composition-root.js'; bootCompositionRoot();",
  compositionRootSource: "import { bootApp } from './app-shell.js'; bootApp();",
  appShellSource: "import { createAudioRuntime } from './features/audio/runtime/index.js'; import { createSubtitlesRuntime } from './features/subtitles/runtime/index.js';",
});

if (mutated.pass) {
  throw new Error('expected parity-checklist failure when runtime pure-helper imports drift');
}

if (!mutated.failures.some((f) => String(f).includes('normalizeAudioProgressPercent'))) {
  throw new Error(`expected missing audio helper import violation, got ${JSON.stringify(mutated.failures)}`);
}

if (!mutated.failures.some((f) => String(f).includes('resolveSubtitleProgressPercentRuntime'))) {
  throw new Error(`expected missing subtitles helper import violation, got ${JSON.stringify(mutated.failures)}`);
}
"""
    result = _run_node(script)
    assert result.returncode == 0, result.stderr


def test_subtitles_navigation_contract_uses_single_remote_view_without_mode_toggle():
    index_source = (ROOT / "index.html").read_text(encoding="utf-8")
    selectors_source = (ROOT / "js" / "modules" / "shared" / "dom" / "selectors.js").read_text(encoding="utf-8")
    bootstrap_source = (ROOT / "js" / "modules" / "core" / "bootstrap.js").read_text(encoding="utf-8")

    for expected in [
        'data-view="subtitulos2"',
        'id="viewSubtitulos2"',
        'id="subtitle2ServiceHealthBanner"',
        'id="subtitle2SessionHistory"',
    ]:
        assert expected in index_source

    for forbidden in [
        'id="subtitleModeSelect"',
        'subtitlesMode:',
        'subtitleModeSelect:',
    ]:
        assert forbidden not in "\n".join([index_source, selectors_source, bootstrap_source])
