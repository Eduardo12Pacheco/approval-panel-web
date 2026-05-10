import {
  CUSTOM_IMAGE_ALLOWED_MIME_TYPES,
  CUSTOM_IMAGE_MAX_SIZE_BYTES,
  detectImageDimensions,
} from '../domain/image-files.js';

export function createRowImageCommands({ api, ui, getProject, resolveProjectKey, renderSelectedVideoProject, updateRow }) {
  async function assignExistingImageToRow(rowId, imageUrl) {
    const cleanUrl = (imageUrl || '').toString().trim();
    if (!rowId || !cleanUrl) return;
    await updateRow(rowId, { selectedAssetId: cleanUrl });
    ui.toast('Imagen asignada a la fila');
  }

  async function uploadAndAssignImage(rowId, file) {
    const project = getProject();
    if (!project || !rowId || !file) return;

    const draftId = resolveProjectKey(project);
    if (!draftId) {
      ui.toast('No se pudo identificar draft_id del proyecto');
      return;
    }

    if (!CUSTOM_IMAGE_ALLOWED_MIME_TYPES.has((file?.type || '').toLowerCase())) {
      ui.toast('Solo JPG/PNG/WebP');
      return;
    }
    if (Number(file?.size || 0) <= 0 || Number(file?.size || 0) > CUSTOM_IMAGE_MAX_SIZE_BYTES) {
      ui.toast('Archivo demasiado pesado (máx 15MB)');
      return;
    }

    project._rowImageUploading = rowId;
    renderSelectedVideoProject();

    try {
      const dimensions = await detectImageDimensions(file);
      const upload = await api.uploadCustomImageFile({ draftId, file });
      const candidate = {
        provider: 'user-upload',
        source: 'user-upload',
        draft_id: draftId,
        project_storage_key: upload.project_storage_key,
        storage_bucket: upload.storage_bucket,
        storage_path: upload.storage_path,
        storage_public_url: upload.storage_public_url,
        mime_type: file.type,
        image_width: dimensions.width,
        image_height: dimensions.height,
        file_size: Number(file.size || 0),
        file_name: file.name || '',
        title: file.name || '',
      };

      const result = await api.addVideoProjectCustomImages({
        draftId,
        customCandidates: [candidate],
      });

      project.image_candidates = Array.isArray(result?.image_candidates)
        ? result.image_candidates
        : (project.image_candidates || []);
      project.selected_images = Array.isArray(result?.selected_images)
        ? result.selected_images
        : (project.selected_images || []);
      project.selected_count = Number(project.selected_images.length || 0);

      // Auto-assign the newly uploaded image to the row by its public URL
      const newPublicUrl = upload.storage_public_url || '';
      updateRow(rowId, { selectedAssetId: newPublicUrl });
      ui.toast('Imagen asignada a la fila');
    } catch (err) {
      console.error(err);
      ui.toast('Error subiendo imagen para la fila');
    } finally {
      project._rowImageUploading = null;
      renderSelectedVideoProject();
    }
  }

  return {
    assignExistingImageToRow,
    uploadAndAssignImage,
  };
}
