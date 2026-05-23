const DEFAULT_MAX_ENTRIES = 25;
const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);
const TEXT_ENTRY_ROLES = new Set(['textbox', 'searchbox']);

function resolveProjectKey(projectOrKey) {
  if (typeof projectOrKey === 'string') return projectOrKey.trim();
  const project = projectOrKey || {};
  return (project.draft_id || project.project_id || project.id || '').toString().trim();
}

export function deepClone(value) {
  if (value === undefined) return undefined;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function cloneArray(value) {
  return Array.isArray(value) ? deepClone(value) : [];
}

function cloneObject(value) {
  return value && typeof value === 'object' ? deepClone(value) : null;
}

function pickEditorState(editorState = {}) {
  const snapshot = {
    phase: editorState.phase || 'idle',
    dirty: Boolean(editorState.dirty),
    error: editorState.error || '',
    timed_rows: cloneArray(editorState.timed_rows),
    global_audio: cloneObject(editorState.global_audio),
    approval_contract_snapshot: cloneObject(editorState.approval_contract_snapshot),
    snapshot_id: editorState.snapshot_id || editorState.snapshotId || '',
    snapshot_hash: editorState.snapshot_hash || editorState.snapshotHash || '',
    composition_hash: editorState.composition_hash || '',
    last_preview_hash: editorState.last_preview_hash || '',
    last_rendered_hash: editorState.last_rendered_hash || '',
    brandChannel: editorState.brandChannel || editorState.brand_channel || editorState.approval_contract_snapshot?.brandChannel || '',
    brand_channel: editorState.brand_channel || editorState.brandChannel || editorState.approval_contract_snapshot?.brandChannel || '',
    video_assets: cloneArray(editorState.video_assets),
    preview_assets: cloneObject(editorState.preview_assets),
  };

  for (const key of [
    'remotion_project_id',
    'remotion_api_url',
    'pipeline_provider',
    'pipeline_base_url',
    'pipeline_fallback_from',
    'pipeline_health',
    'preview_url',
    'final_url',
    'export_status',
  ]) {
    if (Object.prototype.hasOwnProperty.call(editorState, key)) {
      snapshot[key] = deepClone(editorState[key]);
    }
  }

  return snapshot;
}

export function createEditorSnapshot(label, project, { now = () => Date.now() } = {}) {
  const projectKey = resolveProjectKey(project);
  if (!project || !projectKey) return null;

  return {
    projectKey,
    editorRows: cloneArray(project._editorRows),
    globalAudio: cloneObject(project._globalAudio),
    editorState: pickEditorState(project.editor_state || {}),
    imageCandidates: cloneArray(project.image_candidates),
    selectedImages: cloneArray(project.selected_images),
    selectedCount: Number.isFinite(Number(project.selected_count)) ? Number(project.selected_count) : 0,
    videoAssets: cloneArray(project.video_assets || project.editor_state?.video_assets),
    previewAssets: cloneObject(project._previewAssets || project.editor_state?.preview_assets),
    ui: {
      selectedEditorRowId: project._selectedEditorRowId || '',
      editorEffectTab: project._editorEffectTab || '',
      motionEditorTab: project._motionEditorTab || '',
      previewSeekTime: Number.isFinite(Number(project._previewSeekTime)) ? Number(project._previewSeekTime) : 0,
    },
    meta: {
      label: (label || '').toString().trim(),
      createdAt: now(),
    },
  };
}

function comparableSnapshot(snapshot) {
  if (!snapshot) return '';
  const { meta, ...state } = snapshot;
  return JSON.stringify(state);
}

function ensureStacks(stacksByProject, projectKey) {
  if (!stacksByProject.has(projectKey)) {
    stacksByProject.set(projectKey, { undoStack: [], redoStack: [] });
  }
  return stacksByProject.get(projectKey);
}

function pushBounded(stack, snapshot, maxEntries) {
  stack.push(deepClone(snapshot));
  while (stack.length > maxEntries) stack.shift();
}

function restoreArray(project, key, value) {
  project[key] = cloneArray(value);
}

function restoreObject(project, key, value) {
  project[key] = cloneObject(value);
}

export function restoreEditorSnapshot(project, snapshot) {
  if (!project || !snapshot) return false;

  restoreArray(project, '_editorRows', snapshot.editorRows);
  restoreObject(project, '_globalAudio', snapshot.globalAudio);
  restoreArray(project, 'image_candidates', snapshot.imageCandidates);
  restoreArray(project, 'selected_images', snapshot.selectedImages);
  project.selected_count = snapshot.selectedCount;
  restoreArray(project, 'video_assets', snapshot.videoAssets);
  restoreObject(project, '_previewAssets', snapshot.previewAssets);

  project._selectedEditorRowId = snapshot.ui?.selectedEditorRowId || '';
  project._editorEffectTab = snapshot.ui?.editorEffectTab || '';
  project._motionEditorTab = snapshot.ui?.motionEditorTab || '';
  project._previewSeekTime = Number.isFinite(Number(snapshot.ui?.previewSeekTime)) ? Number(snapshot.ui.previewSeekTime) : 0;

  const currentEditorState = project.editor_state && typeof project.editor_state === 'object' ? project.editor_state : {};
  const restoredEditorState = deepClone(snapshot.editorState || {});
  project.editor_state = {
    ...currentEditorState,
    ...restoredEditorState,
    timed_rows: cloneArray(snapshot.editorRows),
    global_audio: cloneObject(snapshot.globalAudio),
    video_assets: cloneArray(snapshot.videoAssets),
    preview_assets: cloneObject(snapshot.previewAssets),
  };

  return true;
}

export function isEditableUndoTarget(target) {
  let node = target || null;
  while (node) {
    const tagName = (node.tagName || node.nodeName || '').toString().toUpperCase();
    if (EDITABLE_TAGS.has(tagName)) return true;
    if (node.isContentEditable === true) return true;
    const contentEditable = typeof node.getAttribute === 'function' ? (node.getAttribute('contenteditable') || '').toString().toLowerCase() : '';
    if (contentEditable === 'true' || contentEditable === 'plaintext-only') return true;
    const role = typeof node.getAttribute === 'function' ? (node.getAttribute('role') || '').toString().toLowerCase() : '';
    if (TEXT_ENTRY_ROLES.has(role)) return true;
    node = node.parentElement || node.parentNode || null;
  }
  return false;
}

export function shouldHandleEditorUndoKey(event = {}, { editorActive = false } = {}) {
  if (!editorActive) return false;
  if (isEditableUndoTarget(event.target)) return false;
  const key = (event.key || '').toString().toLowerCase();
  if (key !== 'z') return false;
  if (event.shiftKey || event.altKey) return false;
  return Boolean(event.ctrlKey || event.metaKey);
}

export function createEditorUndoManager({ maxEntries = DEFAULT_MAX_ENTRIES, now = () => Date.now() } = {}) {
  const safeMaxEntries = Math.max(1, Number.isFinite(Number(maxEntries)) ? Math.floor(Number(maxEntries)) : DEFAULT_MAX_ENTRIES);
  const stacksByProject = new Map();

  function stacksFor(projectOrKey) {
    const projectKey = resolveProjectKey(projectOrKey);
    return projectKey ? ensureStacks(stacksByProject, projectKey) : null;
  }

  function capture(label, project, { clearRedo = true, skipIfUnchanged = true } = {}) {
    const snapshot = createEditorSnapshot(label, project, { now });
    if (!snapshot) return false;
    const stacks = ensureStacks(stacksByProject, snapshot.projectKey);
    const last = stacks.undoStack[stacks.undoStack.length - 1];
    if (skipIfUnchanged && comparableSnapshot(last) === comparableSnapshot(snapshot)) return false;
    pushBounded(stacks.undoStack, snapshot, safeMaxEntries);
    if (clearRedo) stacks.redoStack = [];
    return true;
  }

  function removeLastUndo(project) {
    const stacks = stacksFor(project);
    if (!stacks?.undoStack.length) return null;
    return stacks.undoStack.pop();
  }

  function clearRedoStack(project) {
    const stacks = stacksFor(project);
    if (stacks) stacks.redoStack = [];
  }

  function checkpoint(label, project, mutation) {
    const before = createEditorSnapshot(label, project, { now });
    const captured = capture(label, project, { clearRedo: false });
    const result = typeof mutation === 'function' ? mutation() : undefined;
    const after = createEditorSnapshot(label, project, { now });
    const changed = comparableSnapshot(before) !== comparableSnapshot(after);
    if (!changed && captured) removeLastUndo(project);
    if (changed) clearRedoStack(project);
    return { captured: Boolean(captured && changed), changed, result };
  }

  function canUndo(projectOrKey) {
    const stacks = stacksFor(projectOrKey);
    return Boolean(stacks?.undoStack.length);
  }

  function canRedo(projectOrKey) {
    const stacks = stacksFor(projectOrKey);
    return Boolean(stacks?.redoStack.length);
  }

  function undo({ project } = {}) {
    const projectKey = resolveProjectKey(project);
    const stacks = projectKey ? ensureStacks(stacksByProject, projectKey) : null;
    if (!stacks?.undoStack.length) return null;

    const current = createEditorSnapshot('redo-current', project, { now });
    if (current) pushBounded(stacks.redoStack, current, safeMaxEntries);
    const snapshot = stacks.undoStack.pop();
    restoreEditorSnapshot(project, snapshot);
    return deepClone(snapshot);
  }

  function redo({ project } = {}) {
    const projectKey = resolveProjectKey(project);
    const stacks = projectKey ? ensureStacks(stacksByProject, projectKey) : null;
    if (!stacks?.redoStack.length) return null;

    const current = createEditorSnapshot('undo-current', project, { now });
    if (current) pushBounded(stacks.undoStack, current, safeMaxEntries);
    const snapshot = stacks.redoStack.pop();
    restoreEditorSnapshot(project, snapshot);
    return deepClone(snapshot);
  }

  function clear(projectOrKey) {
    const projectKey = resolveProjectKey(projectOrKey);
    if (!projectKey) return;
    stacksByProject.delete(projectKey);
  }

  function undoDepth(projectOrKey) {
    return stacksFor(projectOrKey)?.undoStack.length || 0;
  }

  function redoDepth(projectOrKey) {
    return stacksFor(projectOrKey)?.redoStack.length || 0;
  }

  return {
    capture,
    checkpoint,
    canUndo,
    undo,
    canRedo,
    redo,
    clear,
    undoDepth,
    redoDepth,
  };
}
