import { AI_RESCUE_REJECTION_GROUP_BATCH_SIZE, normalizeAiRescueQueue, normalizeAiRescueRejection } from './state.js';
import { renderAiRescueCandidates, renderAiRescueDetail, renderAiRescueQueue } from './render.js';

const POLL_INTERVAL_MS = 10000;

export function createAiRescueController({ state, el, api, ui = {}, browser = {} }) {
  const setIntervalImpl = browser.setInterval || setInterval;
  const clearIntervalImpl = browser.clearInterval || clearInterval;
  const windowImpl = browser.window || globalThis.window;
  const confirmImpl = browser.confirm || globalThis.confirm || (() => true);
  let activationRunId = 0;
  let queueOpenRunId = 0;

  function toast(message) { ui.toast?.(message); }
  function render() { renderAiRescueCandidates({ el, state }); }

  async function activate() {
    const runId = ++activationRunId;
    stopActivePolling();
    await refreshAll();
    if (runId !== activationRunId) return;
    stopActivePolling();
    state.activePollingTimer = setIntervalImpl(() => refreshAll({ silent: true }), POLL_INTERVAL_MS);
  }

  function deactivate() {
    activationRunId += 1;
    queueOpenRunId += 1;
    stopActivePolling();
    stopQueuePolling();
  }

  async function refreshAll({ silent = false, includeRejections = false } = {}) {
    if (state.refreshInFlight) return;
    state.refreshInFlight = true;
    state.status = silent ? state.status : 'loading';
    render();
    try {
      await api.preflight?.();
      const shouldFetchRejections = includeRejections || state.selectedTab === 'rejected';
      const requests = [api.candidates(state.selectedTab && state.selectedTab !== 'rejected' ? state.selectedTab : '')];
      if (shouldFetchRejections) requests.push(api.rejections());
      const [candidatesPayload, rejectionsPayload] = await Promise.all(requests);
      state.candidates = Array.isArray(candidatesPayload?.items) ? candidatesPayload.items : [];
      if (shouldFetchRejections) {
        state.rejections = Array.isArray(rejectionsPayload?.items) ? rejectionsPayload.items.map(normalizeAiRescueRejection) : [];
        state.rejectionsLoaded = true;
      }
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
      await refreshAll({ includeRejections: true });
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
    const runId = ++queueOpenRunId;
    el.aiRescueQueueDialog?.showModal?.();
    stopQueuePolling();
    await refreshQueue();
    if (runId !== queueOpenRunId) return;
    stopQueuePolling();
    state.queuePollingTimer = setIntervalImpl(() => refreshQueue(), POLL_INTERVAL_MS);
  }

  function closeQueue() {
    queueOpenRunId += 1;
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
      await refreshAll({ includeRejections: action === 'reject' });
    };
    el.aiRescueConfirmDialog?.showModal?.();
  }

  function confirmCandidateDismiss({ surface = 'ai-rescue-candidate', targetContext = '', videoId = '', candidateId = 0, restoreFocusTo = null } = {}) {
    const contextLabel = humanizeContext(targetContext);
    if (el.aiRescueConfirmTitle) el.aiRescueConfirmTitle.textContent = '¿Estás seguro?';
    if (el.aiRescueConfirmMessage) el.aiRescueConfirmMessage.textContent = `Esta card no volverá a mostrarse en ${contextLabel}. No se borra el video ni la transcripción.`;
    const closeAndRestore = () => {
      el.aiRescueConfirmDialog?.close?.();
      restoreFocusTo?.focus?.();
    };
    if (el.aiRescueConfirmCancelBtn) el.aiRescueConfirmCancelBtn.onclick = closeAndRestore;
    if (el.aiRescueConfirmAcceptBtn) el.aiRescueConfirmAcceptBtn.onclick = async () => {
      await api.dismissCandidate?.({ surface, targetContext: normalizeDismissContext(targetContext), videoId, candidateId: Number(candidateId || 0) });
      closeAndRestore();
      await refreshAll({ silent: true });
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
    el.aiRescueConfirmDialog?.addEventListener?.('cancel', () => {
      state.dismissFocusTarget?.focus?.();
      state.dismissFocusTarget = null;
    });
    el.aiRescueTabs?.addEventListener?.('click', (event) => {
      const button = event.target?.closest?.('[data-ai-rescue-tab]');
      if (!button) return;
      const nextTab = button.dataset.aiRescueTab || 'ecuador';
      if (state.selectedTab === nextTab) return;
      state.selectedTab = nextTab;
      if (nextTab === 'rejected') state.rejectionVisibleGroupCount = AI_RESCUE_REJECTION_GROUP_BATCH_SIZE;
      render();
      void refreshAll({ silent: true, includeRejections: nextTab === 'rejected' });
    });
    el.aiRescueList?.addEventListener?.('click', (event) => {
      const button = event.target?.closest?.('[data-ai-rescue-action]');
      if (!button || button.disabled) return;
      const action = button.dataset.aiRescueAction;
      const candidateId = Number(button.dataset.aiRescueCandidateId || 0);
      if (action === 'load-more-rejections') {
        state.rejectionVisibleGroupCount = Math.max(
          AI_RESCUE_REJECTION_GROUP_BATCH_SIZE,
          Number(state.rejectionVisibleGroupCount || AI_RESCUE_REJECTION_GROUP_BATCH_SIZE) + AI_RESCUE_REJECTION_GROUP_BATCH_SIZE,
        );
        render();
        return;
      }
      if (action === 'open-link') openLink(button.dataset.aiRescueUrl);
      if (action === 'summary' && candidateId) void openDetail(candidateId);
      if (action === 'dismiss-candidate') {
        state.dismissFocusTarget = button;
        confirmCandidateDismiss({
          surface: button.dataset.aiRescueDismissSurface || 'ai-rescue-candidate',
          targetContext: button.dataset.aiRescueDismissTargetContext || state.selectedTab || '',
          videoId: button.dataset.aiRescueDismissVideoId || '',
          candidateId: Number(button.dataset.aiRescueDismissCandidateId || 0),
          restoreFocusTo: button,
        });
      }
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

  return { activate, deactivate, bindEvents, refreshAll, manualRefresh, openQueue, closeQueue, refreshQueue, openDetail, confirmDecision, confirmCandidateDismiss, openLink, render };
}

function normalizeDismissContext(value = '') {
  return (value || '').toString().trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function humanizeContext(value = '') {
  const normalized = normalizeDismissContext(value);
  const labels = { ecuador: 'Ecuador', colombia: 'Colombia', argentina: 'Argentina', uruguay: 'Uruguay', paraguay: 'Paraguay', mexico: 'México', important: 'IMPORTANTES' };
  return labels[normalized] || (value || 'este contexto').toString();
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
