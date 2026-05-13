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
      setView('approval');
      refreshAll({ silent: true, source: 'boot' });
      return;
    }
    el.authGate.classList.remove('hidden');
    el.appShell.classList.add('hidden');
  }

  return { bootApp, bootCompatibilityShell, boot };
}
