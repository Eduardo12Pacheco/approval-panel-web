import { normalizePreparedContractRows } from '../data/contract-pipeline-client.js';
import { normalizeEditorState, normalizeGlobalAudioState } from '../domain/editor-state.js';
import { applyPendingMotionDrafts } from './row-commands.js';

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
        || operation?.type === 'setRowMotion'
        || operation?.type === 'setRowVideoSegment'
        || operation?.type === 'setBoundaryTransition');
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
        const latestSnapshot = await fetchLatestApprovalSnapshot(client, projectId).catch(() => null);
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
    cancelPendingApprovalDrafts,
    createMotionDraft,
    createSnapshotDraft,
  };
}
