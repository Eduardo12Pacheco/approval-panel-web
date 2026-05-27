import { resolveServiceConfig } from '../../../core/state/app-store.js';

export function createAudioCommands({ context, callbacks }) {
  const { state, el, toast, getErrorMessage, ttsPost } = context;

  async function runAudioGenerationFromText({ text, voiceProfile = null, title = 'manual-ui' } = {}) {
    if (state.audioRunning) return;

    const ttsConfig = resolveServiceConfig(state.settings, 'tts');
    const ttsBaseUrl = (ttsConfig.baseUrl || '').trim();
    if (!ttsBaseUrl) {
      toast('Configurá Base URL Audio API antes de ejecutar');
      return;
    }

    const normalizedText = (text || '').toString().trim();
    if (normalizedText.length < 20) {
      toast('El texto es demasiado corto para generar audio');
      return;
    }

    const preset = (voiceProfile || el.audioPresetSelect.value || 'balanced_default').trim();
    const requestId = `ui-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    try {
      state.audioRunning = true;
      state.audioPollingErrorStreak = 0;
      el.audioRunBtn.disabled = true;

      const data = await ttsPost('/api/tts/jobs', {
        text: normalizedText,
        voice_profile: preset,
        request_id: requestId,
        title,
      });

      if (!data?.job_id) {
        throw new Error('La API de audio no devolvió job_id');
      }

      state.audioJobId = data.job_id;
      callbacks.ensureAudioJob(data.job_id, {
        title,
        status: data.status || 'queued',
        progress: { stage: 'queued', percent: 0 },
        created_at: new Date().toISOString(),
      });
      callbacks.renderAudioQueue();

      toast('Job enviado. Comienza el procesamiento...');
      callbacks.startAudioTracking(data.job_id);
    } catch (err) {
      console.error(err);
      toast(getErrorMessage(err, 'Error enviando job de audio'));
    } finally {
      state.audioRunning = false;
      el.audioRunBtn.disabled = false;
    }
  }

  async function runAudioGeneration() {
    return runAudioGenerationFromText({
      text: el.audioTextArea.value,
      voiceProfile: el.audioPresetSelect.value,
      title: 'manual-ui',
    });
  }

  return { runAudioGeneration, runAudioGenerationFromText };
}
