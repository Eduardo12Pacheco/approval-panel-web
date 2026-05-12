import { normalizePreparedContractRows } from '../data/contract-pipeline-client.js';
import { normalizeEditorState, normalizeGlobalAudioState } from '../domain/editor-state.js';
import { applyPendingMotionDrafts } from './row-commands.js';

export function createApprovalSnapshotOperations({
  api,
  store,
  ui,
  persistEditorState,
  renderSelectedVideoProject,
  debounceMs = 400,
}) {
  let approvalMotionSaveTimer = null;
  let approvalMotionDraftRevision = 0;
  let approvalCommitQueue = Promise.resolve();
  const pendingApprovalMotionOperations = new Map();
  const pendingApprovalMotionDrafts = new Map();

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
    project._editorRows = applyPendingMotionDrafts(normalizePreparedContractRows(snapshot.rows), pendingApprovalMotionDrafts);
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

  function queueApprovalSnapshotOperations(project, operations = [], options = {}) {
    const run = approvalCommitQueue
      .catch(() => {})
      .then(() => commitApprovalSnapshotOperations(project, operations, options));
    approvalCommitQueue = run.catch(() => {});
    return run;
  }

  function scheduleApprovalMotionPersistence(project) {
    clearTimeout(approvalMotionSaveTimer);
    approvalMotionSaveTimer = setTimeout(() => {
      const pending = Array.from(pendingApprovalMotionOperations.entries());
      pendingApprovalMotionOperations.clear();
      const operations = pending.map(([, entry]) => entry.operation);
      if (!operations.length) return;

      void queueApprovalSnapshotOperations(project, operations, { phase: 'editing_dirty' })
        .then(() => {
          pending.forEach(([rowId, entry]) => {
            const currentDraft = pendingApprovalMotionDrafts.get(rowId);
            if (currentDraft?.revision === entry.revision) pendingApprovalMotionDrafts.delete(rowId);
          });
        })
        .catch((err) => {
          console.error(err);
          project.editor_state = normalizeEditorState({ ...project.editor_state, phase: 'error', error: err?.message || 'No se pudo actualizar snapshot' });
          ui.toast('Error actualizando snapshot');
        })
        .finally(() => {
          renderSelectedVideoProject();
        });
    }, debounceMs);
  }

  function createMotionDraft(rowId, operation, localPatch) {
    const revision = ++approvalMotionDraftRevision;
    pendingApprovalMotionDrafts.set(rowId, { patch: localPatch, revision });
    pendingApprovalMotionOperations.set(rowId, { operation, revision });
  }

  return {
    createApprovalServiceClient,
    isApprovalServiceMode,
    applyCanonicalSnapshot,
    commitApprovalSnapshotOperations,
    queueApprovalSnapshotOperations,
    scheduleApprovalMotionPersistence,
    createMotionDraft,
  };
}
