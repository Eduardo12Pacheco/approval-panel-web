import { createBackgroundMusicAudioFromTrack, findDefaultBackgroundMusicTrack } from './default-background-music.js';
import { isVoiceVideoAudioInput } from './voice-video-extraction.js';

const AUDIO_KINDS = new Set(['voice', 'background']);

function buildVoiceVideoExtractionSource(upload = {}, file) {
  return {
    publicUrl: upload.public_url || upload.publicUrl || upload.storage_public_url || '',
    name: upload.name || file?.name || 'camera.mp4',
    mimeType: upload.mime_type || upload.mimeType || file?.type || 'video/mp4',
    size: Number(upload.size ?? file?.size ?? 0),
    bucket: upload.bucket || upload.storage_bucket || '',
    storagePath: upload.storage_path || upload.storagePath || '',
  };
}

async function extractVoiceAudioFromStorageBackedVideo({ api, draftId, file }) {
  if (typeof api.uploadProjectVideoFile !== 'function') {
    throw new Error('No se pudo preparar el MP4 de voz para extraer audio');
  }
  const sourceUpload = await api.uploadProjectVideoFile({ draftId, file, durationSeconds: 0 });
  const source = buildVoiceVideoExtractionSource(sourceUpload, file);
  return api.extractVoiceAudioFromVideo({ source });
}

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
      const uploadFile = isVoiceVideoAudioInput(kind, file)
        ? await extractVoiceAudioFromStorageBackedVideo({ api, draftId, file })
        : file;
      const audio = await api.uploadAudioFile({ draftId, kind, file: uploadFile });
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
