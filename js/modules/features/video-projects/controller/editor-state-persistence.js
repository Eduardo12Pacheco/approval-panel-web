import { normalizeEditorState, normalizeGlobalAudioState } from '../domain/editor-state.js';
import { applyAlternatingBoundaryTransitionDefaults } from '../domain/boundary-transitions.js';
import { normalizePreparedContractRows } from '../data/contract-pipeline-client.js';

export function setVideoProjectStep(project, step) {
  if (!project) return;
  project._videoProjectStep = step === 'audio' ? 'audio' : 'images';
}

function resolveEditorRowId(row = {}) {
  return (row?.rowId || row?.id || '').toString().trim();
}

function hasParagraphBreakAroundDelimiter(currentBlock = '', nextBlock = '') {
  return /(?:\r?\n[\t ]*){2,}$/.test(currentBlock) || /^(?:[\t ]*\r?\n){2,}/.test(nextBlock);
}

export function deriveParagraphBoundaryMetadataFromGuion(rawGuion = '', rows = []) {
  if (!Array.isArray(rows) || rows.length < 2) return [];
  const blocks = String(rawGuion || '').split('|');
  if (blocks.length < 2) return [];
  return rows.map((row, index) => {
    if (index >= rows.length - 1) return null;
    const block = blocks[index];
    const nextBlock = blocks[index + 1];
    if (nextBlock === undefined || !hasParagraphBreakAroundDelimiter(block, nextBlock)) return null;
    const nextRowId = resolveEditorRowId(rows[index + 1]);
    if (!nextRowId) return null;
    return { paragraphBoundaryAfter: true, nextRowId };
  });
}

export function mergeDerivedParagraphBoundaryMetadata(rows = [], rawGuion = '') {
  if (!Array.isArray(rows) || rows.length < 2 || !String(rawGuion || '').trim()) return rows;
  const derived = deriveParagraphBoundaryMetadataFromGuion(rawGuion, rows);
  if (!derived.some(Boolean)) return rows;
  return rows.map((row, index) => {
    const metadata = derived[index];
    if (!metadata || row?.paragraphBoundaryAfter === true || row?.nextRowId) return row;
    return { ...row, paragraphBoundaryAfter: true, nextRowId: metadata.nextRowId };
  });
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
  if (Array.isArray(project._editorRows) && project._editorRows.length) {
    project._editorRows = applyAlternatingBoundaryTransitionDefaults(
      mergeDerivedParagraphBoundaryMetadata(project._editorRows, project.guion_piped || editorState.guion_piped || ''),
    );
  }
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
