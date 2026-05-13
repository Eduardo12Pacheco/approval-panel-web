const DEFAULT_REMOTION_API_URL = 'https://remotion-api.automatizacionedun8n.me';
const DEFAULT_APPROVAL_EDITOR_SERVICE_URL = 'http://127.0.0.1:3042';
const DEFAULT_TRANSCRIPT_SERVICE_URL = 'http://127.0.0.1:8765';
const DEFAULT_BRAND_CHANNEL = 'pelotazo-ecuador';
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

function isLocalServiceUrl(rawValue) {
  const value = (rawValue || '').toString().trim();
  if (!value) return false;
  try {
    const url = new URL(value);
    return new Set(['localhost', '127.0.0.1', '[::1]', '::1']).has(url.hostname.toLowerCase());
  } catch {
    return /^(https?:\/\/)?(localhost|127\.0\.0\.1|\[::1\]|::1)(?::\d+)?(?:\/|$)/i.test(value);
  }
}

export function shouldSkipApprovalBackgroundRefresh({ baseUrl, locationLike = globalThis?.location } = {}) {
  return isRemoteBrowserContext(locationLike) && isLocalServiceUrl(baseUrl);
}

function normalizeRemotionApiUrl(rawValue, { fallback = DEFAULT_REMOTION_API_URL, locationLike = globalThis?.location } = {}) {
  const value = (rawValue || '').toString().trim();
  if (!value) return fallback;
  if (LEGACY_LOCAL_REMOTION_URLS.has(value) && isRemoteBrowserContext(locationLike)) {
    return fallback;
  }
  return value;
}

function normalizeApprovalPipelineBaseUrl(rawValue) {
  return (rawValue || '').toString().trim();
}

function normalizeBrandChannel(rawValue) {
  const value = (rawValue || '').toString().trim().toLowerCase();
  return value === 'pelotazo-colombia' ? 'pelotazo-colombia' : DEFAULT_BRAND_CHANNEL;
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
    approvalPipelineBaseUrl: DEFAULT_APPROVAL_EDITOR_SERVICE_URL,
    brandChannel: DEFAULT_BRAND_CHANNEL,
    transcriptServiceBaseUrl: DEFAULT_TRANSCRIPT_SERVICE_URL,
    transcriptServiceApiKey: '',
  };
}

export function loadSettingsFromStorage({ storage, storageKey, defaultsFactory = defaultSettingsFactory }) {
  const defaults = defaultsFactory();
  let raw = null;
  try {
    raw = storage.getItem(storageKey);
  } catch {
    return defaults;
  }
  if (!raw) return defaults;
  try {
    const merged = { ...defaults, ...JSON.parse(raw) };
    merged.remotionApiUrl = normalizeRemotionApiUrl(merged.remotionApiUrl, { fallback: defaults.remotionApiUrl });
    merged.approvalPipelineBaseUrl = normalizeApprovalPipelineBaseUrl(merged.approvalPipelineBaseUrl);
    merged.brandChannel = normalizeBrandChannel(merged.brandChannel);
    return merged;
  } catch {
    return defaults;
  }
}

export function saveSettingsToStorage({ storage, storageKey, nextSettings }) {
  try {
    storage.setItem(storageKey, JSON.stringify(nextSettings));
  } catch {}
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
  if (el.approvalPipelineBaseUrlInput) {
    el.approvalPipelineBaseUrlInput.value = normalizeApprovalPipelineBaseUrl(settings.approvalPipelineBaseUrl);
  }
  if (el.brandChannelSelect) {
    el.brandChannelSelect.value = normalizeBrandChannel(settings.brandChannel);
  }
  if (el.transcriptServiceBaseUrlInput) {
    el.transcriptServiceBaseUrlInput.value = settings.transcriptServiceBaseUrl || DEFAULT_TRANSCRIPT_SERVICE_URL;
  }
  if (el.transcriptServiceApiKeyInput) {
    el.transcriptServiceApiKeyInput.value = settings.transcriptServiceApiKey || '';
  }
}
