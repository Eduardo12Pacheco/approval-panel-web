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


def test_session_gate_persists_login_marker_to_cookie_backup():
    script = r"""
import { persistSessionStatus } from './js/modules/core/auth/session-gate.js';

const writes = [];
const storage = {
  setItem(key, value) {
    writes.push([key, value]);
  },
};
const cookieJar = {
  cookie: '',
  setCookie(value) {
    this.cookie = value;
  },
};

persistSessionStatus({ storage, cookieJar, sessionKey: 'approval-panel-session-v1', value: 'ok' });

if (JSON.stringify(writes) !== JSON.stringify([['approval-panel-session-v1', 'ok']])) {
  throw new Error(`expected local storage write to remain intact, got ${JSON.stringify(writes)}`);
}
if (!cookieJar.cookie.includes('approval-panel-session-v1=ok')) {
  throw new Error(`expected cookie backup with session marker, got ${cookieJar.cookie}`);
}
if (!cookieJar.cookie.includes('SameSite=Lax')) {
  throw new Error(`expected SameSite=Lax cookie attribute, got ${cookieJar.cookie}`);
}
"""
    result = _run_node(script)
    assert result.returncode == 0, result.stderr


def test_session_gate_reads_cookie_backup_when_local_storage_is_empty():
    script = r"""
import { readSessionStatus, clearSessionStatus } from './js/modules/core/auth/session-gate.js';

const removals = [];
const storage = {
  getItem() {
    return null;
  },
  removeItem(key) {
    removals.push(key);
  },
};
const cookieJar = {
  cookie: 'other=value; approval-panel-session-v1=ok',
  setCookie(value) {
    this.cookie = value;
  },
};

const restored = readSessionStatus({ storage, cookieJar, sessionKey: 'approval-panel-session-v1' });
if (restored !== 'ok') {
  throw new Error(`expected cookie fallback to restore session, got ${restored}`);
}

clearSessionStatus({ storage, cookieJar, sessionKey: 'approval-panel-session-v1' });

if (JSON.stringify(removals) !== JSON.stringify(['approval-panel-session-v1'])) {
  throw new Error(`expected local storage session cleanup, got ${JSON.stringify(removals)}`);
}
if (!cookieJar.cookie.includes('approval-panel-session-v1=')) {
  throw new Error(`expected cookie deletion for session key, got ${cookieJar.cookie}`);
}
if (!cookieJar.cookie.includes('Max-Age=0')) {
  throw new Error(`expected expiring cookie cleanup, got ${cookieJar.cookie}`);
}
"""
    result = _run_node(script)
    assert result.returncode == 0, result.stderr


def test_app_shell_auth_wiring_passes_cookie_backup_for_persist_restore_and_clear():
    script = r"""
import { createAppShellLifecycle } from './js/modules/app-shell/lifecycle.js';
import { readFileSync } from 'node:fs';

const storage = { getItem() { return null; } };
const cookieJar = { cookie: 'approval-panel-session-v1=ok' };
const calls = [];
const el = {
  authGate: { classList: { add(name) { this.added = name; }, remove(name) { this.removed = name; } } },
  appShell: { classList: { add(name) { this.added = name; }, remove(name) { this.removed = name; } } },
};

const lifecycle = createAppShellLifecycle({
  bindEvents() {},
  customDropdowns: { mountAll() {} },
  hydrateSettingsForm() {},
  el,
  readSessionStatus(args) {
    calls.push(args);
    return args.cookieJar?.cookie?.includes('approval-panel-session-v1=ok') ? 'ok' : null;
  },
  storage,
  cookieJar,
  sessionKey: 'approval-panel-session-v1',
  setView(view) { calls.push({ setView: view }); },
  refreshAll() { calls.push({ refreshAll: true }); },
  renderSearchRefreshState() {},
  renderSelectedScriptEditor() {},
  renderSelectedVideoProject() {},
});

lifecycle.boot();

if (calls[0]?.cookieJar !== cookieJar) {
  throw new Error(`expected lifecycle restore to pass cookieJar, got ${JSON.stringify(calls[0])}`);
}
if (el.authGate.classList.added !== 'hidden' || el.appShell.classList.removed !== 'hidden') {
  throw new Error('expected cookie-backed session to open the app shell');
}

const runtimeSource = readFileSync('./js/modules/app-shell/runtime.js', 'utf8');
for (const token of [
  'persistSessionStatus({ storage: localStorage, cookieJar: document, sessionKey })',
  'clearSessionStatus({ storage: localStorage, cookieJar: document, sessionKey })',
]) {
  if (!runtimeSource.includes(token)) {
    throw new Error(`missing runtime cookie backup token: ${token}`);
  }
}
"""
    result = _run_node(script)
    assert result.returncode == 0, result.stderr


def test_session_gate_hydrates_gateway_session_and_posts_login_with_credentials():
    script = r"""
import { hydrateGatewaySession, loginGatewaySession, logoutGatewaySession } from './js/modules/core/auth/session-gate.js';

const calls = [];
const fetchImpl = async (url, options = {}) => {
  calls.push({ url, options });
  if (url === 'https://api.automatizacionedun8n.me/panel/session') {
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        user: { user_id: 'user-editor', email: 'editor@example.test', display_name: 'Editor Test' },
        roles: ['editor'],
        session_id: 'session-editor',
      }),
    };
  }
  if (url === 'https://api.automatizacionedun8n.me/panel/login') {
    return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true }) };
  }
  if (url === 'https://api.automatizacionedun8n.me/panel/logout') {
    return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true }) };
  }
  throw new Error(`unexpected url ${url}`);
};

const hydrated = await hydrateGatewaySession({ fetchImpl });
if (hydrated.status !== 'ok' || hydrated.user.email !== 'editor@example.test' || hydrated.roles[0] !== 'editor') {
  throw new Error(`gateway session hydration drift: ${JSON.stringify(hydrated)}`);
}
if (calls[0].options.credentials !== 'include') throw new Error('session hydration must include cookies');

await loginGatewaySession({ fetchImpl, user: 'paneladmin', pass: 'Guiones2026!' });
if (calls[1].options.method !== 'POST') throw new Error('login must POST');
if (calls[1].options.credentials !== 'include') throw new Error('login must include cookies');
if (calls[1].options.headers['Content-Type'] !== 'application/json') throw new Error('login content-type drift');
if (JSON.parse(calls[1].options.body).pass !== 'Guiones2026!') throw new Error('login payload drift');

await logoutGatewaySession({ fetchImpl });
if (calls[2].options.method !== 'POST' || calls[2].options.credentials !== 'include') {
  throw new Error(`logout request drift: ${JSON.stringify(calls[2])}`);
}
"""
    result = _run_node(script)
    assert result.returncode == 0, result.stderr


def test_session_gate_resolves_session_endpoints_against_bootstrap_api_origin():
    script = r"""
import { hydrateGatewaySession, loginGatewaySession, logoutGatewaySession } from './js/modules/core/auth/session-gate.js';

globalThis.__CONTROL_PANEL_BOOTSTRAP__ = { api_origin: 'https://api.automatizacionedun8n.me/' };

const calls = [];
const fetchImpl = async (url, options = {}) => {
  calls.push({ url, options });
  if (url === 'https://api.automatizacionedun8n.me/panel/session') {
    return { ok: true, status: 200, text: async () => JSON.stringify({ user: { email: 'editor@example.test' } }) };
  }
  if (url === 'https://api.automatizacionedun8n.me/panel/login') {
    return { ok: true, status: 200, text: async () => JSON.stringify({ user: { email: 'editor@example.test' } }) };
  }
  if (url === 'https://api.automatizacionedun8n.me/panel/logout') {
    return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true }) };
  }
  throw new Error(`expected API-origin endpoint, got ${url}`);
};

await hydrateGatewaySession({ fetchImpl });
await loginGatewaySession({ fetchImpl, user: 'paneladmin', pass: 'Guiones2026!' });
await logoutGatewaySession({ fetchImpl });

if (calls[0].url !== 'https://api.automatizacionedun8n.me/panel/session') throw new Error(`session endpoint drift: ${calls[0].url}`);
if (calls[1].url !== 'https://api.automatizacionedun8n.me/panel/login') throw new Error(`login endpoint drift: ${calls[1].url}`);
if (calls[2].url !== 'https://api.automatizacionedun8n.me/panel/logout') throw new Error(`logout endpoint drift: ${calls[2].url}`);
if (calls[1].options.credentials !== 'include') throw new Error('login must include Gateway cookies');
"""
    result = _run_node(script)
    assert result.returncode == 0, result.stderr


def test_session_gate_rejects_pages_html_fallback_as_anonymous_gateway_session():
    script = r"""
import { hydrateGatewaySession } from './js/modules/core/auth/session-gate.js';

const fetchImpl = async () => ({
  ok: true,
  status: 200,
  text: async () => '<!doctype html><html><body>Cloudflare Pages fallback</body></html>',
});

const hydrated = await hydrateGatewaySession({ fetchImpl, endpoint: '/panel/session' });
if (hydrated.status !== 'anonymous') {
  throw new Error(`expected HTML fallback to be anonymous, got ${JSON.stringify(hydrated)}`);
}
if (globalThis.__CONTROL_PANEL_SESSION__?.status !== 'anonymous') {
  throw new Error(`expected failed hydration to clear global session, got ${JSON.stringify(globalThis.__CONTROL_PANEL_SESSION__)}`);
}
"""
    result = _run_node(script)
    assert result.returncode == 0, result.stderr


def test_remote_gateway_anonymous_session_ignores_stale_local_operator_marker():
    script = r"""
import { readSessionStatus } from './js/modules/core/auth/session-gate.js';

globalThis.__CONTROL_PANEL_SESSION__ = { status: 'anonymous', error: 'unauthenticated' };
globalThis.location = { hostname: 'approval-panel-web.pages.dev' };

const storage = { getItem() { return 'ok'; } };
const cookieJar = { cookie: 'approval-panel-session-v1=ok' };

const session = readSessionStatus({ storage, cookieJar, sessionKey: 'approval-panel-session-v1' });
if (session !== null) {
  throw new Error(`expected remote anonymous gateway to ignore stale local session, got ${session}`);
}
"""
    result = _run_node(script)
    assert result.returncode == 0, result.stderr


def test_remote_login_does_not_use_local_operator_fallback_after_gateway_rejects():
    script = r"""
import { bindCoreEvents } from './js/modules/core/bootstrap.js';

globalThis.location = { hostname: 'approval-panel-web.pages.dev' };
const submitted = [];
const classCalls = [];
const toasts = [];

const authForm = { addEventListener(_event, handler) { submitted.push(handler); } };
const el = {
  authForm,
  authUser: { value: 'paneladmin' },
  authPass: { value: 'Guiones2026!' },
  authGate: { classList: { add(value) { classCalls.push(['auth-add', value]); }, remove(value) { classCalls.push(['auth-remove', value]); } } },
  appShell: { classList: { add(value) { classCalls.push(['app-add', value]); }, remove(value) { classCalls.push(['app-remove', value]); } } },
  sidebarNav: { addEventListener() {} },
  settingsBtn: { addEventListener() {} },
  settingsDialog: { showModal() {}, close() {} },
  logoutBtn: { addEventListener() {} },
  closeSettings: { addEventListener() {} },
  closeDialog: { addEventListener() {} },
  topicDialog: { close() {} },
  saveSettingsBtn: { addEventListener() {} },
  baseUrlInput: { value: '' },
  secretInput: { value: '' },
  ttsBaseUrlInput: { value: '' },
  searchInput: { addEventListener() {} },
  countryFilter: { addEventListener() {} },
  sourcesFilter: { addEventListener() {} },
};

bindCoreEvents({
  el,
  authUser: 'paneladmin',
  authPass: 'Guiones2026!',
  isValidCredentials: () => true,
  persistSessionStatus() { throw new Error('remote gateway rejection must not persist local session'); },
  clearSessionStatus() {},
  async loginGatewaySession() {
    globalThis.__CONTROL_PANEL_SESSION__ = { status: 'anonymous' };
    throw new Error('unauthenticated');
  },
  logoutGatewaySession() {},
  setView() { throw new Error('remote gateway rejection must not open app'); },
  refreshAll() { throw new Error('remote gateway rejection must not refresh app'); },
  refreshQueue() {},
  runQueue() {},
  saveSettings() {},
  defaultSettings: () => ({ baseUrl: '', ttsBaseUrl: '', brandChannel: 'pelotazo-ecuador' }),
  toast(message) { toasts.push(message); },
  renderCards() {},
  reloadPage() {},
});

submitted[0]({ preventDefault() {} });
await new Promise((resolve) => setTimeout(resolve, 0));

if (toasts.join('|') !== 'Usuario o contraseña incorrectos') throw new Error(`unexpected toast flow: ${JSON.stringify(toasts)}`);
if (classCalls.length) throw new Error(`remote gateway rejection opened shell: ${JSON.stringify(classCalls)}`);
"""
    result = _run_node(script)
    assert result.returncode == 0, result.stderr


def test_local_login_keeps_operator_fallback_when_gateway_is_unavailable():
    script = r"""
import { bindCoreEvents } from './js/modules/core/bootstrap.js';

globalThis.location = { hostname: 'localhost' };
const submitted = [];
const events = [];

const el = {
  authForm: { addEventListener(_event, handler) { submitted.push(handler); } },
  authUser: { value: 'paneladmin' },
  authPass: { value: 'Guiones2026!' },
  authGate: { classList: { add(value) { events.push(['auth-add', value]); }, remove() {} } },
  appShell: { classList: { add() {}, remove(value) { events.push(['app-remove', value]); } } },
  sidebarNav: { addEventListener() {} },
  settingsBtn: { addEventListener() {} },
  settingsDialog: { showModal() {}, close() {} },
  logoutBtn: { addEventListener() {} },
  closeSettings: { addEventListener() {} },
  closeDialog: { addEventListener() {} },
  topicDialog: { close() {} },
  saveSettingsBtn: { addEventListener() {} },
  baseUrlInput: { value: '' },
  secretInput: { value: '' },
  ttsBaseUrlInput: { value: '' },
  searchInput: { addEventListener() {} },
  countryFilter: { addEventListener() {} },
  sourcesFilter: { addEventListener() {} },
};

bindCoreEvents({
  el,
  authUser: 'paneladmin',
  authPass: 'Guiones2026!',
  isValidCredentials: () => true,
  persistSessionStatus() { events.push(['persist']); },
  clearSessionStatus() {},
  async loginGatewaySession() {
    globalThis.__CONTROL_PANEL_SESSION__ = { status: 'failed' };
    throw new Error('network unavailable');
  },
  logoutGatewaySession() {},
  setView(view) { events.push(['view', view]); },
  refreshAll(options) { events.push(['refresh', options.source]); },
  refreshQueue() {},
  runQueue() {},
  saveSettings() {},
  defaultSettings: () => ({ baseUrl: '', ttsBaseUrl: '', brandChannel: 'pelotazo-ecuador' }),
  toast(message) { events.push(['toast', message]); },
  renderCards() {},
  reloadPage() {},
});

submitted[0]({ preventDefault() {} });
await new Promise((resolve) => setTimeout(resolve, 0));

if (!events.some((event) => event[0] === 'persist')) throw new Error(`local fallback did not persist: ${JSON.stringify(events)}`);
if (!events.some((event) => event[0] === 'toast' && event[1] === 'Sesión iniciada')) throw new Error(`local fallback did not log in: ${JSON.stringify(events)}`);
"""
    result = _run_node(script)
    assert result.returncode == 0, result.stderr
