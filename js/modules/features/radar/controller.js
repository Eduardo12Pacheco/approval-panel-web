import { buildRadarJobPayload } from './state.js';
import {
  formatMentionsCopy,
  formatTranscriptCopy,
  renderRadarHistory,
  renderRadarResults,
  renderRadarStatus,
} from './render.js';

const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'cancelled']);

export function createRadarController({ state, el, api, ui = {}, browser = {} }) {
  const setTimeoutImpl = browser.setTimeout || setTimeout;
  const clearTimeoutImpl = browser.clearTimeout || clearTimeout;
  const clipboard = browser.clipboard || globalThis.navigator?.clipboard;
  const pollDelayMs = Number(browser.pollDelayMs || 2000);

  function toast(message) {
    ui.toast?.(message);
  }

  function renderAll() {
    renderRadarStatus({ el, state });
    renderRadarResults({ el, transcript: state.transcript, mentions: state.mentions });
    renderRadarHistory({ el, history: state.history });
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
      targetType: el.radarTargetTypeSelect?.value,
      targetName: el.radarTargetNameInput?.value,
      targetAliases: el.radarTargetAliasesInput?.value,
      extraKeywords: el.radarExtraKeywordsInput?.value,
    });
  }

  async function submitCurrentJob() {
    try {
      const payload = readPayloadFromForm();
      state.status = 'submitting';
      state.transcript = null;
      state.mentions = null;
      renderAll();
      const created = await api.createJob(payload);
      state.activeJobId = created.job_id;
      state.currentJob = created;
      renderAll();
      await pollActiveJob();
    } catch (error) {
      state.status = 'error';
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
        state.transcript = await api.getTranscript(state.activeJobId);
        state.mentions = await api.getMentions(state.activeJobId);
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

  async function copyMentions() {
    const text = formatMentionsCopy(state.mentions || {});
    if (!text) return;
    await clipboard?.writeText?.(text);
    toast('Menciones copiadas');
  }

  function bindEvents() {
    el.radarSubmitBtn?.addEventListener('click', () => { void submitCurrentJob(); });
    el.radarCopyTranscriptBtn?.addEventListener('click', () => { void copyTranscript(); });
    el.radarCopyMentionsBtn?.addEventListener('click', () => { void copyMentions(); });
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
    render: renderAll,
    stopPolling,
  };
}
