import { buildRadarJobPayload } from './state.js';
import {
  formatMentionsCopy,
  formatTranscriptCopy,
  renderRadarHistory,
  renderRadarResults,
  renderRadarSummary,
  renderRadarStatus,
} from './render.js';

const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'cancelled']);

export function createRadarController({ state, el, api, ui = {}, browser = {} }) {
  const setTimeoutImpl = browser.setTimeout || setTimeout;
  const clearTimeoutImpl = browser.clearTimeout || clearTimeout;
  const clipboard = browser.clipboard || globalThis.navigator?.clipboard;
  const documentImpl = browser.document || globalThis.document;
  const urlImpl = browser.URL || globalThis.URL;
  const pollDelayMs = Number(browser.pollDelayMs || 8000);

  function toast(message) {
    ui.toast?.(message);
  }

  function renderAll() {
    renderRadarStatus({ el, state });
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

  function readPayloadFromForm() {
    return buildRadarJobPayload({
      url: el.radarUrlInput?.value,
      countries: [
        el.radarCountryColombia?.checked ? 'colombia' : '',
        el.radarCountryEcuador?.checked ? 'ecuador' : '',
        el.radarCountryArgentina?.checked ? 'argentina' : '',
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

  async function confirmJobAction(jobId, action) {
    if (el.radarConfirmTitle) el.radarConfirmTitle.textContent = action === 'cancel' ? 'Cancelar job' : 'Eliminar job';
    if (el.radarConfirmMessage) el.radarConfirmMessage.textContent = action === 'cancel'
      ? '¿Querés cancelar este job? El backend limpiará los artefactos propios en el próximo checkpoint seguro.'
      : '¿Querés eliminar este job y sus artefactos?';
    if (el.radarConfirmAcceptBtn) el.radarConfirmAcceptBtn.onclick = async () => {
      if (action === 'cancel') await api.cancelJob(jobId);
      else await api.deleteJob(jobId);
      el.radarConfirmDialog?.close?.();
      await refreshHistory();
    };
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
  }

  function stopPolling() {
    if (state.pollingTimer) clearTimeoutImpl(state.pollingTimer);
    state.pollingTimer = null;
  }

  return {
    bindEvents,
    refreshHealth,
    refreshHistory,
    submitCurrentJob,
    pollActiveJob,
    copyTranscript,
    copyMentions,
    showSummary,
    downloadJob,
    confirmJobAction,
    render: renderAll,
    stopPolling,
    activate,
  };
}
