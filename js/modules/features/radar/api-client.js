import { isLocalServiceUrl, isRemoteBrowserContext, resolveServiceConfig } from '../../core/state/app-store.js';

function trimTrailingSlash(value) {
  return (value || '').toString().trim().replace(/\/+$/, '');
}

const REMOTE_LOCAL_SERVICE_MESSAGE = 'Transcript Service local no está disponible desde este dominio. Configurá Transcript Service URL en settings con una URL pública o usá el panel desde localhost.';

function serviceLabel(service = 'radar') {
  return service === 'monitor' ? 'Channel Monitor' : 'Transcript Service';
}

function sanitizeServiceMessage(message, apiKey) {
  const raw = (message || '').toString().trim();
  if (!raw) return '';
  if (apiKey && raw.includes(apiKey)) return raw.replaceAll(apiKey, '[redacted]');
  return raw;
}

function extractServiceMessage(payload) {
  const detail = payload?.detail;
  if (detail && typeof detail === 'object') return detail.message || detail.code || '';
  return payload?.message || detail || payload?.error || '';
}

async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

export function createRadarApiClient({ getSettings, fetchImpl = fetch, locationLike = globalThis?.location } = {}) {
  const resolveSettings = () => getSettings?.() || {};
  const resolveConfig = (service = 'radar') => resolveServiceConfig(resolveSettings(), service);
  const resolveBaseUrl = (service = 'radar') => trimTrailingSlash(resolveConfig(service).baseUrl || (service === 'monitor' ? 'http://127.0.0.1:8775' : 'http://127.0.0.1:8765'));
  const resolveApiKey = (service = 'radar') => (resolveConfig(service).apiKey || '').toString().trim();

  function isBlockedByRemoteContext() {
    return isRemoteBrowserContext(locationLike) && (isLocalServiceUrl(resolveBaseUrl('radar')) || isLocalServiceUrl(resolveBaseUrl('monitor')));
  }

  async function request(path, { method = 'GET', body, responseType = 'json', service = 'radar' } = {}) {
    if (isBlockedByRemoteContext()) {
      throw new Error(REMOTE_LOCAL_SERVICE_MESSAGE);
    }

    const apiKey = resolveApiKey(service);
    const headers = { Accept: 'application/json' };
    if (apiKey) headers['x-api-key'] = apiKey;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    let response;
    try {
      response = await fetchImpl(`${resolveBaseUrl(service)}${path}`, {
        method,
        headers,
        credentials: 'include',
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch (error) {
      const serviceMessage = sanitizeServiceMessage(error?.message, apiKey);
      throw new Error(`${serviceLabel(service)} no disponible. Revisá que el servicio local esté iniciado y que la URL sea correcta.${serviceMessage ? ` Detalle: ${serviceMessage}` : ''}`);
    }
    const payload = responseType === 'text' && response.ok ? await response.text() : await parseJsonResponse(response);
    if (!response.ok) {
      const serviceMessage = sanitizeServiceMessage(extractServiceMessage(payload), apiKey);
      if (response.status === 401 || response.status === 403) {
        throw new Error(`Autenticación del ${serviceLabel(service)} falló. Revisá la API key.${serviceMessage ? ` Detalle: ${serviceMessage}` : ''}`);
      }
      if (response.status === 409) {
        throw new Error(serviceMessage || `El ${serviceLabel(service)} ya tiene un job activo. Esperá a que termine.`);
      }
      throw new Error(serviceMessage || `${serviceLabel(service)} respondió HTTP ${response.status}`);
    }
    return payload;
  }

  return {
    isBlockedByRemoteContext,
    getRemoteLocalServiceMessage: () => REMOTE_LOCAL_SERVICE_MESSAGE,
    monitorCards: (targetCountry = '') => request(`/api/monitor/cards${targetCountry ? `?target_country=${encodeURIComponent(targetCountry)}` : ''}`, { service: 'monitor' }),
    monitorSummary: () => request('/api/monitor/summary', { service: 'monitor' }),
    monitorBasura: () => request('/api/monitor/basura', { service: 'monitor' }),
    health: () => request('/api/radar/health'),
    createJob: (payload) => request('/api/radar/jobs', { method: 'POST', body: payload }),
    history: () => request('/api/radar/jobs'),
    getJob: (jobId) => request(`/api/radar/jobs/${encodeURIComponent(jobId)}`),
    getTranscript: (jobId) => request(`/api/radar/jobs/${encodeURIComponent(jobId)}/transcript`),
    getMentions: (jobId) => request(`/api/radar/jobs/${encodeURIComponent(jobId)}/mentions`),
    getSummary: (jobId) => request(`/api/radar/jobs/${encodeURIComponent(jobId)}/summary`),
    downloadExportText: (jobId) => request(`/api/radar/jobs/${encodeURIComponent(jobId)}/export.txt`, { responseType: 'text' }),
    cancelJob: (jobId) => request(`/api/radar/jobs/${encodeURIComponent(jobId)}/cancel`, { method: 'POST' }),
    deleteJob: (jobId) => request(`/api/radar/jobs/${encodeURIComponent(jobId)}`, { method: 'DELETE' }),
  };
}
