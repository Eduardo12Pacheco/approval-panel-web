const SUBTITLE_UNDO_LIMIT = 50;
const SUBTITLE_UNDO_COALESCE_MS = 700;

export function createSubtitleUndoHistory(ctx, callbacks = {}) {
  const { state, timers } = ctx;
  const renderWorkflow = callbacks.renderWorkflow || (() => ctx.renderCallbacks.renderWorkflow?.());
  const renderPreviewOverlay = callbacks.renderPreviewOverlay || (() => ctx.renderCallbacks.renderPreviewOverlay?.());
  const updateButtonsByPhase = callbacks.updateButtonsByPhase || (() => ctx.renderCallbacks.updateButtonsByPhase?.());
  const onRowsChanged = callbacks.onRowsChanged || (() => {});

  function ensureUndoState() {
    if (!Array.isArray(state.subtitles2.undoStack)) state.subtitles2.undoStack = [];
    if (!state.subtitles2.undoCoalesce) state.subtitles2.undoCoalesce = { key: '', timer: null };
    return state.subtitles2.undoStack;
  }

  function cloneRows(rows = state.subtitles2.rows) {
    return (Array.isArray(rows) ? rows : []).map((row) => ({ ...row }));
  }

  function clearCoalesceTimer() {
    const coalesce = state.subtitles2.undoCoalesce;
    if (coalesce?.timer) timers.clearTimeout(coalesce.timer);
    if (coalesce) coalesce.timer = null;
  }

  function resetCoalesceAfterDelay() {
    const coalesce = state.subtitles2.undoCoalesce;
    clearCoalesceTimer();
    coalesce.timer = timers.setTimeout(() => {
      coalesce.key = '';
      coalesce.timer = null;
    }, SUBTITLE_UNDO_COALESCE_MS);
  }

  function captureRowsSnapshot({ coalesceKey = '' } = {}) {
    const stack = ensureUndoState();
    const coalesce = state.subtitles2.undoCoalesce;
    if (coalesceKey && coalesce.key === coalesceKey && coalesce.timer) {
      resetCoalesceAfterDelay();
      return;
    }
    stack.push(cloneRows());
    if (stack.length > SUBTITLE_UNDO_LIMIT) stack.splice(0, stack.length - SUBTITLE_UNDO_LIMIT);
    coalesce.key = coalesceKey;
    if (coalesceKey) resetCoalesceAfterDelay();
    else clearCoalesceTimer();
  }

  function clearUndoHistory() {
    ensureUndoState().length = 0;
    clearCoalesceTimer();
    if (state.subtitles2.undoCoalesce) state.subtitles2.undoCoalesce.key = '';
  }

  function undoLastRowsChange() {
    const stack = ensureUndoState();
    const previousRows = stack.pop();
    if (!previousRows) return false;
    clearCoalesceTimer();
    if (state.subtitles2.undoCoalesce) state.subtitles2.undoCoalesce.key = '';
    state.subtitles2.rows = cloneRows(previousRows);
    state.subtitles2.changeVersion += 1;
    state.subtitles2.dirty = true;
    renderWorkflow();
    renderPreviewOverlay();
    updateButtonsByPhase();
    onRowsChanged();
    return true;
  }

  return {
    captureRowsSnapshot,
    clearUndoHistory,
    undoLastRowsChange,
  };
}
