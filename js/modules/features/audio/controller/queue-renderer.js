export function createAudioQueueRenderer({ context, callbacks }) {
  const { state, el, escapeHtml, ttsGet, setIntervalImpl, clearIntervalImpl, normalizeAudioProgressPercent, isTerminalAudioStatus, getAudioStatusLabelRuntime, getAudioStatusClassRuntime } = context;

  function renderAudioQueue() {
    if (!el.audioQueueList || !el.audioQueueMeta) return;

    const visibleJobs = state.audioJobOrder
      .filter((jobId) => !state.dismissedAudioJobs.has(jobId))
      .map((jobId) => state.audioJobs[jobId])
      .filter(Boolean);

    if (!visibleJobs.length) {
      el.audioQueueMeta.textContent = '';
      el.audioQueueList.classList.add('is-empty');
      el.audioQueueList.innerHTML = '<p class="audio-queue-empty">Sin jobs todavía.</p>';
      return;
    }

    el.audioQueueList.classList.remove('is-empty');
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
      const displayTitle = job.title || job.job_id;
      const secondaryId = job.title ? `<p class="meta">${escapeHtml(job.job_id)}</p>` : '';

      return `
        <article class="audio-queue-card" data-job-id="${job.job_id}">
          <header class="audio-queue-card-header">
            <div>
              <p class="audio-queue-card-title">${escapeHtml(displayTitle)}</p>
              ${secondaryId}
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

  function shouldPollQueueJob(jobId) {
    if (state.dismissedAudioJobs.has(jobId)) return false;
    const job = state.audioJobs[jobId];
    const status = (job?.status || '').toString().toLowerCase();
    if (isTerminalAudioStatus(status)) return false;
    if (state.audioJobId === jobId && (state.audioStreamController || state.audioPollingTimer)) return false;
    return true;
  }

  async function syncAudioQueueStatuses() {
    const targetJobIds = state.audioJobOrder.filter(shouldPollQueueJob);
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
      callbacks.applyAudioJobStatus(row.jobId, row.data);
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

  return { renderAudioQueue, syncAudioQueueStatuses, startAudioQueueSync, stopAudioQueueSync };
}
