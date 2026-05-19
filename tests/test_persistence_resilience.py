import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def _run_node(script: str):
    return subprocess.run(
        ["node", "--experimental-default-type=module", "-e", script],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )


def test_settings_load_returns_defaults_when_storage_get_item_throws():
    script = r"""
import { defaultSettingsFactory, loadSettingsFromStorage } from './js/modules/core/state/app-store.js';

const defaults = defaultSettingsFactory();
const loaded = loadSettingsFromStorage({
  storage: { getItem() { throw new Error('storage blocked'); } },
  storageKey: 'approval-panel-settings-v1',
});

if (JSON.stringify(loaded) !== JSON.stringify(defaults)) {
  throw new Error(`expected defaults when storage is unavailable, got ${JSON.stringify(loaded)}`);
}
"""
    result = _run_node(script)
    assert result.returncode == 0, result.stderr


def test_settings_save_returns_next_settings_when_storage_set_item_throws():
    script = r"""
import { saveSettingsToStorage } from './js/modules/core/state/app-store.js';

const nextSettings = { baseUrl: 'https://example.test', secret: 'keep-in-memory' };
const saved = saveSettingsToStorage({
  storage: { setItem() { throw new Error('quota exceeded'); } },
  storageKey: 'approval-panel-settings-v1',
  nextSettings,
});

if (saved !== nextSettings) {
  throw new Error('expected save to preserve the in-memory next settings object');
}
"""
    result = _run_node(script)
    assert result.returncode == 0, result.stderr


def test_remote_pages_context_skips_background_local_approval_refreshes():
    script = r"""
import { shouldSkipApprovalBackgroundRefresh } from './js/modules/core/state/app-store.js';

const remotePages = { hostname: 'approval-panel-web.pages.dev' };

if (!shouldSkipApprovalBackgroundRefresh({
  baseUrl: 'http://localhost:5678',
  locationLike: remotePages,
})) {
  throw new Error('remote Pages context should skip background localhost n8n refreshes');
}

if (!shouldSkipApprovalBackgroundRefresh({
  baseUrl: 'http://127.0.0.1:5678',
  locationLike: remotePages,
})) {
  throw new Error('remote Pages context should skip background 127.0.0.1 n8n refreshes');
}
"""
    result = _run_node(script)
    assert result.returncode == 0, result.stderr


def test_local_and_remote_approval_urls_keep_background_refreshes_enabled():
    script = r"""
import { shouldSkipApprovalBackgroundRefresh } from './js/modules/core/state/app-store.js';

if (shouldSkipApprovalBackgroundRefresh({
  baseUrl: 'http://localhost:5678',
  locationLike: { hostname: 'localhost' },
})) {
  throw new Error('local app context must keep background localhost n8n refreshes enabled');
}

if (shouldSkipApprovalBackgroundRefresh({
  baseUrl: 'https://n8n.example.test',
  locationLike: { hostname: 'approval-panel-web.pages.dev' },
})) {
  throw new Error('remote n8n base URL must keep background refreshes enabled');
}
"""
    result = _run_node(script)
    assert result.returncode == 0, result.stderr


def test_remote_pages_context_skips_initial_boot_local_approval_refreshes_only_when_silent():
    script = r"""
import { shouldSkipApprovalInitialBootRefresh } from './js/modules/core/state/app-store.js';

const remotePages = { hostname: 'approval-panel-web.pages.dev' };

if (!shouldSkipApprovalInitialBootRefresh({
  baseUrl: 'http://localhost:5678',
  locationLike: remotePages,
  refreshOptions: { silent: true, source: 'boot' },
})) {
  throw new Error('remote Pages silent boot should skip localhost n8n refreshes');
}

if (shouldSkipApprovalInitialBootRefresh({
  baseUrl: 'http://localhost:5678',
  locationLike: remotePages,
  refreshOptions: {},
})) {
  throw new Error('manual refreshAll calls must keep localhost n8n refreshes enabled');
}
"""
    result = _run_node(script)
    assert result.returncode == 0, result.stderr


def test_initial_boot_refresh_marks_refresh_all_as_silent_boot_context():
    script = r"""
import { createAppShellLifecycle } from './js/modules/app-shell/lifecycle.js';

const refreshCalls = [];
const el = {
  authGate: { classList: { add() {}, remove() {} } },
  appShell: { classList: { add() {}, remove() {} } },
  runQueueBtn: { textContent: '' },
};

const lifecycle = createAppShellLifecycle({
  bindEvents() {},
  customDropdowns: { mountAll() {} },
  hydrateSettingsForm() {},
  el,
  readSessionStatus() { return 'ok'; },
  storage: {},
  cookieJar: {},
  sessionKey: 'approval-panel-session-v1',
  setView() {},
  refreshAll(options) { refreshCalls.push(options); },
  renderSearchRefreshState() {},
  renderSelectedScriptEditor() {},
  renderSelectedVideoProject() {},
});

lifecycle.bootCompatibilityShell();

if (JSON.stringify(refreshCalls) !== JSON.stringify([{ silent: true, source: 'boot' }])) {
  throw new Error(`expected initial boot refresh to be marked silent boot, got ${JSON.stringify(refreshCalls)}`);
}
"""
    result = _run_node(script)
    assert result.returncode == 0, result.stderr


def test_lifecycle_hydrates_and_restores_session_when_event_binding_throws():
    script = r"""
import { createAppShellLifecycle } from './js/modules/app-shell/lifecycle.js';

const calls = [];
const el = {
  authGate: { classList: { add(name) { calls.push(['authGate.add', name]); }, remove(name) { calls.push(['authGate.remove', name]); } } },
  appShell: { classList: { add(name) { calls.push(['appShell.add', name]); }, remove(name) { calls.push(['appShell.remove', name]); } } },
  runQueueBtn: { textContent: '' },
};

const lifecycle = createAppShellLifecycle({
  bindEvents() { calls.push(['bindEvents']); throw new Error('missing optional node'); },
  customDropdowns: { mountAll() { calls.push(['mountAll']); } },
  hydrateSettingsForm() { calls.push(['hydrateSettingsForm']); },
  el,
  readSessionStatus() { calls.push(['readSessionStatus']); return 'ok'; },
  storage: {},
  cookieJar: {},
  sessionKey: 'approval-panel-session-v1',
  setView(view) { calls.push(['setView', view]); },
  refreshAll() { calls.push(['refreshAll']); },
  renderSearchRefreshState() { calls.push(['renderSearchRefreshState']); },
  renderSelectedScriptEditor() { calls.push(['renderSelectedScriptEditor']); },
  renderSelectedVideoProject() { calls.push(['renderSelectedVideoProject']); },
});

lifecycle.bootCompatibilityShell();

const names = calls.map((entry) => entry[0]);
for (const name of ['hydrateSettingsForm', 'readSessionStatus', 'setView', 'refreshAll', 'bindEvents']) {
  if (!names.includes(name)) {
    throw new Error(`expected ${name} to be called, got ${JSON.stringify(calls)}`);
  }
}
if (names.indexOf('hydrateSettingsForm') > names.indexOf('bindEvents')) {
  throw new Error(`expected settings hydration before non-critical event binding, got ${JSON.stringify(calls)}`);
}
if (names.indexOf('readSessionStatus') > names.indexOf('bindEvents')) {
  throw new Error(`expected session restore before non-critical event binding, got ${JSON.stringify(calls)}`);
}
"""
    result = _run_node(script)
    assert result.returncode == 0, result.stderr


def test_settings_migrates_legacy_storage_with_additive_unified_defaults():
    script = r"""
import { loadSettingsFromStorage } from './js/modules/core/state/app-store.js';

const legacySettings = {
  baseUrl: 'https://legacy-n8n.example.test',
  secret: 'legacy-secret',
  ttsBaseUrl: 'https://legacy-tts.example.test',
  ttsApiKey: 'tts-key',
  ttsBasicUser: 'tts-user',
  ttsBasicPass: 'tts-pass',
  subtitlesBaseUrl: 'https://legacy-subtitles.example.test',
  subtitlesApiKey: 'subs-key',
  transcriptServiceBaseUrl: 'https://legacy-radar.example.test',
  transcriptServiceApiKey: 'radar-key',
};

const loaded = loadSettingsFromStorage({
  storage: { getItem() { return JSON.stringify(legacySettings); } },
  storageKey: 'approval-panel-settings-v1',
});

if (loaded.apiProfileMode !== 'unified') throw new Error(`expected unified mode, got ${loaded.apiProfileMode}`);
if (loaded.apiOrigin !== 'https://api.automatizacionedun8n.me') throw new Error(`unexpected api origin ${loaded.apiOrigin}`);
if (loaded.sharedApiKey !== '' || loaded.sharedBasicUser !== '' || loaded.sharedBasicPass !== '') {
  throw new Error('shared credentials must default empty during legacy migration');
}
for (const [service, expected] of Object.entries({ n8n: true, tts: true, subtitles: true, radar: true, remotion: true, approvalPipeline: true })) {
  if (loaded.serviceOverrides?.[service] !== expected) {
    throw new Error(`expected ${service} override ${expected}, got ${loaded.serviceOverrides?.[service]}`);
  }
}
for (const [key, expected] of Object.entries(legacySettings)) {
  if (loaded[key] !== expected) throw new Error(`legacy ${key} drift: ${loaded[key]} !== ${expected}`);
}
"""
    result = _run_node(script)
    assert result.returncode == 0, result.stderr


def test_resolve_service_config_derives_unified_origin_and_preserves_override_precedence():
    script = r"""
import { resolveServiceConfig } from './js/modules/core/state/app-store.js';

const settings = {
  apiProfileMode: 'unified',
  apiOrigin: 'https://api.example.test///',
  sharedApiKey: 'shared-key',
  sharedBasicUser: 'shared-user',
  sharedBasicPass: 'shared-pass',
  serviceOverrides: { n8n: false, tts: false, subtitles: true, radar: false, remotion: false, approvalPipeline: false },
  baseUrl: 'https://legacy-n8n.example.test',
  secret: 'approval-secret',
  ttsBaseUrl: 'https://legacy-tts.example.test',
  ttsApiKey: '',
  ttsBasicUser: '',
  ttsBasicPass: '',
  subtitlesBaseUrl: 'https://override-subtitles.example.test',
  subtitlesApiKey: 'subs-key',
  subtitlesBasicUser: 'subs-user',
  subtitlesBasicPass: 'subs-pass',
  transcriptServiceBaseUrl: 'https://legacy-radar.example.test',
  transcriptServiceApiKey: '',
  remotionApiUrl: 'https://legacy-remotion.example.test',
  approvalPipelineBaseUrl: 'http://127.0.0.1:3042',
};

const n8n = resolveServiceConfig(settings, 'n8n');
if (n8n.baseUrl !== 'https://api.example.test/n8n') throw new Error(`n8n derivation drift: ${n8n.baseUrl}`);
if (n8n.secret !== 'approval-secret') throw new Error('n8n approval secret must remain service-specific');

const tts = resolveServiceConfig(settings, 'tts');
if (tts.baseUrl !== 'https://api.example.test/tts') throw new Error(`tts derivation drift: ${tts.baseUrl}`);
if (tts.apiKey !== 'shared-key' || tts.basicUser !== 'shared-user' || tts.basicPass !== 'shared-pass') {
  throw new Error(`tts shared credential fallback drift: ${JSON.stringify(tts)}`);
}

const subtitles = resolveServiceConfig(settings, 'subtitles');
if (subtitles.baseUrl !== 'https://override-subtitles.example.test') throw new Error(`subtitles override drift: ${subtitles.baseUrl}`);
if (subtitles.apiKey !== 'subs-key' || subtitles.basicUser !== 'subs-user' || subtitles.basicPass !== 'subs-pass') {
  throw new Error(`subtitles override credential drift: ${JSON.stringify(subtitles)}`);
}

const approvalPipeline = resolveServiceConfig(settings, 'approvalPipeline');
if (approvalPipeline.baseUrl !== 'http://127.0.0.1:3042') {
  throw new Error(`approval pipeline must remain advanced/local-only, got ${approvalPipeline.baseUrl}`);
}
"""
    result = _run_node(script)
    assert result.returncode == 0, result.stderr


def test_saving_simple_profile_preserves_existing_service_overrides():
    script = r"""
import { defaultSettingsFactory, mergeSettingsForSave } from './js/modules/core/state/app-store.js';

const current = {
  ...defaultSettingsFactory(),
  apiProfileMode: 'unified',
  ttsBaseUrl: 'https://custom-tts.example.test',
  ttsApiKey: 'service-key',
  ttsBasicUser: 'service-user',
  ttsBasicPass: 'service-pass',
  serviceOverrides: { n8n: true, tts: true, subtitles: true, radar: true, remotion: true, approvalPipeline: true },
};
const saved = mergeSettingsForSave(current, {
  apiProfileMode: 'unified',
  apiOrigin: 'https://api.example.test/',
  sharedApiKey: 'shared-key',
  sharedBasicUser: 'shared-user',
  sharedBasicPass: 'shared-pass',
});

if (saved.apiOrigin !== 'https://api.example.test') throw new Error(`api origin should be trimmed, got ${saved.apiOrigin}`);
if (saved.ttsBaseUrl !== 'https://custom-tts.example.test') throw new Error('simple save must preserve ttsBaseUrl override');
if (saved.ttsApiKey !== 'service-key' || saved.ttsBasicUser !== 'service-user' || saved.ttsBasicPass !== 'service-pass') {
  throw new Error('simple save must preserve service-specific TTS credentials');
}
if (saved.serviceOverrides.tts !== true) throw new Error('simple save must preserve explicit override flags');
"""
    result = _run_node(script)
    assert result.returncode == 0, result.stderr


def test_default_settings_keep_direct_service_urls_until_gateway_routes_are_enabled():
    script = r"""
import { defaultSettingsFactory, resolveServiceConfig } from './js/modules/core/state/app-store.js';

const defaults = defaultSettingsFactory();
if (defaults.apiProfileMode !== 'unified') throw new Error(`default profile must be unified, got ${defaults.apiProfileMode}`);

const expectedBaseUrls = {
  n8n: 'http://localhost:5678',
  tts: 'http://localhost:8088',
  subtitles: 'http://127.0.0.1:8092',
  radar: 'http://127.0.0.1:8765',
  remotion: 'https://remotion-api.automatizacionedun8n.me',
};
for (const [service, expected] of Object.entries(expectedBaseUrls)) {
  const resolved = resolveServiceConfig(defaults, service);
  if (resolved.baseUrl !== expected) throw new Error(`${service} default derivation drift: ${resolved.baseUrl}`);
}
const approvalPipeline = resolveServiceConfig(defaults, 'approvalPipeline');
if (approvalPipeline.baseUrl !== 'http://127.0.0.1:3042') {
  throw new Error(`approval pipeline default must remain local-only, got ${approvalPipeline.baseUrl}`);
}
"""
    result = _run_node(script)
    assert result.returncode == 0, result.stderr
