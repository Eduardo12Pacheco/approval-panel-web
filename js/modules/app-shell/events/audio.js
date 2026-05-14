export function bindAudioEvents({ el, audioFeature, updateWordCounter }) {
  if (el.audioTextArea) {
    el.audioTextArea.addEventListener('input', () => {
      updateWordCounter(el.audioTextArea.value, el.audioWordCount);
    });
  }

  if (el.audioClearBtn) {
    el.audioClearBtn.addEventListener('click', () => {
      el.audioTextArea.value = '';
      updateWordCounter('', el.audioWordCount);
    });
  }

  if (el.audioRunBtn) {
    el.audioRunBtn.addEventListener('click', audioFeature.runAudioGeneration);
  }

  el.audioQueueList?.addEventListener('click', async (ev) => {
    const button = ev.target.closest('button[data-action]');
    if (!button) return;

    const action = button.dataset.action;
    const jobId = (button.dataset.jobId || '').trim();
    if (!jobId) return;

    if (action === 'dismiss-audio-job') {
      audioFeature.dismissAudioJob(jobId);
      return;
    }

    if (action === 'download-audio-job') {
      await audioFeature.downloadAudioJob(jobId);
    }
  });
}
