import { resolveScriptIdentity } from './domain.js';
import { getScriptPublishStageMeta } from './publish-status.js';
import { fetchScriptPublishStatus } from './client.js';

export const SCRIPT_PUBLISH_POLL_INTERVAL_MS = 8000;

export function createScriptPublishPolling({ api, store, ui, callbacks }) {
  const {
    renderScriptCards = () => {},
    renderSelectedScriptEditor = () => {},
    refreshScriptDrafts = async () => {},
  } = callbacks || {};

  function clearPublishPolling() {
    const state = store.getState();
    if (state.scriptPublishPollingTimer) {
      clearInterval(state.scriptPublishPollingTimer);
      state.scriptPublishPollingTimer = null;
    }
    state.scriptPublishPollingInFlight = false;
  }

  function setScriptPublishJob(next = null) {
    const state = store.getState();
    if (!next) {
      state.scriptPublishJob = null;
      renderScriptCards();
      return;
    }

    const stageMeta = getScriptPublishStageMeta(next.stage, next.status);
    state.scriptPublishJob = {
      ...(state.scriptPublishJob || {}),
      ...next,
      stage: stageMeta.stage,
      percent: Number.isFinite(Number(next.percent)) ? Number(next.percent) : stageMeta.percent,
    };
    renderScriptCards();
  }

  async function syncPublishJobStatus(jobId) {
    const state = store.getState();
    if (!jobId || state.scriptPublishPollingInFlight) return;
    state.scriptPublishPollingInFlight = true;
    try {
      const row = await fetchScriptPublishStatus(api, jobId);
      const status = (row?.status || row?.job?.status || '').toString().toLowerCase() || 'queued';
      const stage = (row?.stage || row?.job?.stage || status).toString().toLowerCase();
      const error = row?.error || row?.job?.error || '';
      const message = row?.message || row?.job?.message || '';
      const result = row?.result || row?.job?.result || null;
      setScriptPublishJob({
        job_id: jobId,
        status,
        stage,
        message,
        error,
        result,
        updated_at: row?.updated_at || row?.job?.updated_at || new Date().toISOString(),
      });

      if (status === 'completed' || status === 'failed') {
        clearPublishPolling();
      }

      if (status === 'completed') {
        const selected = state.selectedScript || {};
        const ids = resolveScriptIdentity(selected);
        const resultRow = result && typeof result === 'object' ? result : {};
        state.selectedScript = {
          ...selected,
          ...ids,
          ...resultRow,
          estado_guion: 'publicado',
          doc_id: resultRow.doc_id || selected.doc_id || '',
          doc_url: resultRow.doc_url || selected.doc_url || '',
        };
        await refreshScriptDrafts({ silent: true });
        setScriptPublishJob(null);
        renderSelectedScriptEditor();
        ui.toast('Guion procesado correctamente');
      } else if (status === 'failed') {
        ui.toast(error || 'Falló el procesamiento del guion');
      }
    } catch (err) {
      console.error(err);
    } finally {
      state.scriptPublishPollingInFlight = false;
    }
  }

  function startPublishPolling(jobId) {
    const state = store.getState();
    clearPublishPolling();
    state.scriptPublishPollingTimer = setInterval(() => {
      void syncPublishJobStatus(jobId);
    }, SCRIPT_PUBLISH_POLL_INTERVAL_MS);
    void syncPublishJobStatus(jobId);
  }

  return {
    clearPublishPolling,
    setScriptPublishJob,
    syncPublishJobStatus,
    startPublishPolling,
  };
}
