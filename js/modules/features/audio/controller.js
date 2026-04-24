import {
  getAudioStatusClassRuntime,
  getAudioStatusLabelRuntime,
  isTerminalAudioStatus,
  normalizeAudioProgressPercent,
} from './runtime/index.js';

export function createAudioController({ state, el, api, ui, helpers, browser = globalThis }) {
  const toast = ui.toast;
  const escapeHtml = helpers.escapeHtml;
  const getErrorMessage = helpers.getErrorMessage;
  const resolveTtsGet = helpers.resolveTtsGet;
  const getBlob = helpers.getBlob;
  const fetchImpl = browser.fetchImpl || browser.fetch || globalThis.fetch;
  const URLImpl = browser.URL || globalThis.URL;
  const documentRef = browser.document || globalThis.document;
  const AbortControllerImpl = browser.AbortController || globalThis.AbortController;
  const TextDecoderImpl = browser.TextDecoder || globalThis.TextDecoder;
  const setIntervalImpl = browser.setInterval || globalThis.setInterval;
  const clearIntervalImpl = browser.clearInterval || globalThis.clearInterval;

  function ttsGet(path) {
    return resolveTtsGet()(path);
  }

  function ttsPost(path, payload) {
    return api.post(path, payload);
  }

  function ttsGetBlob(path) {
    return getBlob(path);
  }

  async function runAudioGeneration() {
    if (state.audioRunning) return;

    const ttsBaseUrl = (state.settings.ttsBaseUrl || '').trim();
    const ttsApiKey = (state.settings.ttsApiKey || '').trim();
    if (!ttsBaseUrl) {
      toast('Configurá Base URL Audio API antes de ejecutar');
      return;
    }
    if (!ttsApiKey) {
      toast('Configurá x-api-key Audio API antes de ejecutar');
      return;
    }

    const text = el.audioTextArea.value.trim();
    if (text.length < 20) {
      toast('El texto es demasiado corto para generar audio');
      return;
    }

    const preset = (el.audioPresetSelect.value || 'balanced_default').trim();
    const requestId = `ui-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    try {
      state.audioRunning = true;
      state.audioPollingErrorStreak = 0;
      el.audioRunBtn.disabled = true;

      const data = await ttsPost('/api/tts/jobs', {
        text,
        voice_profile: preset,
        request_id: requestId,
        title: 'manual-ui',
      });

      state.audioJobId = data.job_id;
      ensureAudioJob(data.job_id, {
        status: data.status || 'queued',
        progress: { stage: 'queued', percent: 0 },
        created_at: new Date().toISOString(),
      });
      renderAudioQueue();

      toast('Job enviado. Comienza el procesamiento...');
      startAudioTracking(data.job_id);
    } catch (err) {
      console.error(err);
      toast(getErrorMessage(err, 'Error enviando job de audio'));
    } finally {
      state.audioRunning = false;
      el.audioRunBtn.disabled = false;
    }
  }

  function startAudioTracking(jobId) {
    const streamStarted = startAudioStatusStream(jobId);
    if (!streamStarted) {
      startAudioPolling(jobId);
    }
  }

  function applyAudioJobStatus(jobId, data, options = {}) {
    const { stopTrackingOnTerminal = false } = options;
    const status = (data?.status || 'queued').toString().toLowerCase();
    const stage = data?.progress?.stage || status || 'queued';
    const progressPercent = normalizeAudioProgressPercent(status, data?.progress?.percent, stage);
    const isTerminal = isTerminalAudioStatus(status);
    const previousStatus = (state.audioJobs[jobId]?.status || '').toLowerCase();
    const becameTerminalNow = isTerminal && previousStatus !== status;

    ensureAudioJob(jobId, {
      ...data,
      status,
      progress: {
        ...(data?.progress || {}),
        stage,
        percent: progressPercent,
      },
    });
    renderAudioQueue();

    if (status === 'done') {
      if (stopTrackingOnTerminal && jobId === state.audioJobId) {
        stopAudioTracking();
      }
      if (becameTerminalNow) {
        toast('Audio listo para descarga');
      }
      return { terminal: true, status };
    }

    if (status === 'error' || status === 'cancelled') {
      if (stopTrackingOnTerminal && jobId === state.audioJobId) {
        stopAudioTracking();
      }
      if (becameTerminalNow) {
        const msg = data?.error?.message || `El job terminó en estado ${status}`;
        toast(msg);
      }
      return { terminal: true, status };
    }

    return { terminal: false, status };
  }

  function ensureAudioJob(jobId, payload = {}) {
    const previous = state.audioJobs[jobId] || { job_id: jobId, status: 'queued', progress: { stage: 'queued', percent: 0 } };
    const next = {
      ...previous,
      ...payload,
      job_id: jobId,
    };
    if (!next.progress) {
      next.progress = { stage: next.status || 'queued', percent: 0 };
    }
    if (typeof next.progress.percent !== 'number') {
      next.progress.percent = normalizeAudioProgressPercent(next.status, next.progress.percent, next.progress.stage);
    }
    state.audioJobs[jobId] = next;
    if (!state.audioJobOrder.includes(jobId)) {
      state.audioJobOrder.unshift(jobId);
    }
    state.dismissedAudioJobs.delete(jobId);
  }

  function getLatestTrackedJobId() {
    for (const jobId of state.audioJobOrder) {
      if (state.dismissedAudioJobs.has(jobId)) continue;
      const status = (state.audioJobs[jobId]?.status || '').toLowerCase();
      if (!isTerminalAudioStatus(status)) return jobId;
    }
    return state.audioJobOrder.find((jobId) => !state.dismissedAudioJobs.has(jobId)) || null;
  }

  function dismissAudioJob(jobId) {
    state.dismissedAudioJobs.add(jobId);
    if (jobId === state.audioJobId) {
      stopAudioTracking();
      const nextTrack = getLatestTrackedJobId();
      if (nextTrack) {
        startAudioTracking(nextTrack);
      }
    }
    renderAudioQueue();
  }

  function renderAudioQueue() {
    if (!el.audioQueueList || !el.audioQueueMeta) return;

    const visibleJobs = state.audioJobOrder
      .filter((jobId) => !state.dismissedAudioJobs.has(jobId))
      .map((jobId) => state.audioJobs[jobId])
      .filter(Boolean);

    if (!visibleJobs.length) {
      el.audioQueueMeta.textContent = '';
      el.audioQueueList.innerHTML = '<p class="audio-queue-empty">Sin jobs todavía.</p>';
      return;
    }

    const queuedCount = visibleJobs.filter((j) => (j.status || '').toLowerCase() === 'queued').length;
    const runningCount = visibleJobs.filter((j) => {
      const status = (j.status || '').toLowerCase();
      return status !== 'queued' && !isTerminalAudioStatus(status);
    }).length;
    const doneCount = visibleJobs.filter((j) => (j.status || '').toLowerCase() === 'done').length;
    el.audioQueueMeta.textContent = `${visibleJobs.length} jobs`;

    el.audioQueueList.innerHTML = visibleJobs.map((job) => {
      const status = (job.status || 'queued').toLowerCase();
      const percent = normalizeAudioProgressPercent(status, job?.progress?.percent, job?.progress?.stage);
      const statusLabel = getAudioStatusLabelRuntime(status);
      const statusClass = getAudioStatusClassRuntime(status);
      const progressClass = status === 'done'
        ? 'audio-progress-fill--done'
        : (status === 'error' || status === 'cancelled')
          ? 'audio-progress-fill--error'
          : 'audio-progress-fill--processing';
      const canDownload = status === 'done';

      return `
        <article class="audio-queue-card" data-job-id="${job.job_id}">
          <header class="audio-queue-card-header">
            <div>
              <p class="audio-queue-card-title">${escapeHtml(job.job_id)}</p>
            </div>
            <button class="audio-card-close" data-action="dismiss-audio-job" data-job-id="${job.job_id}" title="Ocultar job" aria-label="Ocultar job">
              <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                <path d="M18 6 6 18M6 6l12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
              </svg>
            </button>
          </header>

          <span class="audio-status-pill ${statusClass}">${statusLabel}</span>

          <p class="audio-progress-meta">Progreso ${percent}%</p>
          <div class="audio-progress-track">
            <div class="audio-progress-fill ${progressClass}" style="width:${percent}%"></div>
          </div>

          <div class="audio-queue-actions">
            ${canDownload
              ? `<button class="approve" data-action="download-audio-job" data-job-id="${job.job_id}">Descargar audio</button>`
              : ''}
          </div>
        </article>
      `;
    }).join('');
  }

  function startAudioStatusStream(jobId) {
    if (typeof AbortControllerImpl === 'undefined') return false;

    stopAudioTracking();
    state.audioJobId = jobId;
    state.audioPollingErrorStreak = 0;

    const trackingToken = `${jobId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    state.audioPollingToken = trackingToken;

    const controller = new AbortControllerImpl();
    state.audioStreamController = controller;

    const baseUrl = (state.settings.ttsBaseUrl || '').trim();
    if (!baseUrl) {
      state.audioStreamController = null;
      return false;
    }

    let headers;
    try {
      headers = ttsApi.buildTtsHeaders();
    } catch {
      state.audioStreamController = null;
      return false;
    }

    const url = `${baseUrl}/api/tts/jobs/${encodeURIComponent(jobId)}/events`;

    (async () => {
      let shouldFallbackToPolling = false;
      try {
        const res = await fetchImpl(url, {
          method: 'GET',
          headers,
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          shouldFallbackToPolling = true;
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoderImpl('utf-8');
        let buffer = '';

        while (state.audioPollingToken === trackingToken) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split(/\r?\n\r?\n/);
          buffer = chunks.pop() || '';

          for (const chunk of chunks) {
            const parsed = parseSseEventChunk(chunk);
            if (!parsed) continue;

            if (parsed.event === 'status') {
              try {
                const payload = JSON.parse(parsed.data || '{}');
                const result = applyAudioJobStatus(jobId, payload, { stopTrackingOnTerminal: true });
                if (!result.terminal) {
                  state.audioPollingErrorStreak = 0;
                }
              } catch {
                // ignorar evento mal formado
              }
            } else if (parsed.event === 'error') {
              try {
                const payload = JSON.parse(parsed.data || '{}');
                const msg = payload?.message || 'Error en stream de estado';
                toast(msg);
              } catch {
                toast('Error en stream de estado');
              }
              shouldFallbackToPolling = true;
            }
          }
        }

        const currentTracked = state.audioJobs[jobId];
        if (!isTerminalAudioStatus(currentTracked?.status) && state.audioPollingToken === trackingToken) {
          shouldFallbackToPolling = true;
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          console.error(err);
          const currentTracked = state.audioJobs[jobId];
          if (!isTerminalAudioStatus(currentTracked?.status) && state.audioPollingToken === trackingToken) {
            shouldFallbackToPolling = true;
          }
        }
      } finally {
        if (state.audioStreamController === controller) {
          state.audioStreamController = null;
        }

        const currentTracked = state.audioJobs[jobId];
        if (shouldFallbackToPolling && !isTerminalAudioStatus(currentTracked?.status) && state.audioPollingToken === trackingToken) {
          startAudioPolling(jobId);
        }
      }
    })();

    return true;
  }

  function parseSseEventChunk(chunk) {
    const lines = (chunk || '').split(/\r?\n/);
    let event = 'message';
    const dataParts = [];

    for (const line of lines) {
      if (!line || line.startsWith(':')) continue;
      if (line.startsWith('event:')) {
        event = line.slice('event:'.length).trim() || 'message';
        continue;
      }
      if (line.startsWith('data:')) {
        dataParts.push(line.slice('data:'.length).trim());
      }
    }

    if (!dataParts.length && event === 'message') return null;
    return { event, data: dataParts.join('\n') };
  }

  function startAudioPolling(jobId) {
    stopAudioPolling();
    state.audioJobId = jobId;
    state.audioPollingErrorStreak = 0;
    state.audioPollingInFlight = false;

    const pollingToken = `${jobId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    state.audioPollingToken = pollingToken;

    const tick = async () => {
      if (state.audioPollingToken !== pollingToken) return;
      if (state.audioPollingInFlight) return;
      state.audioPollingInFlight = true;

      try {
        const data = await ttsGet(`/api/tts/jobs/${encodeURIComponent(jobId)}`);
        if (state.audioPollingToken !== pollingToken) return;

        const result = applyAudioJobStatus(jobId, data, { stopTrackingOnTerminal: true });
        state.audioPollingErrorStreak = 0;

        if (result.terminal) {
          return;
        }
      } catch (err) {
        if (state.audioPollingToken !== pollingToken) return;

        console.error(err);
        state.audioPollingErrorStreak += 1;

        if (state.audioPollingErrorStreak >= 3) {
          stopAudioPolling();
          toast(getErrorMessage(err, 'No se pudo consultar estado del job (3 intentos fallidos)'));
        }
      } finally {
        state.audioPollingInFlight = false;
      }
    };

    void tick();
    state.audioPollingTimer = setIntervalImpl(() => {
      void tick();
    }, 4000);
  }

  function stopAudioPolling() {
    state.audioPollingInFlight = false;
    if (state.audioPollingTimer) {
      clearIntervalImpl(state.audioPollingTimer);
      state.audioPollingTimer = null;
    }
  }

  function stopAudioStatusStream() {
    if (state.audioStreamController) {
      state.audioStreamController.abort();
      state.audioStreamController = null;
    }
  }

  function stopAudioTracking() {
    state.audioPollingToken = null;
    state.audioJobId = null;
    stopAudioPolling();
    stopAudioStatusStream();
  }

  function startAudioQueueSync() {
    if (state.audioQueueSyncTimer) return;

    const tick = async () => {
      if (state.audioQueueSyncInFlight) return;
      state.audioQueueSyncInFlight = true;
      try {
        await syncAudioQueueStatuses();
      } catch (err) {
        console.error(err);
      } finally {
        state.audioQueueSyncInFlight = false;
      }
    };

    void tick();
    state.audioQueueSyncTimer = setIntervalImpl(() => {
      void tick();
    }, 6000);
  }

  function stopAudioQueueSync() {
    if (state.audioQueueSyncTimer) {
      clearIntervalImpl(state.audioQueueSyncTimer);
      state.audioQueueSyncTimer = null;
    }
    state.audioQueueSyncInFlight = false;
  }

  async function syncAudioQueueStatuses() {
    const targetJobIds = state.audioJobOrder.filter((jobId) => !state.dismissedAudioJobs.has(jobId));
    if (!targetJobIds.length) return;

    const checks = await Promise.all(targetJobIds.map(async (jobId) => {
      try {
        const data = await ttsGet(`/api/tts/jobs/${encodeURIComponent(jobId)}`);
        return { jobId, data, ok: true };
      } catch (err) {
        return { jobId, err, ok: false };
      }
    }));

    let hasChanges = false;
    for (const row of checks) {
      if (!row.ok) continue;
      const before = state.audioJobs[row.jobId];
      const beforeJson = before ? JSON.stringify(before) : '';
      applyAudioJobStatus(row.jobId, row.data);
      const after = state.audioJobs[row.jobId];
      const afterJson = after ? JSON.stringify(after) : '';
      if (beforeJson !== afterJson) {
        hasChanges = true;
      }
    }

    if (!hasChanges) {
      renderAudioQueue();
    }
  }

  async function downloadAudioJob(jobId = null) {
    const targetJobId = (jobId || state.audioJobId || '').trim();
    if (!targetJobId) {
      toast('No hay job para descargar');
      return;
    }

    const knownJob = state.audioJobs[targetJobId];
    const knownStatus = (knownJob?.status || '').toLowerCase();
    if (knownStatus && knownStatus !== 'done') {
      toast('Ese job todavía no está listo para descarga');
      return;
    }

    try {
      const blob = await ttsGetBlob(`/api/tts/jobs/${encodeURIComponent(targetJobId)}/download`);
      const url = URLImpl.createObjectURL(blob);
      const link = documentRef.createElement('a');
      link.href = url;
      link.download = `${targetJobId}.wav`;
      documentRef.body.appendChild(link);
      link.click();
      link.remove();
      URLImpl.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      toast(getErrorMessage(err, 'Error descargando audio'));
    }
  }


  return {
    runAudioGeneration,
    startAudioTracking,
    applyAudioJobStatus,
    startAudioStatusStream,
    startAudioPolling,
    stopAudioTracking,
    startAudioQueueSync,
    stopAudioQueueSync,
    syncAudioQueueStatuses,
    renderAudioQueue,
    downloadAudioJob,
    dismissAudioJob,
    getLatestTrackedJobId,
  };
}
