import { normalizeAiRescueQueue, normalizeAiRescueRejection } from './state.js';
import { renderAiRescueCandidates, renderAiRescueDetail, renderAiRescueQueue } from './render.js';

const POLL_INTERVAL_MS = 10000;

export function createAiRescueController({ state, el, api, ui = {}, browser = {} }) {
  const setIntervalImpl = browser.setInterval || setInterval;
  const clearIntervalImpl = browser.clearInterval || clearInterval;
  const windowImpl = browser.window || globalThis.window;
  const confirmImpl = browser.confirm || globalThis.confirm || (() => true);

  function toast(message) { ui.toast?.(message); }
  function render() { renderAiRescueCandidates({ el, state }); }

  async function activate() {
    stopActivePolling();
    await refreshAll();
    state.activePollingTimer = setIntervalImpl(() => { void refreshAll({ silent: true }); }, POLL_INTERVAL_MS);
  }

  function deactivate() {
    stopActivePolling();
    stopQueuePolling();
  }

  async function refreshAll({ silent = false } = {}) {
    if (state.refreshInFlight) return;
    state.refreshInFlight = true;
    state.status = silent ? state.status : 'loading';
    render();
    try {
      await api.preflight?.();
      const [candidatesPayload, rejectionsPayload] = await Promise.all([
        api.candidates(state.selectedTab && state.selectedTab !== 'rejected' ? state.selectedTab : ''),
        api.rejections(),
      ]);
      state.candidates = Array.isArray(candidatesPayload?.items) ? candidatesPayload.items : [];
      state.rejections = Array.isArray(rejectionsPayload?.items) ? rejectionsPayload.items.map(normalizeAiRescueRejection) : [];
      state.status = 'ready';
      state.error = '';
    } catch (error) {
      state.status = 'error';
      state.error = error?.message || 'Prensa IA no disponible';
      if (!silent) toast(state.error);
    } finally {
      state.refreshInFlight = false;
      render();
    }
  }

  async function manualRefresh() {
    try {
      const result = await api.refresh();
      toast(result?.status === 'disabled' ? 'Prensa IA está deshabilitado.' : `Prensa IA actualizado: ${Number(result?.enqueued_count || 0)} nuevos en cola.`);
      await refreshAll();
    } catch (error) {
      toast(error?.message || 'No pude actualizar Prensa IA');
    }
  }

  async function refreshQueue() {
    if (state.queueInFlight) return;
    state.queueInFlight = true;
    try {
      state.queue = normalizeAiRescueQueue(await api.queue());
      renderAiRescueQueue({ el, queue: state.queue });
    } catch (error) {
      if (el.aiRescueQueueBody) el.aiRescueQueueBody.innerHTML = `<p class="meta">${escapeHtml(error?.message || 'No pude cargar la cola Prensa IA')}</p>`;
    } finally {
      state.queueInFlight = false;
    }
  }

  async function openQueue() {
    el.aiRescueQueueDialog?.showModal?.();
    await refreshQueue();
    stopQueuePolling();
    state.queuePollingTimer = setIntervalImpl(() => { void refreshQueue(); }, POLL_INTERVAL_MS);
  }

  function closeQueue() {
    el.aiRescueQueueDialog?.close?.();
    stopQueuePolling();
  }

  async function openDetail(candidateId) {
    try {
      const candidate = await api.candidateDetail(candidateId);
      state.selectedCandidate = candidate;
      renderAiRescueDetail({ el, candidate });
      el.aiRescueDetailDialog?.showModal?.();
    } catch (error) {
      toast(error?.message || 'No pude cargar el resumen Prensa IA');
    }
  }

  async function confirmDecision(candidateId, action, { reason = 'Rechazo editorial' } = {}) {
    if (el.aiRescueConfirmTitle) el.aiRescueConfirmTitle.textContent = action === 'approve' ? 'Aprobar rescate AI' : 'Rechazar candidato AI';
    if (el.aiRescueConfirmMessage) el.aiRescueConfirmMessage.textContent = action === 'approve'
      ? '¿Confirmás aprobar este rescate? Entrará al Radar Monitor como RESCATADO IA.'
      : '¿Confirmás rechazar este candidato? Se guardará para calibración.';
    if (el.aiRescueConfirmAcceptBtn) el.aiRescueConfirmAcceptBtn.onclick = async () => {
      if (action === 'approve') await api.approveCandidate(candidateId, { confirmed: true, reviewer: 'control-panel' });
      else await api.rejectCandidate(candidateId, { confirmed: true, reviewer: 'control-panel', reason });
      el.aiRescueConfirmDialog?.close?.();
      el.aiRescueDetailDialog?.close?.();
      await refreshAll();
    };
    el.aiRescueConfirmDialog?.showModal?.();
  }

  function openLink(url) {
    const cleanUrl = (url || '').toString().trim();
    if (!isSafeYouTubeUrl(cleanUrl)) {
      toast('Link de YouTube no disponible');
      return;
    }
    windowImpl?.open?.(cleanUrl, '_blank', 'noopener,noreferrer');
  }

  function bindEvents() {
    el.aiRescueRefreshBtn?.addEventListener?.('click', () => { void manualRefresh(); });
    el.aiRescueQueueBtn?.addEventListener?.('click', () => { void openQueue(); });
    el.aiRescueQueueCloseBtn?.addEventListener?.('click', closeQueue);
    el.aiRescueQueueRefreshBtn?.addEventListener?.('click', () => { void refreshQueue(); });
    el.aiRescueDetailCloseBtn?.addEventListener?.('click', () => el.aiRescueDetailDialog?.close?.());
    el.aiRescueConfirmCancelBtn?.addEventListener?.('click', () => el.aiRescueConfirmDialog?.close?.());
    el.aiRescueTabs?.addEventListener?.('click', (event) => {
      const button = event.target?.closest?.('[data-ai-rescue-tab]');
      if (!button) return;
      state.selectedTab = button.dataset.aiRescueTab || 'ecuador';
      render();
      void refreshAll({ silent: true });
    });
    el.aiRescueList?.addEventListener?.('click', (event) => {
      const button = event.target?.closest?.('[data-ai-rescue-action]');
      if (!button || button.disabled) return;
      const action = button.dataset.aiRescueAction;
      const candidateId = Number(button.dataset.aiRescueCandidateId || 0);
      if (action === 'open-link') openLink(button.dataset.aiRescueUrl);
      if (action === 'summary' && candidateId) void openDetail(candidateId);
    });
    el.aiRescueDetailBody?.addEventListener?.('click', (event) => {
      const button = event.target?.closest?.('[data-ai-rescue-action]');
      if (!button) return;
      const candidateId = Number(button.dataset.aiRescueCandidateId || state.selectedCandidate?.id || 0);
      if (!candidateId) return;
      if (button.dataset.aiRescueAction === 'approve') void confirmDecision(candidateId, 'approve');
      if (button.dataset.aiRescueAction === 'reject') {
        const reason = confirmImpl('¿Rechazás este candidato AI?') ? 'Rechazo editorial' : '';
        if (reason) void confirmDecision(candidateId, 'reject', { reason });
      }
    });
  }

  function stopActivePolling() {
    if (state.activePollingTimer) clearIntervalImpl(state.activePollingTimer);
    state.activePollingTimer = null;
  }

  function stopQueuePolling() {
    if (state.queuePollingTimer) clearIntervalImpl(state.queuePollingTimer);
    state.queuePollingTimer = null;
  }

  return { activate, deactivate, bindEvents, refreshAll, manualRefresh, openQueue, closeQueue, refreshQueue, openDetail, confirmDecision, openLink, render };
}

function isSafeYouTubeUrl(rawUrl = '') {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === 'https:' && ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function escapeHtml(value) {
  return (value ?? '').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
