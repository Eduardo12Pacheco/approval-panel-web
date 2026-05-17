import { createBackgroundMusicAudioFromTrack, findDefaultBackgroundMusicTrack } from './default-background-music.js';

const AUDIO_KINDS = new Set(['voice', 'background']);

export function createAudioSetupCommands({ api, ui, getProject, resolveProjectKey, renderSelectedVideoProject }) {
  async function uploadProjectAudio(kind, file) {
    const project = getProject();
    if (!project || !AUDIO_KINDS.has(kind)) return;

    const draftId = resolveProjectKey(project);
    if (!draftId) return;

    const uploadKey = kind === 'background' ? '_backgroundAudioUploading' : '_voiceAudioUploading';
    project[uploadKey] = true;
    project._audioUploadError = '';
    renderSelectedVideoProject();

    try {
      const audio = await api.uploadAudioFile({ draftId, kind, file });
      if (kind === 'background') {
        project.background_audio = audio;
      } else {
        project.voice_audio = audio;
      }

      const result = await api.saveVideoProjectAudio({
        draftId,
        voiceAudio: project.voice_audio || {},
        backgroundAudio: project.background_audio || {},
      });

      project.voice_audio = result.voice_audio || project.voice_audio || {};
      project.background_audio = result.background_audio || project.background_audio || {};
      ui.toast(kind === 'background' ? 'Música de fondo subida' : 'Audio de voz subido');
    } catch (err) {
      console.error(err);
      project._audioUploadError = err?.message || 'No se pudo subir el audio';
      ui.toast('Error subiendo audio');
    } finally {
      project[uploadKey] = false;
      renderSelectedVideoProject();
    }
  }

  async function selectDefaultBackgroundMusic(trackId) {
    const project = getProject();
    if (!project) return;

    const draftId = resolveProjectKey(project);
    if (!draftId) return;

    const track = findDefaultBackgroundMusicTrack(trackId);
    if (!track) {
      ui.toast('Música por defecto no encontrada');
      return;
    }

    project._backgroundAudioUploading = true;
    project._audioUploadError = '';
    renderSelectedVideoProject();

    try {
      project.background_audio = createBackgroundMusicAudioFromTrack(track, { selectedAt: new Date().toISOString() });

      const result = await api.saveVideoProjectAudio({
        draftId,
        voiceAudio: project.voice_audio || {},
        backgroundAudio: project.background_audio || {},
      });

      project.voice_audio = result.voice_audio || project.voice_audio || {};
      project.background_audio = result.background_audio || project.background_audio || {};
      ui.toast(`Música seleccionada: ${track.label}`);
    } catch (err) {
      console.error(err);
      project._audioUploadError = err?.message || 'No se pudo seleccionar la música por defecto';
      ui.toast('Error seleccionando música');
    } finally {
      project._backgroundAudioUploading = false;
      renderSelectedVideoProject();
    }
  }

  return {
    uploadProjectAudio,
    selectDefaultBackgroundMusic,
  };
}
