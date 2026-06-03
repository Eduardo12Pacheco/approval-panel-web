import { getShellVersion } from '../../../core/http/shared-read-models.js';

export function createApprovalPipelineClient({ fetchImpl = fetch, resolveBaseUrl } = {}) {
  const ensureBaseUrl = () => {
    const base = (typeof resolveBaseUrl === 'function' ? resolveBaseUrl() : '').toString().trim();
    if (!base) throw new Error('Approval pipeline URL no configurada');
    return base.replace(/\/+$/, '');
  };

  function createApprovalPipelineError(payload = {}, response) {
    const errorPayload = payload?.error && typeof payload.error === 'object' ? payload.error : payload;
    const error = new Error(errorPayload?.message || payload?.message || `Approval Pipeline ${response.status}`);
    error.code = errorPayload?.code || payload?.code || '';
    error.details = errorPayload?.details || payload?.details || null;
    error.status = response.status;
    return error;
  }

  const jsonFetch = async (endpoint, { method = 'GET', body } = {}) => {
    const baseUrl = ensureBaseUrl();
    const url = `${baseUrl}${endpoint}`;
    let response;
    try {
      response = await fetchImpl(url, {
        method,
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(getShellVersion() ? { 'x-control-panel-shell-version': getShellVersion() } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (error) {
      const reason = error?.message ? ` ${error.message}` : '';
      throw new Error(`No se pudo conectar con Approval Pipeline (${url}).${reason}`.trim());
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false) {
      throw createApprovalPipelineError(payload, response);
    }
    return payload?.data || payload;
  };

  const extractVoiceAudioFromVideo = async (input) => {
    const file = input?.file || input;
    const baseUrl = ensureBaseUrl();
    const url = `${baseUrl}/api/audio/extract-voice`;
    let response;
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': file?.type || 'video/mp4',
          ...(getShellVersion() ? { 'x-control-panel-shell-version': getShellVersion() } : {}),
        },
        body: file,
      });
    } catch (error) {
      const reason = error?.message ? ` ${error.message}` : '';
      throw new Error(`No se pudo conectar con Approval Pipeline (${url}).${reason}`.trim());
    }
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw createApprovalPipelineError(payload, response);
    }
    const contentType = String(response.headers?.get?.('content-type') || 'audio/mp4').split(';')[0].trim() || 'audio/mp4';
    const fileName = String(response.headers?.get?.('x-audio-filename') || 'voice-from-video.m4a').trim() || 'voice-from-video.m4a';
    const blob = await response.blob();
    return new File([blob], fileName, { type: contentType });
  };

  return {
    health: () => jsonFetch('/health'),
    createFromApproval: (payload) => jsonFetch('/api/projects/create-from-approval', { method: 'POST', body: payload }),
    snapshot: (projectId) => jsonFetch(`/api/projects/${encodeURIComponent(projectId)}/snapshot`),
    updateSnapshot: (projectId, payload) => jsonFetch(`/api/projects/${encodeURIComponent(projectId)}/snapshot`, { method: 'PATCH', body: payload }),
    renderFinal: (projectId, payload = {}) => jsonFetch(`/api/projects/${encodeURIComponent(projectId)}/render-final`, { method: 'POST', body: payload }),
    extractVoiceAudioFromVideo,
    status: (projectId) => jsonFetch(`/api/projects/${encodeURIComponent(projectId)}/status`),
    finalDownload: (projectId) => jsonFetch(`/api/projects/${encodeURIComponent(projectId)}/download/final`),
    finalDownloadUrl: (projectId) => `${ensureBaseUrl()}/api/projects/${encodeURIComponent(projectId)}/download/final?download=1`,
    assetUrl: (assetId) => `${ensureBaseUrl()}/api/assets/${encodeURIComponent(assetId)}`,
  };
}
