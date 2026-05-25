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
      if (path === '/webhook/approval/search-refresh/supabase/v2') {
        return { status: 'accepted', run_id: 'run-1' };
      }
      if (path === '/webhook/approval/search-refresh/status/supabase/v1') {
        return { status: 'succeeded', run_id: payload.run_id, completed_at: '2026-05-23T20:40:00.000Z' };
      }
      throw new Error(`unexpected path ${path}`);
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

if (calls.length !== 2) throw new Error(`expected start and status POSTs, got ${calls.length}`);
if (calls[0].path !== '/webhook/approval/search-refresh/supabase/v2') {
  throw new Error(`unexpected path: ${calls[0].path}`);
}
if (JSON.stringify(calls[0].payload) !== JSON.stringify({ window: '24h' })) {
  throw new Error(`unexpected payload: ${JSON.stringify(calls[0].payload)}`);
}
if (!calls[0].runningStatus.includes('Buscando noticias: Últimas 24 horas')) {
  throw new Error(`status was not updated before POST: ${calls[0].runningStatus}`);
}
if (calls[1].path !== '/webhook/approval/search-refresh/status/supabase/v1') {
  throw new Error(`unexpected status path: ${calls[1].path}`);
}
if (JSON.stringify(calls[1].payload) !== JSON.stringify({ run_id: 'run-1' })) {
  throw new Error(`unexpected status payload: ${JSON.stringify(calls[1].payload)}`);
}
"""

    result = _run_node(script)

    assert result.returncode == 0, result.stderr


def test_last_news_search_meta_uses_shared_item_timestamp_instead_of_local_timestamp():
    script = r"""
import { createApprovalSearchController } from './js/modules/app-shell/views/approval-search.js';

const state = {
  searchRefreshRunning: false,
  lastNewsSearchAt: '2026-05-22T10:15:00.000Z',
  items: [
    { cluster_id: 'old', fecha_creacion_cluster: '2026-05-23T20:40:00.000Z' },
    { cluster_id: 'new', fecha_creacion_cluster: '2026-05-23T21:52:00.000Z' },
  ],
};
const el = {
  searchRefreshBtn: { disabled: false, textContent: '' },
  searchRefreshWindow: { value: '24h', disabled: false },
  searchRefreshStatus: { textContent: '', classList: { toggle() {} } },
  lastNewsSearchMeta: { hidden: true, textContent: '' },
};

const controller = createApprovalSearchController({
  state,
  el,
  customDropdowns: { refreshAll() {} },
  approvalApi: { async post() { return {}; } },
  refreshAll: async () => {},
  renderCards: () => {},
  saveLastNewsSearchAt: () => {},
  toast: () => {},
  getErrorMessage: (err) => err?.message || 'error',
});

controller.renderLastNewsSearchMeta();
if (el.lastNewsSearchMeta.hidden !== false) throw new Error('expected last refresh meta to be visible');
if (!el.lastNewsSearchMeta.textContent.includes('Última actualización del panel:')) {
  throw new Error(`missing label: ${el.lastNewsSearchMeta.textContent}`);
}
if (!el.lastNewsSearchMeta.textContent.includes('23/05/2026')) {
  throw new Error(`missing shared date: ${el.lastNewsSearchMeta.textContent}`);
}
if (el.lastNewsSearchMeta.textContent.includes('22/05/2026')) {
  throw new Error(`local timestamp leaked into shared meta: ${el.lastNewsSearchMeta.textContent}`);
}
"""

    result = _run_node(script)

    assert result.returncode == 0, result.stderr


def test_async_search_refresh_surfaces_run_error_field():
    script = r"""
import { createApprovalSearchController } from './js/modules/app-shell/views/approval-search.js';

const toasts = [];
const state = { searchRefreshRunning: false };
const el = {
  searchRefreshBtn: { disabled: false, textContent: '' },
  searchRefreshWindow: { value: '24h', disabled: false },
  searchRefreshStatus: { textContent: '', classList: { toggle() {} } },
};

const controller = createApprovalSearchController({
  state,
  el,
  customDropdowns: { refreshAll() {} },
  approvalApi: {
    async post(path, payload) {
      if (path === '/webhook/approval/search-refresh/supabase/v2') {
        return { status: 'accepted', run_id: 'run-failed' };
      }
      if (path === '/webhook/approval/search-refresh/status/supabase/v1') {
        return { status: 'failed', run_id: payload.run_id, error: 'OpenCode quota exceeded' };
      }
      throw new Error(`unexpected path ${path}`);
    },
  },
  refreshAll: async () => {},
  renderCards: () => {},
  toast: (message) => { toasts.push(message); },
  getErrorMessage: (err) => err?.message || 'error',
});

await controller.runSearchRefresh();

if (!el.searchRefreshStatus.textContent.includes('OpenCode quota exceeded')) {
  throw new Error(`expected run.error in status, got: ${el.searchRefreshStatus.textContent}`);
}
if (toasts[0] !== 'OpenCode quota exceeded') {
  throw new Error(`expected run.error toast, got: ${JSON.stringify(toasts)}`);
}
"""

    result = _run_node(script)

    assert result.returncode == 0, result.stderr


def test_last_news_search_meta_stays_pending_when_only_local_timestamp_exists():
    script = r"""
import { createApprovalSearchController } from './js/modules/app-shell/views/approval-search.js';

const state = {
  searchRefreshRunning: false,
  lastNewsSearchAt: '2026-05-23T20:40:00.000Z',
  items: [
    { cluster_id: 'missing-date' },
    { cluster_id: 'bad-date', fecha_creacion_cluster: 'not-a-date' },
  ],
};
const el = {
  searchRefreshBtn: { disabled: false, textContent: '' },
  searchRefreshWindow: { value: '24h', disabled: false },
  searchRefreshStatus: { textContent: '', classList: { toggle() {} } },
  lastNewsSearchMeta: { hidden: true, textContent: '' },
};

const controller = createApprovalSearchController({
  state,
  el,
  customDropdowns: { refreshAll() {} },
  approvalApi: { async post() { return {}; } },
  refreshAll: async () => {},
  renderCards: () => {},
  saveLastNewsSearchAt: () => { throw new Error('must not persist shared panel timestamp locally'); },
  toast: () => {},
  getErrorMessage: (err) => err?.message || 'error',
});

controller.renderLastNewsSearchMeta();
if (el.lastNewsSearchMeta.hidden !== false) throw new Error('expected last refresh meta to be visible');
if (el.lastNewsSearchMeta.textContent !== 'Última actualización del panel: pendiente') {
  throw new Error(`unexpected local-only copy: ${el.lastNewsSearchMeta.textContent}`);
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
