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
    ttsUserEmail: 'dev@example.com',
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
if (postCall.options.headers['x-user-email'] !== 'dev@example.com') throw new Error('x-user-email drift');

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
    assert "extractSubtitleProgressPercentRuntime" in app_shell_source
    assert "normalizeAudioProgressPercent" in parity_checklist_source
    assert "extractSubtitleProgressPercentRuntime" in parity_checklist_source


def test_parity_checklist_enforces_runtime_helper_import_boundaries_in_app_shell():
    script = r"""
import { runParityChecklist } from './js/modules/__checks__/parity-checklist.js';

const baseline = runParityChecklist({
  indexHtmlSource: '<div id="authGate"></div><div id="appShell"></div><form id="authForm"></form><input id="searchInput"><select id="countryFilter"></select><select id="sourcesFilter"></select><div id="cards"></div><dialog id="queueDialog"></dialog><dialog id="settingsDialog"></dialog><nav id="sidebarNav"></nav><section id="viewApproval"></section><section id="viewScripts"></section><section id="viewAudio"></section><section id="viewSubtitulos"></section><section id="viewSubtitulos2"></section><button id="audioRunBtn"></button><tbody id="subtitleRowsBody"></tbody><section id="subtitle2ServiceHealthBanner"></section><section id="subtitle2SessionHistory"></section><section id="subtitle2PreviewStage"></section><video id="subtitle2PreviewVideo"></video><section id="subtitle2PreviewOverlay"></section><section id="subtitle2PreviewCue"></section><section id="subtitle2PreviewTimeline"></section><button id="subtitle2AddRowBtn"></button><button id="subtitle2AnotherVideoBtn"></button>',
  mainJsSource: "import './modules/composition-root.js'; bootCompositionRoot();",
  compositionRootSource: "import { bootApp } from './app-shell.js'; bootApp();",
  appShellSource: "import { normalizeAudioProgressPercent } from './features/audio/runtime/index.js'; import { extractSubtitleProgressPercentRuntime } from './features/subtitles/runtime/index.js';",
});

if (!baseline.pass) {
  throw new Error(`expected baseline parity-checklist pass, got ${JSON.stringify(baseline.failures)}`);
}

const mutated = runParityChecklist({
  indexHtmlSource: '<div id="authGate"></div><div id="appShell"></div><form id="authForm"></form><input id="searchInput"><select id="countryFilter"></select><select id="sourcesFilter"></select><div id="cards"></div><dialog id="queueDialog"></dialog><dialog id="settingsDialog"></dialog><nav id="sidebarNav"></nav><section id="viewApproval"></section><section id="viewScripts"></section><section id="viewAudio"></section><section id="viewSubtitulos"></section><section id="viewSubtitulos2"></section><button id="audioRunBtn"></button><tbody id="subtitleRowsBody"></tbody><section id="subtitle2ServiceHealthBanner"></section><section id="subtitle2SessionHistory"></section><section id="subtitle2PreviewStage"></section><video id="subtitle2PreviewVideo"></video><section id="subtitle2PreviewOverlay"></section><section id="subtitle2PreviewCue"></section><section id="subtitle2PreviewTimeline"></section><button id="subtitle2AddRowBtn"></button><button id="subtitle2AnotherVideoBtn"></button>',
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

if (!mutated.failures.some((f) => String(f).includes('extractSubtitleProgressPercentRuntime'))) {
  throw new Error(`expected missing subtitles helper import violation, got ${JSON.stringify(mutated.failures)}`);
}
"""
    result = _run_node(script)
    assert result.returncode == 0, result.stderr


def test_subtitles_navigation_contract_uses_separate_legacy_and_remote_views_without_mode_toggle():
    index_source = (ROOT / "index.html").read_text(encoding="utf-8")
    selectors_source = (ROOT / "js" / "modules" / "shared" / "dom" / "selectors.js").read_text(encoding="utf-8")
    bootstrap_source = (ROOT / "js" / "modules" / "core" / "bootstrap.js").read_text(encoding="utf-8")

    for expected in [
        'data-view="subtitulos"',
        'data-view="subtitulos2"',
        'id="viewSubtitulos"',
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
