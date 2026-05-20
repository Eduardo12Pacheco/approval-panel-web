import { normalizeEditorState, normalizeGlobalAudioState } from '../domain/editor-state.js';
import { normalizePreparedContractRows } from '../data/contract-pipeline-client.js';

export function setVideoProjectStep(project, step) {
  if (!project) return;
  project._videoProjectStep = step === 'audio' ? 'audio' : 'images';
}

function resolveEditorRowId(row = {}) {
  return (row?.rowId || row?.id || '').toString().trim();
}

export function mergeHydratedEditorRows(contractRows = [], timedRows = []) {
  const canonicalRows = Array.isArray(contractRows) ? contractRows : [];
  const persistedRows = Array.isArray(timedRows) ? timedRows : [];
  if (!canonicalRows.length) return persistedRows;
  if (!persistedRows.length) return canonicalRows;

  const persistedById = new Map(
    persistedRows
      .map((row) => [resolveEditorRowId(row), row])
      .filter(([rowId]) => rowId),
  );
  const mergedRows = canonicalRows.map((row) => {
    const rowId = resolveEditorRowId(row);
    const persisted = persistedById.get(rowId);
    if (!persisted) return row;
    persistedById.delete(rowId);
    return { ...row, ...persisted };
  });
  return [...mergedRows, ...persistedById.values()];
}

export function hydrateSelectedProjectState(project) {
  if (!project) return;
  project.editor_state = normalizeEditorState(project.editor_state || {});
  const editorState = project.editor_state;
  const timedRows = normalizePreparedContractRows(editorState.timed_rows);
  const contractRows = normalizePreparedContractRows(editorState.approval_contract_snapshot?.rows);
  if (contractRows.length) project._editorRows = mergeHydratedEditorRows(contractRows, timedRows);
  else if (timedRows.length) project._editorRows = timedRows;
  project._previewAssets = editorState.preview_assets || null;
  if (Array.isArray(editorState.video_assets)) {
    project.video_assets = editorState.video_assets;
  }
  project._globalAudio = normalizeGlobalAudioState(editorState.global_audio);
  setVideoProjectStep(project, 'images');
}

export function createEditorStatePersistence({ api, resolveProjectKey }) {
  async function persistEditorState(project, patch = {}) {
    if (!project) return;
    const draftId = resolveProjectKey(project);
    if (!draftId) return;
    const merged = normalizeEditorState({ ...(project.editor_state || {}), ...patch, updated_at: new Date().toISOString() });
    project.editor_state = merged;
    await api.saveVideoProjectEditorState({ draftId, editorState: merged });
  }

  return { persistEditorState };
}
