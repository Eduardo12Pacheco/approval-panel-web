export function defaultSettingsFactory() {
  return {
    baseUrl: 'http://localhost:5678',
    secret: '',
    ttsBaseUrl: 'http://localhost:8088',
    ttsApiKey: '',
    ttsBasicUser: '',
    ttsBasicPass: '',
    ttsUserEmail: '',
    subtitlesMode: 'legacy',
  };
}

export function loadSettingsFromStorage({ storage, storageKey, defaultsFactory = defaultSettingsFactory }) {
  const raw = storage.getItem(storageKey);
  const defaults = defaultsFactory();
  if (!raw) return defaults;
  try {
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return defaults;
  }
}

export function saveSettingsToStorage({ storage, storageKey, nextSettings }) {
  storage.setItem(storageKey, JSON.stringify(nextSettings));
  return nextSettings;
}

export function hydrateSettingsFormValues({ el, settings }) {
  el.baseUrlInput.value = settings.baseUrl;
  el.secretInput.value = settings.secret;
  el.ttsBaseUrlInput.value = settings.ttsBaseUrl;
  el.ttsApiKeyInput.value = settings.ttsApiKey;
  el.ttsBasicUserInput.value = settings.ttsBasicUser;
  el.ttsBasicPassInput.value = settings.ttsBasicPass;
  el.ttsUserEmailInput.value = settings.ttsUserEmail;
  if (el.subtitleModeSelect) el.subtitleModeSelect.value = settings.subtitlesMode || 'legacy';
}
