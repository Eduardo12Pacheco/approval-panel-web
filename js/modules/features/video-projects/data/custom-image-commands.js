import {
  CUSTOM_IMAGE_MAX_SIZE_BYTES,
  detectImageDimensions,
  normalizeCustomImageMimeType,
} from '../domain/image-files.js';

export function createCustomImageCommands({ api, ui, getProject, resolveProjectKey, renderSelectedVideoProject }) {
  async function uploadCustomImages(files) {
    const project = getProject();
    if (!project) return;

    const draftId = resolveProjectKey(project);
    if (!draftId) {
      ui.toast('No se pudo identificar draft_id del proyecto');
      return;
    }

    const inputFiles = Array.from(files || []);
    if (!inputFiles.length) return;

    const acceptedFiles = [];
    for (const file of inputFiles) {
      if (!normalizeCustomImageMimeType(file)) continue;
      if (Number(file?.size || 0) <= 0 || Number(file?.size || 0) > CUSTOM_IMAGE_MAX_SIZE_BYTES) continue;
      acceptedFiles.push(file);
    }

    if (!acceptedFiles.length) {
      project._customImageUploadError = 'Solo JPG/PNG/WebP/JFIF de hasta 15MB.';
      ui.toast('Formato inválido o archivo demasiado pesado');
      renderSelectedVideoProject();
      return;
    }

    project._customImagesUploading = true;
    project._customImageUploadError = '';
    renderSelectedVideoProject();

    try {
      const candidates = [];
      for (const file of acceptedFiles) {
        const dimensions = await detectImageDimensions(file);
        const upload = await api.uploadCustomImageFile({ draftId, file });
        const mimeType = normalizeCustomImageMimeType(file);
        candidates.push({
          provider: 'user-upload',
          source: 'user-upload',
          draft_id: draftId,
          project_storage_key: upload.project_storage_key,
          storage_bucket: upload.storage_bucket,
          storage_path: upload.storage_path,
          storage_public_url: upload.storage_public_url,
          mime_type: mimeType,
          image_width: dimensions.width,
          image_height: dimensions.height,
          file_size: Number(file.size || 0),
          file_name: file.name || '',
          title: file.name || '',
        });
      }

      const result = await api.addVideoProjectCustomImages({
        draftId,
        customCandidates: candidates,
      });

      project.image_candidates = Array.isArray(result?.image_candidates)
        ? result.image_candidates
        : (project.image_candidates || []);
      project.selected_images = Array.isArray(result?.selected_images)
        ? result.selected_images
        : (project.selected_images || []);
      project.selected_count = Number(project.selected_images.length || 0);

      ui.toast(`Imágenes custom subidas (${Number(result?.added_count || candidates.length)})`);
    } catch (err) {
      console.error(err);
      project._customImageUploadError = err?.message || 'No se pudieron subir las imágenes custom';
      ui.toast('Error subiendo imágenes custom');
    } finally {
      project._customImagesUploading = false;
      renderSelectedVideoProject();
    }
  }

  return {
    uploadCustomImages,
  };
}
