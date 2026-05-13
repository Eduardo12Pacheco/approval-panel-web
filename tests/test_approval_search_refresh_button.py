import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def _run_node(script: str):
    return subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )


def test_search_refresh_button_posts_and_marks_running_even_without_dialog_body():
    script = r"""
import { createApprovalSearchController } from './js/modules/app-shell/views/approval-search.js';
import { bindApprovalDialogEvents } from './js/modules/app-shell/events/approval-dialog.js';

const calls = [];
const state = { searchRefreshRunning: false };
const el = {
  queueList: null,
  dialogBody: null,
  searchRefreshBtn: {
    disabled: false,
    textContent: 'Actualizar noticias de hoy',
    listeners: {},
    addEventListener(type, handler) { this.listeners[type] = handler; },
    click() { this.listeners.click?.({ target: this }); },
  },
  searchRefreshWindow: { value: '24h', disabled: false },
  searchRefreshStatus: {
    textContent: '',
    classList: { toggle() {} },
  },
};

const approvalSearch = createApprovalSearchController({
  state,
  el,
  customDropdowns: { refreshAll() {} },
  approvalApi: {
    async post(path, payload) {
      calls.push({ path, payload, runningStatus: el.searchRefreshStatus.textContent });
      return { status: 'ok', promote: { status: 'succeeded' } };
    },
  },
  refreshAll: async () => {},
  renderCards: () => {},
  saveLastNewsSearchAt: () => {},
  toast: () => {},
  getErrorMessage: (err) => err?.message || 'error',
});

bindApprovalDialogEvents({
  state,
  el,
  renderQueue: () => {},
  removeSourceFromTopic: async () => {},
  approveSourceFromTopic: async () => {},
  runSearchRefresh: approvalSearch.runSearchRefresh,
  toast: () => {},
  windowRef: { open() {} },
});

el.searchRefreshBtn.click();
await new Promise((resolve) => setTimeout(resolve, 0));

if (calls.length !== 1) throw new Error(`expected one POST, got ${calls.length}`);
if (calls[0].path !== '/webhook/approval/search-refresh/supabase/v2') {
  throw new Error(`unexpected path: ${calls[0].path}`);
}
if (JSON.stringify(calls[0].payload) !== JSON.stringify({ window: '24h' })) {
  throw new Error(`unexpected payload: ${JSON.stringify(calls[0].payload)}`);
}
if (!calls[0].runningStatus.includes('Buscando noticias: Últimas 24 horas')) {
  throw new Error(`status was not updated before POST: ${calls[0].runningStatus}`);
}
"""

    result = _run_node(script)

    assert result.returncode == 0, result.stderr


def test_shell_event_binding_keeps_search_refresh_listener_when_earlier_binder_throws():
    script = r"""
import { bindShellEvents } from './js/modules/app-shell/events/index.js';
import { bindApprovalDialogEvents } from './js/modules/app-shell/events/approval-dialog.js';

const calls = [];
let refreshCount = 0;
const el = {
  queueList: null,
  dialogBody: null,
  searchRefreshBtn: {
    listeners: {},
    addEventListener(type, handler) { this.listeners[type] = handler; },
    click() { this.listeners.click?.({ target: this }); },
  },
};

bindShellEvents({
  bindCore: () => calls.push('core'),
  bindRadar: () => { calls.push('radar'); throw new Error('optional radar node missing'); },
  bindScripts: () => calls.push('scripts'),
  bindAudio: () => calls.push('audio'),
  bindSubtitles: () => calls.push('subtitles'),
  bindApprovalDialog: () => {
    calls.push('approval');
    bindApprovalDialogEvents({
      state: { dismissedQueueJobs: new Set(), selectedTopic: null },
      el,
      renderQueue: () => {},
      removeSourceFromTopic: async () => {},
      approveSourceFromTopic: async () => {},
      runSearchRefresh: () => { refreshCount += 1; },
      toast: () => {},
      windowRef: { open() {} },
    });
  },
});

el.searchRefreshBtn.click();

const expectedCalls = ['core', 'radar', 'scripts', 'audio', 'subtitles', 'approval'];
if (JSON.stringify(calls) !== JSON.stringify(expectedCalls)) {
  throw new Error(`expected isolated bind order ${JSON.stringify(expectedCalls)}, got ${JSON.stringify(calls)}`);
}
if (refreshCount !== 1) {
  throw new Error(`expected search refresh click listener to run once, got ${refreshCount}`);
}
"""

    result = _run_node(script)

    assert result.returncode == 0, result.stderr
