export function createAudioStatusStream({ context, callbacks }) {
  const { state, api, toast, fetchImpl, AbortControllerImpl, TextDecoderImpl, isTerminalAudioStatus } = context;

  function startAudioStatusStream(jobId) {
    if (typeof AbortControllerImpl === 'undefined') return false;

    callbacks.stopAudioTracking();
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
      headers = api.buildTtsHeaders();
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
                const result = callbacks.applyAudioJobStatus(jobId, payload, { stopTrackingOnTerminal: true });
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
          callbacks.startAudioPolling(jobId);
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

  function stopAudioStatusStream() {
    if (state.audioStreamController) {
      state.audioStreamController.abort();
      state.audioStreamController = null;
    }
  }

  return { startAudioStatusStream, stopAudioStatusStream, parseSseEventChunk };
}
