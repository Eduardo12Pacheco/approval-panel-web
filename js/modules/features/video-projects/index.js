import { createAudioSetupCommands } from './audio/commands.js';
import { buildCompositionPayload, computeCompositionHash } from './composition/composition-payload.js';
import { prepareVideoCompositionContract, normalizePreparedContractRows } from './data/contract-pipeline-client.js';
import { createCustomImageCommands } from './data/custom-image-commands.js';
import { createVideoProjectDetailCache } from './data/detail-cache.js';
import { createRowImageCommands } from './data/row-image-commands.js';
import { createSelectionCommands } from './data/selection-commands.js';
import { normalizeVideoProjectRows } from './data/video-project-rows.js';
import { resolveVideoProjectKey, resolveVideoProjectTitle } from './domain/project-identity.js';
import { findMotionPreset } from './domain/motion-presets.js';
import {
  normalizeEditorState,
  normalizeGlobalAudioState,
  sanitizePipelineHealthMetadata,
} from './domain/editor-state.js';

export { resolveVideoProjectKey, resolveVideoProjectTitle } from './domain/project-identity.js';
export { normalizeVideoProjectRows } from './data/video-project-rows.js';

const SAVE_DEBOUNCE_MS = 400;
const AUDIO_CONTROL_KINDS = new Set(['voice', 'music', 'background']);

function resolveMotionPatchForApprovalService(motion) {
  const preset = findMotionPreset(motion);
  if (preset) return { motionPresetId: preset.name, motion: { ...preset } };
  const normalized = (motion || '').toString().trim().toLowerCase();
  if (normalized === 'none' || normalized === 'still') {
    return { motionPresetId: 'none', motion: { fromScale: 1, toScale: 1, fromX: 0, fromY: 0, toX: 0, toY: 0 } };
  }
  if (normalized === 'slow-zoom-out') {
    return { motionPresetId: 'slow-zoom-out', motion: { fromScale: 1.08, toScale: 1, fromX: 0, fromY: 0, toX: 0, toY: 0 } };
  }
  if (normalized === 'slow-zoom' || normalized === 'slow-zoom-in') {
    return { motionPresetId: normalized || 'slow-zoom-in', motion: { fromScale: 1, toScale: normalized === 'slow-zoom' ? 1.04 : 1.08, fromX: 0, fromY: 0, toX: 0, toY: 0 } };
  }
  if (normalized === 'pan-left') {
    return { motionPresetId: 'pan-left', motion: { fromScale: 1.1, toScale: 1.1, fromX: 72, fromY: 0, toX: -72, toY: 0 } };
  }
  if (normalized === 'pan-right') {
    return { motionPresetId: 'pan-right', motion: { fromScale: 1.1, toScale: 1.1, fromX: -72, fromY: 0, toX: 72, toY: 0 } };
  }
  return { motionPresetId: normalized || 'custom', motion: typeof motion === 'object' ? motion : undefined };
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

export function buildCompositionPayloadForCheck(project) {
  return buildCompositionPayload(project);
}

export function createVideoProjectsFeature({ api, store, ui, callbacks }) {
  const {
    renderVideoProjects = () => {},
    renderSelectedVideoProject = () => {},
  } = callbacks || {};

  let saveTimer = null;
  const {
    getCachedProjectDetail,
    preloadProjectCandidateImages,
    fetchAndCacheProjectDetail,
    prefetchProjectDetail,
    prefetchListedVideoProjects,
  } = createVideoProjectDetailCache({
    api,
    store,
    normalizeRows: normalizeVideoProjectRows,
    resolveProjectKey: resolveVideoProjectKey,
  });
  const {
    uploadProjectAudio,
    selectDefaultBackgroundMusic,
  } = createAudioSetupCommands({
    api,
    ui,
    getProject: () => store.getState().selectedVideoProject,
    resolveProjectKey: resolveVideoProjectKey,
    renderSelectedVideoProject,
  });
  const { uploadCustomImages } = createCustomImageCommands({
    api,
    ui,
    getProject: () => store.getState().selectedVideoProject,
    resolveProjectKey: resolveVideoProjectKey,
    renderSelectedVideoProject,
  });
  const {
    toggleImageSelection,
    goToAudioStep,
    goToImagesStep,
  } = createSelectionCommands({
    api,
    store,
    resolveProjectKey: resolveVideoProjectKey,
    renderSelectedVideoProject,
    getSaveTimer: () => saveTimer,
    setSaveTimer: (timer) => { saveTimer = timer; },
    debounceMs: SAVE_DEBOUNCE_MS,
    setVideoProjectStep,
  });

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
        const download = typeof client.finalDownload === 'function' ? await client.finalDownload(projectId) : null;
        await persistEditorState(project, {
          phase: 'final_ready',
          final_url: download?.finalUrl || '',
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
      if (patch.motion !== undefined || patch.motionPresetId !== undefined) {
        const resolvedMotion = patch.motionPresetId
          ? { motionPresetId: patch.motionPresetId, motion: typeof patch.motion === 'object' ? patch.motion : undefined }
          : resolveMotionPatchForApprovalService(patch.motion);
        operations.push({ type: 'setRowMotion', rowId, ...resolvedMotion });
      }
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

  const { uploadAndAssignImage } = createRowImageCommands({
    api,
    ui,
    getProject: () => store.getState().selectedVideoProject,
    resolveProjectKey: resolveVideoProjectKey,
    renderSelectedVideoProject,
    updateRow,
  });

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
        project.editor_state = normalizeEditorState({ ...project.editor_state, phase: 'editing_dirty' });
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
