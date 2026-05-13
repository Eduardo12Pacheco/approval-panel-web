export function createApprovalPipelineClient({ fetchImpl = fetch, resolveBaseUrl } = {}) {
  const ensureBaseUrl = () => {
    const base = (typeof resolveBaseUrl === 'function' ? resolveBaseUrl() : '').toString().trim();
    if (!base) throw new Error('Approval pipeline URL no configurada');
    return base.replace(/\/+$/, '');
  };

  const jsonFetch = async (endpoint, { method = 'GET', body } = {}) => {
    const baseUrl = ensureBaseUrl();
    const url = `${baseUrl}${endpoint}`;
    let response;
    try {
      response = await fetchImpl(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (error) {
      const reason = error?.message ? ` ${error.message}` : '';
      throw new Error(`No se pudo conectar con Approval Pipeline (${url}).${reason}`.trim());
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false) {
      throw new Error(payload?.error?.message || payload?.message || `Approval Pipeline ${response.status}`);
    }
    return payload?.data || payload;
  };

  return {
    health: () => jsonFetch('/health'),
    createFromApproval: (payload) => jsonFetch('/api/projects/create-from-approval', { method: 'POST', body: payload }),
    snapshot: (projectId) => jsonFetch(`/api/projects/${encodeURIComponent(projectId)}/snapshot`),
    updateSnapshot: (projectId, payload) => jsonFetch(`/api/projects/${encodeURIComponent(projectId)}/snapshot`, { method: 'PATCH', body: payload }),
    renderFinal: (projectId, payload = {}) => jsonFetch(`/api/projects/${encodeURIComponent(projectId)}/render-final`, { method: 'POST', body: payload }),
    status: (projectId) => jsonFetch(`/api/projects/${encodeURIComponent(projectId)}/status`),
    finalDownload: (projectId) => jsonFetch(`/api/projects/${encodeURIComponent(projectId)}/download/final`),
    finalDownloadUrl: (projectId) => `${ensureBaseUrl()}/api/projects/${encodeURIComponent(projectId)}/download/final?download=1`,
    assetUrl: (assetId) => `${ensureBaseUrl()}/api/assets/${encodeURIComponent(assetId)}`,
  };
}
