const MOTION_SCRUB_DRAG_THRESHOLD_PX = 4;

export function resolveMotionScrubValue({ startValue = 0, deltaX = 0, kind = 'position', shiftKey = false, altKey = false } = {}) {
  const numericStart = Number(startValue);
  const safeStart = Number.isFinite(numericStart) ? numericStart : 0;
  const numericDelta = Number(deltaX);
  const safeDelta = Number.isFinite(numericDelta) ? numericDelta : 0;
  const baseSensitivity = kind === 'scalePercent' ? 0.25 : 1;
  const modifier = shiftKey ? 2 : altKey ? 0.25 : 1;
  return Math.round(safeStart + (safeDelta * baseSensitivity * modifier));
}

function resolveMotionScrubKind(input) {
  const field = (input?.dataset?.motionField || input?.dataset?.videoForegroundField || '').toString().toLowerCase();
  return field.includes('scalepercent') ? 'scalePercent' : 'position';
}

export function createMotionScrubHandlers({ input, documentRef = globalThis.document } = {}) {
  let scrubState = null;
  let previousBodyUserSelect = null;
  let documentListenersAttached = false;

  const getBody = () => documentRef?.body || null;

  const addDocumentListeners = () => {
    if (documentListenersAttached || !documentRef?.addEventListener) return;
    documentRef.addEventListener('pointermove', pointermove);
    documentRef.addEventListener('pointerup', pointerup);
    documentRef.addEventListener('pointercancel', pointercancel);
    documentListenersAttached = true;
  };
  const removeDocumentListeners = () => {
    if (!documentListenersAttached || !documentRef?.removeEventListener) return;
    documentRef.removeEventListener('pointermove', pointermove);
    documentRef.removeEventListener('pointerup', pointerup);
    documentRef.removeEventListener('pointercancel', pointercancel);
    documentListenersAttached = false;
  };
  const setActiveScrubUi = () => {
    input?.classList?.add('is-motion-scrubbing');
    const body = getBody();
    body?.classList?.add('is-motion-scrubbing');
    if (body?.style && previousBodyUserSelect === null) {
      previousBodyUserSelect = body.style.userSelect || '';
      body.style.userSelect = 'none';
    }
  };
  const clearActiveScrubUi = () => {
    input?.classList?.remove('is-motion-scrubbing');
    const body = getBody();
    body?.classList?.remove('is-motion-scrubbing');
    if (body?.style && previousBodyUserSelect !== null) {
      body.style.userSelect = previousBodyUserSelect;
      previousBodyUserSelect = null;
    }
  };
  const stopScrub = (pointerId) => {
    if (!scrubState) return;
    if (scrubState.active) input.dispatchEvent(new Event('change', { bubbles: true }));
    clearActiveScrubUi();
    input.releasePointerCapture?.(pointerId);
    removeDocumentListeners();
    scrubState = null;
  };
  const pointerdown = (ev) => {
    if (!input) return;
    if (ev.button !== undefined && ev.button !== 0) return;
    scrubState = { pointerId: ev.pointerId, startClientX: ev.clientX, startValue: Number(input.value || 0), active: false };
    input.setPointerCapture?.(ev.pointerId);
    addDocumentListeners();
  };
  const pointermove = (ev) => {
    if (!input || !scrubState || ev.pointerId !== scrubState.pointerId) return;
    const deltaX = ev.clientX - scrubState.startClientX;
    if (!scrubState.active && Math.abs(deltaX) < MOTION_SCRUB_DRAG_THRESHOLD_PX) return;
    scrubState.active = true;
    ev.preventDefault();
    setActiveScrubUi();
    input.value = resolveMotionScrubValue({
      startValue: scrubState.startValue,
      deltaX,
      kind: resolveMotionScrubKind(input),
      shiftKey: ev.shiftKey,
      altKey: ev.altKey,
    }).toString();
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const pointerup = (ev) => {
    if (!scrubState || ev.pointerId !== scrubState.pointerId) return;
    stopScrub(ev.pointerId);
  };
  const pointercancel = (ev) => {
    if (!scrubState || ev.pointerId !== scrubState.pointerId) return;
    stopScrub(ev.pointerId);
  };
  return { pointerdown, pointermove, pointerup, pointercancel };
}

export function hydrateMotionScrubberInput(input) {
  if (!input) return;
  const handlers = createMotionScrubHandlers({ input });
  input.addEventListener('pointerdown', handlers.pointerdown);
}
