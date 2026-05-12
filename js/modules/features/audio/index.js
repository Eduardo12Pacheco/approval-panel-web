export function createAudioFeature({ api, store, ui, selectors, handlers }) {
  return {
    runAudioGeneration: handlers.runAudioGeneration,
    runAudioGenerationFromText: handlers.runAudioGenerationFromText,
    startAudioTracking: handlers.startAudioTracking,
    applyAudioJobStatus: handlers.applyAudioJobStatus,
    startAudioStatusStream: handlers.startAudioStatusStream,
    startAudioPolling: handlers.startAudioPolling,
    stopAudioTracking: handlers.stopAudioTracking,
    startAudioQueueSync: handlers.startAudioQueueSync,
    stopAudioQueueSync: handlers.stopAudioQueueSync,
    syncAudioQueueStatuses: handlers.syncAudioQueueStatuses,
    renderAudioQueue: handlers.renderAudioQueue,
    downloadAudioJob: handlers.downloadAudioJob,
    dismissAudioJob: handlers.dismissAudioJob,
    getLatestTrackedJobId: handlers.getLatestTrackedJobId,
    dependencies: {
      api,
      store,
      ui,
      selectors,
    },
  };
}
