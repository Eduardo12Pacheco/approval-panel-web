const DEFAULT_REMOTION_API_URL = 'https://remotion-api.automatizacionedun8n.me';
const DEFAULT_APPROVAL_EDITOR_SERVICE_URL = 'https://api.automatizacionedun8n.me/approval';
const DEFAULT_TRANSCRIPT_SERVICE_URL = 'http://127.0.0.1:8765';
const DEFAULT_SUBTITLES_SERVICE_URL = 'http://127.0.0.1:8092';
const DEFAULT_API_ORIGIN = 'https://api.automatizacionedun8n.me';
const DEFAULT_BRAND_CHANNEL = 'pelotazo-ecuador';
const DEFAULT_SERVICE_OVERRIDES = Object.freeze({
  n8n: false,
  tts: false,
  subtitles: false,
  radar: false,
  remotion: false,
  approvalPipeline: true,
});
const UNIFIED_SERVICE_PREFIX = Object.freeze({
  n8n: 'n8n',
  tts: 'tts',
  subtitles: 'subtitles',
  radar: 'radar',
  remotion: 'remotion',
});
const LEGACY_LOCAL_REMOTION_URLS = new Set([
  'http://127.0.0.1:3037',
  'http://127.0.0.1:3037/',
  'http://localhost:3037',
  'http://localhost:3037/',
]);

export function isRemoteBrowserContext(locationLike = globalThis?.location) {
  const hostname = (locationLike?.hostname || '').toLowerCase();
  if (!hostname) return false;
  return !new Set(['localhost', '127.0.0.1', '::1']).has(hostname);
}

export function isLocalServiceUrl(rawValue) {
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

export function shouldSkipApprovalInitialBootRefresh({ baseUrl, locationLike = globalThis?.location, refreshOptions = {} } = {}) {
  return refreshOptions?.silent === true
    && refreshOptions?.source === 'boot'
    && shouldSkipApprovalBackgroundRefresh({ baseUrl, locationLike });
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

function trimTrailingSlash(rawValue) {
  return (rawValue || '').toString().trim().replace(/\/+$/, '');
}

function normalizeApiProfileMode(rawValue) {
  return rawValue === 'legacy' ? 'legacy' : 'unified';
}

function normalizeServiceOverrides(rawValue = {}) {
  return {
    ...DEFAULT_SERVICE_OVERRIDES,
    ...(rawValue && typeof rawValue === 'object' ? rawValue : {}),
  };
}

function isLegacyStoredSettings(rawValue = {}) {
  return rawValue
    && typeof rawValue === 'object'
    && !Object.prototype.hasOwnProperty.call(rawValue, 'apiProfileMode')
    && !Object.prototype.hasOwnProperty.call(rawValue, 'serviceOverrides');
}

function normalizeBrandChannel(rawValue) {
  const value = (rawValue || '').toString().trim().toLowerCase();
  return value === 'pelotazo-colombia' ? 'pelotazo-colombia' : DEFAULT_BRAND_CHANNEL;
}

export function defaultSettingsFactory() {
  return {
    apiProfileMode: 'unified',
    apiOrigin: DEFAULT_API_ORIGIN,
    sharedApiKey: '',
    sharedBasicUser: '',
    sharedBasicPass: '',
    serviceOverrides: { ...DEFAULT_SERVICE_OVERRIDES },
    baseUrl: 'http://localhost:5678',
    secret: '',
    ttsBaseUrl: 'http://localhost:8088',
    ttsApiKey: '',
    ttsBasicUser: '',
    ttsBasicPass: '',
    subtitlesBaseUrl: DEFAULT_SUBTITLES_SERVICE_URL,
    subtitlesApiKey: '',
    subtitlesBasicUser: '',
    subtitlesBasicPass: '',
    remotionApiUrl: DEFAULT_REMOTION_API_URL,
    approvalPipelineBaseUrl: DEFAULT_APPROVAL_EDITOR_SERVICE_URL,
    brandChannel: DEFAULT_BRAND_CHANNEL,
    transcriptServiceBaseUrl: DEFAULT_TRANSCRIPT_SERVICE_URL,
    transcriptServiceApiKey: '',
  };
}

export function normalizeSettings(settings = {}, { defaultsFactory = defaultSettingsFactory } = {}) {
  const defaults = defaultsFactory();
  const merged = { ...defaults, ...(settings || {}) };
  merged.apiProfileMode = normalizeApiProfileMode(merged.apiProfileMode);
  merged.apiOrigin = trimTrailingSlash(merged.apiOrigin) || defaults.apiOrigin;
  merged.sharedApiKey = fallbackCredential(merged.sharedApiKey, merged.subtitlesApiKey || merged.ttsApiKey || merged.transcriptServiceApiKey).trim();
  merged.sharedBasicUser = fallbackCredential(merged.sharedBasicUser, merged.subtitlesBasicUser || merged.ttsBasicUser).trim();
  merged.sharedBasicPass = fallbackCredential(merged.sharedBasicPass, merged.subtitlesBasicPass || merged.ttsBasicPass);
  merged.serviceOverrides = normalizeServiceOverrides(merged.serviceOverrides);
  merged.remotionApiUrl = normalizeRemotionApiUrl(merged.remotionApiUrl, { fallback: defaults.remotionApiUrl });
  merged.approvalPipelineBaseUrl = normalizeApprovalPipelineBaseUrl(merged.approvalPipelineBaseUrl);
  merged.brandChannel = normalizeBrandChannel(merged.brandChannel);
  return merged;
}

export function mergeSettingsForSave(currentSettings = {}, nextSettings = {}) {
  return normalizeSettings({ ...(currentSettings || {}), ...(nextSettings || {}) });
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
    const parsed = JSON.parse(raw);
    return normalizeSettings({
      ...defaults,
      ...parsed,
      ...(isLegacyStoredSettings(parsed) ? { serviceOverrides: Object.fromEntries(
        Object.keys(DEFAULT_SERVICE_OVERRIDES).map((service) => [service, true]),
      ) } : {}),
    }, { defaultsFactory });
  } catch {
    return defaults;
  }
}

export function saveSettingsToStorage({ storage, storageKey, nextSettings }) {
  const normalized = normalizeSettings(nextSettings);
  try {
    storage.setItem(storageKey, JSON.stringify(normalized));
  } catch {
    return nextSettings;
  }
  return normalized;
}

const SERVICE_BASE_FIELD = Object.freeze({
  n8n: 'baseUrl',
  tts: 'ttsBaseUrl',
  subtitles: 'subtitlesBaseUrl',
  radar: 'transcriptServiceBaseUrl',
  remotion: 'remotionApiUrl',
});

function hasPartialLegacyBaseOverride(rawSettings, service, { locationLike = globalThis?.location } = {}) {
  const field = SERVICE_BASE_FIELD[service];
  if (!field || !rawSettings || typeof rawSettings !== 'object') return false;
  const storedValue = (rawSettings[field] || '').toString().trim();
  if (service === 'subtitles' && isRemoteBrowserContext(locationLike) && isLocalServiceUrl(storedValue)) return false;
  return !Object.prototype.hasOwnProperty.call(rawSettings, 'apiProfileMode')
    && !Object.prototype.hasOwnProperty.call(rawSettings, 'serviceOverrides')
    && Object.prototype.hasOwnProperty.call(rawSettings, field)
    && Boolean(storedValue);
}

function shouldUseUnifiedService(settings, service, rawSettings = {}) {
  return settings.apiProfileMode === 'unified'
    && service !== 'approvalPipeline'
    && !hasPartialLegacyBaseOverride(rawSettings, service)
    && settings.serviceOverrides?.[service] === false;
}

function deriveUnifiedBaseUrl(settings, service) {
  const origin = trimTrailingSlash(settings.apiOrigin);
  const prefix = UNIFIED_SERVICE_PREFIX[service];
  return origin && prefix ? `${origin}/${prefix}` : '';
}

function fallbackCredential(primary, shared) {
  const value = (primary || '').toString();
  return value.trim() ? value : (shared || '').toString();
}

function resolveUniversalCredentials(settings = {}) {
  return {
    apiKey: fallbackCredential(settings.sharedApiKey, settings.ttsApiKey || settings.subtitlesApiKey || settings.transcriptServiceApiKey).trim(),
    basicUser: fallbackCredential(settings.sharedBasicUser, settings.ttsBasicUser || settings.subtitlesBasicUser).trim(),
    basicPass: fallbackCredential(settings.sharedBasicPass, settings.subtitlesBasicPass || settings.ttsBasicPass),
  };
}

export function resolveServiceConfig(rawSettings = {}, service) {
  const settings = normalizeSettings(rawSettings);
  const unifiedBaseUrl = shouldUseUnifiedService(settings, service, rawSettings) ? deriveUnifiedBaseUrl(settings, service) : '';
  const universalCredentials = resolveUniversalCredentials(settings);

  if (service === 'n8n') {
    return { baseUrl: unifiedBaseUrl || trimTrailingSlash(settings.baseUrl), secret: settings.secret || '' };
  }
  if (service === 'tts') {
    return {
      baseUrl: unifiedBaseUrl || trimTrailingSlash(settings.ttsBaseUrl),
      apiKey: universalCredentials.apiKey,
      basicUser: universalCredentials.basicUser,
      basicPass: universalCredentials.basicPass,
    };
  }
  if (service === 'subtitles') {
    return {
      baseUrl: unifiedBaseUrl || trimTrailingSlash(settings.subtitlesBaseUrl || settings.ttsBaseUrl),
      apiKey: universalCredentials.apiKey,
      basicUser: universalCredentials.basicUser,
      basicPass: universalCredentials.basicPass,
    };
  }
  if (service === 'radar') {
    return {
      baseUrl: unifiedBaseUrl || trimTrailingSlash(settings.transcriptServiceBaseUrl),
      apiKey: universalCredentials.apiKey,
    };
  }
  if (service === 'remotion') {
    return { baseUrl: unifiedBaseUrl || trimTrailingSlash(settings.remotionApiUrl) };
  }
  if (service === 'approvalPipeline') {
    const hasExplicitApprovalPipeline = Object.prototype.hasOwnProperty.call(rawSettings || {}, 'approvalPipelineBaseUrl');
    return { baseUrl: hasExplicitApprovalPipeline ? trimTrailingSlash(rawSettings.approvalPipelineBaseUrl) : '' };
  }
  return { baseUrl: '' };
}

export function hydrateSettingsFormValues({ el, settings }) {
  const normalized = normalizeSettings(settings);
  if (el.apiProfileModeSelect) {
    el.apiProfileModeSelect.value = normalized.apiProfileMode;
  }
  if (el.apiOriginInput) {
    el.apiOriginInput.value = normalized.apiOrigin;
  }
  if (el.sharedApiKeyInput) {
    el.sharedApiKeyInput.value = normalized.sharedApiKey;
  }
  if (el.sharedBasicUserInput) {
    el.sharedBasicUserInput.value = normalized.sharedBasicUser;
  }
  if (el.sharedBasicPassInput) {
    el.sharedBasicPassInput.value = normalized.sharedBasicPass;
  }
  if (el.advancedSettingsSection) {
    el.advancedSettingsSection.hidden = true;
    el.advancedSettingsSection.setAttribute?.('aria-hidden', 'true');
  }
  if (el.baseUrlInput) {
    el.baseUrlInput.value = normalized.baseUrl;
  }
  if (el.secretInput) {
    el.secretInput.value = normalized.secret;
  }
  if (el.ttsBaseUrlInput) {
    el.ttsBaseUrlInput.value = normalized.ttsBaseUrl;
  }
  if (el.subtitlesBaseUrlInput) {
    el.subtitlesBaseUrlInput.value = normalized.subtitlesBaseUrl || DEFAULT_SUBTITLES_SERVICE_URL;
  }
  if (el.remotionApiUrlInput) {
    el.remotionApiUrlInput.value = normalizeRemotionApiUrl(normalized.remotionApiUrl, { fallback: DEFAULT_REMOTION_API_URL });
  }
  if (el.approvalPipelineBaseUrlInput) {
    el.approvalPipelineBaseUrlInput.value = normalizeApprovalPipelineBaseUrl(normalized.approvalPipelineBaseUrl);
  }
  if (el.brandChannelSelect) {
    el.brandChannelSelect.value = normalizeBrandChannel(normalized.brandChannel);
  }
  if (el.transcriptServiceBaseUrlInput) {
    el.transcriptServiceBaseUrlInput.value = normalized.transcriptServiceBaseUrl || DEFAULT_TRANSCRIPT_SERVICE_URL;
  }
}
