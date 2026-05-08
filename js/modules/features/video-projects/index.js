import { findDefaultBackgroundMusicTrack } from './default-background-music.js';
import { buildPreviewCompositionContract } from './composition-contract.js';
import { prepareVideoCompositionContract, normalizePreparedContractRows } from './contract-pipeline-client.js';

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

function sanitizePipelineHealthMetadata(healthPayload) {
  if (!healthPayload || typeof healthPayload !== 'object') return null;
  const sanitized = {};
  if (typeof healthPayload.ok === 'boolean') sanitized.ok = healthPayload.ok;
  const status = (healthPayload.status || '').toString().trim();
  if (status) sanitized.status = status;
  return Object.keys(sanitized).length ? sanitized : null;
}

function normalizeEditorState(editorState = {}) {
  if (!editorState || typeof editorState !== 'object') return {};
  const globalAudio = normalizeGlobalAudioState(editorState.global_audio);
  return {
    phase: editorState.phase || 'idle',
    remotion_project_id: editorState.remotion_project_id || '',
    remotion_api_url: editorState.remotion_api_url || '',
    pipeline_provider: editorState.pipeline_provider || '',
    pipeline_base_url: editorState.pipeline_base_url || '',
    pipeline_fallback_from: editorState.pipeline_fallback_from || '',
    pipeline_health: sanitizePipelineHealthMetadata(editorState.pipeline_health),
    preview_url: editorState.preview_url || '',
    final_url: editorState.final_url || '',
    composition_hash: editorState.composition_hash || '',
    last_preview_hash: editorState.last_preview_hash || '',
    last_rendered_hash: editorState.last_rendered_hash || '',
    snapshot_id: editorState.snapshot_id || editorState.snapshotId || '',
    snapshot_hash: editorState.snapshot_hash || editorState.snapshotHash || '',
    approval_contract_snapshot: editorState.approval_contract_snapshot && typeof editorState.approval_contract_snapshot === 'object' ? editorState.approval_contract_snapshot : null,
    dirty: Boolean(editorState.dirty),
    export_status: editorState.export_status || 'idle',
    error: editorState.error || '',
    timed_rows: Array.isArray(editorState.timed_rows) ? editorState.timed_rows : [],
    preview_assets: editorState.preview_assets && typeof editorState.preview_assets === 'object' ? editorState.preview_assets : null,
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


function setVideoProjectStep(project, step) {
  if (!project) return;
  project._videoProjectStep = step === 'audio' ? 'audio' : 'images';
}

function hydrateSelectedProjectState(project) {
  if (!project) return;
  project.editor_state = normalizeEditorState(project.editor_state || {});
  const es = project.editor_state;
  const timedRows = normalizePreparedContractRows(es.timed_rows);
  const contractRows = normalizePreparedContractRows(es.approval_contract_snapshot?.rows);
  if (contractRows.length) project._editorRows = contractRows;
  else if (timedRows.length) project._editorRows = timedRows;
  project._previewAssets = es.preview_assets || null;
  project._globalAudio = normalizeGlobalAudioState(es.global_audio);
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
  const contractSnapshot = project?.editor_state?.approval_contract_snapshot;
  if (contractSnapshot?.snapshotHash) return contractSnapshot.snapshotHash;
  const rows = Array.isArray(project._editorRows) ? project._editorRows : (project.editor_state?.timed_rows || []);
  const globalAudio = normalizeGlobalAudioState(project._globalAudio);
  const payload = JSON.stringify({ rows, globalAudio });
  return hashString(payload);
}

function buildCompositionPayload(project) {
  const contractSnapshot = project?.editor_state?.approval_contract_snapshot;
  if (contractSnapshot?.contractVersion === 'approval-editor-service-v1') {
    return {
      rows: normalizePreparedContractRows(contractSnapshot.rows),
      audio: contractSnapshot.audio,
      contract: contractSnapshot,
      manifest: { version: 1, assets: contractSnapshot.assets || {} },
      snapshotHash: contractSnapshot.snapshotHash,
      snapshotId: contractSnapshot.snapshotId,
    };
  }
  const rows = Array.isArray(project._editorRows) ? project._editorRows : (project.editor_state?.timed_rows || []);
  const globalAudio = normalizeGlobalAudioState(project._globalAudio);
  const legacyPayload = {
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

  const previewContract = buildPreviewCompositionContract(project, rows);
  const manifestImages = Array.isArray(previewContract?.manifest?.images) ? previewContract.manifest.images : [];
  const hasManifestImages = manifestImages.some((item) => item?.rowId && item?.assetId && item?.mediaUrl);
  const hasManifestAudio = Boolean(previewContract?.manifest?.audio?.voice?.mediaUrl || previewContract?.manifest?.audio?.music?.mediaUrl);
  if (!hasManifestImages && !hasManifestAudio) return legacyPayload;

  const contract = {
    fps: 30,
    renderProfile: { fps: 30 },
    audio: {
      voiceAssetId: previewContract?.manifest?.audio?.voice?.assetId || 'voice-asset',
      musicAssetId: previewContract?.manifest?.audio?.music?.assetId || 'music-asset',
      voice: globalAudio.voice,
      music: {
        ...globalAudio.music,
        loop: true,
        fadeInSeconds: 0.5,
        fadeOutSeconds: 1,
      },
    },
    segments: (Array.isArray(previewContract.rows) ? previewContract.rows : []).map((row, index) => ({
      rowId: row.id,
      phrase: row.phrase || '',
      startTime: Number(row.startTime || 0),
      endTime: Number(row.endTime || 0),
      effectiveEndTime: Number(row.effectiveEndTime ?? row.endTime ?? 0),
      selectedAssetId: row.selectedAssetId || manifestImages.find((item) => item?.rowId === row.id)?.assetId || null,
      motion: row.motion || 'slow-zoom-in',
      dust: { enabled: Boolean(row.dust?.enabled) },
      logo: { enabled: row.logo?.enabled !== false },
      filter: { enabled: Boolean(row.filter?.enabled), mode: row.filter?.mode || 'cover' },
      transition: row.transition || 'none',
      caption: row.caption || '',
      id: index + 1,
    })),
    globalLayers: {},
    outro: { enabled: true, durationSeconds: 2, label: 'Gracias por mirar' },
  };

  const assets = {};
  for (const item of manifestImages) {
    const assetId = (item?.assetId || '').toString().trim();
    const mediaUrl = (item?.mediaUrl || '').toString().trim();
    if (!assetId || !mediaUrl) continue;
    assets[assetId] = { status: 'ready', renderPath: mediaUrl };
  }
  const voiceMediaUrl = (previewContract?.manifest?.audio?.voice?.mediaUrl || '').toString().trim();
  const musicMediaUrl = (previewContract?.manifest?.audio?.music?.mediaUrl || '').toString().trim();
  if (voiceMediaUrl) assets[contract.audio.voiceAssetId] = { status: 'ready', renderPath: voiceMediaUrl };
  if (musicMediaUrl) assets[contract.audio.musicAssetId] = { status: 'ready', renderPath: musicMediaUrl };

  return {
    ...legacyPayload,
    contract,
    manifest: {
      version: 1,
      assets,
    },
  };
}

export function buildCompositionPayloadForCheck(project) {
  return buildCompositionPayload(project);
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

  function createApprovalServiceClient(project) {
    const baseUrl = (project?.editor_state?.pipeline_base_url || store.getState()?.settings?.approvalPipelineBaseUrl || '').toString().trim();
    if (!baseUrl || typeof api?.createApprovalPipelineClient !== 'function') return null;
    return api.createApprovalPipelineClient({ resolveBaseUrl: () => baseUrl });
  }

  function isApprovalServiceMode(project) {
    return project?.editor_state?.pipeline_provider === 'approval' && Boolean(project?.editor_state?.approval_contract_snapshot?.snapshotHash);
  }

  function applyCanonicalSnapshot(project, snapshot, { dirty = false, phase = 'preview_ready' } = {}) {
    if (!snapshot?.contractVersion) return;
    project._editorRows = normalizePreparedContractRows(snapshot.rows);
    project._globalAudio = normalizeGlobalAudioState(snapshot.audio);
    project.editor_state = normalizeEditorState({
      ...project.editor_state,
      approval_contract_snapshot: snapshot,
      snapshot_id: snapshot.snapshotId,
      snapshot_hash: snapshot.snapshotHash,
      timed_rows: project._editorRows,
      global_audio: project._globalAudio,
      composition_hash: snapshot.snapshotHash,
      last_preview_hash: snapshot.snapshotHash,
      dirty,
      phase,
    });
  }

  async function commitApprovalSnapshotOperations(project, operations = [], { phase = 'preview_ready' } = {}) {
    const client = createApprovalServiceClient(project);
    if (!client) throw new Error('Approval editor service no configurado');
    const projectId = project.editor_state?.remotion_project_id;
    const baseSnapshotHash = project.editor_state?.snapshot_hash || project.editor_state?.approval_contract_snapshot?.snapshotHash;
    const result = await client.updateSnapshot(projectId, { baseSnapshotHash, operations });
    const snapshot = result?.snapshot || result?.data?.snapshot;
    if (!snapshot) throw new Error('Approval editor service no devolvió snapshot');
    applyCanonicalSnapshot(project, snapshot, { dirty: true, phase });
    await persistEditorState(project, {
      phase,
      approval_contract_snapshot: snapshot,
      snapshot_id: snapshot.snapshotId,
      snapshot_hash: snapshot.snapshotHash,
      timed_rows: project._editorRows,
      global_audio: project._globalAudio,
      composition_hash: snapshot.snapshotHash,
      last_preview_hash: snapshot.snapshotHash,
      dirty: true,
      error: '',
    });
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

    try {
      await persistEditorState(project, {
        phase: 'preparing',
        dirty: false,
        error: '',
        remotion_api_url: state.settings?.remotionApiUrl || '',
        pipeline_base_url: (state.settings?.approvalPipelineBaseUrl || '').toString().trim(),
      });
      renderSelectedVideoProject();

      const preparedContract = await prepareVideoCompositionContract({
        project,
        settings: state.settings,
        api,
      });

      project._editorRows = preparedContract.timedRows;
      project._previewAssets = preparedContract.previewAssets;
      project._globalAudio = preparedContract.globalAudio;
      if (preparedContract.approvalContractSnapshot) {
        project.editor_state = normalizeEditorState({
          ...project.editor_state,
          approval_contract_snapshot: preparedContract.approvalContractSnapshot,
          snapshot_id: preparedContract.snapshotId,
          snapshot_hash: preparedContract.snapshotHash,
        });
      }

      await persistEditorState(project, {
        phase: 'preview_ready',
        remotion_project_id: preparedContract.compositionProjectId,
        pipeline_provider: preparedContract.provider || '',
        pipeline_base_url: preparedContract.providerMetadata?.baseUrl || '',
        pipeline_fallback_from: preparedContract.providerMetadata?.fallbackFrom || '',
        pipeline_health: sanitizePipelineHealthMetadata(preparedContract.providerMetadata?.health),
        timed_rows: preparedContract.timedRows,
        preview_assets: project._previewAssets,
        approval_contract_snapshot: preparedContract.approvalContractSnapshot || null,
        snapshot_id: preparedContract.snapshotId || '',
        snapshot_hash: preparedContract.snapshotHash || '',
        preview_url: '',
      });
      renderSelectedVideoProject();

      const compositionHash = computeCompositionHash(project);

      await persistEditorState(project, {
        phase: 'preview_ready',
        remotion_project_id: preparedContract.compositionProjectId,
        pipeline_provider: preparedContract.provider || '',
        pipeline_base_url: preparedContract.providerMetadata?.baseUrl || '',
        pipeline_fallback_from: preparedContract.providerMetadata?.fallbackFrom || '',
        pipeline_health: sanitizePipelineHealthMetadata(preparedContract.providerMetadata?.health),
        preview_url: '',
        composition_hash: compositionHash,
        last_preview_hash: compositionHash,
        last_rendered_hash: compositionHash,
        approval_contract_snapshot: preparedContract.approvalContractSnapshot || null,
        snapshot_id: preparedContract.snapshotId || '',
        snapshot_hash: preparedContract.snapshotHash || '',
        dirty: false,
        error: '',
        export_status: 'idle',
      });
      ui.toast('Editor preparado');
    } catch (err) {
      console.error(err);
      await persistEditorState(project, {
        phase: 'error',
        error: err?.message || 'No se pudo preparar el editor',
      });
      ui.toast('Error preparando editor');
    } finally {
      renderSelectedVideoProject();
    }
  }

  async function refreshPreview() {
    const state = store.getState();
    const project = state.selectedVideoProject;
    if (!project) return;

    if (isApprovalServiceMode(project)) {
      await persistEditorState(project, { phase: 'preview_ready', dirty: false, error: '', last_preview_hash: project.editor_state.snapshot_hash });
      renderSelectedVideoProject();
      ui.toast('Preview actualizada desde snapshot canónico');
      return;
    }

    const remotion = api.createRemotionClient({
      resolveBaseUrl: () => store.getState()?.settings?.remotionApiUrl || '',
    });
    const remotionProjectId = project.editor_state?.remotion_project_id;
    if (!remotionProjectId) {
      ui.toast('No hay proyecto Remotion vinculado');
      return;
    }

    try {
      if (!Array.isArray(project._editorRows) || !project._editorRows.length) {
        const currentRows = normalizePreparedContractRows(project.editor_state?.timed_rows);
        if (currentRows.length) {
          project._editorRows = currentRows;
        } else {
          const currentStatus = await remotion.status(remotionProjectId);
          const recoveredRows = normalizePreparedContractRows(currentStatus?.project?.rows);
          if (recoveredRows.length) {
            project._editorRows = recoveredRows;
            project.editor_state = normalizeEditorState({
              ...project.editor_state,
              timed_rows: recoveredRows,
              preview_assets: currentStatus?.previewAssets || project.editor_state?.preview_assets || null,
            });
            project._previewAssets = project.editor_state.preview_assets;
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
      project._previewAssets = refreshedStatus?.previewAssets || project._previewAssets || null;
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
        preview_assets: project._previewAssets,
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
      const proceed = window.confirm('Hay cambios pendientes de render final. ¿Querés exportar ahora?');
      if (!proceed) return;
    }

    if (isApprovalServiceMode(project)) {
      const client = createApprovalServiceClient(project);
      const projectId = project.editor_state?.remotion_project_id;
      const snapshotHash = project.editor_state?.snapshot_hash;
      try {
        await persistEditorState(project, { phase: 'final_rendering', export_status: 'rendering', error: '' });
        renderSelectedVideoProject();
        const result = await client.renderFinal(projectId, { snapshotHash });
        await persistEditorState(project, {
          phase: 'final_ready',
          final_url: client.finalDownloadUrl(projectId),
          export_status: 'ready',
          last_rendered_hash: result?.lastRenderedSnapshotHash || snapshotHash,
          dirty: false,
          error: '',
          diagnostics: result?.diagnostics || null,
        });
        ui.toast('Exportación lista. Descargá el video final.');
      } catch (err) {
        console.error(err);
        await persistEditorState(project, { phase: 'error', export_status: 'error', error: err?.message || 'No se pudo exportar el video final' });
        ui.toast('Error exportando video final');
      } finally {
        renderSelectedVideoProject();
      }
      return;
    }

    const remotion = api.createRemotionClient({
      resolveBaseUrl: () => store.getState()?.settings?.remotionApiUrl || '',
    });
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
        last_rendered_hash: computeCompositionHash(project),
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

  async function updateRow(rowId, patch) {
    const state = store.getState();
    const project = state.selectedVideoProject;
    if (!project || !rowId) return;

    const rows = Array.isArray(project._editorRows) ? project._editorRows : [];
    const index = rows.findIndex((r) => r.id === rowId);
    if (index === -1) return;

    if (isApprovalServiceMode(project)) {
      const operations = [];
      if (patch.selectedAssetId !== undefined) operations.push({ type: 'setRowImage', rowId, asset: { assetId: patch.selectedAssetId || null, previewUrl: patch.selectedAssetId || '', renderPath: patch.selectedAssetId || '' } });
      if (patch.motion !== undefined || patch.motionPresetId !== undefined) operations.push({ type: 'setRowMotion', rowId, motionPresetId: patch.motionPresetId || (typeof patch.motion === 'string' ? patch.motion : 'custom'), motion: typeof patch.motion === 'object' ? patch.motion : undefined });
      if (patch.dust !== undefined) operations.push({ type: 'setRowDust', rowId, enabled: Boolean(patch.dust?.enabled), dustType: patch.dust?.type || 'dust-1' });
      if (patch.logo !== undefined) operations.push({ type: 'setLogo', enabled: patch.logo?.enabled !== false, source: patch.logo?.source || 'logo-alpha.webm' });
      if (!operations.length) return;
      try {
        await commitApprovalSnapshotOperations(project, operations, { phase: 'editing_dirty' });
      } catch (err) {
        console.error(err);
        project.editor_state = normalizeEditorState({ ...project.editor_state, phase: 'error', error: `Fila ${rowId}: ${err?.message || 'No se pudo actualizar snapshot'}` });
        ui.toast('Error actualizando snapshot');
      } finally {
        renderSelectedVideoProject();
      }
      return;
    }

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
    const lastRenderedHash = project.editor_state?.last_rendered_hash
      || project.editor_state?.last_preview_hash
      || project.editor_state?.composition_hash
      || '';
    const isDirty = compositionHash !== lastRenderedHash;

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

  async function updateGlobalAudio(kind, patch) {
    const state = store.getState();
    const project = state.selectedVideoProject;
    if (!project) return;
    if (!AUDIO_CONTROL_KINDS.has(kind)) return;

    const normalizedKind = kind === 'voice' ? 'voice' : 'music';

    if (isApprovalServiceMode(project)) {
      try {
        await commitApprovalSnapshotOperations(project, [{ type: 'setAudio', kind: normalizedKind, settings: patch }], { phase: 'editing_dirty' });
      } catch (err) {
        console.error(err);
        project.editor_state = normalizeEditorState({ ...project.editor_state, phase: 'error', error: `Audio ${normalizedKind}: ${err?.message || 'No se pudo actualizar audio'}` });
        ui.toast('Error actualizando audio');
      } finally {
        renderSelectedVideoProject();
      }
      return;
    }

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
    const lastRenderedHash = project.editor_state?.last_rendered_hash
      || project.editor_state?.last_preview_hash
      || project.editor_state?.composition_hash
      || '';
    const isDirty = compositionHash !== lastRenderedHash;

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
