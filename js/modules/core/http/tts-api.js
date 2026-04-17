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

export function createTtsApiClient({ getSettings, fetchImpl = fetch, btoaImpl = btoa }) {
  function getTtsBasicAuthHeader() {
    const settings = getSettings();
    const user = (settings.ttsBasicUser || '').trim();
    const pass = (settings.ttsBasicPass || '').toString();
    if (!user || !pass) {
      throw new Error('Configurá usuario y contraseña de Audio API');
    }
    return `Basic ${btoaImpl(`${user}:${pass}`)}`;
  }

  function buildTtsHeaders(contentType = null) {
    const settings = getSettings();
    const apiKey = (settings.ttsApiKey || '').trim();
    if (!apiKey) {
      throw new Error('Configuración de Audio API incompleta');
    }

    const headers = {
      'x-api-key': apiKey,
      Authorization: getTtsBasicAuthHeader(),
    };

    if (contentType) {
      headers['Content-Type'] = contentType;
    }

    const devUserEmail = (settings.ttsUserEmail || '').trim();
    if (devUserEmail) headers['x-user-email'] = devUserEmail;

    return headers;
  }

  function resolveBaseUrl() {
    const settings = getSettings();
    const baseUrl = (settings.ttsBaseUrl || '').trim();
    if (!baseUrl) {
      throw new Error('Configuración de Audio API incompleta');
    }
    return baseUrl;
  }

  async function get(path) {
    const baseUrl = resolveBaseUrl();
    const headers = buildTtsHeaders();
    const res = await fetchImpl(`${baseUrl}${path}`, { headers });
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

  async function postForm(path, formData) {
    const baseUrl = resolveBaseUrl();
    const headers = buildTtsHeaders();
    const res = await fetchImpl(`${baseUrl}${path}`, {
      method: 'POST',
      headers,
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
    const res = await fetchImpl(`${baseUrl}${path}`, { headers });
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

  return {
    get,
    post,
    postForm,
    getBlob,
    buildTtsHeaders,
  };
}
