export function defaultSettingsFactory() {
  return {
    baseUrl: 'http://localhost:5678',
    secret: '',
    supabasePublishableKey: 'sb_publishable_RDUiyePyvXCkdU5k17Ue6g_nmxgSsQf',
    ttsBaseUrl: 'http://localhost:8088',
    ttsApiKey: '',
    ttsBasicUser: '',
    ttsBasicPass: '',
    remotionApiUrl: 'https://remotion-api.automatizacionedun8n.me',
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
  if (el.remotionApiUrlInput) {
    el.remotionApiUrlInput.value = settings.remotionApiUrl || 'http://127.0.0.1:3037';
  }
}
