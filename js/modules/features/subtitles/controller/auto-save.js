const SUBTITLE_AUTOSAVE_INTERVAL_MS = 15000;
const SUBTITLE_AUTOSAVE_DEBOUNCE_MS = 2500;

export function createSubtitleAutoSaveController(ctx, callbacks = {}) {
  const { state, el, timers, windowRef, browser } = ctx;
  const enqueueSave = callbacks.enqueueSave || (() => Promise.resolve());
  const hasDraftRows = callbacks.hasDraftRows || (() => false);
  const reportPresence = callbacks.reportPresence || (() => {});
  const updateButtonsByPhase = callbacks.updateButtonsByPhase || (() => {});

  let activated = false;
  let debounceTimer = null;
  let intervalTimer = null;
  let saveInFlight = false;
  let savePending = false;

  function setStatus(message) {
    state.subtitles2.autoSaveStatus = message;
    if (el.subtitle2AutosaveStatus) el.subtitle2AutosaveStatus.textContent = message || '';
  }

  function canAutoSave() {
    return Boolean(state.subtitles2.sessionId && state.subtitles2.snapshotVersion >= 1 && state.subtitles2.dirty && !hasDraftRows());
  }

  function clearDebounce() {
    if (!debounceTimer) return;
    timers.clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  function requestAutoSave() {
    clearDebounce();
    if (!canAutoSave()) return;
    setStatus('Autoguardado pendiente');
    debounceTimer = timers.setTimeout(() => {
      debounceTimer = null;
      return flush('debounce');
    }, SUBTITLE_AUTOSAVE_DEBOUNCE_MS);
  }

  async function flush(reason = 'interval') {
    clearDebounce();
    if (!canAutoSave()) return false;
    if (saveInFlight) {
      savePending = true;
      setStatus('Autoguardado pendiente');
      return false;
    }
    saveInFlight = true;
    setStatus('Guardando…');
    try {
      await reportPresence({ mode: 'editing' });
      await enqueueSave(reason === 'lifecycle' ? 'auto-lifecycle' : 'auto');
      const savedAt = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setStatus(`Guardado automáticamente ${savedAt}`);
      updateButtonsByPhase();
      return true;
    } catch (error) {
      console.error(error);
      setStatus('No se pudo autoguardar');
      return false;
    } finally {
      saveInFlight = false;
      if (savePending) {
        savePending = false;
        requestAutoSave();
      }
    }
  }

  function onVisibilityChange() {
    const documentRef = browser?.document || globalThis.document;
    if (documentRef?.visibilityState === 'hidden') void flush('lifecycle');
  }

  function onLifecycleSave() {
    void flush('lifecycle');
  }

  function activate() {
    if (activated) return;
    activated = true;
    intervalTimer = timers.setInterval(() => {
      void flush('interval');
    }, SUBTITLE_AUTOSAVE_INTERVAL_MS);
    const documentRef = browser?.document || globalThis.document;
    documentRef?.addEventListener?.('visibilitychange', onVisibilityChange);
    windowRef?.addEventListener?.('pagehide', onLifecycleSave);
    windowRef?.addEventListener?.('beforeunload', onLifecycleSave);
  }

  function deactivate() {
    if (!activated) return;
    activated = false;
    clearDebounce();
    if (intervalTimer) timers.clearInterval(intervalTimer);
    intervalTimer = null;
    const documentRef = browser?.document || globalThis.document;
    documentRef?.removeEventListener?.('visibilitychange', onVisibilityChange);
    windowRef?.removeEventListener?.('pagehide', onLifecycleSave);
    windowRef?.removeEventListener?.('beforeunload', onLifecycleSave);
  }

  return {
    activate,
    deactivate,
    flush,
    requestAutoSave,
  };
}
