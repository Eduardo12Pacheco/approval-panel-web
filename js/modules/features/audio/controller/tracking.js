export function createAudioTracking({ context, callbacks }) {
  const { state } = context;

  function startAudioTracking(jobId) {
    const streamStarted = callbacks.startAudioStatusStream(jobId);
    if (!streamStarted) {
      callbacks.startAudioPolling(jobId);
    }
  }

  function stopAudioTracking() {
    state.audioPollingToken = null;
    state.audioJobId = null;
    callbacks.stopAudioPolling();
    callbacks.stopAudioStatusStream();
  }

  return { startAudioTracking, stopAudioTracking };
}
