import { mergeProjectVideoAsset } from '../domain/video-assets.js';

export const VIDEO_UPLOAD_ALLOWED_MIME_TYPES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-m4v',
]);
export const VIDEO_UPLOAD_MAX_SIZE_BYTES = 200 * 1024 * 1024;

export function validateVideoUploadFile(file) {
  if (!file) return { ok: false, reason: 'Seleccioná un video.' };
  if (!VIDEO_UPLOAD_ALLOWED_MIME_TYPES.has((file.type || '').toLowerCase())) {
    return { ok: false, reason: 'Solo videos MP4/WebM/MOV/M4V' };
  }
  if (Number(file.size || 0) <= 0 || Number(file.size || 0) > VIDEO_UPLOAD_MAX_SIZE_BYTES) {
    return { ok: false, reason: 'Archivo demasiado pesado (máx 200MB)' };
  }
  return { ok: true, reason: '' };
}

export function readVideoDuration(file) {
  if (!file || typeof URL === 'undefined' || typeof document === 'undefined') return Promise.resolve(0);
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
    };
    video.preload = 'metadata';
    video.addEventListener('loadedmetadata', () => {
      const duration = Number(video.duration || 0);
      cleanup();
      resolve(Number.isFinite(duration) ? duration : 0);
    }, { once: true });
    video.addEventListener('error', () => {
      cleanup();
      resolve(0);
    }, { once: true });
    video.src = url;
  });
}

export function createRowVideoCommands({ api, ui, getProject, resolveProjectKey, renderSelectedVideoProject, updateRow }) {
  async function uploadVideoToLibrary(rowId, file) {
    const project = getProject();
    if (!project || !rowId || !file) return null;
    const validation = validateVideoUploadFile(file);
    if (!validation.ok) {
      ui.toast(validation.reason);
      return null;
    }
    const draftId = resolveProjectKey(project);
    if (!draftId) {
      ui.toast('No se pudo identificar draft_id del proyecto');
      return null;
    }

    project._rowVideoUploading = rowId;
    renderSelectedVideoProject();
    try {
      const durationSeconds = await readVideoDuration(file);
      const upload = await api.uploadProjectVideoFile?.({ draftId, file, durationSeconds });
      const video = {
        id: upload?.assetId || upload?.public_url || upload?.storage_public_url || file.name,
        title: file.name || 'Video',
        src: upload?.public_url || upload?.storage_public_url || '',
        durationSeconds,
        duration_seconds: durationSeconds,
        storage_bucket: upload?.bucket || upload?.storage_bucket,
        storage_path: upload?.storage_path,
        file_size: Number(file.size || 0),
        mime_type: file.type || '',
      };
      const nextVideoAssets = mergeProjectVideoAsset(project, video);
      project.video_assets = nextVideoAssets;
      project.editor_state = {
        ...(project.editor_state || {}),
        video_assets: nextVideoAssets,
        updated_at: new Date().toISOString(),
      };
      await api.saveVideoProjectEditorState?.({ draftId, editorState: project.editor_state });
      ui.toast('Video subido a la biblioteca');
      return video;
    } catch (err) {
      console.error(err);
      ui.toast('Error subiendo video');
      return null;
    } finally {
      project._rowVideoUploading = null;
      renderSelectedVideoProject();
    }
  }

  async function assignVideoSegmentToRow(rowId, video, sourceInSeconds) {
    if (!rowId || !video) return;
    const project = getProject();
    const rows = Array.isArray(project?._editorRows) ? project._editorRows : [];
    const row = rows.find((item) => item?.id === rowId || item?.rowId === rowId);
    const durationSeconds = Math.max(0, Number(row?.effectiveEndTime ?? row?.endTime ?? 0) - Number(row?.startTime || 0));
    await updateRow(rowId, {
      media: {
        kind: 'video-segment',
        sourceVideoAssetId: video.id || video.assetId || video.src,
        sourceVideoSrc: video.src || video.public_url || video.storage_public_url || '',
        sourceInSeconds: Number(sourceInSeconds || 0),
        durationSeconds,
        overlayColor: '#3835AF',
        overlayOpacity: 0.3,
        effect1AssetId: 'effect-layer-01',
        effect2AssetId: 'effect-layer-02',
      },
    });
    ui.toast('Fila cambiada a video');
    return true;
  }

  return { uploadVideoToLibrary, assignVideoSegmentToRow };
}
