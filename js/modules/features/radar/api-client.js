function trimTrailingSlash(value) {
  return (value || '').toString().trim().replace(/\/+$/, '');
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

export function createRadarApiClient({ getSettings, fetchImpl = fetch } = {}) {
  const resolveSettings = () => getSettings?.() || {};
  const resolveBaseUrl = () => trimTrailingSlash(resolveSettings().transcriptServiceBaseUrl || 'http://127.0.0.1:8091');
  const resolveApiKey = () => (resolveSettings().transcriptServiceApiKey || '').toString().trim();

  async function request(path, { method = 'GET', body } = {}) {
    const apiKey = resolveApiKey();
    const headers = { Accept: 'application/json' };
    if (apiKey) headers['x-api-key'] = apiKey;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    let response;
    try {
      response = await fetchImpl(`${resolveBaseUrl()}${path}`, {
        method,
        headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch (error) {
      const serviceMessage = sanitizeServiceMessage(error?.message, apiKey);
      throw new Error(`Transcript Service no disponible. Revisá que el servicio local esté iniciado y que la URL sea correcta.${serviceMessage ? ` Detalle: ${serviceMessage}` : ''}`);
    }
    const payload = await parseJsonResponse(response);
    if (!response.ok) {
      const serviceMessage = sanitizeServiceMessage(extractServiceMessage(payload), apiKey);
      if (response.status === 401 || response.status === 403) {
        throw new Error(`Autenticación del Transcript Service falló. Revisá la API key.${serviceMessage ? ` Detalle: ${serviceMessage}` : ''}`);
      }
      if (response.status === 409) {
        throw new Error(serviceMessage || 'El Transcript Service ya tiene un job activo. Esperá a que termine.');
      }
      throw new Error(serviceMessage || `Transcript Service respondió HTTP ${response.status}`);
    }
    return payload;
  }

  return {
    health: () => request('/api/radar/health'),
    createJob: (payload) => request('/api/radar/jobs', { method: 'POST', body: payload }),
    history: () => request('/api/radar/jobs'),
    getJob: (jobId) => request(`/api/radar/jobs/${encodeURIComponent(jobId)}`),
    getTranscript: (jobId) => request(`/api/radar/jobs/${encodeURIComponent(jobId)}/transcript`),
    getMentions: (jobId) => request(`/api/radar/jobs/${encodeURIComponent(jobId)}/mentions`),
  };
}
