import { normalizePreparedContractRows } from '../data/contract-pipeline-client.js';
import { normalizeEditorState, normalizeGlobalAudioState } from '../domain/editor-state.js';
import { applyPendingMotionDrafts } from './row-commands.js';

const AUTOMATIC_BOUNDARY_TRANSITIONS = new Set(['glitch-1', 'glitch-2', 'glitch-3']);

function toPositiveFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function toFiniteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function resolveEditorRowId(row = {}) {
  return (row?.id || row?.rowId || '').toString().trim();
}

function hasSameGeometry(motion = {}, geometry = {}) {
  return Number(motion.imageWidth) === Number(geometry.imageWidth)
    && Number(motion.imageHeight) === Number(geometry.imageHeight)
    && Number(motion.panViewportWidth) === Number(geometry.panViewportWidth)
    && Number(motion.panViewportHeight) === Number(geometry.panViewportHeight);
}

function hasCompleteRenderGeometry(motion = {}) {
  return Boolean(
    toPositiveFiniteNumber(motion?.imageWidth)
    && toPositiveFiniteNumber(motion?.imageHeight)
    && toPositiveFiniteNumber(motion?.panViewportWidth)
    && toPositiveFiniteNumber(motion?.panViewportHeight),
  );
}

function isAutomaticBoundaryTransitionRow(row = {}) {
  return Boolean(
    row?.paragraphBoundaryAfter === true
    && (row?.nextRowId || '').toString().trim()
    && row?.transitionSource === 'auto'
    && AUTOMATIC_BOUNDARY_TRANSITIONS.has((row?.transition || '').toString().trim()),
  );
}

function hasSameAutomaticBoundaryTransition(snapshotRow = {}, editorRow = {}) {
  return snapshotRow?.paragraphBoundaryAfter === true
    && (snapshotRow?.nextRowId || '').toString().trim() === (editorRow?.nextRowId || '').toString().trim()
    && snapshotRow?.transitionSource === 'auto'
    && (snapshotRow?.transition || '').toString().trim() === (editorRow?.transition || '').toString().trim();
}

export function buildAutomaticBoundaryTransitionOperations(project = {}) {
  const rows = Array.isArray(project?._editorRows) ? project._editorRows : [];
  if (!rows.length) return [];
  const snapshotRows = Array.isArray(project?.editor_state?.approval_contract_snapshot?.rows)
    ? project.editor_state.approval_contract_snapshot.rows
    : [];
  const snapshotRowsById = new Map(
    snapshotRows
      .map((row) => [resolveEditorRowId(row), row])
      .filter(([rowId]) => rowId),
  );

  return rows
    .filter(isAutomaticBoundaryTransitionRow)
    .filter((row) => !hasSameAutomaticBoundaryTransition(snapshotRowsById.get(resolveEditorRowId(row)), row))
    .map((row) => ({
      type: 'setBoundaryTransition',
      rowId: resolveEditorRowId(row),
      nextRowId: (row.nextRowId || '').toString().trim(),
      paragraphBoundaryAfter: true,
      transition: row.transition,
      transitionSource: 'auto',
    }));
}

function normalizeForegroundTransform(value) {
  if (!value || typeof value !== 'object') return null;
  const rawScale = Number(value.scale || 1);
  return {
    x: toFiniteNumber(value.x, 0),
    y: toFiniteNumber(value.y, 0),
    scale: Math.max(0.1, Number.isFinite(rawScale) ? rawScale : 1),
  };
}

function hasSameForegroundTransform(left, right) {
  const normalizedLeft = normalizeForegroundTransform(left);
  const normalizedRight = normalizeForegroundTransform(right);
  if (!normalizedLeft || !normalizedRight) return false;
  return Math.abs(normalizedLeft.x - normalizedRight.x) < 0.000001
    && Math.abs(normalizedLeft.y - normalizedRight.y) < 0.000001
    && Math.abs(normalizedLeft.scale - normalizedRight.scale) < 0.000001;
}

function resolveVideoSegmentDuration(row = {}, media = {}) {
  const mediaDuration = toPositiveFiniteNumber(media.durationSeconds);
  if (mediaDuration) return mediaDuration;
  const startTime = toFiniteNumber(row.startTime, 0);
  const endTime = Number.isFinite(Number(row.effectiveEndTime)) ? Number(row.effectiveEndTime) : Number(row.endTime);
  const rowDuration = endTime - startTime;
  return Number.isFinite(rowDuration) && rowDuration > 0 ? rowDuration : null;
}

export function buildApprovalVideoForegroundTransformOperations(project = {}) {
  const rows = Array.isArray(project?._editorRows) && project._editorRows.length
    ? normalizePreparedContractRows(project._editorRows)
    : normalizePreparedContractRows(project?.editor_state?.timed_rows);
  if (!rows.length) return [];
  const snapshotRows = Array.isArray(project?.editor_state?.approval_contract_snapshot?.rows)
    ? project.editor_state.approval_contract_snapshot.rows
    : [];
  const snapshotRowsById = new Map(
    snapshotRows
      .map((row) => [resolveEditorRowId(row), row])
      .filter(([rowId]) => rowId),
  );

  const operations = [];
  for (const row of rows) {
    const rowId = resolveEditorRowId(row);
    const media = row?.media || {};
    const localTransform = normalizeForegroundTransform(media.foregroundTransform);
    if (!rowId || media.kind !== 'video-segment' || !localTransform) continue;

    const snapshotRow = snapshotRowsById.get(rowId);
    if (hasSameForegroundTransform(localTransform, snapshotRow?.media?.foregroundTransform)) continue;

    const sourceVideoAssetId = (media.sourceVideoAssetId || media.assetId || snapshotRow?.media?.sourceVideoAssetId || '').toString().trim();
    const sourceVideoSrc = (media.sourceVideoSrc || media.previewUrl || media.renderPath || media.publicUrl || snapshotRow?.media?.sourceVideoSrc || '').toString().trim();
    const durationSeconds = resolveVideoSegmentDuration(row, media);
    if ((!sourceVideoAssetId && !sourceVideoSrc) || !durationSeconds) continue;

    operations.push({
      type: 'setRowVideoSegment',
      rowId,
      sourceVideoAssetId,
      sourceVideoSrc,
      sourceInSeconds: Math.max(0, toFiniteNumber(media.sourceInSeconds, 0)),
      durationSeconds,
      foregroundTransform: localTransform,
    });
  }
  return operations;
}

export function buildApprovalRenderGeometryMotionOperations(project = {}, renderGeometryByRowId = {}) {
  const rows = Array.isArray(project?._editorRows) && project._editorRows.length
    ? project._editorRows
    : normalizePreparedContractRows(project?.editor_state?.timed_rows || project?.editor_state?.approval_contract_snapshot?.rows);
  const operations = [];
  const missingGeometryRowIds = [];
  for (const row of rows) {
    const rowId = resolveEditorRowId(row);
    if (!rowId || row?.media?.kind === 'video-segment' || !row?.selectedAssetId || !row?.motion || typeof row.motion !== 'object') continue;
    const sourceGeometry = renderGeometryByRowId?.[rowId];
    const geometry = {
      imageWidth: toPositiveFiniteNumber(sourceGeometry?.imageWidth),
      imageHeight: toPositiveFiniteNumber(sourceGeometry?.imageHeight),
      panViewportWidth: toPositiveFiniteNumber(sourceGeometry?.panViewportWidth),
      panViewportHeight: toPositiveFiniteNumber(sourceGeometry?.panViewportHeight),
    };
    if (!geometry.imageWidth || !geometry.imageHeight || !geometry.panViewportWidth || !geometry.panViewportHeight) {
      if (!hasCompleteRenderGeometry(row.motion)) missingGeometryRowIds.push(rowId);
      continue;
    }
    if (hasSameGeometry(row.motion, geometry)) continue;
    operations.push({
      type: 'setRowMotion',
      rowId,
      motionPresetId: row.motionPresetId || row.motion?.motionPresetId || 'custom',
      motion: { ...row.motion, ...geometry },
    });
  }
  if (missingGeometryRowIds.length) {
    throw new Error(`No se pudo resolver geometry de render para las filas de imagen: ${missingGeometryRowIds.join(', ')}. Actualizá la preview o verificá que las imágenes carguen antes del render final.`);
  }
  return operations;
}

export function createApprovalSnapshotOperations({
  api,
  store,
  ui,
  persistEditorState,
  renderSelectedVideoProject,
  updateSelectedVideoProjectCompositionPreview,
  debounceMs = 400,
}) {
  let approvalMotionSaveTimer = null;
  let approvalMotionDraftRevision = 0;
  let approvalQueueRevision = 0;
  let approvalCommitQueue = Promise.resolve();
  const pendingApprovalMotionOperations = new Map();
  const pendingApprovalMotionDrafts = new Map();
  const pendingApprovalSnapshotDrafts = new Map();

  function createApprovalServiceClient(project) {
    const baseUrl = (project?.editor_state?.pipeline_base_url || store.getState()?.settings?.approvalPipelineBaseUrl || '').toString().trim();
    if (!baseUrl || typeof api?.createApprovalPipelineClient !== 'function') return null;
    return api.createApprovalPipelineClient({ resolveBaseUrl: () => baseUrl });
  }

  function isApprovalServiceMode(project) {
    return project?.editor_state?.pipeline_provider === 'approval' && Boolean(project?.editor_state?.approval_contract_snapshot?.snapshotHash);
  }

  function resolveApprovalSnapshotProjectId(project) {
    return (
      project?.editor_state?.approval_contract_snapshot?.projectId
      || project?.editor_state?.remotion_project_id
      || ''
    ).toString().trim();
  }

  function applyCanonicalSnapshot(project, snapshot, { dirty = false, phase = 'preview_ready' } = {}) {
    if (!snapshot?.contractVersion) return;
    const snapshotDraft = Array.from(pendingApprovalSnapshotDrafts.values()).reduce((next, entry) => entry.apply(next), snapshot);
    project._editorRows = applyPendingMotionDrafts(normalizePreparedContractRows(snapshotDraft.rows), pendingApprovalMotionDrafts);
    project._globalAudio = normalizeGlobalAudioState(snapshotDraft.audio);
    project.editor_state = normalizeEditorState({
      ...project.editor_state,
      approval_contract_snapshot: snapshotDraft,
      snapshot_id: snapshotDraft.snapshotId,
      snapshot_hash: snapshotDraft.snapshotHash,
      timed_rows: project._editorRows,
      global_audio: project._globalAudio,
      composition_hash: snapshotDraft.snapshotHash,
      last_preview_hash: snapshotDraft.snapshotHash,
      dirty,
      phase,
    });
  }

  function isStaleBaseSnapshotHashError(error) {
    const message = (error?.message || error?.error?.message || '').toString();
    return error?.code === 'version_conflict' || error?.status === 409 || /stale\s+baseSnapshotHash/i.test(message) || (/baseSnapshotHash/i.test(message) && /stale|conflict|409/i.test(message));
  }

  function isLeaseHeldError(error) {
    return error?.code === 'lease_held' || error?.status === 423;
  }

  function canAutoRetryStaleSnapshotOperations(operations = []) {
    return Array.isArray(operations)
      && operations.length > 0
      && operations.every((operation) => operation?.type === 'setRowImage'
        || operation?.type === 'setRowMediaMode'
        || operation?.type === 'setRowMotion'
        || operation?.type === 'setRowNewspaper'
        || operation?.type === 'setRowVideoSegment'
        || operation?.type === 'setBoundaryTransition'
        || operation?.type === 'setBrandChannel');
  }

  function toConflictState(error, localBaseSnapshotHash) {
    const details = error?.details && typeof error.details === 'object' ? error.details : {};
    return {
      code: error?.code || (isLeaseHeldError(error) ? 'lease_held' : 'version_conflict'),
      message: error?.message || 'Approval editor conflict',
      local_base_snapshot_hash: localBaseSnapshotHash || '',
      expected_version: details.expected_version ?? null,
      received_version: details.received_version ?? null,
      owner: details.owner || null,
      expires_at: details.expires_at || '',
      local_edits_preserved: true,
    };
  }

  function extractSnapshot(payload) {
    return payload?.snapshot || payload?.data?.snapshot || null;
  }

  function extractLatestConflictSnapshot(error) {
    return error?.details?.latest?.snapshot || error?.details?.latest?.data?.snapshot || null;
  }

  async function fetchLatestApprovalSnapshot(client, projectId) {
    if (typeof client?.snapshot !== 'function') return null;
    const latest = await client.snapshot(projectId);
    return extractSnapshot(latest);
  }

  async function commitApprovalSnapshotOperations(project, operations = [], { phase = 'preview_ready', baseSnapshotHashOverride = '' } = {}) {
    const client = createApprovalServiceClient(project);
    if (!client) throw new Error('Approval editor service no configurado');
    const projectId = resolveApprovalSnapshotProjectId(project);
    if (!projectId) throw new Error('Approval editor service no tiene projectId de snapshot');
    const baseSnapshotHash = baseSnapshotHashOverride || project.editor_state?.snapshot_hash || project.editor_state?.approval_contract_snapshot?.snapshotHash;
    const updateWithHash = (hash) => client.updateSnapshot(projectId, { baseSnapshotHash: hash, operations });
    let result;
    try {
      result = await updateWithHash(baseSnapshotHash);
    } catch (err) {
      if (isStaleBaseSnapshotHashError(err) && canAutoRetryStaleSnapshotOperations(operations)) {
        const latestSnapshot = extractLatestConflictSnapshot(err) || await fetchLatestApprovalSnapshot(client, projectId).catch(() => null);
        const latestHash = latestSnapshot?.snapshotHash || '';
        if (latestHash && latestHash !== baseSnapshotHash) {
          applyCanonicalSnapshot(project, latestSnapshot, { dirty: true, phase });
          try {
            result = await updateWithHash(latestHash);
          } catch (retryError) {
            err = retryError;
          }
        }
      }
      if (result) {
        // Continue with normal canonical snapshot application below.
      } else if (!isStaleBaseSnapshotHashError(err) && !isLeaseHeldError(err)) {
        throw err;
      } else {
        project.editor_state = normalizeEditorState({
          ...project.editor_state,
          phase: 'conflict',
          dirty: true,
          conflict: toConflictState(err, baseSnapshotHash),
        });
        throw err;
      }
    }
    const snapshot = extractSnapshot(result);
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

  function queueApprovalSnapshotOperations(project, operations = [], options = {}) {
    const queueRevision = approvalQueueRevision;
    const run = approvalCommitQueue
      .catch(() => {})
      .then(() => {
        if (queueRevision !== approvalQueueRevision) return null;
        return commitApprovalSnapshotOperations(project, operations, options);
      });
    approvalCommitQueue = run.catch(() => {});
    return run;
  }

  function cancelPendingApprovalDrafts({ neutralizeQueue = false } = {}) {
    const hadTimer = approvalMotionSaveTimer !== null;
    if (hadTimer) clearTimeout(approvalMotionSaveTimer);
    approvalMotionSaveTimer = null;

    const motionOperations = pendingApprovalMotionOperations.size;
    const motionDrafts = pendingApprovalMotionDrafts.size;
    const snapshotDrafts = pendingApprovalSnapshotDrafts.size;
    pendingApprovalMotionOperations.clear();
    pendingApprovalMotionDrafts.clear();
    pendingApprovalSnapshotDrafts.clear();
    approvalMotionDraftRevision += 1;
    if (neutralizeQueue) approvalQueueRevision += 1;

    return {
      canceledTimer: hadTimer,
      clearedOperations: motionOperations,
      clearedMotionDrafts: motionDrafts,
      clearedSnapshotDrafts: snapshotDrafts,
      invalidated: hadTimer || motionOperations > 0 || motionDrafts > 0 || snapshotDrafts > 0 || neutralizeQueue,
      revision: approvalMotionDraftRevision,
      queueRevision: approvalQueueRevision,
    };
  }

  function scheduleApprovalMotionPersistence(project) {
    clearTimeout(approvalMotionSaveTimer);
    approvalMotionSaveTimer = setTimeout(() => {
      const pending = Array.from(pendingApprovalMotionOperations.entries());
      pendingApprovalMotionOperations.clear();
      const operations = pending.map(([, entry]) => entry.operation).filter(Boolean);
      if (!operations.length) return;

      void queueApprovalSnapshotOperations(project, operations, { phase: 'editing_dirty' })
        .then(() => {
          pending.forEach(([operationKey, entry]) => {
            const rowId = entry.rowId || operationKey;
            const currentDraft = pendingApprovalMotionDrafts.get(rowId);
            if (currentDraft?.revision === entry.revision) pendingApprovalMotionDrafts.delete(rowId);
            const currentSnapshotDraft = pendingApprovalSnapshotDrafts.get(operationKey);
            if (currentSnapshotDraft?.revision === entry.revision) pendingApprovalSnapshotDrafts.delete(operationKey);
          });
        })
        .catch((err) => {
          console.error(err);
          const context = resolveOperationErrorContext(operations[0]);
          const message = err?.message || 'No se pudo actualizar snapshot';
          project.editor_state = normalizeEditorState({ ...project.editor_state, phase: 'error', error: context ? `${context}: ${message}` : message });
          ui.toast('Error actualizando snapshot');
        })
        .finally(() => {
          if (!updateSelectedVideoProjectCompositionPreview?.({ project })) {
            renderSelectedVideoProject();
          }
        });
    }, debounceMs);
  }

  async function flushPendingApprovalDrafts(project, { renderGeometryByRowId = {}, includeRenderGeometry = true } = {}) {
    if (approvalMotionSaveTimer !== null) {
      clearTimeout(approvalMotionSaveTimer);
      approvalMotionSaveTimer = null;
    }

    const pending = Array.from(pendingApprovalMotionOperations.entries());
    const pendingOperationKeys = new Set(pending.map(([operationKey]) => operationKey));
    const geometryOperations = includeRenderGeometry ? buildApprovalRenderGeometryMotionOperations(project, renderGeometryByRowId) : [];
    const automaticBoundaryOperations = buildAutomaticBoundaryTransitionOperations(project);
    const videoForegroundOperations = buildApprovalVideoForegroundTransformOperations(project)
      .filter((operation) => !pendingOperationKeys.has(`${operation.rowId}:video-foreground`));
    if (!pending.length && !geometryOperations.length && !automaticBoundaryOperations.length && !videoForegroundOperations.length) {
      await approvalCommitQueue.catch(() => {});
      return {
        flushedOperations: 0,
        snapshotHash: project?.editor_state?.snapshot_hash || project?.editor_state?.approval_contract_snapshot?.snapshotHash || '',
      };
    }

    pendingApprovalMotionOperations.clear();
    const operations = [
      ...pending.map(([, entry]) => entry.operation).filter(Boolean),
      ...videoForegroundOperations,
      ...geometryOperations,
      ...automaticBoundaryOperations,
    ];
    if (!operations.length) {
      await approvalCommitQueue.catch(() => {});
      return {
        flushedOperations: 0,
        snapshotHash: project?.editor_state?.snapshot_hash || project?.editor_state?.approval_contract_snapshot?.snapshotHash || '',
      };
    }

    await queueApprovalSnapshotOperations(project, operations, { phase: 'editing_dirty' });
    pending.forEach(([operationKey, entry]) => {
      const rowId = entry.rowId || operationKey;
      const currentDraft = pendingApprovalMotionDrafts.get(rowId);
      if (currentDraft?.revision === entry.revision) pendingApprovalMotionDrafts.delete(rowId);
      const currentSnapshotDraft = pendingApprovalSnapshotDrafts.get(operationKey);
      if (currentSnapshotDraft?.revision === entry.revision) pendingApprovalSnapshotDrafts.delete(operationKey);
    });

    return {
      flushedOperations: operations.length,
      snapshotHash: project?.editor_state?.snapshot_hash || project?.editor_state?.approval_contract_snapshot?.snapshotHash || '',
    };
  }

  function resolveOperationErrorContext(operation = {}) {
    if (operation?.type === 'setAudio') return `Audio ${operation.kind === 'voice' ? 'voice' : 'music'}`;
    if (operation?.rowId) return `Fila ${operation.rowId}`;
    return '';
  }

  function createMotionDraft(rowId, operation, localPatch, operationKey = rowId) {
    const revision = ++approvalMotionDraftRevision;
    const previous = pendingApprovalMotionDrafts.get(rowId)?.patch || {};
    pendingApprovalMotionDrafts.set(rowId, { patch: { ...previous, ...localPatch }, revision });
    if (operation) pendingApprovalMotionOperations.set(operationKey, { operation, revision, rowId });
  }

  function createSnapshotDraft(operationKey, operation, apply) {
    const revision = ++approvalMotionDraftRevision;
    pendingApprovalSnapshotDrafts.set(operationKey, { apply, revision });
    if (operation) pendingApprovalMotionOperations.set(operationKey, { operation, revision });
  }

  return {
    createApprovalServiceClient,
    isApprovalServiceMode,
    resolveApprovalSnapshotProjectId,
    applyCanonicalSnapshot,
    commitApprovalSnapshotOperations,
    queueApprovalSnapshotOperations,
    scheduleApprovalMotionPersistence,
    flushPendingApprovalDrafts,
    cancelPendingApprovalDrafts,
    createMotionDraft,
    createSnapshotDraft,
  };
}
