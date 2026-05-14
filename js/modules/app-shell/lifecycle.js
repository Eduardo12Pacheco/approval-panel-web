export function createAppShellLifecycle({
  bindEvents,
  customDropdowns,
  hydrateSettingsForm,
  el,
  readSessionStatus,
  storage,
  cookieJar,
  sessionKey,
  setView,
  refreshAll,
  renderSearchRefreshState,
  renderSelectedScriptEditor,
  renderSelectedVideoProject,
  _visited,
}) {
  function bootApp() {
    bootCompatibilityShell();
  }

  function bootCompatibilityShell() {
    customDropdowns.mountAll();
    hydrateSettingsForm();
    if (el.runQueueBtn) {
      el.runQueueBtn.textContent = 'Actualizar cola';
    }
    renderSearchRefreshState();
    renderSelectedScriptEditor();
    renderSelectedVideoProject();
    boot();
    try {
      bindEvents();
    } catch (err) {
      console.warn('Control Panel event binding skipped after boot:', err);
    }
  }

  function boot() {
    const session = readSessionStatus({ storage, cookieJar, sessionKey });
    if (session === 'ok') {
      el.authGate.classList.add('hidden');
      el.appShell.classList.remove('hidden');
      // Fire-and-forget: lazy load CSS+DOM for approval view asynchronously
      // Approval DOM is already in index.html (not in a template), so no FOUC
      setView('approval');
      refreshAll({ silent: true, source: 'boot' });
      return;
    }
    el.authGate.classList.remove('hidden');
    el.appShell.classList.add('hidden');
  }

  /**
   * Mark a view as visited. Called by navigation guards after the first
   * successful navigation to a view. Used by refreshAll() to defer API
   * calls until the user has actually entered the relevant view.
   */
  function markVisited(viewName) {
    _visited.add(viewName);
  }

  return { bootApp, bootCompatibilityShell, boot, markVisited };
}
