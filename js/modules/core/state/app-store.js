const DEFAULT_REMOTION_API_URL = 'https://remotion-api.automatizacionedun8n.me';
const LEGACY_LOCAL_REMOTION_URLS = new Set([
  'http://127.0.0.1:3037',
  'http://127.0.0.1:3037/',
  'http://localhost:3037',
  'http://localhost:3037/',
]);

function isRemoteBrowserContext(locationLike = globalThis?.location) {
  const hostname = (locationLike?.hostname || '').toLowerCase();
  if (!hostname) return false;
  return !new Set(['localhost', '127.0.0.1', '::1']).has(hostname);
}

function normalizeRemotionApiUrl(rawValue, { fallback = DEFAULT_REMOTION_API_URL, locationLike = globalThis?.location } = {}) {
  const value = (rawValue || '').toString().trim();
  if (!value) return fallback;
  if (LEGACY_LOCAL_REMOTION_URLS.has(value) && isRemoteBrowserContext(locationLike)) {
    return fallback;
  }
  return value;
}

export function defaultSettingsFactory() {
  return {
    baseUrl: 'http://localhost:5678',
    secret: '',
    ttsBaseUrl: 'http://localhost:8088',
    ttsApiKey: '',
    ttsBasicUser: '',
    ttsBasicPass: '',
    remotionApiUrl: DEFAULT_REMOTION_API_URL,
  };
}

export function loadSettingsFromStorage({ storage, storageKey, defaultsFactory = defaultSettingsFactory }) {
  const raw = storage.getItem(storageKey);
  const defaults = defaultsFactory();
  if (!raw) return defaults;
  try {
    const merged = { ...defaults, ...JSON.parse(raw) };
    merged.remotionApiUrl = normalizeRemotionApiUrl(merged.remotionApiUrl, { fallback: defaults.remotionApiUrl });
    return merged;
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
    el.remotionApiUrlInput.value = normalizeRemotionApiUrl(settings.remotionApiUrl, { fallback: DEFAULT_REMOTION_API_URL });
  }
}
