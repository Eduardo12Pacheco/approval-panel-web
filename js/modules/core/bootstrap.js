export function bindCoreEvents({
  el,
  authUser,
  authPass,
  isValidCredentials,
  persistSessionStatus,
  clearSessionStatus,
  loginGatewaySession,
  logoutGatewaySession,
  setView,
  refreshAll,
  refreshQueue,
  runQueue,
  saveSettings,
  defaultSettings,
  toast,
  renderCards,
  reloadPage,
}) {
  el.authForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    void (async () => {
      const user = el.authUser.value.trim();
      const pass = el.authPass.value;

      const validLocalCredentials = isValidCredentials({ user, pass, authUser, authPass });
      if (validLocalCredentials) {
        if (typeof loginGatewaySession === 'function') {
          try {
            await loginGatewaySession({ user, pass });
          } catch {
            // Keep the existing operator login flow available during gateway rollout.
          }
        }
        persistSessionStatus();
        el.authGate.classList.add('hidden');
        el.appShell.classList.remove('hidden');
        el.authPass.value = '';
        setView('approval');
        toast('Sesión iniciada');
        refreshAll({ silent: true, source: 'login' });
        return;
      }

      toast('Usuario o contraseña incorrectos');
    })();
  });

  el.sidebarNav.addEventListener('click', (ev) => {
    const btn = ev.target.closest('.nav-item[data-view]');
    if (!btn) return;
    setView(btn.dataset.view);
  });

  el.openQueueBtn?.addEventListener('click', () => {
    refreshQueue();
    el.queueDialog?.showModal?.();
  });
  el.closeQueueBtn?.addEventListener('click', () => el.queueDialog?.close?.());
  el.refreshQueueBtn?.addEventListener('click', refreshQueue);
  el.runQueueBtn?.addEventListener('click', runQueue);
  el.settingsBtn.addEventListener('click', () => el.settingsDialog.showModal());
  el.logoutBtn.addEventListener('click', () => {
    if (typeof logoutGatewaySession === 'function') {
      void logoutGatewaySession().catch(() => {});
    }
    clearSessionStatus();
    reloadPage();
  });
  el.closeSettings.addEventListener('click', () => el.settingsDialog.close());
  el.closeDialog.addEventListener('click', () => el.topicDialog.close());

  el.saveSettingsBtn.addEventListener('click', () => {
    const defaults = defaultSettings();
    saveSettings({
      apiProfileMode: 'unified',
      apiOrigin: el.apiOriginInput?.value?.trim() || defaults.apiOrigin,
      sharedApiKey: el.sharedApiKeyInput?.value?.trim() || '',
      sharedBasicUser: el.sharedBasicUserInput?.value?.trim() || '',
      sharedBasicPass: el.sharedBasicPassInput?.value || '',
      serviceOverrides: {
        n8n: false,
        tts: false,
        subtitles: false,
        radar: false,
        monitor: false,
        remotion: false,
        approvalPipeline: true,
      },
      baseUrl: el.baseUrlInput.value.trim() || defaults.baseUrl,
      secret: el.secretInput.value.trim(),
      ttsBaseUrl: el.ttsBaseUrlInput.value.trim() || defaults.ttsBaseUrl,
      ttsApiKey: '',
      ttsBasicUser: '',
      ttsBasicPass: '',
      subtitlesBaseUrl: el.subtitlesBaseUrlInput?.value?.trim() || defaults.subtitlesBaseUrl,
      subtitlesApiKey: '',
      subtitlesBasicUser: '',
      subtitlesBasicPass: '',
      remotionApiUrl: el.remotionApiUrlInput?.value?.trim() || defaults.remotionApiUrl,
      approvalPipelineBaseUrl: el.approvalPipelineBaseUrlInput?.value?.trim() || '',
      brandChannel: el.brandChannelSelect?.value || defaults.brandChannel,
      transcriptServiceBaseUrl: el.transcriptServiceBaseUrlInput?.value?.trim() || defaults.transcriptServiceBaseUrl,
      transcriptServiceApiKey: '',
      channelMonitorBaseUrl: defaults.channelMonitorBaseUrl,
      channelMonitorApiKey: '',
    });
    el.settingsDialog.close();
    toast('Configuración guardada');
    refreshAll({ silent: true, source: 'settings' });
  });

  let searchDebounceTimer = 0;
  [el.searchInput, el.countryFilter, el.sourcesFilter].forEach((inputEl) => {
    inputEl.addEventListener('input', () => {
      window.clearTimeout(searchDebounceTimer);
      searchDebounceTimer = window.setTimeout(renderCards, 300);
    });
  });
}
