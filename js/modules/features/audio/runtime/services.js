export function isTerminalAudioStatus(status) {
  const value = (status || '').toLowerCase();
  return value === 'done' || value === 'error' || value === 'cancelled';
}

export function normalizeAudioProgressPercent(status, rawPercent, stage) {
  if (typeof rawPercent === 'number' && Number.isFinite(rawPercent)) {
    return Math.max(0, Math.min(100, Math.round(rawPercent)));
  }

  const normalizedStatus = (status || '').toLowerCase();
  if (normalizedStatus === 'done') return 100;
  if (normalizedStatus === 'error' || normalizedStatus === 'cancelled') return 0;
  if (normalizedStatus === 'queued') return 0;

  const normalizedStage = (stage || '').toLowerCase();
  if (normalizedStage.includes('loading')) return 10;
  if (normalizedStage.includes('reference')) return 20;
  if (normalizedStage.includes('synthesizing')) return 55;
  return 30;
}

export function getAudioStatusLabelRuntime(status) {
  const value = (status || '').toLowerCase();
  if (value === 'done') return 'Completado';
  if (value === 'error' || value === 'cancelled') return 'Falló';
  if (value === 'queued') return 'En cola';
  return 'Procesando';
}

export function getAudioStatusClassRuntime(status) {
  const value = (status || '').toLowerCase();
  if (value === 'done') return 'audio-status-pill--done';
  if (value === 'error' || value === 'cancelled') return 'audio-status-pill--error';
  return 'audio-status-pill--processing';
}

export function createAudioRuntimeServices({ hooks }) {
  return {
    runAudioGeneration: hooks.runAudioGeneration,
    runAudioGenerationFromText: hooks.runAudioGenerationFromText,
    startAudioTracking: hooks.startAudioTracking,
    applyAudioJobStatus: hooks.applyAudioJobStatus,
    startAudioStatusStream: hooks.startAudioStatusStream,
    startAudioPolling: hooks.startAudioPolling,
    stopAudioTracking: hooks.stopAudioTracking,
    startAudioQueueSync: hooks.startAudioQueueSync,
    stopAudioQueueSync: hooks.stopAudioQueueSync,
    syncAudioQueueStatuses: hooks.syncAudioQueueStatuses,
    renderAudioQueue: hooks.renderAudioQueue,
    downloadAudioJob: hooks.downloadAudioJob,
    dismissAudioJob: hooks.dismissAudioJob,
    normalizeAudioProgressPercent,
    isTerminalAudioStatus,
    getAudioStatusLabelRuntime,
    getAudioStatusClassRuntime,
  };
}
