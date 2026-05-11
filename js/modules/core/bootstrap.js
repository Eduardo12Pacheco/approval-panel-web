export function bindCoreEvents({
  el,
  authUser,
  authPass,
  isValidCredentials,
  persistSessionStatus,
  clearSessionStatus,
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
    const user = el.authUser.value.trim();
    const pass = el.authPass.value;

    if (isValidCredentials({ user, pass, authUser, authPass })) {
      persistSessionStatus();
      el.authGate.classList.add('hidden');
      el.appShell.classList.remove('hidden');
      el.authPass.value = '';
      setView('approval');
      toast('Sesión iniciada');
      refreshAll();
      return;
    }

    toast('Usuario o contraseña incorrectos');
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
    clearSessionStatus();
    reloadPage();
  });
  el.closeSettings.addEventListener('click', () => el.settingsDialog.close());
  el.closeDialog.addEventListener('click', () => el.topicDialog.close());

  el.saveSettingsBtn.addEventListener('click', () => {
    const defaults = defaultSettings();
      saveSettings({
        baseUrl: el.baseUrlInput.value.trim() || defaults.baseUrl,
        secret: el.secretInput.value.trim(),
        ttsBaseUrl: el.ttsBaseUrlInput.value.trim() || defaults.ttsBaseUrl,
        ttsApiKey: el.ttsApiKeyInput.value.trim(),
        ttsBasicUser: el.ttsBasicUserInput.value.trim(),
        ttsBasicPass: el.ttsBasicPassInput.value,
        remotionApiUrl: el.remotionApiUrlInput?.value?.trim() || defaults.remotionApiUrl,
        approvalPipelineBaseUrl: el.approvalPipelineBaseUrlInput?.value?.trim() || '',
        brandChannel: el.brandChannelSelect?.value || defaults.brandChannel,
        transcriptServiceBaseUrl: el.transcriptServiceBaseUrlInput?.value?.trim() || defaults.transcriptServiceBaseUrl,
        transcriptServiceApiKey: el.transcriptServiceApiKeyInput.value.trim(),
      });
    el.settingsDialog.close();
    toast('Configuración guardada');
    refreshAll();
  });

  [el.searchInput, el.countryFilter, el.sourcesFilter].forEach((inputEl) => {
    inputEl.addEventListener('input', renderCards);
  });
}
