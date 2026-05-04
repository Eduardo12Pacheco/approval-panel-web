export function normalizeVideoProjectRows(payload = {}) {
  const candidates = [payload?.projects, payload?.items, payload?.rows, payload?.data];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

export function resolveVideoProjectKey(row = {}) {
  return (row.project_id || row.draft_id || row.id_noticia || row.cluster_id || '').toString();
}

export function resolveVideoProjectTitle(row = {}, fallback = 'Proyecto sin título') {
  return [row.title, row.tema_principal, row.jugador, row.draft_id]
    .map((part) => (part || '').toString().trim())
    .find(Boolean) || fallback;
}

const SAVE_DEBOUNCE_MS = 400;
const AUDIO_KINDS = new Set(['voice', 'background']);
const CUSTOM_IMAGE_MAX_SIZE_BYTES = 15 * 1024 * 1024;
const CUSTOM_IMAGE_ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function setVideoProjectStep(project, step) {
  if (!project) return;
  project._videoProjectStep = step === 'audio' ? 'audio' : 'images';
}

export function createVideoProjectsFeature({ api, store, ui, callbacks }) {
  const {
    renderVideoProjects = () => {},
    renderSelectedVideoProject = () => {},
  } = callbacks || {};

  let saveTimer = null;

  function detectImageDimensions(file) {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();

      img.onload = () => {
        const width = Number(img.naturalWidth || 0);
        const height = Number(img.naturalHeight || 0);
        URL.revokeObjectURL(objectUrl);
        if (!width || !height) {
          reject(new Error(`No pudimos leer dimensiones de ${file.name || 'imagen'}`));
          return;
        }
        resolve({ width, height });
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error(`Archivo inválido o corrupto: ${file.name || 'imagen'}`));
      };

      img.src = objectUrl;
    });
  }

  async function refreshVideoProjects({ silent = false } = {}) {
    const state = store.getState();
    try {
      state.videoProjectsLoading = true;
      renderVideoProjects();
      const data = await api.listVideoProjects({ limit: 50 });
      state.videoProjects = normalizeVideoProjectRows(data);

      if (state.selectedVideoProject) {
        const selectedKey = resolveVideoProjectKey(state.selectedVideoProject);
        const refreshed = state.videoProjects.find((item) => resolveVideoProjectKey(item) === selectedKey);
        state.selectedVideoProject = refreshed
          ? { ...state.selectedVideoProject, ...refreshed }
          : null;
      }

      renderVideoProjects();
      renderSelectedVideoProject();
    } catch (err) {
      console.error(err);
      if (!silent) ui.toast('Error cargando proyectos de edición');
    } finally {
      state.videoProjectsLoading = false;
      renderVideoProjects();
    }
  }

  async function openVideoProject(projectId) {
    const state = store.getState();
    const id = (projectId || '').toString();
    if (!id) return;

    const listRow = state.videoProjects.find((item) => resolveVideoProjectKey(item) === id);
    state.selectedVideoProject = listRow || { draft_id: id, project_id: id };
    state.videoProjectDetailLoading = true;
    renderVideoProjects();
    renderSelectedVideoProject();

    try {
      const data = await api.getVideoProject(id);
      const [detail] = normalizeVideoProjectRows(data);
      if (!detail) {
        ui.toast('Ese proyecto todavía no existe o fue deshabilitado');
        state.selectedVideoProject = listRow || null;
        return;
      }
      state.selectedVideoProject = detail;
      setVideoProjectStep(state.selectedVideoProject, 'images');
      renderVideoProjects();
      renderSelectedVideoProject();
    } catch (err) {
      console.error(err);
      ui.toast('Error abriendo proyecto de edición');
    } finally {
      state.videoProjectDetailLoading = false;
      renderSelectedVideoProject();
    }
  }

  function toggleImageSelection(candidateImageUrl) {
    const state = store.getState();
    const project = state.selectedVideoProject;
    if (!project) return;

    const id = (candidateImageUrl || '').toString().trim();
    if (!id) return;

    const draftId = resolveVideoProjectKey(project);
    const selected = Array.isArray(project.selected_images) ? [...project.selected_images] : [];

    const idx = selected.indexOf(id);
    if (idx >= 0) {
      selected.splice(idx, 1);
    } else {
      selected.push(id);
    }

    project.selected_images = selected;
    project.selected_count = selected.length;

    renderSelectedVideoProject();

    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      void (async () => {
        try {
          await api.saveVideoProjectSelections({ draftId, selectedImageIds: selected });
        } catch (err) {
          console.error(err);
        }
      })();
    }, SAVE_DEBOUNCE_MS);
  }

  function goToAudioStep() {
    const project = store.getState().selectedVideoProject;
    if (!project) return;
    setVideoProjectStep(project, 'audio');
    renderSelectedVideoProject();
  }

  function goToImagesStep() {
    const project = store.getState().selectedVideoProject;
    if (!project) return;
    setVideoProjectStep(project, 'images');
    renderSelectedVideoProject();
  }

  async function uploadProjectAudio(kind, file) {
    const state = store.getState();
    const project = state.selectedVideoProject;
    if (!project || !AUDIO_KINDS.has(kind)) return;

    const draftId = resolveVideoProjectKey(project);
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

  async function uploadCustomImages(files) {
    const state = store.getState();
    const project = state.selectedVideoProject;
    if (!project) return;

    const draftId = resolveVideoProjectKey(project);
    if (!draftId) {
      ui.toast('No se pudo identificar draft_id del proyecto');
      return;
    }

    const inputFiles = Array.from(files || []);
    if (!inputFiles.length) return;

    const acceptedFiles = [];
    for (const file of inputFiles) {
      if (!CUSTOM_IMAGE_ALLOWED_MIME_TYPES.has((file?.type || '').toLowerCase())) continue;
      if (Number(file?.size || 0) <= 0 || Number(file?.size || 0) > CUSTOM_IMAGE_MAX_SIZE_BYTES) continue;
      acceptedFiles.push(file);
    }

    if (!acceptedFiles.length) {
      project._customImageUploadError = 'Solo JPG/PNG/WebP de hasta 15MB.';
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
        candidates.push({
          provider: 'user-upload',
          source: 'user-upload',
          storage_bucket: upload.storage_bucket,
          storage_path: upload.storage_path,
          storage_public_url: upload.storage_public_url,
          mime_type: file.type,
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
    refreshVideoProjects,
    openVideoProject,
    toggleImageSelection,
    goToAudioStep,
    goToImagesStep,
    uploadProjectAudio,
    uploadCustomImages,
  };
}
