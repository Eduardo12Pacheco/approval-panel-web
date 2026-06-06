import { buildRadarJobPayload, mapMonitorCard, normalizeMonitorSummary } from './state.js';
import {
  formatMentionsCopy,
  formatTranscriptCopy,
  renderRadarMonitor,
  renderRadarHistory,
  renderRadarResults,
  renderRadarSummary,
  renderRadarStatus,
} from './render.js';

const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'cancelled']);
const MONITOR_PAGE_SIZE = 200;

export function createRadarController({ state, el, api, ui = {}, browser = {} }) {
  const setTimeoutImpl = browser.setTimeout || setTimeout;
  const clearTimeoutImpl = browser.clearTimeout || clearTimeout;
  const clipboard = browser.clipboard || globalThis.navigator?.clipboard;
  const documentImpl = browser.document || globalThis.document;
  const urlImpl = browser.URL || globalThis.URL;
  const windowImpl = browser.window || globalThis.window;
  const pollDelayMs = Number(browser.pollDelayMs || 8000);

  function toast(message) {
    ui.toast?.(message);
  }

  function renderAll() {
    renderRadarStatus({ el, state });
    renderRadarMonitor({ el, state });
    renderRadarResults({ el, state });
    renderRadarHistory({ el, history: state.history });
  }

  function activate() {
    if (!api.isBlockedByRemoteContext?.()) return true;
    state.health = {
      status: 'error',
      message: api.getRemoteLocalServiceMessage?.() || 'Configurá Transcript Service URL en settings para usar Radar desde este dominio.',
    };
    state.history = [];
    renderAll();
    return false;
  }

  async function refreshHealth() {
    try {
      state.health = await api.health();
    } catch (error) {
      state.health = { status: 'error', message: error?.message || 'Transcript Service no disponible' };
      toast(state.health.message);
    } finally {
      renderAll();
    }
  }

  async function refreshHistory() {
    try {
      const payload = await api.history();
      state.history = Array.isArray(payload.items) ? payload.items : [];
    } catch (error) {
      toast(error?.message || 'No pude cargar el historial Radar');
    } finally {
      renderAll();
    }
  }

  async function refreshMonitor() {
    state.monitorStatus = 'loading';
    state.monitorError = '';
    renderAll();
    try {
      const [payload, summary] = await Promise.all([
        loadAllPages((page) => api.monitorCards(state.selectedCountry || '', page)),
        api.monitorSummary?.().catch?.(() => null) || null,
      ]);
      const cards = Array.isArray(payload.items) ? payload.items : [];
      state.monitorSummary = summary;
      state.basuraCount = Number(summary?.basura_count || 0);
      state.monitorCards = cards.map((card) => mapMonitorCard(card, normalizeMonitorSummary({ items: card.mention_counts || card.mentionCounts || [] })));
      state.monitorStatus = payload.degraded || payload.status === 'degraded' ? 'degraded' : 'ready';
    } catch (error) {
      state.monitorStatus = 'error';
      state.monitorError = error?.message || 'Channel Monitor no disponible';
      state.monitorCards = [];
      toast(state.monitorError);
    } finally {
      renderAll();
    }
  }

  async function showBasura() {
    try {
      const payload = await loadAllPages((page) => api.monitorBasura?.(page));
      state.basuraItems = Array.isArray(payload?.items) ? payload.items : [];
      state.basuraCount = Number(payload?.total ?? state.basuraItems.length);
      renderAll();
      el.radarBasuraDialog?.showModal?.();
    } catch (error) {
      toast(error?.message || 'No pude cargar Basura');
    }
  }

  async function loadAllPages(fetchPage) {
    const items = [];
    let offset = 0;
    let total = 0;
    let hasMore = true;
    let firstPayload = null;
    while (hasMore) {
      const page = await fetchPage({ limit: MONITOR_PAGE_SIZE, offset });
      if (!firstPayload) firstPayload = page || {};
      const pageItems = Array.isArray(page?.items) ? page.items : [];
      items.push(...pageItems);
      const pagination = page?.pagination || {};
      total = Number(pagination.total ?? page?.total ?? items.length);
      const pageLimit = Number(pagination.limit || MONITOR_PAGE_SIZE);
      offset = Number(pagination.offset ?? offset) + pageLimit;
      hasMore = Boolean(pagination.has_more) && pageItems.length > 0;
      if (!page?.pagination) hasMore = false;
    }
    return { ...(firstPayload || {}), total, items };
  }

  async function enrichMonitorCards(cards) {
    return Promise.all(cards.map(async (card) => {
      if (!card.radar_job_id) return mapMonitorCard(card, []);
      try {
        const summary = await api.getSummary(card.radar_job_id);
        return mapMonitorCard(card, normalizeMonitorSummary(summary));
      } catch (error) {
        return mapMonitorCard(card, [{ label: 'Pendiente', count: '—', status: 'summary_unavailable' }]);
      }
    }));
  }

  function readPayloadFromForm() {
    return buildRadarJobPayload({
      url: el.radarUrlInput?.value,
      countries: [
        el.radarCountryColombia?.checked ? 'colombia' : '',
        el.radarCountryEcuador?.checked ? 'ecuador' : '',
        el.radarCountryArgentina?.checked ? 'argentina' : '',
        el.radarCountryParaguay?.checked ? 'paraguay' : '',
        el.radarCountryUruguay?.checked ? 'uruguay' : '',
        el.radarCountryMexico?.checked ? 'mexico' : '',
      ],
      extraKeywords: el.radarExtraKeywordsInput?.value,
    });
  }

  async function submitCurrentJob() {
    try {
      const payload = readPayloadFromForm();
      state.status = 'submitting';
      state.summary = null;
      renderAll();
      const created = await api.createJob(payload);
      state.activeJobId = created.job_id;
      state.currentJob = created;
      el.radarNewJobDialog?.close?.();
      renderAll();
      await pollActiveJob();
    } catch (error) {
      state.status = 'error';
      if (el.radarValidationMessage) el.radarValidationMessage.textContent = error?.message || 'No pude enviar el job Radar';
      toast(error?.message || 'No pude enviar el job Radar');
      renderAll();
    }
  }

  async function pollActiveJob() {
    if (!state.activeJobId || state.pollingInFlight) return;
    state.pollingInFlight = true;
    try {
      const job = await api.getJob(state.activeJobId);
      state.currentJob = job;
      if (job.status === 'succeeded') {
        await refreshHistory();
        renderAll();
        return;
      }
      if (job.status === 'cancelled' || job.status === 'failed') {
        await refreshHistory();
        renderAll();
        return;
      }
      if (!TERMINAL_STATUSES.has(job.status)) {
        state.pollingTimer = setTimeoutImpl(() => { void pollActiveJob(); }, pollDelayMs);
      }
    } catch (error) {
      toast(error?.message || 'No pude consultar el progreso Radar');
    } finally {
      state.pollingInFlight = false;
      renderAll();
    }
  }

  async function copyTranscript() {
    const text = formatTranscriptCopy(state.transcript || {});
    if (!text) return;
    await clipboard?.writeText?.(text);
    toast('Transcripción copiada');
  }

  async function showSummary(jobId) {
    state.summary = await api.getSummary(jobId);
    renderRadarSummary({ el, summary: state.summary });
    el.radarSummaryDialog?.showModal?.();
  }

  async function downloadJob(jobId) {
    const text = await api.downloadExportText(jobId);
    triggerTextDownload({ text, filename: buildExportFilename(jobId) });
    toast('TXT descargado');
  }

  function buildExportFilename(jobId) {
    const safeJobId = (jobId || 'radar-export').toString().replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '');
    return `${safeJobId || 'radar-export'}.txt`;
  }

  function triggerTextDownload({ text, filename }) {
    if (!documentImpl?.createElement || !urlImpl?.createObjectURL) {
      throw new Error('El navegador no permite crear la descarga del TXT');
    }

    const blob = new Blob([text || ''], { type: 'text/plain;charset=utf-8' });
    const href = urlImpl.createObjectURL(blob);
    const link = documentImpl.createElement('a');
    link.href = href;
    link.download = filename;
    link.rel = 'noopener';
    documentImpl.body?.appendChild?.(link);
    link.click?.();
    link.remove?.();
    urlImpl.revokeObjectURL?.(href);
  }

  function openMonitorLink(url) {
    const cleanUrl = (url || '').toString().trim();
    if (!isSafeYouTubeUrl(cleanUrl)) {
      toast('Link de YouTube no disponible');
      return;
    }
    windowImpl?.open?.(cleanUrl, '_blank', 'noopener,noreferrer');
  }

  function isSafeYouTubeUrl(rawUrl = '') {
    try {
      const parsed = new URL(rawUrl);
      const hostname = parsed.hostname.toLowerCase();
      return parsed.protocol === 'https:' && ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(hostname);
    } catch {
      return false;
    }
  }

  async function confirmJobAction(jobId, action) {
    if (el.radarConfirmTitle) el.radarConfirmTitle.textContent = action === 'cancel' ? 'Cancelar job' : 'Eliminar job';
    if (el.radarConfirmMessage) el.radarConfirmMessage.textContent = action === 'cancel'
      ? '¿Querés cancelar este job? El backend limpiará los artefactos propios en el próximo checkpoint seguro.'
      : '¿Querés eliminar este job y sus artefactos?';
    if (el.radarConfirmAcceptBtn) el.radarConfirmAcceptBtn.onclick = async () => {
      if (action === 'cancel') {
        await api.cancelJob(jobId);
        stopPolling();
        state.activeJobId = null;
        state.currentJob = null;
      } else {
        await api.deleteJob(jobId);
      }
      el.radarConfirmDialog?.close?.();
      await refreshHistory();
      renderAll();
    };
    el.radarConfirmDialog?.showModal?.();
  }

  async function confirmMonitorCardDismiss({ videoId, targetContext, targetLabel, trigger } = {}) {
    const cleanVideoId = (videoId || '').toString().trim();
    const cleanTargetContext = normalizeDismissContext(targetContext);
    const cleanTargetLabel = (targetLabel || humanizeDismissContext(cleanTargetContext)).toString().trim();
    if (!cleanVideoId || !cleanTargetContext) {
      toast('No pude identificar el contexto del card para ocultarlo.');
      return;
    }
    if (el.radarConfirmTitle) el.radarConfirmTitle.textContent = '¿Estás seguro?';
    if (el.radarConfirmMessage) {
      el.radarConfirmMessage.textContent = `Esta card no volverá a mostrarse en ${cleanTargetLabel}. No se borra el video ni la transcripción.`;
    }
    const restoreFocus = () => trigger?.focus?.();
    state.monitorDismissCancelHandler = () => {
      el.radarConfirmDialog?.close?.();
      restoreFocus();
      state.monitorDismissCancelHandler = null;
    };
    if (el.radarConfirmDialog?.addEventListener && !state.monitorDismissCancelBound) {
      el.radarConfirmDialog.addEventListener('cancel', (event) => {
        if (!state.monitorDismissCancelHandler) return;
        event?.preventDefault?.();
        state.monitorDismissCancelHandler();
      });
      state.monitorDismissCancelBound = true;
    }
    if (el.radarConfirmCancelBtn) {
      el.radarConfirmCancelBtn.onclick = () => {
        state.monitorDismissCancelHandler?.();
      };
    }
    if (el.radarConfirmAcceptBtn) {
      el.radarConfirmAcceptBtn.onclick = async () => {
        await api.dismissCard?.({
          surface: 'monitor-card',
          targetContext: cleanTargetContext,
          videoId: cleanVideoId,
        });
        el.radarConfirmDialog?.close?.();
        await refreshMonitor();
        restoreFocus();
        state.monitorDismissCancelHandler = null;
      };
    }
    el.radarConfirmDialog?.showModal?.();
  }

  async function copyMentions() {
    const text = formatMentionsCopy(state.mentions || {});
    if (!text) return;
    await clipboard?.writeText?.(text);
    toast('Menciones copiadas');
  }

  function bindEvents() {
    el.radarNewJobBtn?.addEventListener('click', () => el.radarNewJobDialog?.showModal?.());
    el.radarNewJobCancelBtn?.addEventListener('click', () => el.radarNewJobDialog?.close?.());
    el.radarSummaryCloseBtn?.addEventListener('click', () => el.radarSummaryDialog?.close?.());
    el.radarConfirmCancelBtn?.addEventListener('click', () => el.radarConfirmDialog?.close?.());
    el.radarSubmitBtn?.addEventListener('click', () => { void submitCurrentJob(); });
    el.radarMonitorRefreshBtn?.addEventListener('click', () => { void refreshMonitor(); });
    el.radarMonitorSearchInput?.addEventListener('input', (event) => {
      state.monitorSearchQuery = event.target?.value || '';
      renderAll();
    });
    el.radarMonitorSortSelect?.addEventListener('change', (event) => {
      state.monitorSortMode = event.target?.value === 'recent' ? 'recent' : 'relevance';
      renderAll();
    });
    el.radarBasuraBtn?.addEventListener('click', () => { void showBasura(); });
    el.radarBasuraCloseBtn?.addEventListener('click', () => el.radarBasuraDialog?.close?.());
    el.radarCountryBar?.addEventListener?.('click', (event) => {
      const button = event.target?.closest?.('[data-radar-country-option]');
      if (!button) return;
      const nextCountry = button.dataset.radarCountryOption || '';
      state.selectedCountry = state.selectedCountry === nextCountry ? '' : nextCountry;
      void refreshMonitor();
    });
    el.radarCopyTranscriptBtn?.addEventListener('click', () => { void copyTranscript(); });
    el.radarCopyMentionsBtn?.addEventListener('click', () => { void copyMentions(); });
    el.radarHistoryList?.addEventListener?.('click', (event) => {
      const button = event.target?.closest?.('[data-radar-action]');
      if (!button) return;
      const jobId = button.dataset.radarJobId;
      if (button.dataset.radarAction === 'summary') void showSummary(jobId);
      if (button.dataset.radarAction === 'download') void downloadJob(jobId);
      if (button.dataset.radarAction === 'delete') void confirmJobAction(jobId, 'delete');
    });
    el.radarQueueList?.addEventListener?.('click', (event) => {
      const button = event.target?.closest?.('[data-radar-action]');
      if (!button) return;
      if (button.dataset.radarAction === 'cancel') void confirmJobAction(button.dataset.radarJobId, 'cancel');
      if (button.dataset.radarAction === 'delete') void confirmJobAction(button.dataset.radarJobId, 'delete');
    });
    el.radarMonitorList?.addEventListener?.('click', (event) => {
      const button = event.target?.closest?.('[data-radar-action]');
      if (!button) return;
      if (button.disabled) return;
      if (button.dataset.radarAction === 'open-link') openMonitorLink(button.dataset.radarUrl);
      if (button.dataset.radarAction === 'download-monitor-transcript' && button.dataset.radarJobId) void downloadJob(button.dataset.radarJobId);
      if (button.dataset.radarAction === 'dismiss-monitor-card') {
        void confirmMonitorCardDismiss({
          videoId: button.dataset.radarDismissVideoId,
          targetContext: button.dataset.radarDismissTargetContext,
          targetLabel: button.dataset.radarDismissTargetLabel,
          trigger: button,
        });
      }
    });
  }

  function stopPolling() {
    if (state.pollingTimer) clearTimeoutImpl(state.pollingTimer);
    state.pollingTimer = null;
  }

  return {
    bindEvents,
    refreshHealth,
    refreshHistory,
    refreshMonitor,
    showBasura,
    submitCurrentJob,
    pollActiveJob,
    copyTranscript,
    copyMentions,
    showSummary,
    downloadJob,
    openMonitorLink,
    confirmJobAction,
    confirmMonitorCardDismiss,
    render: renderAll,
    stopPolling,
    activate,
  };
}

function normalizeDismissContext(value = '') {
  const normalized = (value || '').toString().trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (normalized === 'importantes') return 'important';
  return normalized;
}

function humanizeDismissContext(value = '') {
  const labels = {
    important: 'IMPORTANTES',
    ecuador: 'Ecuador',
    colombia: 'Colombia',
    argentina: 'Argentina',
    uruguay: 'Uruguay',
    paraguay: 'Paraguay',
    mexico: 'México',
  };
  return labels[normalizeDismissContext(value)] || 'este contexto';
}
