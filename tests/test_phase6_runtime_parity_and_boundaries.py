import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CONTRACT_MATRIX_PATH = ROOT / "docs" / "parity" / "contract-matrix.md"
MAIN_JS_PATH = ROOT / "js" / "main.js"
COMPOSITION_ROOT_PATH = ROOT / "js" / "modules" / "composition-root.js"
VIDEO_PROJECTS_CSS_FACADE = ROOT / "styles" / "features" / "video-projects" / "index.css"
FILE_SIZE_SOFT_CAP_LINES = 500
FILE_SIZE_EXCEPTIONS = {
    # composition-renderer.js grew beyond 500 lines with the forced-reflow
    # fix (deferred viewport read via rAF + initial fallback dimensions).
    'js/modules/features/video-projects/composition/composition-renderer.js',
}


def _run_node(script: str):
    return subprocess.run(
        ["node", "--experimental-default-type=module", "-e", script],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )


def _read_check_implementation_source(facade_path: str) -> str:
    script = r"""
import { readFile } from 'node:fs/promises';
import { CHECK_MANIFEST } from './js/modules/__checks__/manifest.js';

const facadePath = process.argv[1];
const entry = CHECK_MANIFEST.find((candidate) => candidate.facadePath === facadePath);
if (!entry) throw new Error(`missing check manifest entry for ${facadePath}`);
process.stdout.write(await readFile(entry.implementationPath, 'utf8'));
"""
    result = subprocess.run(
        ["node", "--input-type=module", "-e", script, facade_path],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr
    return result.stdout


def test_contract_matrix_includes_runtime_behavioral_parity_evidence_section():
    source = CONTRACT_MATRIX_PATH.read_text(encoding="utf-8")
    assert "Runtime Behavioral Parity Evidence" in source
    assert "Protected Scenario" in source


def test_approval_api_runtime_contract_headers_payload_and_error_paths():
    script = r"""
import { createApprovalApiClient } from './js/modules/core/http/approval-api.js';

globalThis.__CONTROL_PANEL_BOOTSTRAP__ = { app_version: '2026.05.24.1' };

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
if (getCall.url !== '/panel/read-models/approval/queue') throw new Error(`get shared read url drift: ${getCall.url}`);
if ('x-approval-secret' in getCall.options.headers) throw new Error('get must not send browser approval secret');
if (getCall.options.credentials !== 'include') throw new Error('get must include gateway session credentials');
if (getCall.options.headers['x-control-panel-shell-version'] !== '2026.05.24.1') throw new Error('get shell version header drift');

await api.post('/webhook/approval/decision/v2', { cluster_id: 'c-1', action: 'approve' });
const postCall = calls[1];
if (postCall.url !== 'http://localhost:5678/webhook/approval/decision/v2') throw new Error('url drift');
if (postCall.options.method !== 'POST') throw new Error('method drift');
if (postCall.options.headers['Content-Type'] !== 'application/json') throw new Error('content-type drift');
if ('x-approval-secret' in postCall.options.headers) throw new Error('post must not send browser approval secret');
if (postCall.options.credentials !== 'include') throw new Error('post must include gateway session credentials');

const body = JSON.parse(postCall.options.body);
if (body.cluster_id !== 'c-1' || body.action !== 'approve') throw new Error('payload drift');

const blobResult = await api.postBlob('/download-docx', { draft_id: 'draft-1' });
const blobCall = calls[2];
if (blobCall.options.method !== 'POST') throw new Error('postBlob method drift');
if ('x-approval-secret' in blobCall.options.headers) throw new Error('postBlob must not send browser approval secret');
if (blobCall.options.credentials !== 'include') throw new Error('postBlob must include gateway session credentials');
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

globalThis.__CONTROL_PANEL_BOOTSTRAP__ = { app_version: '2026.05.24.1' };

const calls = [];
const api = createTtsApiClient({
  getSettings: () => ({
    ttsBaseUrl: 'http://localhost:8088',
    sharedApiKey: 'api-key-1',
    sharedBasicUser: 'user',
    sharedBasicPass: 'pass',
    subtitlesBaseUrl: 'http://127.0.0.1:8092',
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
if ('x-api-key' in postCall.options.headers) throw new Error('tts must not send browser x-api-key');
if ('Authorization' in postCall.options.headers) throw new Error('tts must not send browser basic auth');
if ('x-user-email' in postCall.options.headers) throw new Error('x-user-email should not be sent');
if (postCall.options.credentials !== 'include') throw new Error('tts must include gateway session credentials');
if (postCall.options.headers['x-control-panel-shell-version'] !== '2026.05.24.1') throw new Error('tts shell version header drift');

await api.deleteSubtitleSession('session-1');
const deleteCall = calls[1];
if (deleteCall.url !== 'http://127.0.0.1:8092/api/subtitles/sessions/session-1') throw new Error('subtitle delete url drift');
if (deleteCall.options.method !== 'DELETE') throw new Error('subtitle delete method drift');
if ('x-api-key' in deleteCall.options.headers) throw new Error('subtitle must not send browser x-api-key');
if (deleteCall.options.credentials !== 'include') throw new Error('subtitle must include gateway session credentials');

const apiMissingCreds = createTtsApiClient({
  getSettings: () => ({ ttsBaseUrl: 'http://localhost:8088', sharedApiKey: 'k', sharedBasicUser: '', sharedBasicPass: '' }),
  fetchImpl: async () => ({ ok: true, status: 200, text: async () => '{}' }),
});

let missingCredsCaught = false;
try {
  await apiMissingCreds.get('/api/tts/jobs/x');
} catch (err) {
  missingCredsCaught = String(err?.message || '').includes('Configuración de Audio API incompleta');
}
if (missingCredsCaught) throw new Error('gateway-authenticated TTS must not require browser basic credentials');
"""
    result = _run_node(script)
    assert result.returncode == 0, result.stderr


def test_unified_service_config_keeps_api_client_endpoint_paths_headers_and_direct_calls():
    script = r"""
import { createApprovalApiClient } from './js/modules/core/http/approval-api.js';
import { createTtsApiClient } from './js/modules/core/http/tts-api.js';
import { createRadarApiClient } from './js/modules/features/radar/api-client.js';
import { createVideoProjectsApiClient } from './js/modules/features/video-projects/data/api.js';

globalThis.__CONTROL_PANEL_BOOTSTRAP__ = { app_version: '2026.05.24.1' };

const settings = {
  apiProfileMode: 'unified',
  apiOrigin: 'https://api.example.test',
  sharedApiKey: 'shared-key',
  sharedBasicUser: 'shared-user',
  sharedBasicPass: 'shared-pass',
  serviceOverrides: { n8n: false, tts: false, subtitles: false, radar: false, remotion: false, approvalPipeline: false },
  baseUrl: 'https://direct-n8n.example.test',
  secret: 'approval-secret',
  ttsBaseUrl: 'https://direct-tts.example.test',
  ttsApiKey: '',
  ttsBasicUser: '',
  ttsBasicPass: '',
  subtitlesBaseUrl: 'https://direct-subtitles.example.test',
  subtitlesApiKey: '',
  subtitlesBasicUser: '',
  subtitlesBasicPass: '',
  transcriptServiceBaseUrl: 'https://direct-radar.example.test',
  transcriptServiceApiKey: '',
  remotionApiUrl: 'https://direct-remotion.example.test',
  approvalPipelineBaseUrl: 'http://127.0.0.1:3042',
};
const calls = [];
const fetchImpl = async (url, options = {}) => {
  calls.push({ url, options });
  return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true }) };
};

const approval = createApprovalApiClient({ getSettings: () => settings, fetchImpl });
await approval.post('/webhook/approval/decision/supabase/v2', { cluster_id: 'c-1' });
if (calls[0].url !== 'https://api.example.test/n8n/webhook/approval/decision/supabase/v2') throw new Error(`approval URL drift: ${calls[0].url}`);
if ('x-approval-secret' in calls[0].options.headers) throw new Error('approval browser secret header drift');
if (calls[0].options.credentials !== 'include') throw new Error('approval credentials drift');

const tts = createTtsApiClient({ getSettings: () => settings, fetchImpl, btoaImpl: (value) => Buffer.from(value).toString('base64') });
await tts.post('/api/tts/jobs', { text: 'hola' });
if (calls[1].url !== 'https://api.example.test/tts/api/tts/jobs') throw new Error(`tts URL drift: ${calls[1].url}`);
if ('x-api-key' in calls[1].options.headers) throw new Error('tts browser api key drift');
if ('Authorization' in calls[1].options.headers) throw new Error('tts browser basic auth drift');
if (calls[1].options.credentials !== 'include') throw new Error('tts credentials drift');

await tts.deleteSubtitleSession('session-1');
if (calls[2].url !== 'https://api.example.test/subtitles/api/subtitles/sessions/session-1') throw new Error(`subtitles URL drift: ${calls[2].url}`);
if ('x-api-key' in calls[2].options.headers) throw new Error('subtitles browser api key drift');

const radar = createRadarApiClient({ getSettings: () => settings, fetchImpl, locationLike: { hostname: 'approval-panel-web.pages.dev' } });
await radar.health();
if (calls[3].url !== 'https://api.example.test/radar/api/radar/health') throw new Error(`radar URL drift: ${calls[3].url}`);
if (calls[3].options.headers['x-api-key'] !== 'shared-key') throw new Error('radar shared api key drift');

const videoApi = createVideoProjectsApiClient({ fetchImpl });
await videoApi.createManualVideoProject({ settings, payload: { title: 'T' } });
if (calls[4].url !== 'https://api.example.test/n8n/webhook/video-projects/manual-create/v1') throw new Error(`manual video project URL drift: ${calls[4].url}`);
if (calls[4].options.headers['x-approval-secret'] !== 'approval-secret') throw new Error('manual video project secret drift');
"""
    result = _run_node(script)
    assert result.returncode == 0, result.stderr


def test_shared_read_model_adapters_hydrate_approval_scripts_audio_and_subtitles_from_bff():
    script = r"""
import { createApprovalApiClient } from './js/modules/core/http/approval-api.js';
import { createTtsApiClient } from './js/modules/core/http/tts-api.js';

globalThis.__CONTROL_PANEL_BOOTSTRAP__ = { app_version: '2026.05.24.3' };

const settings = {
  apiProfileMode: 'unified',
  apiOrigin: 'https://api.example.test',
  serviceOverrides: { n8n: false, tts: false, subtitles: false },
};
const calls = [];
const fetchImpl = async (url, options = {}) => {
  calls.push({ url, options });
  if (url.endsWith('/panel/read-models/approval/queue')) return { ok: true, status: 200, text: async () => JSON.stringify({ items: [{ queue_id: 'queue-shared-1', estado_queue: 'processing' }] }) };
  if (url.endsWith('/panel/read-models/scripts/drafts')) return { ok: true, status: 200, text: async () => JSON.stringify({ items: [{ draft_id: 'draft-shared-1' }] }) };
  if (url.endsWith('/panel/read-models/audio/jobs')) return { ok: true, status: 200, text: async () => JSON.stringify({ items: [{ job_id: 'audio-shared-1', status: 'queued' }] }) };
  if (url.endsWith('/panel/read-models/audio/jobs/audio-shared-1')) return { ok: true, status: 200, text: async () => JSON.stringify({ job_id: 'audio-shared-1', status: 'done' }) };
  if (url.endsWith('/panel/read-models/subtitles/sessions?limit=20')) return { ok: true, status: 200, text: async () => JSON.stringify({ items: [{ id: 'sub-shared-1', status: 'editing' }] }) };
  if (url.endsWith('/panel/read-models/subtitles/sessions/sub-shared-1')) return { ok: true, status: 200, text: async () => JSON.stringify({ id: 'sub-shared-1', status: 'editing', preview: { duration_ms: 1000 } }) };
  if (url.endsWith('/panel/read-models/subtitles/sessions/sub-shared-1/segments')) return { ok: true, status: 200, text: async () => JSON.stringify({ version: 2, segments: [{ id: 'seg-1', start_ms: 0, end_ms: 1000, text: 'Hola' }] }) };
  throw new Error(`unexpected shared read URL ${url}`);
};

const approval = createApprovalApiClient({ getSettings: () => settings, fetchImpl });
const queue = await approval.get('/webhook/approval/queue/supabase/v2');
const drafts = await approval.get('/webhook/mvp-script-drafts-pending/supabase/v2');
const tts = createTtsApiClient({ getSettings: () => settings, fetchImpl, btoaImpl: (value) => Buffer.from(value).toString('base64') });
const audioJobs = await tts.get('/api/tts/jobs');
const audioJob = await tts.get('/api/tts/jobs/audio-shared-1');
const sessions = await tts.listSubtitleSessions(20);
const session = await tts.getSubtitleSession('sub-shared-1');
const segments = await tts.getSubtitleSegments('sub-shared-1');

if (queue.items[0].queue_id !== 'queue-shared-1') throw new Error('approval queue read model drift');
if (drafts.items[0].draft_id !== 'draft-shared-1') throw new Error('script drafts read model drift');
if (audioJobs.items[0].job_id !== 'audio-shared-1') throw new Error('audio jobs read model drift');
if (audioJob.status !== 'done') throw new Error('audio job status read model drift');
if (sessions.items[0].id !== 'sub-shared-1') throw new Error('subtitle sessions read model drift');
if (session.preview.duration_ms !== 1000) throw new Error('subtitle detail read model drift');
if (segments.version !== 2 || segments.segments[0].text !== 'Hola') throw new Error('subtitle segments read model drift');

for (const call of calls) {
  if (!call.url.startsWith('https://api.example.test/')) throw new Error(`shared read did not use API origin: ${call.url}`);
  if (call.options.credentials !== 'include') throw new Error(`shared read missing credentials for ${call.url}`);
  if (call.options.headers['x-control-panel-shell-version'] !== '2026.05.24.3') throw new Error(`shared read missing shell version for ${call.url}`);
}
"""
    result = _run_node(script)
    assert result.returncode == 0, result.stderr


def test_video_projects_read_model_hydrates_list_and_detail_from_bff_without_supabase_read_secret_headers():
    script = r"""
import { createVideoProjectsApiClient } from './js/modules/features/video-projects/data/api.js';

globalThis.__CONTROL_PANEL_BOOTSTRAP__ = { app_version: '2026.05.24.3' };

const calls = [];
const fetchImpl = async (url, options = {}) => {
  calls.push({ url, options });
  if (url === '/panel/read-models/video-projects?limit=50') {
    return { ok: true, status: 200, text: async () => JSON.stringify({ projects: [{ draft_id: 'video-shared-1', title: 'Shared video' }] }) };
  }
  if (url === '/panel/read-models/video-projects?draft_id=video-shared-1') {
    return { ok: true, status: 200, text: async () => JSON.stringify({ projects: [{ draft_id: 'video-shared-1', editor_state: { brandChannel: 'pelotazo-ecuador' } }] }) };
  }
  throw new Error(`unexpected video read URL ${url}`);
};

const api = createVideoProjectsApiClient({ fetchImpl });
const list = await api.listVideoProjects({ limit: 50 });
const detail = await api.getVideoProject('video-shared-1');

if (list.projects[0].draft_id !== 'video-shared-1') throw new Error('video project list read model drift');
if (detail.projects[0].editor_state.brandChannel !== 'pelotazo-ecuador') throw new Error('video project detail read model drift');
for (const call of calls) {
  if (call.options.method !== 'GET') throw new Error(`video read should be GET: ${call.options.method}`);
  if (call.options.credentials !== 'include') throw new Error('video read missing gateway credentials');
  if (call.options.headers.apikey || call.options.headers.Authorization) throw new Error('video read must not send Supabase browser headers');
  if (call.options.headers['x-control-panel-shell-version'] !== '2026.05.24.3') throw new Error('video read missing shell version');
}
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
    sharedApiKey: 'api-key-1',
    sharedBasicUser: 'user',
    sharedBasicPass: 'pass',
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


def test_audio_controller_summarizes_missing_sox_errors():
    script = r"""
import { createAudioController } from './js/modules/features/audio/controller.js';

const toasts = [];
const state = {
  settings: { ttsBaseUrl: 'http://localhost:8088', sharedApiKey: 'api-key-1', sharedBasicUser: 'user', sharedBasicPass: 'pass' },
  audioJobId: 'job-sox-1',
  audioJobs: { 'job-sox-1': { job_id: 'job-sox-1', status: 'running', progress: { stage: 'loading_model', percent: 10 } } },
  audioJobOrder: ['job-sox-1'],
  dismissedAudioJobs: new Set(),
  audioStreamController: null,
  audioPollingTimer: 42,
};

const el = {
  audioQueueMeta: { textContent: '' },
  audioQueueList: { innerHTML: '', classList: { add() {}, remove() {} } },
};

const controller = createAudioController({
  state,
  el,
  api: { post() { throw new Error('not used'); } },
  ui: { toast(message) { toasts.push(message); } },
  helpers: {
    escapeHtml(value) { return String(value); },
    getErrorMessage(err, fallback) { return err?.message || fallback; },
    resolveTtsGet() { return async () => ({}); },
    getBlob() { throw new Error('not used'); },
  },
  browser: { clearInterval() {} },
});

controller.applyAudioJobStatus('job-sox-1', {
  job_id: 'job-sox-1',
  status: 'error',
  progress: { stage: 'error', percent: 10 },
  error: { message: '"sox" no se reconoce como un comando interno o externo.\nSoX could not be found!\nIf you do not have SoX...' },
}, { stopTrackingOnTerminal: true });

if (toasts[0] !== 'Falta SoX en el servidor de audio. Instalalo y reiniciá el worker TTS.') {
  throw new Error(`unexpected sox toast ${JSON.stringify(toasts)}`);
}
if (toasts[0].length > 100) throw new Error('toast should stay compact');
"""
    result = _run_node(script)
    assert result.returncode == 0, result.stderr


def test_audio_queue_sync_skips_terminal_and_actively_tracked_jobs():
    script = r"""
import { createAudioController } from './js/modules/features/audio/controller.js';

const requested = [];
const state = {
  settings: { ttsBaseUrl: 'http://localhost:8088' },
  audioJobId: 'job-active',
  audioStreamController: { active: true },
  audioPollingTimer: null,
  audioJobs: {
    'job-done': { job_id: 'job-done', status: 'done' },
    'job-error': { job_id: 'job-error', status: 'error' },
    'job-active': { job_id: 'job-active', status: 'processing' },
    'job-processing': { job_id: 'job-processing', status: 'processing' },
  },
  audioJobOrder: ['job-done', 'job-error', 'job-active', 'job-processing'],
  dismissedAudioJobs: new Set(),
};

const controller = createAudioController({
  state,
  el: { audioQueueMeta: { textContent: '' }, audioQueueList: { innerHTML: '', classList: { add() {}, remove() {} } } },
  api: { post() { throw new Error('not used'); } },
  ui: { toast() {} },
  helpers: {
    escapeHtml(value) { return String(value); },
    getErrorMessage(err, fallback) { return err?.message || fallback; },
    resolveTtsGet() {
      return async (path) => {
        requested.push(path);
        return { job_id: path.split('/').pop(), status: 'processing' };
      };
    },
    getBlob() { throw new Error('not used'); },
  },
  browser: { clearInterval() {} },
});

await controller.syncAudioQueueStatuses();

if (JSON.stringify(requested) !== JSON.stringify(['/api/tts/jobs/job-processing'])) {
  throw new Error(`queue sync requested unnecessary jobs: ${JSON.stringify(requested)}`);
}
"""
    result = _run_node(script)
    assert result.returncode == 0, result.stderr


def test_approval_cards_use_delegated_interaction_handlers():
    source = (ROOT / "js" / "modules" / "app-shell" / "runtime.js").read_text(encoding="utf-8")
    render_cards = source.split("function renderCards()", 1)[1].split("function bindCardsInteractionEvents()", 1)[0]
    delegated = source.split("function bindCardsInteractionEvents()", 1)[1].split("function renderScriptStats()", 1)[0]

    assert "querySelectorAll('.card').forEach" not in render_cards
    assert "delegatedCardEvents" in delegated
    assert "el.cards.addEventListener('click'" in delegated
    assert "el.cards.addEventListener('keydown'" in delegated


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
    index_source = (ROOT / "index.html").read_text(encoding="utf-8")
    selectors_source = (ROOT / "js" / "modules" / "shared" / "dom" / "selectors.js").read_text(encoding="utf-8")

    assert "runVoiceAiFromSelectedScript" in source
    assert "openVoiceAiPresetDialog" in source
    assert "confirmVoiceAiPresetSelection" in source
    assert "isScriptProcessed(selected)" in source
    assert "Tenés cambios sin procesar" in source
    assert "selected.guion_pronunciacion" in source
    assert "runAudioGenerationFromText" in source
    assert "voiceProfile: preset" in source
    assert "runAudioGenerationFromText: audioController.runAudioGenerationFromText" in source
    assert "runAudioGenerationFromText: hooks.runAudioGenerationFromText" in audio_runtime_source
    assert 'id="voicePresetDialog"' in index_source
    assert 'id="voicePresetSelect"' in index_source
    assert "voicePresetDialog" in selectors_source
    assert "confirmVoicePresetBtn" in selectors_source


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


def test_approval_facade_exports_render_helpers_and_preserves_dom_contracts():
    script = r"""
import {
  buildApprovalNewsCardMarkup,
  buildQueueMonitorCard,
  createOptimisticApprovedTopic,
  formatQueueAttempts,
  normalizeApprovalQueueItems,
  normalizeQueueStatus,
  renderApprovalTopicDetail,
  renderQueueMonitor,
  resolveApprovalOrderingAvg,
  resolveApprovalSourceLink,
  resolveQueueProgressPercent,
  shouldDisplayInQueueMonitor,
  syncPendingItemsAfterApproval,
} from './js/modules/features/approval/index.js';

const escapeHtml = (value) => (value ?? '').toString()
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

if (resolveApprovalOrderingAvg({ promedio_score: '1.25' }).value !== 1.25) throw new Error('ordering export drift');
if (resolveApprovalSourceLink({ source_url: 'https://example.com/source' }) !== 'https://example.com/source') throw new Error('source link export drift');
if (normalizeApprovalQueueItems({ rows: [{ queue_id: 'q-row' }] })[0].queue_id !== 'q-row') throw new Error('queue envelope export drift');
if (normalizeQueueStatus('En revisión') !== 'en_revision') throw new Error('queue status helper export drift');
if (resolveQueueProgressPercent({ progress: { percent: 63.2 } }, 'processing') !== 63) throw new Error('queue percent helper export drift');
if (formatQueueAttempts(2) !== 'Intento 2') throw new Error('queue attempts helper export drift');
if (shouldDisplayInQueueMonitor('completed')) throw new Error('terminal queue helper export drift');

const optimistic = createOptimisticApprovedTopic({
  cluster_id: 'cluster-1',
  cantidad_fuentes_total: 2,
  cantidad_fuentes_aprobadas: 0,
  sources: [
    { id_noticia: 'news-1', index: 1 },
    { id_noticia: 'news-2', index: 2 },
  ],
}, { id_noticia: 'news-1' });
if (optimistic.sources.length !== 1 || optimistic.sources[0].id_noticia !== 'news-2') throw new Error('optimistic helper export drift');
const synced = syncPendingItemsAfterApproval([{ cluster_id: 'cluster-1', cantidad_fuentes: 2 }], optimistic, { cluster_id: 'cluster-1' });
if (synced.length !== 1 || synced[0].cantidad_fuentes !== 1) throw new Error('pending sync helper export drift');

const cardMarkup = buildApprovalNewsCardMarkup({ cluster_id: 'cluster A/B', tema_principal: 'Tema <uno>', seleccion: 'AR', jugador: 'Jugador', cantidad_fuentes: 3 });
if (!cardMarkup.includes('data-card-id="cluster%20A%2FB"')) throw new Error(`card id encoding drift: ${cardMarkup}`);
if (!cardMarkup.includes('Tema &lt;uno&gt;')) throw new Error(`card escaping drift: ${cardMarkup}`);

const detailEl = {
  dialogTitle: { textContent: '' },
  dialogBody: { innerHTML: '' },
};
renderApprovalTopicDetail({
  item: {
    jugador: 'Jugador',
    tema_principal: 'Tema',
    resumen_cluster: 'Resumen',
    sources: [{
      id_noticia: 'news/1',
      index: 7,
      titular: 'Titular',
      fuente: 'Fuente',
      link: 'https://example.com/a b?x=1&y=2',
    }],
  },
  el: detailEl,
  state: { approvingSourceId: '', deletingSource: false },
  escapeHtml,
  resolveApprovalSourceLink,
});
const detailMarkup = detailEl.dialogBody.innerHTML;
if (!detailMarkup.includes('data-action="open-source"')) throw new Error(`missing open action: ${detailMarkup}`);
if (!detailMarkup.includes('data-action="approve-source"')) throw new Error(`missing approve action: ${detailMarkup}`);
if (!detailMarkup.includes('data-action="delete-source"')) throw new Error(`missing delete action: ${detailMarkup}`);
if (!detailMarkup.includes('data-url="https%3A%2F%2Fexample.com%2Fa%20b%3Fx%3D1%26y%3D2"')) throw new Error(`url encoding drift: ${detailMarkup}`);
if (!detailMarkup.includes('data-id-noticia="news%2F1"')) throw new Error(`id encoding drift: ${detailMarkup}`);
if (!detailMarkup.includes('data-index="7"')) throw new Error(`index contract drift: ${detailMarkup}`);

const queueCard = buildQueueMonitorCard({ queue_id: 'queue-1', estado_queue: 'processing', tema_principal: 'Job activo', jugador: 'Jugador', fuente: 'Fuente' });
if (queueCard.id !== 'queue-1' || queueCard.tone !== 'active' || !queueCard.isVisible) throw new Error(`queue card helper drift: ${JSON.stringify(queueCard)}`);

const queueEl = {
  queueMeta: { textContent: '', classList: { toggle(name, enabled) { this[name] = enabled; } } },
  queueList: { innerHTML: '' },
};
renderQueueMonitor({ queueItems: [{ queue_id: 'queue-1', estado_queue: 'failed', tema_principal: 'Job con error', jugador: 'Jugador', fuente: 'Fuente' }], el: queueEl, escapeHtml });
if (!queueEl.queueList.innerHTML.includes('data-action="dismiss-approval-queue-job"')) throw new Error(`missing queue dismiss action: ${queueEl.queueList.innerHTML}`);
if (!queueEl.queueList.innerHTML.includes('data-queue-id="queue-1"')) throw new Error(`missing queue dataset id: ${queueEl.queueList.innerHTML}`);
"""
    result = _run_node(script)
    assert result.returncode == 0, result.stderr

    runtime_source = (ROOT / "js" / "modules" / "app-shell" / "runtime.js").read_text(encoding="utf-8")
    assert "../features/approval/cards.js" not in runtime_source
    assert "../features/approval/detail-dialog.js" not in runtime_source
    assert "../features/approval/queue-monitor.js" not in runtime_source
    assert "../features/approval/index.js" in runtime_source
    for token in ["buildApprovalNewsCardMarkup", "renderApprovalTopicDetail", "renderQueueMonitor"]:
        assert token in runtime_source


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


def test_architecture_file_size_soft_cap_and_css_facade_guardrails():
    guarded_files = [
        "styles/features/video-projects/index.css",
        "styles/features/video-projects/layout.css",
        "styles/features/video-projects/project-list.css",
        "styles/features/video-projects/setup-images.css",
        "styles/features/video-projects/setup-audio.css",
        "styles/features/video-projects/editor-shell.css",
        "styles/features/video-projects/editor-controls.css",
        "styles/features/video-projects/preview-composition.css",
        "styles/features/video-projects/video-selector.css",
        "styles/features/video-projects/responsive.css",
        "js/modules/features/video-projects/index.js",
        "js/modules/features/video-projects/render.js",
        "js/modules/features/video-projects/render/index.js",
        "js/modules/features/video-projects/render/project-list-view.js",
        "js/modules/features/video-projects/render/setup-view.js",
        "js/modules/features/video-projects/render/editor-shell-view.js",
        "js/modules/features/video-projects/render/preview-lifecycle.js",
        "js/modules/features/video-projects/render/editor-hydration.js",
        "js/modules/features/video-projects/render/video-selector-hydration.js",
        "js/modules/features/video-projects/render/motion-scrub.js",
        "js/modules/features/video-projects/controller/create-video-projects-controller.js",
        "js/modules/features/video-projects/controller/project-loading.js",
        "js/modules/features/video-projects/controller/editor-state-persistence.js",
        "js/modules/features/video-projects/controller/approval-snapshot-operations.js",
        "js/modules/features/video-projects/controller/preview-export-commands.js",
        "js/modules/features/video-projects/controller/row-commands.js",
        "js/modules/features/video-projects/controller/audio-commands.js",
        "js/modules/features/video-projects/controller/brand-commands.js",
        "js/modules/app-shell.js",
        "js/modules/app-shell/index.js",
        "js/modules/app-shell/state.js",
        "js/modules/app-shell/services.js",
        "js/modules/app-shell/navigation.js",
        "js/modules/app-shell/settings.js",
        "js/modules/app-shell/events/index.js",
        "js/modules/app-shell/events/scripts.js",
        "js/modules/app-shell/events/audio.js",
        "js/modules/app-shell/events/subtitles.js",
        "js/modules/app-shell/events/approval-dialog.js",
        "js/modules/app-shell/render-callbacks.js",
        "js/modules/app-shell/approval-monitor.js",
        "js/modules/features/video-projects/composition/composition-renderer.js",
        "js/modules/features/video-projects/composition/renderer/index.js",
        "js/modules/features/video-projects/composition/renderer/dom.js",
        "js/modules/features/video-projects/composition/renderer/frame-math.js",
        "js/modules/features/video-projects/composition/renderer/video-layers.js",
        "js/modules/features/video-projects/composition/renderer/logo-chroma.js",
    ]

    oversize = []
    for relative_path in guarded_files:
        path = ROOT / relative_path
        assert path.exists(), f"Missing architecture guardrail target: {relative_path}"
        line_count = len(path.read_text(encoding="utf-8").splitlines())
        if line_count > FILE_SIZE_SOFT_CAP_LINES and relative_path not in FILE_SIZE_EXCEPTIONS:
            oversize.append(f"{relative_path} ({line_count} lines)")

    assert not oversize, "Files exceed 500-line soft cap without exception: " + ", ".join(oversize)

    facade_lines = [line.strip() for line in VIDEO_PROJECTS_CSS_FACADE.read_text(encoding="utf-8").splitlines() if line.strip()]
    assert all(line.startswith("@import './") and line.endswith(".css';") for line in facade_lines)


def test_video_projects_render_facade_and_hydration_seams():
    result = subprocess.run(
        ["node", "--test", "js/modules/__checks__/video-projects-render-seams.check.mjs"],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr


def test_video_projects_controller_facade_and_use_case_seams():
    result = subprocess.run(
        ["node", "--test", "js/modules/__checks__/video-projects-controller-seams.check.mjs"],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr


def test_app_shell_facade_navigation_settings_and_render_callback_seams():
    result = subprocess.run(
        ["node", "--test", "js/modules/__checks__/app-shell-seams.check.mjs"],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr


def test_composition_renderer_pure_helper_facade_parity():
    result = subprocess.run(
        ["node", "--test", "js/modules/__checks__/composition-renderer-helpers.check.mjs"],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr


def test_app_shell_rollback_scope_is_documented():
    contract_source = CONTRACT_MATRIX_PATH.read_text(encoding="utf-8")
    assert "Checkpoint P6 (App Shell Facade Extraction)" in contract_source
    assert "Rollback Scope (P6 App Shell)" in contract_source
    assert "js/modules/app-shell/" in contract_source
    assert "CompositionRenderer" in contract_source


def test_video_projects_controller_rollback_scope_is_documented():
    contract_source = CONTRACT_MATRIX_PATH.read_text(encoding="utf-8")
    assert "Checkpoint P5 (Video Projects Controller Use-Cases)" in contract_source
    assert "Rollback Scope (P5 Controller)" in contract_source
    assert "js/modules/features/video-projects/controller/" in contract_source
    assert "app-shell" in contract_source
    assert "CompositionRenderer" in contract_source


def test_contract_matrix_documents_check_manifest_source_aggregation():
    contract_source = CONTRACT_MATRIX_PATH.read_text(encoding="utf-8")
    assert "Check Organization Manifest" in contract_source
    assert "js/modules/__checks__/manifest.js" in contract_source
    assert "implementationPath" in contract_source


def test_dependency_boundary_validator_detects_sibling_feature_imports():
    script = r"""
import { validateNoSiblingFeatureImports } from './js/modules/__checks__/dependency-boundary-validator.js';

const baseline = validateNoSiblingFeatureImports({
  'js/modules/features/video-projects/index.js': "import { x } from '../../core/foo.js';",
  'js/modules/features/audio/index.js': "import { x } from '../../core/bar.js';",
});
if (!baseline.ok) throw new Error(`expected baseline pass, got ${JSON.stringify(baseline.violations)}`);

const mutated = validateNoSiblingFeatureImports({
  'js/modules/features/video-projects/index.js': "import { createAudioController } from '../audio/index.js';",
});
if (mutated.ok) throw new Error('expected sibling feature import violation');
if (mutated.violations[0]?.from !== 'js/modules/features/video-projects/index.js') {
  throw new Error(`violation source drift: ${JSON.stringify(mutated.violations)}`);
}
if (mutated.violations[0]?.feature !== 'audio') {
  throw new Error(`violation feature drift: ${JSON.stringify(mutated.violations)}`);
}
"""
    result = _run_node(script)
    assert result.returncode == 0, result.stderr


def test_bootstrap_boundary_invariance_and_runtime_helper_delegation_contract():
    main_source = MAIN_JS_PATH.read_text(encoding="utf-8")
    composition_source = COMPOSITION_ROOT_PATH.read_text(encoding="utf-8")
    app_shell_source = (ROOT / "js" / "modules" / "app-shell.js").read_text(encoding="utf-8")
    parity_checklist_source = _read_check_implementation_source("js/modules/__checks__/parity-checklist.js")

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


def test_parity_checklist_enforces_video_projects_facade_contracts():
    script = r"""
import { runParityChecklist } from './js/modules/__checks__/parity-checklist.js';

const indexHtmlSource = '<div id="authGate"></div><div id="appShell"></div><form id="authForm"></form><input id="searchInput"><select id="countryFilter"></select><select id="sourcesFilter"></select><div id="cards"></div><dialog id="queueDialog"></dialog><dialog id="settingsDialog"></dialog><nav id="sidebarNav"></nav><section id="viewApproval"></section><section id="viewScripts"></section><section id="viewAudio"></section><section id="viewSubtitulos2"></section><button id="audioRunBtn"></button><tbody id="subtitle2RowsBody"></tbody><section id="subtitle2ServiceHealthBanner"></section><section id="subtitle2SessionHistory"></section><section id="subtitle2PreviewStage"></section><video id="subtitle2PreviewVideo"></video><section id="subtitle2PreviewOverlay"></section><section id="subtitle2PreviewCue"></section><section id="subtitle2PreviewTimeline"></section><button id="subtitle2AddRowBtn"></button><button id="subtitle2AnotherVideoBtn"></button>';
const baseline = runParityChecklist({
  indexHtmlSource,
  mainJsSource: "import './modules/composition-root.js'; bootCompositionRoot();",
  compositionRootSource: "import { bootApp } from './app-shell.js'; bootApp();",
  appShellSource: "import { normalizeAudioProgressPercent } from './features/audio/runtime/index.js'; import { resolveSubtitleProgressPercentRuntime } from './features/subtitles/runtime/index.js';",
  stylesSource: "@import './styles/features/video-projects/index.css';",
  videoProjectsFacadeSource: "export function createVideoProjectsFeature() {}; export { renderSelectedVideoProjectView } from './render.js';",
});
if (!baseline.pass) throw new Error(`expected video projects facade baseline pass, got ${JSON.stringify(baseline.failures)}`);

const mutated = runParityChecklist({
  indexHtmlSource,
  mainJsSource: "import './modules/composition-root.js'; bootCompositionRoot();",
  compositionRootSource: "import { bootApp } from './app-shell.js'; bootApp();",
  appShellSource: "import { normalizeAudioProgressPercent } from './features/audio/runtime/index.js'; import { resolveSubtitleProgressPercentRuntime } from './features/subtitles/runtime/index.js';",
  stylesSource: "@import './styles/features/video-projects.css';",
  videoProjectsFacadeSource: "export function createRenamedFeature() {};",
});
if (mutated.pass) throw new Error('expected video projects facade contract failure');
if (!mutated.failures.some((f) => String(f).includes('video-projects/index.css'))) {
  throw new Error(`expected CSS facade import violation, got ${JSON.stringify(mutated.failures)}`);
}
if (!mutated.failures.some((f) => String(f).includes('createVideoProjectsFeature'))) {
  throw new Error(`expected public factory violation, got ${JSON.stringify(mutated.failures)}`);
}
"""
    result = _run_node(script)
    assert result.returncode == 0, result.stderr


def test_subtitles_navigation_contract_uses_single_remote_view_without_mode_toggle():
    index_source = (ROOT / "index.html").read_text(encoding="utf-8")
    subtitles_template = (ROOT / "js" / "modules" / "app-shell" / "views" / "templates" / "subtitles-view.js").read_text(encoding="utf-8")
    dom_source = index_source + "\n" + subtitles_template
    selectors_source = (ROOT / "js" / "modules" / "shared" / "dom" / "selectors.js").read_text(encoding="utf-8")
    bootstrap_source = (ROOT / "js" / "modules" / "core" / "bootstrap.js").read_text(encoding="utf-8")

    for expected in [
        'data-view="subtitulos2"',
        'id="viewSubtitulos2"',
        'id="subtitle2ServiceHealthBanner"',
        'id="subtitle2SessionHistory"',
    ]:
        assert expected in dom_source

    for forbidden in [
        'id="subtitleModeSelect"',
        'subtitlesMode:',
        'subtitleModeSelect:',
    ]:
        assert forbidden not in "\n".join([dom_source, selectors_source, bootstrap_source])
