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
