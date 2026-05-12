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
