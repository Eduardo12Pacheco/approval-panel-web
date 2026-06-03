import { buildCompositionPayload, computeCompositionHash } from '../composition/composition-payload.js';
import { normalizePreparedContractRows } from '../data/contract-pipeline-client.js';
import { WHIP_TRANSITION_CONFIG, applyAlternatingBoundaryTransitionDefaults, resolveBoundaryTransitionPatch } from '../domain/boundary-transitions.js';
import { normalizeEditorState } from '../domain/editor-state.js';
import { findMotionPreset, normalizeRowMotionForPreview } from '../domain/motion-presets.js';
import { mergeDerivedParagraphBoundaryMetadata } from './editor-state-persistence.js';

function hasOwnPatchValue(patch, key) {
  return Object.prototype.hasOwnProperty.call(patch || {}, key);
}

function defaultZoom150Motion() {
  const { category, name, ...motion } = findMotionPreset('Zoom 150') || {};
  return Object.keys(motion).length ? motion : { fromScale: 1, toScale: 1.5, fromX: 0, fromY: 0, toX: 0, toY: 0, easing: 'linear' };
}

export function mergeLocalEditorRowPatch(current = {}, patch = {}) {
  return {
    ...current,
    ...(hasOwnPatchValue(patch, 'motion') ? { motion: patch.motion } : {}),
    ...(hasOwnPatchValue(patch, 'motionPresetId') ? { motionPresetId: patch.motionPresetId || null } : {}),
    ...(hasOwnPatchValue(patch, 'dust') ? { dust: { ...(current.dust || {}), ...(patch.dust || {}), enabled: Boolean(patch.dust?.enabled) } } : {}),
    ...(hasOwnPatchValue(patch, 'logo') ? { logo: { ...(current.logo || {}), ...(patch.logo || {}), enabled: patch.logo?.enabled !== false } } : {}),
    ...(hasOwnPatchValue(patch, 'transition') ? { transition: patch.transition } : {}),
    ...(hasOwnPatchValue(patch, 'transitionSource') ? { transitionSource: patch.transitionSource === 'auto' ? 'auto' : patch.transitionSource === 'manual' ? 'manual' : undefined } : {}),
    ...(hasOwnPatchValue(patch, 'transitionConfig') ? (patch.transitionConfig ? { transitionConfig: { ...patch.transitionConfig } } : { transitionConfig: undefined }) : {}),
    ...(hasOwnPatchValue(patch, 'sfx') ? { sfx: patch.sfx } : {}),
    ...(hasOwnPatchValue(patch, 'selectedAssetId') ? { selectedAssetId: patch.selectedAssetId || null } : {}),
    ...(hasOwnPatchValue(patch, 'mediaMode') ? { mediaMode: patch.mediaMode === 'newspaper' ? 'newspaper' : 'image' } : {}),
    ...(hasOwnPatchValue(patch, 'media') ? { media: patch.media?.kind === 'video-segment' ? { ...patch.media } : { kind: 'image' } } : {}),
    ...(hasOwnPatchValue(patch, 'newspaper') ? { newspaper: { ...(current.newspaper || {}), ...(patch.newspaper || {}) } } : {}),
  };
}

export function patchLocalEditorRows(rows = [], rowId, patch = {}) {
  const index = Array.isArray(rows) ? rows.findIndex((row) => row?.id === rowId) : -1;
  if (index === -1) return rows;
  const nextRows = rows.slice();
  nextRows[index] = mergeLocalEditorRowPatch(rows[index], patch);
  return nextRows;
}

export function applyPendingMotionDrafts(rows = [], drafts = new Map()) {
  if (!Array.isArray(rows) || !rows.length) return rows;
  const getDraft = typeof drafts?.get === 'function'
    ? (rowId) => drafts.get(rowId)
    : (rowId) => drafts?.[rowId];
  return rows.map((row) => {
    const draft = getDraft(row?.id);
    if (!draft) return row;
    return mergeLocalEditorRowPatch(row, draft.patch || draft);
  });
}

function resolveApprovalRowImageAsset(project, assetId) {
  const cleanAssetId = (assetId || '').toString().trim();
  if (!cleanAssetId) return null;
  const existingAsset = project?.editor_state?.approval_contract_snapshot?.assets?.[cleanAssetId];
  if (existingAsset) return { ...existingAsset, assetId: existingAsset.assetId || cleanAssetId, id: existingAsset.id || existingAsset.assetId || cleanAssetId };
  return { assetId: cleanAssetId, previewUrl: cleanAssetId, renderPath: cleanAssetId };
}

export function shouldFallbackApprovalSnapshotOperationError(error, operationType = '') {
  const message = (error?.message || error?.error?.message || '').toString();
  if (error?.code === 'unsupported_operation') return !operationType || message.includes(operationType);
  if (operationType && message.includes(`unsupported operation: ${operationType}`)) return true;
  return operationType === 'setRowVideoSegment' && message.includes('unsupported operation: setRowVideoSegment');
}

function isMotionRowPatch(patch = {}) {
  return hasOwnPatchValue(patch, 'motion') || hasOwnPatchValue(patch, 'motionPresetId');
}

function isMediaModeRowPatch(patch = {}) {
  return hasOwnPatchValue(patch, 'mediaMode') || hasOwnPatchValue(patch, 'media');
}

function isBoundaryTransitionPatch(patch = {}) {
  return hasOwnPatchValue(patch, 'boundaryTransition');
}

function isNewspaperRowPatch(patch = {}) {
  return hasOwnPatchValue(patch, 'newspaper');
}

function isVideoForegroundTransformPatch(row = {}, patch = {}) {
  if (row?.media?.kind !== 'video-segment' || patch?.media?.kind !== 'video-segment') return false;
  if (!patch.media.foregroundTransform || typeof patch.media.foregroundTransform !== 'object') return false;
  return String(patch.media.sourceVideoAssetId || '') === String(row.media.sourceVideoAssetId || '')
    && String(patch.media.sourceVideoSrc || '') === String(row.media.sourceVideoSrc || '')
    && Number(patch.media.sourceInSeconds || 0) === Number(row.media.sourceInSeconds || 0)
    && Number(patch.media.durationSeconds || 0) === Number(row.media.durationSeconds || 0);
}

function stableJson(value) {
  return JSON.stringify(value ?? null);
}

function rowsWouldChange(rows = [], rowId, patch = {}) {
  const index = Array.isArray(rows) ? rows.findIndex((row) => row?.id === rowId) : -1;
  if (index === -1) return false;
  const localPatch = isBoundaryTransitionPatch(patch)
    ? resolveBoundaryTransitionPatch(patch.boundaryTransition, { source: 'manual' })
    : patch;
  const nextRows = hasOwnPatchValue(localPatch, 'logo')
    ? rows.map((row) => mergeLocalEditorRowPatch(row, localPatch))
    : patchLocalEditorRows(rows, rowId, localPatch);
  return stableJson(nextRows) !== stableJson(rows);
}

function preservePreviewSeekDuringNextRender(project) {
  if (!project) return;
  project._skipNextPreviewSeekCapture = true;
}

function resolveMotionPatchForApprovalService(motion) {
  if (motion && typeof motion === 'object') {
    const motionPresetId = (motion.presetName || motion.name || 'custom').toString();
    return { motionPresetId, motion };
  }
  const preset = findMotionPreset(motion);
  if (preset) return { motionPresetId: preset.name, motion: { ...preset } };
  const normalized = (motion || '').toString().trim().toLowerCase();
  if (!normalized || normalized === 'zoom 110' || normalized === 'zoom-110' || normalized === 'slow-zoom-in' || normalized === 'slow-zoom') {
    return { motionPresetId: 'Zoom 150', motion: defaultZoom150Motion() };
  }
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

function cloneMotionValue(motion) {
  return motion && typeof motion === 'object' ? { ...motion } : motion;
}

function resolveVisualSwapPatch(row = {}, nextAssetId = '') {
  const motion = normalizeRowMotionForPreview(row);
  return {
    selectedAssetId: nextAssetId,
    motionPresetId: motion.motionPresetId,
    motion: cloneMotionValue(motion.motion),
  };
}

export function createRowCommands({
  store,
  ui,
  persistEditorState,
  isApprovalServiceMode,
  queueApprovalSnapshotOperations,
  scheduleApprovalMotionPersistence,
  createMotionDraft,
  updateSelectedVideoProjectCompositionPreview,
  renderSelectedVideoProject,
  getSaveTimer,
  setSaveTimer,
  cancelPendingEditorSave,
  beforeMutate,
  debounceMs,
}) {
  function clearPendingEditorSave() {
    if (typeof cancelPendingEditorSave === 'function') {
      cancelPendingEditorSave();
      return;
    }
    clearTimeout(getSaveTimer());
  }

  function notifyBeforeMutate(label, project, details = {}) {
    if (typeof beforeMutate === 'function') beforeMutate({ label, project, ...details });
  }

  async function updateRow(rowId, patch, options = {}) {
    const suppressRender = options?.render === false;
    const preserveSelection = options?.preserveSelection === true;
    const state = store.getState();
    const project = state.selectedVideoProject;
    if (!project || !rowId) return;

    const rows = applyAlternatingBoundaryTransitionDefaults(
      mergeDerivedParagraphBoundaryMetadata(
        Array.isArray(project._editorRows) ? project._editorRows : [],
        project.guion_piped || project.editor_state?.guion_piped || '',
      ),
    );
    project._editorRows = rows;
    const index = rows.findIndex((r) => r.id === rowId);
    if (index === -1) return;
    const preservedSelectedRowId = preserveSelection ? rowId : project._selectedEditorRowId;
    const currentPreviewSeekTime = Number(project._previewSeekTime);
    const preservedSeekTime = preserveSelection
      ? (Number.isFinite(currentPreviewSeekTime) ? currentPreviewSeekTime : Number(rows[index]?.startTime ?? 0))
      : project._previewSeekTime;
    const meaningfulChange = rowsWouldChange(rows, rowId, patch);
    if (!meaningfulChange) return;
    notifyBeforeMutate('update-row', project, { rowId, patch });

    if (isApprovalServiceMode(project)) {
      const operations = [];
      const shouldDraftMotion = isMotionRowPatch(patch);
      const shouldDraftVideoForeground = isVideoForegroundTransformPatch(rows[index], patch);
      if (patch.selectedAssetId !== undefined) {
        const currentMediaMode = patch.mediaMode || rows[index]?.mediaMode;
        operations.push({ type: 'setRowImage', rowId, asset: resolveApprovalRowImageAsset(project, patch.selectedAssetId), ...(currentMediaMode ? { mediaMode: currentMediaMode } : {}) });
      }
      if (patch.mediaMode !== undefined) operations.push({ type: 'setRowMediaMode', rowId, mediaMode: patch.mediaMode, media: patch.media });
      if (patch.media?.kind === 'video-segment') {
        const operation = { type: 'setRowVideoSegment', rowId, sourceVideoAssetId: patch.media.sourceVideoAssetId, sourceVideoSrc: patch.media.sourceVideoSrc, sourceInSeconds: patch.media.sourceInSeconds, durationSeconds: patch.media.durationSeconds, foregroundTransform: patch.media.foregroundTransform };
        if (shouldDraftVideoForeground) {
          const localMediaPatch = { media: { ...rows[index].media, foregroundTransform: { ...patch.media.foregroundTransform } } };
          project._editorRows = patchLocalEditorRows(rows, rowId, localMediaPatch);
          project.editor_state = normalizeEditorState({ ...project.editor_state, timed_rows: project._editorRows, dirty: true, phase: 'editing_dirty' });
          createMotionDraft(rowId, operation, localMediaPatch, `${rowId}:video-foreground`);
          updateSelectedVideoProjectCompositionPreview({ project });
          scheduleApprovalMotionPersistence(project);
        } else {
          operations.push(operation);
        }
      }
      if (isBoundaryTransitionPatch(patch)) {
        const transition = ['whip', 'glitch-1', 'glitch-2'].includes(patch.boundaryTransition) ? patch.boundaryTransition : 'none';
        operations.push({ type: 'setBoundaryTransition', rowId, nextRowId: patch.nextRowId || rows[index]?.nextRowId, paragraphBoundaryAfter: rows[index]?.paragraphBoundaryAfter === true, transition, transitionSource: 'manual', ...(transition === 'whip' ? { direction: WHIP_TRANSITION_CONFIG.direction } : {}) });
      }
      if (patch.motion !== undefined || patch.motionPresetId !== undefined) {
        const resolvedMotion = patch.motionPresetId
          ? { motionPresetId: patch.motionPresetId, motion: typeof patch.motion === 'object' ? patch.motion : undefined }
          : resolveMotionPatchForApprovalService(patch.motion);
        if (shouldDraftMotion) {
          const localMotionPatch = { motionPresetId: resolvedMotion.motionPresetId, motion: resolvedMotion.motion };
          project._editorRows = patchLocalEditorRows(rows, rowId, localMotionPatch);
          project.editor_state = normalizeEditorState({ ...project.editor_state, timed_rows: project._editorRows, dirty: true, phase: 'editing_dirty' });
          createMotionDraft(rowId, { type: 'setRowMotion', rowId, ...resolvedMotion }, localMotionPatch);
          updateSelectedVideoProjectCompositionPreview({ project });
          scheduleApprovalMotionPersistence(project);
        } else {
          operations.push({ type: 'setRowMotion', rowId, ...resolvedMotion });
        }
      }
      if (patch.dust !== undefined) {
        const localDustPatch = { dust: { ...(rows[index]?.dust || {}), enabled: Boolean(patch.dust?.enabled), type: patch.dust?.type || rows[index]?.dust?.type || 'dust-1', assetId: patch.dust?.enabled ? (patch.dust?.type || rows[index]?.dust?.type || 'dust-1') : null } };
        project._editorRows = patchLocalEditorRows(project._editorRows, rowId, localDustPatch);
        project.editor_state = normalizeEditorState({ ...project.editor_state, timed_rows: project._editorRows, dirty: true, phase: 'editing_dirty' });
        createMotionDraft(rowId, { type: 'setRowDust', rowId, enabled: localDustPatch.dust.enabled, dustType: localDustPatch.dust.type }, localDustPatch, `${rowId}:dust`);
        updateSelectedVideoProjectCompositionPreview({ project });
        scheduleApprovalMotionPersistence(project);
      }
      if (patch.newspaper !== undefined) {
        const localNewspaperPatch = { newspaper: { ...(rows[index]?.newspaper || {}), ...(patch.newspaper || {}) } };
        project._editorRows = patchLocalEditorRows(project._editorRows, rowId, localNewspaperPatch);
        project.editor_state = normalizeEditorState({ ...project.editor_state, timed_rows: project._editorRows, dirty: true, phase: 'editing_dirty' });
        createMotionDraft(rowId, { type: 'setRowNewspaper', rowId, newspaper: localNewspaperPatch.newspaper }, localNewspaperPatch, `${rowId}:newspaper`);
        updateSelectedVideoProjectCompositionPreview({ project });
        scheduleApprovalMotionPersistence(project);
      }
      if (patch.logo !== undefined) {
        const localLogoPatch = { logo: { enabled: patch.logo?.enabled !== false, source: patch.logo?.source || rows[index]?.logo?.source || 'logo-alpha.webm', assetId: patch.logo?.assetId || rows[index]?.logo?.assetId || null } };
        project._editorRows = project._editorRows.map((row) => mergeLocalEditorRowPatch(row, localLogoPatch));
        project.editor_state = normalizeEditorState({ ...project.editor_state, timed_rows: project._editorRows, dirty: true, phase: 'editing_dirty' });
        project._editorRows.forEach((row) => createMotionDraft(row.id, row.id === rowId ? { type: 'setLogo', enabled: localLogoPatch.logo.enabled, source: localLogoPatch.logo.source, assetId: localLogoPatch.logo.assetId } : null, localLogoPatch, `${rowId}:logo`));
        updateSelectedVideoProjectCompositionPreview({ project });
        scheduleApprovalMotionPersistence(project);
      }
      if (!operations.length) return;
      try {
        await queueApprovalSnapshotOperations(project, operations, { phase: 'editing_dirty' });
        if (suppressRender) updateSelectedVideoProjectCompositionPreview({ project });
      } catch (err) {
        const canFallbackVideoSegment = patch.media?.kind === 'video-segment'
          && operations.length === 1
          && operations[0]?.type === 'setRowVideoSegment'
          && shouldFallbackApprovalSnapshotOperationError(err, 'setRowVideoSegment');
        const canFallbackMediaMode = isMediaModeRowPatch(patch)
          && operations.length === 1
          && operations[0]?.type === 'setRowMediaMode'
          && shouldFallbackApprovalSnapshotOperationError(err, 'setRowMediaMode');
        const canFallbackNewspaper = isNewspaperRowPatch(patch)
          && operations.length === 1
          && operations[0]?.type === 'setRowNewspaper'
          && shouldFallbackApprovalSnapshotOperationError(err, 'setRowNewspaper');
        if (canFallbackVideoSegment || canFallbackMediaMode || canFallbackNewspaper) {
          project._editorRows = patchLocalEditorRows(rows, rowId, patch);
          const compositionHash = computeCompositionHash(project);
          await persistEditorState(project, { timed_rows: project._editorRows, composition_hash: compositionHash, dirty: true, phase: 'editing_dirty', error: '' });
          updateSelectedVideoProjectCompositionPreview({ project });
          return;
        }
        console.error(err);
        project.editor_state = normalizeEditorState({ ...project.editor_state, phase: 'error', error: `Fila ${rowId}: ${err?.message || 'No se pudo actualizar snapshot'}` });
        ui.toast('Error actualizando snapshot');
        throw err;
      } finally {
        if (preserveSelection) {
          project._selectedEditorRowId = preservedSelectedRowId;
          if (Number.isFinite(preservedSeekTime)) project._previewSeekTime = preservedSeekTime;
        }
        if (preserveSelection && !suppressRender) preservePreviewSeekDuringNextRender(project);
        if (!suppressRender) renderSelectedVideoProject();
        if (preserveSelection) {
          project._selectedEditorRowId = preservedSelectedRowId;
          if (Number.isFinite(preservedSeekTime)) project._previewSeekTime = preservedSeekTime;
        }
      }
      return;
    }

    const localPatch = isBoundaryTransitionPatch(patch)
      ? resolveBoundaryTransitionPatch(patch.boundaryTransition, { source: 'manual' })
      : patch;
    project._editorRows = patchLocalEditorRows(rows, rowId, localPatch);
    const compositionHash = computeCompositionHash(project);
    const lastRenderedHash = project.editor_state?.last_rendered_hash || project.editor_state?.last_preview_hash || project.editor_state?.composition_hash || '';
    const isDirty = compositionHash !== lastRenderedHash;
    project.editor_state = normalizeEditorState({ ...project.editor_state, dirty: isDirty, phase: isDirty ? 'editing_dirty' : (project.editor_state?.phase || 'preview_ready') });

    if (suppressRender || patch.manualMotionDraft === true || isMotionRowPatch(patch) || isNewspaperRowPatch(patch)) updateSelectedVideoProjectCompositionPreview({ project });
    else {
      if (preserveSelection) preservePreviewSeekDuringNextRender(project);
      renderSelectedVideoProject();
    }
    if (preserveSelection) {
      project._selectedEditorRowId = preservedSelectedRowId;
      if (Number.isFinite(preservedSeekTime)) project._previewSeekTime = preservedSeekTime;
    }

    clearPendingEditorSave();
    setSaveTimer(setTimeout(() => {
      void persistEditorState(project, { timed_rows: project._editorRows, dirty: isDirty, phase: isDirty ? 'editing_dirty' : (project.editor_state?.phase || 'preview_ready') });
    }, debounceMs));
  }

  async function swapRowImages(sourceRowId, targetRowId) {
    const state = store.getState();
    const project = state.selectedVideoProject;
    if (!project || !sourceRowId || !targetRowId || sourceRowId === targetRowId) return;

    const rows = Array.isArray(project._editorRows) ? project._editorRows : [];
    const sourceRow = rows.find((row) => row.id === sourceRowId);
    const targetRow = rows.find((row) => row.id === targetRowId);
    if (!sourceRow || !targetRow) return;
    if (sourceRow.media?.kind === 'video-segment' || targetRow.media?.kind === 'video-segment') return;

    const sourceAssetId = sourceRow.selectedAssetId || '';
    const targetAssetId = targetRow.selectedAssetId || '';
    if (!sourceAssetId || !targetAssetId || sourceAssetId === targetAssetId) return;
    notifyBeforeMutate('swap-row-images', project, { sourceRowId, targetRowId });

    if (isApprovalServiceMode(project)) {
      const sourceMotion = normalizeRowMotionForPreview(sourceRow);
      const targetMotion = normalizeRowMotionForPreview(targetRow);
      const operations = [
        { type: 'setRowImage', rowId: sourceRowId, asset: resolveApprovalRowImageAsset(project, targetAssetId) },
        { type: 'setRowImage', rowId: targetRowId, asset: resolveApprovalRowImageAsset(project, sourceAssetId) },
        { type: 'setRowMotion', rowId: sourceRowId, motionPresetId: targetMotion.motionPresetId, motion: cloneMotionValue(targetMotion.motion) },
        { type: 'setRowMotion', rowId: targetRowId, motionPresetId: sourceMotion.motionPresetId, motion: cloneMotionValue(sourceMotion.motion) },
      ];
      try {
        await queueApprovalSnapshotOperations(project, operations, { phase: 'editing_dirty' });
      } catch (err) {
        console.error(err);
        project.editor_state = normalizeEditorState({ ...project.editor_state, phase: 'error', error: `Intercambio de imágenes: ${err?.message || 'No se pudo actualizar snapshot'}` });
        ui.toast('Error intercambiando imágenes');
        throw err;
      } finally {
        renderSelectedVideoProject();
      }
      return;
    }

    project._editorRows = patchLocalEditorRows(
      patchLocalEditorRows(rows, sourceRowId, resolveVisualSwapPatch(targetRow, targetAssetId)),
      targetRowId,
      resolveVisualSwapPatch(sourceRow, sourceAssetId),
    );
    const compositionHash = computeCompositionHash(project);
    const lastRenderedHash = project.editor_state?.last_rendered_hash || project.editor_state?.last_preview_hash || project.editor_state?.composition_hash || '';
    const isDirty = compositionHash !== lastRenderedHash;
    project.editor_state = normalizeEditorState({ ...project.editor_state, dirty: isDirty, phase: isDirty ? 'editing_dirty' : (project.editor_state?.phase || 'preview_ready') });
    updateSelectedVideoProjectCompositionPreview({ project });
    renderSelectedVideoProject();

    clearPendingEditorSave();
    setSaveTimer(setTimeout(() => {
      void persistEditorState(project, { timed_rows: project._editorRows, dirty: isDirty, phase: isDirty ? 'editing_dirty' : (project.editor_state?.phase || 'preview_ready') });
    }, debounceMs));
  }

  return { updateRow, swapRowImages };
}

export function normalizeRowsForPreview(project) {
  if (!Array.isArray(project?._editorRows) || !project._editorRows.length) {
    project._editorRows = normalizePreparedContractRows(project?.editor_state?.timed_rows);
  }
  if (Array.isArray(project?._editorRows) && project._editorRows.length) {
    project._editorRows = mergeDerivedParagraphBoundaryMetadata(project._editorRows, project.guion_piped || project.editor_state?.guion_piped || '');
  }
  return project?._editorRows || [];
}

export { buildCompositionPayload };
