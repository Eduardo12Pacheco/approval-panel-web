import { isLocalServiceUrl, isRemoteBrowserContext, resolveServiceConfig } from '../../core/state/app-store.js';

const REMOTE_LOCAL_SERVICE_MESSAGE = 'Prensa IA local no está disponible desde este dominio. Configurá Channel Monitor URL en settings con una URL pública o usá el panel desde localhost.';

function trimTrailingSlash(value) {
  return (value || '').toString().trim().replace(/\/+$/, '');
}

function sanitizeServiceMessage(message, apiKey) {
  const raw = (message || '').toString().trim();
  if (!raw) return '';
  return apiKey ? raw.replaceAll(apiKey, '[redacted]') : raw;
}

function extractServiceMessage(payload) {
  const detail = payload?.detail;
  if (detail && typeof detail === 'object') return detail.message || detail.code || '';
  return payload?.message || detail || payload?.error || '';
}

async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { message: text }; }
}

export function createAiRescueApiClient({ getSettings, fetchImpl = fetch, locationLike = globalThis?.location } = {}) {
  const resolveSettings = () => getSettings?.() || {};
  const resolveConfig = () => resolveServiceConfig(resolveSettings(), 'monitor');
  const resolveBaseUrl = () => trimTrailingSlash(resolveConfig().baseUrl || 'http://127.0.0.1:8775');
  const resolveApiKey = () => (resolveConfig().apiKey || '').toString().trim();

  function isBlockedByRemoteContext() {
    return isRemoteBrowserContext(locationLike) && isLocalServiceUrl(resolveBaseUrl());
  }

  async function request(path, { method = 'GET', body } = {}) {
    if (isBlockedByRemoteContext()) throw new Error(REMOTE_LOCAL_SERVICE_MESSAGE);

    const apiKey = resolveApiKey();
    const headers = { Accept: 'application/json' };
    if (apiKey) headers['x-api-key'] = apiKey;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    let response;
    try {
      response = await fetchImpl(`${resolveBaseUrl()}${path}`, {
        method,
        headers,
        credentials: 'include',
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch (error) {
      const serviceMessage = sanitizeServiceMessage(error?.message, apiKey);
      throw new Error(`Prensa IA no disponible. Revisá que Channel Monitor esté iniciado y que la URL sea correcta.${serviceMessage ? ` Detalle: ${serviceMessage}` : ''}`);
    }
    const payload = await parseJsonResponse(response);
    if (!response.ok) {
      const serviceMessage = sanitizeServiceMessage(extractServiceMessage(payload), apiKey);
      if (response.status === 401 || response.status === 403) {
        throw new Error(`Autenticación de Prensa IA falló. Revisá la API key.${serviceMessage ? ` Detalle: ${serviceMessage}` : ''}`);
      }
      throw new Error(serviceMessage || `Prensa IA respondió HTTP ${response.status}`);
    }
    return payload;
  }

  return {
    isBlockedByRemoteContext,
    getRemoteLocalServiceMessage: () => REMOTE_LOCAL_SERVICE_MESSAGE,
    preflight: () => request('/api/monitor/ai-rescue/preflight'),
    queue: () => request('/api/monitor/ai-rescue/queue'),
    candidates: (targetCountry = '') => request(`/api/monitor/ai-rescue/candidates${targetCountry ? `?target_country=${encodeURIComponent(targetCountry)}` : ''}`),
    candidateDetail: (candidateId) => request(`/api/monitor/ai-rescue/candidates/${encodeURIComponent(candidateId)}`),
    rejections: () => request('/api/monitor/ai-rescue/rejections'),
    refresh: () => request('/api/monitor/ai-rescue/refresh', { method: 'POST' }),
    approveCandidate: (candidateId, payload = {}) => request(`/api/monitor/ai-rescue/candidates/${encodeURIComponent(candidateId)}/approve`, { method: 'POST', body: { confirmed: true, ...payload } }),
    rejectCandidate: (candidateId, payload = {}) => request(`/api/monitor/ai-rescue/candidates/${encodeURIComponent(candidateId)}/reject`, { method: 'POST', body: { confirmed: true, ...payload } }),
  };
}
