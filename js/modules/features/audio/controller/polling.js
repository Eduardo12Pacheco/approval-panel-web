export function createAudioPolling({ context, callbacks }) {
  const { state, toast, getErrorMessage, ttsGet, setIntervalImpl, clearIntervalImpl } = context;

  function startAudioPolling(jobId) {
    callbacks.stopAudioPolling();
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

        const result = callbacks.applyAudioJobStatus(jobId, data, { stopTrackingOnTerminal: true });
        state.audioPollingErrorStreak = 0;

        if (result.terminal) {
          return;
        }
      } catch (err) {
        if (state.audioPollingToken !== pollingToken) return;

        console.error(err);
        state.audioPollingErrorStreak += 1;

        if (state.audioPollingErrorStreak >= 3) {
          callbacks.stopAudioPolling();
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

  return { startAudioPolling, stopAudioPolling };
}
