import { findDefaultBackgroundMusicTrack } from './default-background-music.js';

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
const AUDIO_CONTROL_KINDS = new Set(['voice', 'music', 'background']);
const CUSTOM_IMAGE_MAX_SIZE_BYTES = 15 * 1024 * 1024;
const CUSTOM_IMAGE_ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const DETAIL_CACHE_TTL_MS = 2 * 60 * 1000;
const DETAIL_CACHE_MAX_ENTRIES = 24;
const DETAIL_PREFETCH_VISIBLE_LIMIT = 6;
const DETAIL_PRELOAD_MAX_IMAGES = 32;

function normalizeEditorState(editorState = {}) {
  if (!editorState || typeof editorState !== 'object') return {};
  const globalAudio = normalizeGlobalAudioState(editorState.global_audio);
  return {
    phase: editorState.phase || 'idle',
    remotion_project_id: editorState.remotion_project_id || '',
    remotion_api_url: editorState.remotion_api_url || '',
    preview_url: editorState.preview_url || '',
    final_url: editorState.final_url || '',
    composition_hash: editorState.composition_hash || '',
    last_preview_hash: editorState.last_preview_hash || '',
    dirty: Boolean(editorState.dirty),
    export_status: editorState.export_status || 'idle',
    error: editorState.error || '',
    timed_rows: Array.isArray(editorState.timed_rows) ? editorState.timed_rows : [],
    global_audio: globalAudio,
    updated_at: editorState.updated_at || new Date().toISOString(),
  };
}

function normalizeGlobalAudioState(globalAudio = {}) {
  const voiceVolume = Number(globalAudio?.voice?.volume);
  const musicVolume = Number(globalAudio?.music?.volume);
  return {
    voice: {
      volume: Number.isFinite(voiceVolume) ? Math.max(0, Math.min(1, voiceVolume)) : 1,
      muted: Boolean(globalAudio?.voice?.muted),
    },
    music: {
      volume: Number.isFinite(musicVolume) ? Math.max(0, Math.min(1, musicVolume)) : 0.16,
      muted: Boolean(globalAudio?.music?.muted),
    },
  };
}

function normalizeRemotionRows(rows = []) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row, index) => ({
    id: (row?.id || `row-${index + 1}`).toString(),
    index: Number(row?.index ?? index),
    phrase: (row?.phrase || row?.caption || '').toString(),
    startTime: Number(row?.startTime ?? 0),
    endTime: Number(row?.endTime ?? 0),
    selectedAssetId: row?.selectedAssetId || null,
    motion: row?.motion || 'slow-zoom-in',
    dust: { enabled: Boolean(row?.dust?.enabled) },
    logo: { enabled: row?.logo?.enabled !== false },
    filter: { enabled: Boolean(row?.filter?.enabled), mode: row?.filter?.mode || 'cover' },
    transition: row?.transition || 'none',
  })).filter((row) => row.id);
}

function resolveRemotionClient({ api, store }) {
  return api.createRemotionClient({
    resolveBaseUrl: () => store.getState()?.settings?.remotionApiUrl || '',
  });
}

function buildApprovalSeedPayload(project = {}) {
  const draftId = resolveVideoProjectKey(project);
  const selected_images = Array.isArray(project.selected_images) ? project.selected_images : [];
  const segments = Array.isArray(project.segments)
    ? project.segments.map((segment, index) => ({
      id: segment?.id || `row-${index + 1}`,
      phrase: (segment?.text || segment?.phrase || '').toString().trim(),
    })).filter((segment) => segment.phrase)
    : [];

  return {
    draft_id: draftId,
    project_id: draftId,
    title: resolveVideoProjectTitle(project),
    guion_piped: (project.guion_piped || '').toString(),
    segments,
    selected_images,
    voice_audio: project.voice_audio || null,
    background_audio: project.background_audio || null,
    defaults: {
      fps: 30,
      preview: { width: 1280, height: 720 },
      final: { width: 1920, height: 1080 },
    },
  };
}

function validateRemotionAudioInputs(project = {}) {
  const voiceUrl = (project?.voice_audio?.public_url || '').toString().trim();
  const backgroundUrl = (project?.background_audio?.public_url || '').toString().trim();
  if (!voiceUrl) {
    throw new Error('Falta el audio de voz (voice_audio.public_url). Subí y guardá el audio antes de preparar la preview.');
  }
  if (!backgroundUrl) {
    throw new Error('Falta la música de fondo (background_audio.public_url). Subí y guardá el audio antes de preparar la preview.');
  }
}

function setVideoProjectStep(project, step) {
  if (!project) return;
  project._videoProjectStep = step === 'audio' ? 'audio' : 'images';
}

function hydrateSelectedProjectState(project) {
  if (!project) return;
  project.editor_state = normalizeEditorState(project.editor_state || {});
  const es = project.editor_state;
  const timedRows = normalizeRemotionRows(es.timed_rows);
  if (timedRows.length) project._editorRows = timedRows;
  project._globalAudio = normalizeGlobalAudioState(es.global_audio);
  // Default to browser composition when editor rows are available
  if (project._useCompositionPreview === undefined) {
    project._useCompositionPreview = timedRows.length > 0;
  }
  setVideoProjectStep(project, 'images');
}

function hashString(input) {
  let hash = 2166136261;
  for (const char of String(input)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function computeCompositionHash(project) {
  const rows = Array.isArray(project._editorRows) ? project._editorRows : (project.editor_state?.timed_rows || []);
  const globalAudio = normalizeGlobalAudioState(project._globalAudio);
  const payload = JSON.stringify({ rows, globalAudio });
  return hashString(payload);
}

function buildCompositionPayload(project) {
  const rows = Array.isArray(project._editorRows) ? project._editorRows : (project.editor_state?.timed_rows || []);
  const globalAudio = normalizeGlobalAudioState(project._globalAudio);
  return {
    rows: rows.map((row) => ({
      id: row.id,
      selectedAssetId: row.selectedAssetId || null,
      motion: row.motion || 'slow-zoom-in',
      dust: { enabled: Boolean(row.dust?.enabled) },
      logo: { enabled: row.logo?.enabled !== false },
      filter: { enabled: Boolean(row.filter?.enabled), mode: row.filter?.mode || 'cover' },
      transition: row.transition || 'none',
      startTime: row.startTime,
      endTime: row.endTime,
    })),
    audio: globalAudio,
  };
}

export function createVideoProjectsFeature({ api, store, ui, callbacks }) {
  const {
    renderVideoProjects = () => {},
    renderSelectedVideoProject = () => {},
  } = callbacks || {};

  let saveTimer = null;
  const detailCache = new Map();
  const detailInFlight = new Map();

  function getCachedProjectDetail(projectId) {
    const key = (projectId || '').toString();
    if (!key) return null;
    const cached = detailCache.get(key);
    if (!cached) return null;
    if (Date.now() - cached.cachedAt > DETAIL_CACHE_TTL_MS) {
      detailCache.delete(key);
      return null;
    }
    return cached.detail;
  }

  function setCachedProjectDetail(projectId, detail) {
    const key = (projectId || '').toString();
    if (!key || !detail || typeof detail !== 'object') return;
    if (detailCache.size >= DETAIL_CACHE_MAX_ENTRIES) {
      const oldestKey = detailCache.keys().next().value;
      if (oldestKey) detailCache.delete(oldestKey);
    }
    detailCache.set(key, { detail, cachedAt: Date.now() });
  }

  function collectCandidateUrls(project = {}) {
    const candidates = Array.isArray(project.image_candidates) ? project.image_candidates : [];
    const urls = [];
    for (const candidate of candidates) {
      const url = (
        candidate?.storage_public_url
        || candidate?.public_url
        || candidate?.storage_url
        || candidate?.cached_url
        || candidate?.image_url
        || candidate?.imageUrl
        || candidate?.thumbnail_url
        || candidate?.thumbnailUrl
        || ''
      ).toString().trim();
      if (!url || urls.includes(url)) continue;
      urls.push(url);
    }
    return urls;
  }

  async function preloadProjectCandidateImages(project = {}, { max = DETAIL_PRELOAD_MAX_IMAGES } = {}) {
    const urls = collectCandidateUrls(project).slice(0, Math.max(0, Number(max || 0)));
    if (!urls.length) return;

    await Promise.allSettled(urls.map((url) => new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = () => resolve();
      img.src = url;
    })));
  }

  async function fetchAndCacheProjectDetail(projectId, { preloadImages = true } = {}) {
    const id = (projectId || '').toString();
    if (!id) return null;

    if (detailInFlight.has(id)) return detailInFlight.get(id);

    const request = (async () => {
      const data = await api.getVideoProject(id);
      const [detail] = normalizeVideoProjectRows(data);
      if (!detail) return null;
      setCachedProjectDetail(id, detail);
      if (preloadImages) await preloadProjectCandidateImages(detail);
      return detail;
    })();

    detailInFlight.set(id, request);
    try {
      return await request;
    } finally {
      detailInFlight.delete(id);
    }
  }

  function prefetchProjectDetail(projectId) {
    const id = (projectId || '').toString();
    if (!id || getCachedProjectDetail(id) || detailInFlight.has(id)) return;
    void fetchAndCacheProjectDetail(id, { preloadImages: true }).catch(() => {});
  }

  function prefetchListedVideoProjects() {
    const projects = Array.isArray(store.getState()?.videoProjects) ? store.getState().videoProjects : [];
    projects
      .slice(0, DETAIL_PREFETCH_VISIBLE_LIMIT)
      .map((project) => resolveVideoProjectKey(project))
      .filter(Boolean)
      .forEach((projectId) => prefetchProjectDetail(projectId));
  }

  async function persistEditorState(project, patch = {}) {
    if (!project) return;
    const draftId = resolveVideoProjectKey(project);
    if (!draftId) return;
    const merged = normalizeEditorState({ ...(project.editor_state || {}), ...patch, updated_at: new Date().toISOString() });
    project.editor_state = merged;
    await api.saveVideoProjectEditorState({ draftId, editorState: merged });
  }

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
        if (refreshed) {
          const priorEditorState = state.selectedVideoProject.editor_state;
          state.selectedVideoProject = { ...state.selectedVideoProject, ...refreshed };
          // Preserve/reopen editor state from server if present
          if (refreshed.editor_state && typeof refreshed.editor_state === 'object') {
            state.selectedVideoProject.editor_state = normalizeEditorState(refreshed.editor_state);
          } else if (priorEditorState) {
            state.selectedVideoProject.editor_state = normalizeEditorState(priorEditorState);
          }
        }
      }

      renderVideoProjects();
      renderSelectedVideoProject();
      prefetchListedVideoProjects();
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
    const cachedDetail = getCachedProjectDetail(id);
    if (cachedDetail) {
      state.selectedVideoProject = cachedDetail;
      hydrateSelectedProjectState(state.selectedVideoProject);
      state.videoProjectDetailLoading = false;
      state.videoProjectDetailImagesPreparing = false;
      renderVideoProjects();
      renderSelectedVideoProject();
      return;
    }

    state.selectedVideoProject = listRow || { draft_id: id, project_id: id };
    state.videoProjectDetailLoading = true;
    state.videoProjectDetailImagesPreparing = true;
    renderVideoProjects();
    renderSelectedVideoProject();

    try {
      const detail = await fetchAndCacheProjectDetail(id, { preloadImages: false });
      if (!detail) {
        ui.toast('Ese proyecto todavía no existe o fue deshabilitado');
        state.selectedVideoProject = listRow || null;
        return;
      }
      state.selectedVideoProject = detail;
      hydrateSelectedProjectState(state.selectedVideoProject);
      renderVideoProjects();
      renderSelectedVideoProject();
      await preloadProjectCandidateImages(state.selectedVideoProject);
      state.videoProjectDetailImagesPreparing = false;
      renderVideoProjects();
      renderSelectedVideoProject();
    } catch (err) {
      console.error(err);
      ui.toast('Error abriendo proyecto de edición');
    } finally {
      state.videoProjectDetailLoading = false;
      state.videoProjectDetailImagesPreparing = false;
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

  async function selectDefaultBackgroundMusic(trackId) {
    const state = store.getState();
    const project = state.selectedVideoProject;
    if (!project) return;

    const draftId = resolveVideoProjectKey(project);
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
      project.background_audio = {
        kind: 'background',
        bucket: 'video-project-audio',
        storage_path: track.path,
        public_url: track.public_url,
        name: track.label,
        file_name: track.fileName,
        size: 0,
        mime_type: track.mime_type,
        source: 'default-background-music',
        default_track_id: track.id,
        selected_at: new Date().toISOString(),
      };

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

  async function preparePreview() {
    const state = store.getState();
    const project = state.selectedVideoProject;
    if (!project) return;

    const remotion = resolveRemotionClient({ api, store });
    const seed = buildApprovalSeedPayload(project);

    try {
      validateRemotionAudioInputs(project);
      await persistEditorState(project, {
        phase: 'preparing',
        dirty: false,
        error: '',
        remotion_api_url: state.settings?.remotionApiUrl || '',
      });
      renderSelectedVideoProject();

      const created = await remotion.createFromApproval(seed);
      if (created?.alignmentStatus?.status !== 'ready') {
        const detail = created?.alignmentStatus?.details || created?.alignmentStatus?.warning || '';
        throw new Error(`Alineación de audio pendiente. Esperando Whisper...${detail ? ` (${detail})` : ''}`);
      }
      const remotionProjectId = created?.projectId || created?.snapshot?.project?.projectId;
      if (!remotionProjectId) throw new Error('Remotion no devolvió projectId');

      const createdRows = normalizeRemotionRows(created?.snapshot?.project?.rows);
      const status = await remotion.status(remotionProjectId);
      const statusRows = normalizeRemotionRows(status?.project?.rows);
      const timedRows = createdRows.length ? createdRows : statusRows;
      if (!timedRows.length) throw new Error('Remotion no devolvió filas cronometradas para el editor.');

      project._editorRows = timedRows;
      project._globalAudio = { voice: { volume: 1, muted: false }, music: { volume: 0.16, muted: false } };

      await persistEditorState(project, {
        phase: 'preview_rendering',
        remotion_project_id: remotionProjectId,
        timed_rows: timedRows,
      });
      renderSelectedVideoProject();

      const preview = await remotion.renderPreview(remotionProjectId);
      const refreshedStatus = await remotion.status(remotionProjectId);
      const previewReady = Boolean(refreshedStatus?.preview?.exists || refreshedStatus?.preview?.outputPath);
      if (!previewReady) throw new Error('Remotion no generó el archivo de preview.');
      const previewUrl = remotion.previewDownloadUrl(remotionProjectId);

      const compositionHash = computeCompositionHash(project);

      await persistEditorState(project, {
        phase: 'preview_ready',
        remotion_project_id: remotionProjectId,
        preview_url: previewUrl,
        composition_hash: compositionHash,
        last_preview_hash: compositionHash,
        dirty: false,
        error: '',
        export_status: 'idle',
        diagnostics: preview?.diagnostics || refreshedStatus?.diagnostics || null,
      });
      ui.toast('Preview preparada');
    } catch (err) {
      console.error(err);
      await persistEditorState(project, {
        phase: 'error',
        error: err?.message || 'No se pudo preparar preview',
      });
      ui.toast('Error preparando preview');
    } finally {
      renderSelectedVideoProject();
    }
  }

  async function refreshPreview() {
    const state = store.getState();
    const project = state.selectedVideoProject;
    if (!project) return;

    const remotion = resolveRemotionClient({ api, store });
    const remotionProjectId = project.editor_state?.remotion_project_id;
    if (!remotionProjectId) {
      ui.toast('No hay proyecto Remotion vinculado');
      return;
    }

    try {
      if (!Array.isArray(project._editorRows) || !project._editorRows.length) {
        const currentRows = normalizeRemotionRows(project.editor_state?.timed_rows);
        if (currentRows.length) {
          project._editorRows = currentRows;
        } else {
          const currentStatus = await remotion.status(remotionProjectId);
          const recoveredRows = normalizeRemotionRows(currentStatus?.project?.rows);
          if (recoveredRows.length) {
            project._editorRows = recoveredRows;
            project.editor_state = normalizeEditorState({
              ...project.editor_state,
              timed_rows: recoveredRows,
            });
          }
        }
      }

      if (!Array.isArray(project._editorRows) || !project._editorRows.length) {
        throw new Error('No hay filas cronometradas para actualizar la preview.');
      }

      await persistEditorState(project, {
        phase: 'preview_rendering',
        error: '',
      });
      renderSelectedVideoProject();

      // Push current composition edits to Remotion before re-rendering
      const composition = buildCompositionPayload(project);
      await remotion.updateComposition(remotionProjectId, composition);

      const preview = await remotion.renderPreview(remotionProjectId);
      const refreshedStatus = await remotion.status(remotionProjectId);
      const previewReady = Boolean(refreshedStatus?.preview?.exists || refreshedStatus?.preview?.outputPath);
      if (!previewReady) throw new Error('Remotion no generó el archivo de preview.');
      const previewUrl = remotion.previewDownloadUrl(remotionProjectId);

      const compositionHash = computeCompositionHash(project);

      await persistEditorState(project, {
        phase: 'preview_ready',
        preview_url: previewUrl,
        last_preview_hash: compositionHash,
        dirty: false,
        error: '',
        diagnostics: preview?.diagnostics || refreshedStatus?.diagnostics || null,
      });
      ui.toast('Preview actualizada');
    } catch (err) {
      console.error(err);
      await persistEditorState(project, {
        phase: 'error',
        error: err?.message || 'No se pudo actualizar preview',
      });
      ui.toast('Error actualizando preview');
    } finally {
      renderSelectedVideoProject();
    }
  }

  async function exportFinal() {
    const state = store.getState();
    const project = state.selectedVideoProject;
    if (!project) return;

    const editorState = project.editor_state || {};
    if (editorState.dirty) {
      const proceed = window.confirm('La preview está desactualizada. ¿Exportar igual? Es recomendable actualizar la preview antes de exportar.');
      if (!proceed) return;
    }

    const remotion = resolveRemotionClient({ api, store });
    const remotionProjectId = editorState.remotion_project_id;
    if (!remotionProjectId) {
      ui.toast('No hay proyecto Remotion vinculado');
      return;
    }

    try {
      await persistEditorState(project, {
        phase: 'final_rendering',
        export_status: 'rendering',
        error: '',
      });
      renderSelectedVideoProject();

      // Push latest composition before final render
      const composition = buildCompositionPayload(project);
      await remotion.updateComposition(remotionProjectId, composition);

      const result = await remotion.renderFinal(remotionProjectId);
      const finalUrl = remotion.finalDownloadUrl(remotionProjectId);

      await persistEditorState(project, {
        phase: 'final_ready',
        final_url: finalUrl,
        export_status: 'ready',
        dirty: false,
        error: '',
        diagnostics: result?.diagnostics || null,
      });
      ui.toast('Exportación lista. Descargá el video final.');
    } catch (err) {
      console.error(err);
      await persistEditorState(project, {
        phase: 'error',
        export_status: 'error',
        error: err?.message || 'No se pudo exportar el video final',
      });
      ui.toast('Error exportando video final');
    } finally {
      renderSelectedVideoProject();
    }
  }

  function updateRow(rowId, patch) {
    const state = store.getState();
    const project = state.selectedVideoProject;
    if (!project || !rowId) return;

    const rows = Array.isArray(project._editorRows) ? project._editorRows : [];
    const index = rows.findIndex((r) => r.id === rowId);
    if (index === -1) return;

    const current = rows[index];
    const next = {
      ...current,
      ...(patch.motion !== undefined ? { motion: patch.motion } : {}),
      ...(patch.dust !== undefined ? { dust: { enabled: Boolean(patch.dust?.enabled) } } : {}),
      ...(patch.logo !== undefined ? { logo: { enabled: patch.logo?.enabled !== false } } : {}),
      ...(patch.transition !== undefined ? { transition: patch.transition } : {}),
      ...(patch.selectedAssetId !== undefined ? { selectedAssetId: patch.selectedAssetId || null } : {}),
    };

    rows[index] = next;
    project._editorRows = rows;

    const compositionHash = computeCompositionHash(project);
    const lastPreviewHash = project.editor_state?.last_preview_hash || '';
    const isDirty = compositionHash !== lastPreviewHash;

    project.editor_state = normalizeEditorState({
      ...project.editor_state,
      dirty: isDirty,
      phase: isDirty ? 'editing_dirty' : (project.editor_state?.phase || 'preview_ready'),
    });

    renderSelectedVideoProject();

    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      void persistEditorState(project, {
        timed_rows: rows,
        dirty: isDirty,
        phase: isDirty ? 'editing_dirty' : (project.editor_state?.phase || 'preview_ready'),
      });
    }, SAVE_DEBOUNCE_MS);
  }

  async function uploadAndAssignImage(rowId, file) {
    const state = store.getState();
    const project = state.selectedVideoProject;
    if (!project || !rowId || !file) return;

    const draftId = resolveVideoProjectKey(project);
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

  function updateGlobalAudio(kind, patch) {
    const state = store.getState();
    const project = state.selectedVideoProject;
    if (!project) return;
    if (!AUDIO_CONTROL_KINDS.has(kind)) return;

    const normalizedKind = kind === 'voice' ? 'voice' : 'music';

    const current = normalizeGlobalAudioState(project._globalAudio);
    const next = {
      ...current,
      [normalizedKind]: {
        volume: Number.isFinite(patch.volume) ? Math.max(0, Math.min(1, patch.volume)) : current[normalizedKind]?.volume,
        muted: patch.muted !== undefined ? Boolean(patch.muted) : current[normalizedKind]?.muted,
      },
    };
    project._globalAudio = normalizeGlobalAudioState(next);

    const compositionHash = computeCompositionHash(project);
    const lastPreviewHash = project.editor_state?.last_preview_hash || '';
    const isDirty = compositionHash !== lastPreviewHash;

    project.editor_state = normalizeEditorState({
      ...project.editor_state,
      dirty: isDirty,
      phase: isDirty ? 'editing_dirty' : (project.editor_state?.phase || 'preview_ready'),
      global_audio: project._globalAudio,
    });

    renderSelectedVideoProject();

    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      void persistEditorState(project, {
        dirty: isDirty,
        phase: isDirty ? 'editing_dirty' : (project.editor_state?.phase || 'preview_ready'),
        global_audio: project._globalAudio,
      });
    }, SAVE_DEBOUNCE_MS);
  }

  return {
    refreshVideoProjects,
    openVideoProject,
    prefetchProjectDetail,
    toggleImageSelection,
    goToAudioStep,
    goToImagesStep,
    uploadProjectAudio,
    selectDefaultBackgroundMusic,
    uploadCustomImages,
    preparePreview,
    refreshPreview,
    exportFinal,
    updateRow,
    uploadAndAssignImage,
    updateGlobalAudio,
  };
}
