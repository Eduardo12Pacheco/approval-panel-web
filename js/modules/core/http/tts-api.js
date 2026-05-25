import { resolveServiceConfig } from '../state/app-store.js';
import {
  buildGatewayReadHeaders,
  getShellVersion,
  resolveGatewayBaseUrl,
  resolveSharedReadModelUrl,
  resolveSubtitlesSharedReadPath,
  resolveTtsSharedReadPath,
} from './shared-read-models.js';

export const TTS_PARITY_ENDPOINTS = [
  '/api/tts/jobs',
  '/api/tts/jobs/${encodeURIComponent(jobId)}',
  '/api/tts/jobs/${encodeURIComponent(jobId)}/events',
  '/api/tts/jobs/${encodeURIComponent(jobId)}/download',
  '/api/subtitles/analyze',
  '/api/subtitles/analyze/${jobId}',
  '/api/subtitles/render/${jobId}',
  '/api/subtitles/review/snapshots',
  '/api/subtitles/review/snapshots/${analysisJobId}/latest',
  '/api/subtitles/review/approve',
  '/api/subtitles/render',
];

function buildGatewayHeaders(contentType = null) {
  const headers = {};
  const shellVersion = getShellVersion();
  if (shellVersion) headers['x-control-panel-shell-version'] = shellVersion;
  if (contentType) headers['Content-Type'] = contentType;
  return headers;
}

export function createTtsApiClient({ getSettings, fetchImpl = fetch, btoaImpl = btoa }) {
  function getBasicAuthHeader({ user, pass, label }) {
    const username = (user || '').trim();
    const password = (pass || '').toString();
    if (!username || !password) {
      throw new Error(`Configurá usuario y contraseña de ${label}`);
    }
    return `Basic ${btoaImpl(`${username}:${password}`)}`;
  }

  function getTtsBasicAuthHeader() {
    const settings = getSettings();
    const config = resolveServiceConfig(settings, 'tts');
    return getBasicAuthHeader({
      user: config.basicUser,
      pass: config.basicPass,
      label: 'Audio API',
    });
  }

  function getSubtitlesBasicAuthHeader() {
    const settings = getSettings();
    const config = resolveServiceConfig(settings, 'subtitles');
    return getBasicAuthHeader({
      user: config.basicUser,
      pass: config.basicPass,
      label: 'Subtítulos',
    });
  }

  function buildAuthHeaders({ contentType = null }) {
    return buildGatewayHeaders(contentType);
  }

  function buildTtsHeaders(contentType = null) {
    const settings = getSettings();
    const config = resolveServiceConfig(settings, 'tts');
    return buildAuthHeaders({
      label: 'Audio API',
      contentType,
    });
  }

  function buildSubtitlesHeaders(contentType = null) {
    const settings = getSettings();
    const config = resolveServiceConfig(settings, 'subtitles');
    return buildAuthHeaders({
      label: 'Subtítulos',
      contentType,
    });
  }

  function resolveBaseUrl() {
    const settings = getSettings();
    const baseUrl = resolveServiceConfig(settings, 'tts').baseUrl;
    if (!baseUrl) {
      throw new Error('Configuración de Audio API incompleta');
    }
    return baseUrl;
  }

  function resolveSubtitlesBaseUrl() {
    const settings = getSettings();
    const baseUrl = resolveServiceConfig(settings, 'subtitles').baseUrl;
    if (!baseUrl) {
      throw new Error('Configuración de Subtítulos incompleta');
    }
    return baseUrl;
  }

  async function get(path) {
    const settings = getSettings();
    const sharedReadPath = resolveTtsSharedReadPath(path);
    const baseUrl = sharedReadPath ? resolveGatewayBaseUrl(settings) : resolveBaseUrl();
    const headers = sharedReadPath ? buildGatewayReadHeaders() : buildTtsHeaders();
    const url = sharedReadPath ? resolveSharedReadModelUrl(sharedReadPath, settings) : `${baseUrl}${path}`;
    const res = await fetchImpl(url, {
      headers,
      credentials: 'include',
      ...(sharedReadPath ? { cache: 'no-store' } : {}),
    });
    const raw = await res.text();
    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = { raw };
    }

    const businessStatus = (data?.status || '').toString().trim().toLowerCase();
    if (!res.ok) {
      const message = data?.error?.message || data?.message || `GET ${path} ${res.status}`;
      throw new Error(message);
    }

    if (data?.error && businessStatus !== 'failed') {
      const message = data?.error?.message || data?.message || `GET ${path} ${res.status}`;
      throw new Error(message);
    }

    return data;
  }

  async function post(path, payload) {
    const baseUrl = resolveBaseUrl();
    const headers = buildTtsHeaders('application/json');
    const res = await fetchImpl(`${baseUrl}${path}`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    const raw = await res.text();
    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = { raw };
    }

    const businessStatus = (data?.status || '').toString().trim().toLowerCase();
    if (!res.ok) {
      const message = data?.error?.message || data?.message || `POST ${path} ${res.status}`;
      throw new Error(message);
    }

    if (data?.error && businessStatus !== 'failed') {
      const message = data?.error?.message || data?.message || `POST ${path} ${res.status}`;
      throw new Error(message);
    }

    return data;
  }

  async function put(path, payload) {
    const baseUrl = resolveBaseUrl();
    const headers = buildTtsHeaders('application/json');
    const res = await fetchImpl(`${baseUrl}${path}`, {
      method: 'PUT',
      headers,
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    const raw = await res.text();
    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = { raw };
    }

    const businessStatus = (data?.status || '').toString().trim().toLowerCase();
    if (!res.ok) {
      const message = data?.error?.message || data?.detail?.message || data?.message || `PUT ${path} ${res.status}`;
      throw new Error(message);
    }

    if (data?.error && businessStatus !== 'failed') {
      const message = data?.error?.message || data?.message || `PUT ${path} ${res.status}`;
      throw new Error(message);
    }

    return data;
  }

  async function patch(path, payload) {
    const baseUrl = resolveBaseUrl();
    const headers = buildTtsHeaders('application/json');
    const res = await fetchImpl(`${baseUrl}${path}`, {
      method: 'PATCH',
      headers,
      credentials: 'include',
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
      const message = data?.error?.message || data?.detail?.message || data?.message || `PATCH ${path} ${res.status}`;
      throw new Error(message);
    }

    return data;
  }

  async function del(path) {
    const baseUrl = resolveBaseUrl();
    const headers = buildTtsHeaders();
    const res = await fetchImpl(`${baseUrl}${path}`, {
      method: 'DELETE',
      headers,
      credentials: 'include',
    });

    const raw = await res.text();
    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = { raw };
    }

    if (!res.ok) {
      const message = data?.error?.message || data?.detail?.message || data?.message || `DELETE ${path} ${res.status}`;
      throw new Error(message);
    }

    return data;
  }

  async function postForm(path, formData) {
    const baseUrl = resolveBaseUrl();
    const headers = buildTtsHeaders();
    const res = await fetchImpl(`${baseUrl}${path}`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: formData,
    });

    const raw = await res.text();
    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = { raw };
    }

    const businessStatus = (data?.status || '').toString().trim().toLowerCase();
    if (!res.ok) {
      const message = data?.error?.message || data?.message || `POST ${path} ${res.status}`;
      throw new Error(message);
    }

    if (data?.error && businessStatus !== 'failed') {
      const message = data?.error?.message || data?.message || `POST ${path} ${res.status}`;
      throw new Error(message);
    }

    return data;
  }

  async function getBlob(path) {
    const baseUrl = resolveBaseUrl();
    const headers = buildTtsHeaders();
    const res = await fetchImpl(`${baseUrl}${path}`, { headers, credentials: 'include' });
    if (!res.ok) {
      let data = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }
      const message = data?.error?.message || `GET ${path} ${res.status}`;
      throw new Error(message);
    }
    return res.blob();
  }

  async function subtitlesGet(path) {
    const settings = getSettings();
    const sharedReadPath = resolveSubtitlesSharedReadPath(path);
    const baseUrl = sharedReadPath ? resolveGatewayBaseUrl(settings) : resolveSubtitlesBaseUrl();
    const headers = sharedReadPath ? buildGatewayReadHeaders() : buildSubtitlesHeaders();
    const url = sharedReadPath ? resolveSharedReadModelUrl(sharedReadPath, settings) : `${baseUrl}${path}`;
    const res = await fetchImpl(url, {
      headers,
      credentials: 'include',
      ...(sharedReadPath ? { cache: 'no-store' } : {}),
    });
    const raw = await res.text();
    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = { raw };
    }
    if (!res.ok) {
      const message = data?.error?.message || data?.detail?.message || data?.message || `GET ${path} ${res.status}`;
      throw new Error(message);
    }
    return data;
  }

  async function subtitlesPost(path, payload) {
    const baseUrl = resolveSubtitlesBaseUrl();
    const headers = buildSubtitlesHeaders('application/json');
    const res = await fetchImpl(`${baseUrl}${path}`, {
      method: 'POST',
      headers,
      credentials: 'include',
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
      const message = data?.error?.message || data?.detail?.message || data?.message || `POST ${path} ${res.status}`;
      throw new Error(message);
    }
    return data;
  }

  async function subtitlesPut(path, payload) {
    const baseUrl = resolveSubtitlesBaseUrl();
    const headers = buildSubtitlesHeaders('application/json');
    const res = await fetchImpl(`${baseUrl}${path}`, {
      method: 'PUT',
      headers,
      credentials: 'include',
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
      const message = data?.error?.message || data?.detail?.message || data?.message || `PUT ${path} ${res.status}`;
      throw new Error(message);
    }
    return data;
  }

  async function subtitlesPatch(path, payload) {
    const baseUrl = resolveSubtitlesBaseUrl();
    const headers = buildSubtitlesHeaders('application/json');
    const res = await fetchImpl(`${baseUrl}${path}`, {
      method: 'PATCH',
      headers,
      credentials: 'include',
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
      const message = data?.error?.message || data?.detail?.message || data?.message || `PATCH ${path} ${res.status}`;
      throw new Error(message);
    }
    return data;
  }

  async function subtitlesDelete(path) {
    const baseUrl = resolveSubtitlesBaseUrl();
    const headers = buildSubtitlesHeaders();
    const res = await fetchImpl(`${baseUrl}${path}`, { method: 'DELETE', headers, credentials: 'include' });
    const raw = await res.text();
    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = { raw };
    }
    if (!res.ok) {
      const message = data?.error?.message || data?.detail?.message || data?.message || `DELETE ${path} ${res.status}`;
      throw new Error(message);
    }
    return data;
  }

  async function subtitlesPostForm(path, formData) {
    const baseUrl = resolveSubtitlesBaseUrl();
    const headers = buildSubtitlesHeaders();
    const res = await fetchImpl(`${baseUrl}${path}`, { method: 'POST', headers, credentials: 'include', body: formData });
    const raw = await res.text();
    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = { raw };
    }
    if (!res.ok) {
      const message = data?.error?.message || data?.detail?.message || data?.message || `POST ${path} ${res.status}`;
      throw new Error(message);
    }
    return data;
  }

  async function subtitlesGetBlob(path) {
    const baseUrl = resolveSubtitlesBaseUrl();
    const headers = buildSubtitlesHeaders();
    const res = await fetchImpl(`${baseUrl}${path}`, { headers, credentials: 'include' });
    if (!res.ok) {
      let data = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }
      const message = data?.error?.message || data?.detail?.message || `GET ${path} ${res.status}`;
      throw new Error(message);
    }
    return res.blob();
  }

  return {
    get,
    post,
    put,
    patch,
    delete: del,
    postForm,
    getBlob,
    buildTtsHeaders,
    getSubtitlesHealth: () => subtitlesGet('/api/subtitles/health'),
    createSubtitleSession(formData) {
      return subtitlesPostForm('/api/subtitles/sessions', formData);
    },
    listSubtitleSessions(limit = 20) {
      return subtitlesGet(`/api/subtitles/sessions?limit=${encodeURIComponent(limit)}`);
    },
    getSubtitleSession(sessionId) {
      return subtitlesGet(`/api/subtitles/sessions/${encodeURIComponent(sessionId)}`);
    },
    deleteSubtitleSession(sessionId) {
      return subtitlesDelete(`/api/subtitles/sessions/${encodeURIComponent(sessionId)}`);
    },
    renameSubtitleSession(sessionId, displayName) {
      return subtitlesPatch(`/api/subtitles/sessions/${encodeURIComponent(sessionId)}`, { display_name: displayName });
    },
    getSubtitleSegments(sessionId) {
      return subtitlesGet(`/api/subtitles/sessions/${encodeURIComponent(sessionId)}/segments`);
    },
    updateSubtitleSegments(sessionId, payload) {
      return subtitlesPut(`/api/subtitles/sessions/${encodeURIComponent(sessionId)}/segments`, payload);
    },
    startSubtitleRender(sessionId, payload) {
      return subtitlesPost(`/api/subtitles/sessions/${encodeURIComponent(sessionId)}/render`, payload);
    },
    getSubtitleRenderStatus(sessionId) {
      return subtitlesGet(`/api/subtitles/sessions/${encodeURIComponent(sessionId)}/render`);
    },
    getSubtitleDownload(sessionId) {
      return subtitlesGet(`/api/subtitles/sessions/${encodeURIComponent(sessionId)}/download`);
    },
    downloadSubtitleRender(sessionId) {
      return subtitlesGetBlob(`/api/subtitles/sessions/${encodeURIComponent(sessionId)}/download/file`);
    },
    getSubtitlePreviewVideo(sessionId) {
      return subtitlesGetBlob(`/api/subtitles/sessions/${encodeURIComponent(sessionId)}/preview/video`);
    },
  };
}
