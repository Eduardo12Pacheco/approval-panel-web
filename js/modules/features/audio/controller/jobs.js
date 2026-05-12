export function createAudioJobs({ context, callbacks }) {
  const { state, toast, getFriendlyAudioErrorMessage, normalizeAudioProgressPercent, isTerminalAudioStatus } = context;

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
    callbacks.renderAudioQueue();

    if (status === 'done') {
      if (stopTrackingOnTerminal && jobId === state.audioJobId) {
        callbacks.stopAudioTracking();
      }
      if (becameTerminalNow) {
        toast('Audio listo para descarga');
      }
      return { terminal: true, status };
    }

    if (status === 'error' || status === 'cancelled') {
      if (stopTrackingOnTerminal && jobId === state.audioJobId) {
        callbacks.stopAudioTracking();
      }
      if (becameTerminalNow) {
        const msg = getFriendlyAudioErrorMessage(data?.error?.message, `El job terminó en estado ${status}`);
        toast(msg);
      }
      return { terminal: true, status };
    }

    return { terminal: false, status };
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
      callbacks.stopAudioTracking();
      const nextTrack = getLatestTrackedJobId();
      if (nextTrack) {
        callbacks.startAudioTracking(nextTrack);
      }
    }
    callbacks.renderAudioQueue();
  }

  return { ensureAudioJob, applyAudioJobStatus, getLatestTrackedJobId, dismissAudioJob };
}
