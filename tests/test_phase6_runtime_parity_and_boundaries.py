import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CONTRACT_MATRIX_PATH = ROOT / "docs" / "parity" / "contract-matrix.md"


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
      return { ok: false, status: 500, text: async () => JSON.stringify({ message: 'boom' }) };
    }
    if (url.endsWith('/business-error')) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ status: 'error', message: 'business' }) };
    }
    return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true }) };
  },
});

await api.post('/webhook/approval/decision/v1', { cluster_id: 'c-1', action: 'approve' });
const postCall = calls[0];
if (postCall.url !== 'http://localhost:5678/webhook/approval/decision/v1') throw new Error('url drift');
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
