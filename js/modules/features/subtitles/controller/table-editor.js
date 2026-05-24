import {
  applySubtitleRowPatch,
  createEmptySubtitleRow,
} from '../../../subtitles-workflow.mjs';
import {
  formatSubtitleDisplayTimeRuntime,
  getLastSubtitleNonDraftRowIndexRuntime,
  hasSubtitleDraftRowsRuntime,
  parseSubtitleTimeToMsRuntime,
  resolveSubtitlePreviewDurationMsRuntime,
  validateSubtitleTimingPatchRuntime,
} from '../runtime/index.js';

// Cohesive exception: row patching, timing validation, and draft drag/drop stay
// together so each edit path shares the same row identity and dirty-state rules.

const SUBTITLE_TIME_NUDGE_MS = 100;
const SUBTITLE_TIMING_GAP_MS = 60;
const SUBTITLE_DRAFT_INSERT_DURATION_MS = 1000;
const SUBTITLE_NUMBER_HOLD_DELAY_MS = 320;
const SUBTITLE_NUMBER_HOLD_INTERVAL_MS = 75;

export function createSubtitleTableEditor(ctx, callbacks = {}) {
  const { state, el, ui, timers, windowRef } = ctx;
  const toast = ui.toast;
  const renderWorkflow = callbacks.renderWorkflow || (() => ctx.renderCallbacks.renderWorkflow?.());
  const renderTable = callbacks.renderTable || (() => ctx.renderCallbacks.renderTable?.());
  const renderPreviewOverlay = callbacks.renderPreviewOverlay || (() => ctx.renderCallbacks.renderPreviewOverlay?.());
  const updateButtonsByPhase = callbacks.updateButtonsByPhase || (() => ctx.renderCallbacks.updateButtonsByPhase?.());
  const resolvePreviewDurationMs = callbacks.resolvePreviewDurationMs || (() => resolveSubtitlePreviewDurationMsRuntime({
    audioDurationMs: state.subtitles2.audioDurationMs,
    rows: state.subtitles2.rows,
  }));

  function patchRow(rowId, patch, options = {}) {
    const rerender = options.rerender !== false;
    state.subtitles2.rows = state.subtitles2.rows.map((row) => (row.id === rowId ? applySubtitleRowPatch(row, patch) : row));
    state.subtitles2.changeVersion += 1;
    state.subtitles2.dirty = true;
    if (rerender) renderTable();
    renderPreviewOverlay();
    updateButtonsByPhase();
  }

  function hasDraftRows() {
    return hasSubtitleDraftRowsRuntime(state.subtitles2.rows);
  }

  function onTableInput(ev) {
    const target = ev.target;
    if (!target) return;
    const rowId = target.dataset.rowId;
    if (!rowId) return;

    if (target.dataset.field === 'start' || target.dataset.field === 'end') {
      applyTimingInput(rowId, target.dataset.field, target.value);
      return;
    }
    if (target.dataset.field === 'phrase') {
      patchRow(rowId, { phrase: target.value }, { rerender: false });
      return;
    }
    if (target.dataset.field === 'maxWidthPx') {
      patchRow(rowId, { maxWidthPx: target.value });
      return;
    }
    if (target.dataset.field === 'size') {
      patchRow(rowId, { size: target.value });
      return;
    }
    if (target.dataset.field === 'color') {
      patchRow(rowId, { color: target.value });
      return;
    }
    if (target.dataset.field === 'fontFamily') {
      patchRow(rowId, { fontFamily: target.value });
    }
  }

  function applyTimingInput(rowId, field, rawValue) {
    const valueMs = parseSubtitleTimeToMsRuntime(rawValue);
    const validation = validateSubtitleTimingPatchRuntime({ rows: state.subtitles2.rows, rowId, field, valueMs, gapMs: SUBTITLE_TIMING_GAP_MS });
    if (!validation.accepted) {
      toast(validation.reason || 'Timing inválido');
      renderTable();
      return;
    }
    const index = state.subtitles2.rows.findIndex((row) => row.id === rowId);
    const row = state.subtitles2.rows[index];
    if (!row) return;
    if (field === 'start') {
      patchRow(rowId, { start: formatSubtitleDisplayTimeRuntime(valueMs) });
      return;
    }
    patchRow(rowId, { end: formatSubtitleDisplayTimeRuntime(valueMs) });
    const nextRow = state.subtitles2.rows[index + 1];
    if (nextRow) patchRow(nextRow.id, { start: formatSubtitleDisplayTimeRuntime(valueMs + SUBTITLE_TIMING_GAP_MS) });
  }

  function onTableClick(ev) {
    const nudgeButton = ev.target.closest('button[data-action="nudge-subtitle-time"]');
    if (nudgeButton) {
      nudgeTimingBoundary(nudgeButton.dataset.rowId, nudgeButton.dataset.field, nudgeButton.dataset.direction);
      return;
    }
    const numberStepButton = ev.target.closest('button[data-action="step-subtitle-number"]');
    if (numberStepButton) {
      if (numberStepButton.dataset.pointerHandled === 'true') {
        delete numberStepButton.dataset.pointerHandled;
        return;
      }
      stepNumberField(numberStepButton.dataset.rowId, numberStepButton.dataset.field, numberStepButton.dataset.direction);
      return;
    }
    const deleteButton = ev.target.closest('button[data-action="delete-subtitle-row"]');
    if (deleteButton) {
      const rowId = deleteButton.dataset.rowId;
      if (rowId) deleteRow(rowId);
      return;
    }
    const button = ev.target.closest('button[data-field="align"]');
    if (!button) return;
    const rowId = button.dataset.rowId;
    const align = button.dataset.align;
    if (!rowId || !align) return;
    patchRow(rowId, { align });
  }

  function onTablePointerDown(ev) {
    const button = ev.target.closest('button[data-action="step-subtitle-number"]');
    if (!button || button.disabled) return;
    if (ev.button != null && ev.button !== 0) return;
    ev.preventDefault();
    button.dataset.pointerHandled = 'true';
    startNumberHold(button);
  }

  function startNumberHold(button) {
    stopNumberHold();
    const rowId = button.dataset.rowId;
    const field = button.dataset.field;
    const direction = button.dataset.direction;
    if (!rowId || !field || !direction) return;
    button.classList.add('is-holding');
    stepNumberField(rowId, field, direction);

    const runRepeat = () => {
      stepNumberField(rowId, field, direction);
      state.subtitles2.numberHoldTimer = timers.setTimeout(runRepeat, SUBTITLE_NUMBER_HOLD_INTERVAL_MS);
    };

    state.subtitles2.numberHoldTimer = timers.setTimeout(runRepeat, SUBTITLE_NUMBER_HOLD_DELAY_MS);
    const stop = () => {
      button.classList.remove('is-holding');
      stopNumberHold();
      windowRef.removeEventListener?.('pointerup', stop);
      windowRef.removeEventListener?.('pointercancel', stop);
      windowRef.removeEventListener?.('blur', stop);
    };
    windowRef.addEventListener?.('pointerup', stop);
    windowRef.addEventListener?.('pointercancel', stop);
    windowRef.addEventListener?.('blur', stop);
  }

  function stopNumberHold() {
    if (!state.subtitles2.numberHoldTimer) return;
    timers.clearTimeout(state.subtitles2.numberHoldTimer);
    state.subtitles2.numberHoldTimer = null;
  }

  function stepNumberField(rowId, field, direction) {
    if (field !== 'maxWidthPx') return;
    const row = state.subtitles2.rows.find((item) => item.id === rowId);
    if (!row) return;
    const input = findRowInput(rowId, field);
    const step = Math.max(1, Number(input?.step || 10) || 10);
    const min = Number(input?.min || 1) || 1;
    const current = Number(input?.value || row.maxWidthPx || 1080);
    const base = Number.isFinite(current) ? current : Number(row.maxWidthPx || 1080);
    const next = Math.max(min, Math.round(base + (direction === 'down' ? -step : step)));
    if (input) input.value = String(next);
    patchRow(rowId, { [field]: next }, { rerender: false });
  }

  function findRowInput(rowId, field) {
    if (!el.subtitle2RowsBody?.querySelectorAll) return null;
    return Array.from(el.subtitle2RowsBody.querySelectorAll('input[data-row-id][data-field]')).find((input) => (
      input.dataset.rowId === rowId && input.dataset.field === field
    )) || null;
  }

  function nudgeTimingBoundary(rowId, field, direction) {
    const index = state.subtitles2.rows.findIndex((row) => row.id === rowId);
    const row = state.subtitles2.rows[index];
    if (!row || row.isDraft) return;
    if (field === 'end' && index === getLastNonDraftRowIndex()) {
      toast('El END de la última frase debe durar hasta el final del video');
      return;
    }
    const delta = direction === 'up' ? -SUBTITLE_TIME_NUDGE_MS : SUBTITLE_TIME_NUDGE_MS;
    const currentStartMs = parseSubtitleTimeToMsRuntime(row.start);
    const currentEndMs = parseSubtitleTimeToMsRuntime(row.end);

    if (field === 'start') {
      if (index === 0) {
        toast('El START de la primera frase es fijo en 00:00.00');
        return;
      }
      const previous = state.subtitles2.rows[index - 1];
      const previousStartMs = parseSubtitleTimeToMsRuntime(previous.start);
      const nextStartMs = currentStartMs + delta;
      const previousEndMs = nextStartMs - SUBTITLE_TIMING_GAP_MS;
      if (previousEndMs <= previousStartMs || nextStartMs >= currentEndMs - SUBTITLE_TIMING_GAP_MS) {
        toast('No hay margen suficiente para mover el START');
        return;
      }
      state.subtitles2.rows = state.subtitles2.rows.map((item, itemIndex) => {
        if (itemIndex === index - 1) return applySubtitleRowPatch(item, { end: formatSubtitleDisplayTimeRuntime(previousEndMs) });
        if (itemIndex === index) return applySubtitleRowPatch(item, { start: formatSubtitleDisplayTimeRuntime(nextStartMs) });
        return item;
      });
      markRowsChanged();
      renderTable();
      renderPreviewOverlay();
      updateButtonsByPhase();
      return;
    }

    if (field !== 'end') return;
    const next = state.subtitles2.rows[index + 1] || null;
    const nextEndMs = next ? parseSubtitleTimeToMsRuntime(next.end) : null;
    const nextEndBoundaryMs = currentEndMs + delta;
    const nextStartMs = nextEndBoundaryMs + SUBTITLE_TIMING_GAP_MS;
    if (nextEndBoundaryMs <= currentStartMs + SUBTITLE_TIMING_GAP_MS || (next && nextStartMs >= nextEndMs)) {
      toast('No hay margen suficiente para mover el END');
      return;
    }
    state.subtitles2.rows = state.subtitles2.rows.map((item, itemIndex) => {
      if (itemIndex === index) return applySubtitleRowPatch(item, { end: formatSubtitleDisplayTimeRuntime(nextEndBoundaryMs) });
      if (next && itemIndex === index + 1) return applySubtitleRowPatch(item, { start: formatSubtitleDisplayTimeRuntime(nextStartMs) });
      return item;
    });
    markRowsChanged();
    renderTable();
    renderPreviewOverlay();
    updateButtonsByPhase();
  }

  function deleteRow(rowId) {
    const index = state.subtitles2.rows.findIndex((row) => row.id === rowId);
    if (index <= 0) {
      toast('La primera frase no se puede eliminar');
      return;
    }
    const deletedRow = state.subtitles2.rows[index];
    if (deletedRow?.isDraft) {
      state.subtitles2.rows = state.subtitles2.rows.filter((row) => row.id !== rowId);
      markRowsChanged();
      renderWorkflow();
      return;
    }
    const previousRow = state.subtitles2.rows[index - 1];
    const nextRows = state.subtitles2.rows.filter((row) => row.id !== rowId);
    nextRows[index - 1] = {
      ...previousRow,
      end: deletedRow.end,
    };
    state.subtitles2.rows = nextRows;
    markRowsChanged();
    renderWorkflow();
  }

  function onAddRowClicked() {
    if (hasDraftRows()) {
      toast('Ya hay un subtítulo fantasma para ubicar');
      return;
    }
    const row = createEmptySubtitleRow({
      id: `draft-${Date.now()}`,
      start: '',
      end: '',
      phrase: '',
      isDraft: true,
    });
    state.subtitles2.rows = [...state.subtitles2.rows, row];
    markRowsChanged();
    renderWorkflow();
  }

  function onDraftDragStart(ev) {
    const rowEl = ev.target.closest('tr[data-row-id]');
    if (!rowEl || rowEl.dataset.draft !== 'true') return;
    state.subtitles2.draggingDraftRowId = rowEl.dataset.rowId;
    ev.dataTransfer.effectAllowed = 'move';
    ev.dataTransfer.setData('text/plain', rowEl.dataset.rowId);
    rowEl.classList.add('is-dragging');
  }

  function onDraftDragOver(ev) {
    const draftId = state.subtitles2.draggingDraftRowId;
    if (!draftId) return;
    const rowEl = ev.target.closest('tr[data-row-id]');
    if (!rowEl || rowEl.dataset.draft === 'true') return;
    const targetIndex = state.subtitles2.rows.findIndex((row) => row.id === rowEl.dataset.rowId);
    if (targetIndex <= 0 || targetIndex >= getLastNonDraftRowIndex()) return;
    ev.preventDefault();
    clearDropTargets();
    rowEl.classList.add('is-drop-before');
  }

  function onDraftDragLeave(ev) {
    const rowEl = ev.target.closest('tr[data-row-id]');
    if (!rowEl || rowEl.contains(ev.relatedTarget)) return;
    rowEl.classList.remove('is-drop-before');
  }

  function onDraftDrop(ev) {
    const draftId = state.subtitles2.draggingDraftRowId;
    if (!draftId) return;
    const rowEl = ev.target.closest('tr[data-row-id]');
    if (!rowEl || rowEl.dataset.draft === 'true') return;
    ev.preventDefault();
    const targetIndex = state.subtitles2.rows.findIndex((row) => row.id === rowEl.dataset.rowId);
    if (targetIndex <= 0 || targetIndex >= getLastNonDraftRowIndex()) {
      toast('Soltá el subtítulo entre dos frases intermedias');
      return;
    }
    placeDraftBetweenRows(draftId, targetIndex);
  }

  function getLastNonDraftRowIndex() {
    return getLastSubtitleNonDraftRowIndexRuntime(state.subtitles2.rows);
  }

  function onDraftDragEnd() {
    clearDropTargets();
    state.subtitles2.draggingDraftRowId = null;
  }

  function clearDropTargets() {
    el.subtitle2RowsBody?.querySelectorAll('.is-drop-before, .is-dragging').forEach((node) => {
      node.classList.remove('is-drop-before', 'is-dragging');
    });
  }

  function placeDraftBetweenRows(draftId, targetIndex) {
    const rows = state.subtitles2.rows;
    const draft = rows.find((row) => row.id === draftId && row.isDraft);
    const previous = rows[targetIndex - 1];
    const next = rows[targetIndex];
    if (!draft || !previous || !next || previous.isDraft || next.isDraft) return;
    const previousEndMs = parseSubtitleTimeToMsRuntime(previous.end);
    const nextStartMs = parseSubtitleTimeToMsRuntime(next.start);
    const nextEndMs = parseSubtitleTimeToMsRuntime(next.end);
    const draftStartMs = nextStartMs;
    const draftEndMs = draftStartMs + SUBTITLE_DRAFT_INSERT_DURATION_MS;
    const adjustedNextStartMs = draftEndMs + SUBTITLE_TIMING_GAP_MS;
    if (draftStartMs < previousEndMs + SUBTITLE_TIMING_GAP_MS || adjustedNextStartMs >= nextEndMs) {
      toast('No hay espacio suficiente para insertar el subtítulo');
      renderWorkflow();
      return;
    }
    const placedDraft = {
      ...draft,
      start: formatSubtitleDisplayTimeRuntime(draftStartMs),
      end: formatSubtitleDisplayTimeRuntime(draftEndMs),
      isDraft: false,
    };
    const withoutDraft = rows.filter((row) => row.id !== draftId);
    const adjustedTargetIndex = withoutDraft.findIndex((row) => row.id === next.id);
    withoutDraft[adjustedTargetIndex] = {
      ...next,
      start: formatSubtitleDisplayTimeRuntime(adjustedNextStartMs),
    };
    state.subtitles2.rows = [
      ...withoutDraft.slice(0, adjustedTargetIndex),
      placedDraft,
      ...withoutDraft.slice(adjustedTargetIndex),
    ];
    markRowsChanged();
    state.subtitles2.draggingDraftRowId = null;
    renderWorkflow();
  }

  function ensureRowsCoverDuration(durationMs = resolvePreviewDurationMs()) {
    const safeDurationMs = Math.max(0, Number(durationMs) || 0);
    if (!safeDurationMs || hasDraftRows()) return false;
    const lastIndex = state.subtitles2.rows.length - 1;
    const lastRow = state.subtitles2.rows[lastIndex];
    if (!lastRow) return false;
    const lastEndMs = parseSubtitleTimeToMsRuntime(lastRow.end);
    if (lastEndMs >= safeDurationMs) return false;
    state.subtitles2.rows = state.subtitles2.rows.map((row, index) => (
      index === lastIndex ? applySubtitleRowPatch(row, { end: formatSubtitleDisplayTimeRuntime(safeDurationMs) }) : row
    ));
    markRowsChanged();
    return true;
  }

  function resolvePreviewDuration() {
    return resolveSubtitlePreviewDurationMsRuntime({
      audioDurationMs: state.subtitles2.audioDurationMs,
      rows: state.subtitles2.rows,
    });
  }

  function markRowsChanged() {
    state.subtitles2.changeVersion += 1;
    state.subtitles2.dirty = true;
  }

  return {
    patchRow,
    hasDraftRows,
    onTableInput,
    applyTimingInput,
    onTableClick,
    onTablePointerDown,
    stopNumberHold,
    nudgeTimingBoundary,
    deleteRow,
    onAddRowClicked,
    onDraftDragStart,
    onDraftDragOver,
    onDraftDragLeave,
    onDraftDrop,
    getLastNonDraftRowIndex,
    onDraftDragEnd,
    clearDropTargets,
    placeDraftBetweenRows,
    ensureRowsCoverDuration,
    resolvePreviewDuration,
  };
}
