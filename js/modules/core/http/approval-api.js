export const APPROVAL_PARITY_ENDPOINTS = [
  '/webhook/approval/pending/v1',
  '/webhook/approval/queue/v1',
  '/webhook/approval/topic/v1',
  '/webhook/approval/decision/v1',
  '/webhook/approval/run-queue/v1',
  '/webhook/approval/sources/v1',
  '/webhook/mvp-script-drafts-pending-v1',
  '/webhook/mvp-script-draft-save-v1',
  '/webhook/mvp-script-publish-v1',
];

export function createApprovalApiClient({ getSettings, fetchImpl = fetch }) {
  async function get(path) {
    const settings = getSettings();
    const res = await fetchImpl(`${settings.baseUrl}${path}`);
    if (!res.ok) throw new Error(`GET ${path} ${res.status}`);
    return res.json();
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

  return {
    get,
    post,
  };
}
