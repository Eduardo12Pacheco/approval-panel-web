export function createRemotionClient({ fetchImpl = fetch, resolveBaseUrl } = {}) {
  const ensureBaseUrl = () => {
    const base = (typeof resolveBaseUrl === 'function' ? resolveBaseUrl() : '').toString().trim();
    if (!base) throw new Error('Remotion API URL no configurada');
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
      throw new Error(`No se pudo conectar con Remotion API (${url}). Verificá túnel/API/CORS.${reason}`.trim());
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false) {
      throw new Error(payload?.error?.message || payload?.message || `Remotion API ${response.status}`);
    }
    return payload?.data || {};
  };

  return {
    createFromApproval: (payload) => jsonFetch('/api/projects/create-from-approval', { method: 'POST', body: payload }),
    updateComposition: (projectId, payload) => jsonFetch(`/api/projects/${encodeURIComponent(projectId)}/composition`, { method: 'PUT', body: payload }),
    renderPreview: (projectId) => jsonFetch(`/api/projects/${encodeURIComponent(projectId)}/render-preview`, { method: 'POST', body: {} }),
    renderFinal: (projectId) => jsonFetch(`/api/projects/${encodeURIComponent(projectId)}/render-final`, { method: 'POST', body: {} }),
    status: (projectId) => jsonFetch(`/api/projects/${encodeURIComponent(projectId)}/status`),
    diagnostics: (projectId) => jsonFetch(`/api/projects/${encodeURIComponent(projectId)}/diagnostics`),
    previewDownloadUrl: (projectId) => `${ensureBaseUrl()}/api/projects/${encodeURIComponent(projectId)}/download/preview`,
    finalDownloadUrl: (projectId) => `${ensureBaseUrl()}/api/projects/${encodeURIComponent(projectId)}/download/final`,
  };
}
