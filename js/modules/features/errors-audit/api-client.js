import { resolveGatewayBaseUrl, resolveGatewayEventsReadPath } from '../../core/http/shared-read-models.js';

async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { message: text }; }
}

function extractMessage(payload) {
  const detail = payload?.detail;
  if (detail && typeof detail === 'object') return detail.message || detail.code || '';
  return payload?.message || payload?.error || detail || '';
}

export function createErrorsAuditApiClient({ getSettings, fetchImpl = fetch } = {}) {
  const resolveSettings = () => getSettings?.() || {};

  async function events(filters = {}) {
    const url = `${resolveGatewayBaseUrl(resolveSettings())}${resolveGatewayEventsReadPath({ limit: 50, ...filters })}`;
    let response;
    try {
      response = await fetchImpl(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        credentials: 'include',
      });
    } catch {
      throw new Error('Gateway events no disponible. Reintentá la lectura.');
    }
    const payload = await parseJsonResponse(response);
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new Error('Iniciá sesión para leer eventos Gateway.');
      throw new Error(sanitizeMessage(extractMessage(payload)) || `Gateway events respondió HTTP ${response.status}`);
    }
    return payload;
  }

  return { events };
}

function sanitizeMessage(value = '') {
  return (value || '').toString().replace(/raw[-_\w]*secret[-_\w]*/gi, '[redacted]').replace(/token[-_\w]*/gi, '[redacted]').trim();
}
