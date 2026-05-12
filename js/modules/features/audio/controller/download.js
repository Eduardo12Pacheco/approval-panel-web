export function createAudioDownload({ context }) {
  const { state, toast, getErrorMessage, ttsGetBlob, URLImpl, documentRef } = context;

  async function downloadAudioJob(jobId = null) {
    const targetJobId = (jobId || state.audioJobId || '').trim();
    if (!targetJobId) {
      toast('No hay job para descargar');
      return;
    }

    const knownJob = state.audioJobs[targetJobId];
    const knownStatus = (knownJob?.status || '').toLowerCase();
    if (knownStatus && knownStatus !== 'done') {
      toast('Ese job todavía no está listo para descarga');
      return;
    }

    try {
      const blob = await ttsGetBlob(`/api/tts/jobs/${encodeURIComponent(targetJobId)}/download`);
      const url = URLImpl.createObjectURL(blob);
      const link = documentRef.createElement('a');
      link.href = url;
      link.download = `${targetJobId}.wav`;
      documentRef.body.appendChild(link);
      link.click();
      link.remove();
      URLImpl.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      toast(getErrorMessage(err, 'Error descargando audio'));
    }
  }

  return { downloadAudioJob };
}
