import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


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

    result = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
