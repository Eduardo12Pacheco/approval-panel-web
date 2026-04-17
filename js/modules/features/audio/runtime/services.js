export function createAudioRuntimeServices({ hooks }) {
  return {
    runAudioGeneration: hooks.runAudioGeneration,
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
  };
}
