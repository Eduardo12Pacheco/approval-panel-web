export const APPROVAL_PARITY_ENDPOINTS = [
  '/webhook/approval/pending/supabase/v2',
  '/webhook/approval/queue/supabase/v2',
  '/webhook/approval/topic/supabase/v2',
  '/webhook/approval/decision/supabase/v2',
  '/webhook/approval/search-refresh/supabase/v2',
  '/webhook/mvp-script-drafts-pending/supabase/v2',
  '/webhook/mvp-script-draft-save/supabase/v2',
  '/webhook/mvp-script-publish/supabase/v2',
  '/webhook/mvp-script-download-doc/supabase/v1',
];

function parseFilenameFromContentDisposition(header = '') {
  const value = header.toString();
  const utfMatch = value.match(/filename\*=UTF-8''([^;]+)/i);
  if (utfMatch?.[1]) return decodeURIComponent(utfMatch[1].trim().replace(/^"|"$/g, ''));
  const asciiMatch = value.match(/filename="?([^";]+)"?/i);
  return asciiMatch?.[1]?.trim() || '';
}

export function createApprovalApiClient({ getSettings, fetchImpl = fetch }) {
  async function get(path) {
    const settings = getSettings();
    const headers = {};
    if (settings.secret) headers['x-approval-secret'] = settings.secret;

    const res = await fetchImpl(`${settings.baseUrl}${path}`, {
      headers,
    });
    if (!res.ok) throw new Error(`GET ${path} ${res.status}`);
    const raw = await res.text();
    if (!raw) return {};
    try {
      return JSON.parse(raw);
    } catch {
      return { raw };
    }
  }

  async function post(path, payload) {
    const settings = getSettings();
    const headers = { 'Content-Type': 'application/json' };
    if (settings.secret) headers['x-approval-secret'] = settings.secret;

    const res = await fetchImpl(`${settings.baseUrl}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    const raw = await res.text();
    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = { raw };
    }

    if (!res.ok) {
      const message = data?.message || data?.error || `POST ${path} ${res.status}`;
      throw new Error(message);
    }

    if (data?.error || data?.status === 'error') {
      const message = data?.message || data?.error || `POST ${path} failed`;
      throw new Error(message);
    }

    return data;
  }

  async function postBlob(path, payload) {
    const settings = getSettings();
    const headers = { 'Content-Type': 'application/json' };
    if (settings.secret) headers['x-approval-secret'] = settings.secret;

    const res = await fetchImpl(`${settings.baseUrl}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const raw = await res.text();
      let data = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = { raw };
      }
      const message = data?.message || data?.error || data?.raw || `POST ${path} ${res.status}`;
      throw new Error(message);
    }

    const blob = await res.blob();
    const filename = parseFilenameFromContentDisposition(res.headers?.get?.('Content-Disposition'));
    return { blob, filename };
  }

  return {
    get,
    post,
    postBlob,
  };
}
