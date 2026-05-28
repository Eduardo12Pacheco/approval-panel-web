import { resolveGatewayBaseUrl, resolveGatewayPresenceReadPath } from '../../core/http/shared-read-models.js';

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

export function createActiveUsersApiClient({ getSettings, fetchImpl = fetch } = {}) {
  const resolveSettings = () => getSettings?.() || {};

  async function presence() {
    const url = `${resolveGatewayBaseUrl(resolveSettings())}${resolveGatewayPresenceReadPath()}`;
    let response;
    try {
      response = await fetchImpl(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        credentials: 'include',
      });
    } catch {
      throw new Error('Activos no disponible. Reintentá la lectura.');
    }
    const payload = await parseJsonResponse(response);
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new Error('Iniciá sesión para leer presencia.');
      throw new Error(sanitizeMessage(extractMessage(payload)) || `Activos respondió HTTP ${response.status}`);
    }
    return payload;
  }

  return { presence };
}

function sanitizeMessage(value = '') {
  return (value || '').toString().replace(/raw[-_\w]*secret[-_\w]*/gi, '[redacted]').replace(/token[-_\w]*/gi, '[redacted]').trim();
}
