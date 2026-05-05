const SUPABASE_URL = 'https://ulzcthcdakjfretjdakd.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_RDUiyePyvXCkdU5k17Ue6g_nmxgSsQf';
const VIDEO_PROJECTS_RPC = '/rest/v1/rpc/get_video_edit_projects';
const SAVE_AUDIO_RPC = '/rest/v1/rpc/save_video_project_audio';
const ADD_CUSTOM_IMAGES_RPC = '/rest/v1/rpc/add_video_project_custom_images';
const SAVE_EDITOR_STATE_RPC = '/rest/v1/rpc/save_video_project_editor_state';
const VIDEO_PROJECT_AUDIO_BUCKET = 'video-project-audio';
const VIDEO_CANDIDATES_TEMP_BUCKET = 'video-candidates-temp';

function sanitizePathPart(value = '') {
  return (value || '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || 'audio';
}

function safeProjectPathPart(value = '') {
  return (value || '')
    .toString()
    .trim()
    .replace(/[\\/]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'project';
}

function md5ProjectStorageKey(value = '') {
  const input = unescape(encodeURIComponent((value || '').toString()));
  const rotateLeft = (x, c) => (x << c) | (x >>> (32 - c));
  const add = (x, y) => ((x || 0) + (y || 0)) | 0;
  const cmn = (q, a, b, x, s, t) => add(rotateLeft(add(add(a, q), add(x, t)), s), b);
  const ff = (a, b, c, d, x, s, t) => cmn((b & c) | (~b & d), a, b, x, s, t);
  const gg = (a, b, c, d, x, s, t) => cmn((b & d) | (c & ~d), a, b, x, s, t);
  const hh = (a, b, c, d, x, s, t) => cmn(b ^ c ^ d, a, b, x, s, t);
  const ii = (a, b, c, d, x, s, t) => cmn(c ^ (b | ~d), a, b, x, s, t);

  const words = [];
  for (let i = 0; i < input.length; i += 1) {
    words[i >> 2] |= input.charCodeAt(i) << ((i % 4) * 8);
  }
  const bitLength = input.length * 8;
  words[bitLength >> 5] |= 0x80 << (bitLength % 32);
  words[(((bitLength + 64) >>> 9) << 4) + 14] = bitLength;

  let a = 1732584193;
  let b = -271733879;
  let c = -1732584194;
  let d = 271733878;

  for (let i = 0; i < words.length; i += 16) {
    const olda = a;
    const oldb = b;
    const oldc = c;
    const oldd = d;

    a = ff(a, b, c, d, words[i], 7, -680876936);
    d = ff(d, a, b, c, words[i + 1], 12, -389564586);
    c = ff(c, d, a, b, words[i + 2], 17, 606105819);
    b = ff(b, c, d, a, words[i + 3], 22, -1044525330);
    a = ff(a, b, c, d, words[i + 4], 7, -176418897);
    d = ff(d, a, b, c, words[i + 5], 12, 1200080426);
    c = ff(c, d, a, b, words[i + 6], 17, -1473231341);
    b = ff(b, c, d, a, words[i + 7], 22, -45705983);
    a = ff(a, b, c, d, words[i + 8], 7, 1770035416);
    d = ff(d, a, b, c, words[i + 9], 12, -1958414417);
    c = ff(c, d, a, b, words[i + 10], 17, -42063);
    b = ff(b, c, d, a, words[i + 11], 22, -1990404162);
    a = ff(a, b, c, d, words[i + 12], 7, 1804603682);
    d = ff(d, a, b, c, words[i + 13], 12, -40341101);
    c = ff(c, d, a, b, words[i + 14], 17, -1502002290);
    b = ff(b, c, d, a, words[i + 15], 22, 1236535329);

    a = gg(a, b, c, d, words[i + 1], 5, -165796510);
    d = gg(d, a, b, c, words[i + 6], 9, -1069501632);
    c = gg(c, d, a, b, words[i + 11], 14, 643717713);
    b = gg(b, c, d, a, words[i], 20, -373897302);
    a = gg(a, b, c, d, words[i + 5], 5, -701558691);
    d = gg(d, a, b, c, words[i + 10], 9, 38016083);
    c = gg(c, d, a, b, words[i + 15], 14, -660478335);
    b = gg(b, c, d, a, words[i + 4], 20, -405537848);
    a = gg(a, b, c, d, words[i + 9], 5, 568446438);
    d = gg(d, a, b, c, words[i + 14], 9, -1019803690);
    c = gg(c, d, a, b, words[i + 3], 14, -187363961);
    b = gg(b, c, d, a, words[i + 8], 20, 1163531501);
    a = gg(a, b, c, d, words[i + 13], 5, -1444681467);
    d = gg(d, a, b, c, words[i + 2], 9, -51403784);
    c = gg(c, d, a, b, words[i + 7], 14, 1735328473);
    b = gg(b, c, d, a, words[i + 12], 20, -1926607734);

    a = hh(a, b, c, d, words[i + 5], 4, -378558);
    d = hh(d, a, b, c, words[i + 8], 11, -2022574463);
    c = hh(c, d, a, b, words[i + 11], 16, 1839030562);
    b = hh(b, c, d, a, words[i + 14], 23, -35309556);
    a = hh(a, b, c, d, words[i + 1], 4, -1530992060);
    d = hh(d, a, b, c, words[i + 4], 11, 1272893353);
    c = hh(c, d, a, b, words[i + 7], 16, -155497632);
    b = hh(b, c, d, a, words[i + 10], 23, -1094730640);
    a = hh(a, b, c, d, words[i + 13], 4, 681279174);
    d = hh(d, a, b, c, words[i], 11, -358537222);
    c = hh(c, d, a, b, words[i + 3], 16, -722521979);
    b = hh(b, c, d, a, words[i + 6], 23, 76029189);
    a = hh(a, b, c, d, words[i + 9], 4, -640364487);
    d = hh(d, a, b, c, words[i + 12], 11, -421815835);
    c = hh(c, d, a, b, words[i + 15], 16, 530742520);
    b = hh(b, c, d, a, words[i + 2], 23, -995338651);

    a = ii(a, b, c, d, words[i], 6, -198630844);
    d = ii(d, a, b, c, words[i + 7], 10, 1126891415);
    c = ii(c, d, a, b, words[i + 14], 15, -1416354905);
    b = ii(b, c, d, a, words[i + 5], 21, -57434055);
    a = ii(a, b, c, d, words[i + 12], 6, 1700485571);
    d = ii(d, a, b, c, words[i + 3], 10, -1894986606);
    c = ii(c, d, a, b, words[i + 10], 15, -1051523);
    b = ii(b, c, d, a, words[i + 1], 21, -2054922799);
    a = ii(a, b, c, d, words[i + 8], 6, 1873313359);
    d = ii(d, a, b, c, words[i + 15], 10, -30611744);
    c = ii(c, d, a, b, words[i + 6], 15, -1560198380);
    b = ii(b, c, d, a, words[i + 13], 21, 1309151649);
    a = ii(a, b, c, d, words[i + 4], 6, -145523070);
    d = ii(d, a, b, c, words[i + 11], 10, -1120210379);
    c = ii(c, d, a, b, words[i + 2], 15, 718787259);
    b = ii(b, c, d, a, words[i + 9], 21, -343485551);

    a = add(a, olda);
    b = add(b, oldb);
    c = add(c, oldc);
    d = add(d, oldd);
  }

  const toHex = (num) => Array.from({ length: 4 }, (_, i) => ((num >> (i * 8)) & 0xff).toString(16).padStart(2, '0')).join('');
  return `${toHex(a)}${toHex(b)}${toHex(c)}${toHex(d)}`;
}

function encodeStoragePath(path = '') {
  return path.split('/').map(encodeURIComponent).join('/');
}

function buildAudioPath({ draftId, kind, file }) {
  const safeDraftId = md5ProjectStorageKey(draftId);
  const safeKind = kind === 'background' ? 'background' : 'voice';
  const safeName = sanitizePathPart(file?.name || `${safeKind}-audio`);
  return `projects/${safeDraftId}/${safeKind}/${Date.now()}-${safeName}`;
}

function buildCustomImagePath({ draftId, file }) {
  const safeDraftId = md5ProjectStorageKey(draftId);
  const safeName = sanitizePathPart(file?.name || 'custom-image');
  return `projects/${safeDraftId}/custom/${Date.now()}-${safeName}`;
}

function buildPublicStorageUrl(bucket, path) {
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${encodeStoragePath(path)}`;
}

function buildAudioMetadata({ path, kind, file }) {
  return {
    kind,
    bucket: VIDEO_PROJECT_AUDIO_BUCKET,
    path,
    public_url: buildPublicStorageUrl(VIDEO_PROJECT_AUDIO_BUCKET, path),
    name: file?.name || '',
    size: Number(file?.size || 0),
    mime_type: file?.type || 'application/octet-stream',
    uploaded_at: new Date().toISOString(),
  };
}

function normalizeRpcPayload(payload = {}) {
  return {
    p_draft_id: payload.draftId || null,
    p_limit: Number.isFinite(Number(payload.limit)) ? Number(payload.limit) : 50,
    p_include_detail: Boolean(payload.includeDetail),
  };
}

export function createVideoProjectsApiClient({ fetchImpl = fetch } = {}) {
  const rpcHeaders = {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
    'Content-Type': 'application/json',
  };

  async function callVideoProjectsRpc(payload = {}) {
    const response = await fetchImpl(`${SUPABASE_URL}${VIDEO_PROJECTS_RPC}`, {
      method: 'POST',
      headers: rpcHeaders,
      body: JSON.stringify(normalizeRpcPayload(payload)),
    });

    const raw = await response.text();
    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = { raw };
    }

    if (!response.ok) {
      const message = data?.message || data?.error || data?.raw || `Video projects RPC ${response.status}`;
      throw new Error(message);
    }

    return data;
  }

  const SAVE_SELECTIONS_RPC = '/rest/v1/rpc/save_video_project_selections';

  async function saveVideoProjectSelections({ draftId, selectedImageIds = [] } = {}) {
    const id = (draftId || '').toString().trim();
    if (!id) throw new Error('draftId is required');

    const ids = Array.isArray(selectedImageIds) ? selectedImageIds : [];

    const response = await fetchImpl(`${SUPABASE_URL}${SAVE_SELECTIONS_RPC}`, {
      method: 'POST',
      headers: rpcHeaders,
      body: JSON.stringify({
        p_draft_id: id,
        p_selected_image_ids: ids,
      }),
    });

    const raw = await response.text();
    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = { raw };
    }

    if (!response.ok) {
      const message = data?.message || data?.error || data?.raw || `Save selections RPC ${response.status}`;
      throw new Error(message);
    }

    return data;
  }

  async function uploadAudioFile({ draftId, kind, file }) {
    const id = (draftId || '').toString().trim();
    if (!id) throw new Error('draftId is required');
    if (!file) throw new Error('audio file is required');

    const normalizedKind = kind === 'background' ? 'background' : 'voice';
    const path = buildAudioPath({ draftId: id, kind: normalizedKind, file });
    const response = await fetchImpl(
      `${SUPABASE_URL}/storage/v1/object/${VIDEO_PROJECT_AUDIO_BUCKET}/${encodeStoragePath(path)}`,
      {
        method: 'POST',
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
          'Content-Type': file.type || 'application/octet-stream',
          'x-upsert': 'false',
        },
        body: file,
      },
    );

    const raw = await response.text();
    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = { raw };
    }

    if (!response.ok) {
      const message = data?.message || data?.error || data?.raw || `Audio upload ${response.status}`;
      throw new Error(message);
    }

    return buildAudioMetadata({ path, kind: normalizedKind, file });
  }

  async function uploadCustomImageFile({ draftId, file }) {
    const id = (draftId || '').toString().trim();
    if (!id) throw new Error('draftId is required');
    if (!file) throw new Error('image file is required');

    const projectStorageKey = md5ProjectStorageKey(id);
    const path = buildCustomImagePath({ draftId: id, file });
    const response = await fetchImpl(
      `${SUPABASE_URL}/storage/v1/object/${VIDEO_CANDIDATES_TEMP_BUCKET}/${encodeStoragePath(path)}`,
      {
        method: 'POST',
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
          'Content-Type': file.type || 'application/octet-stream',
          'x-upsert': 'false',
        },
        body: file,
      },
    );

    const raw = await response.text();
    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = { raw };
    }

    if (!response.ok) {
      const message = data?.message || data?.error || data?.raw || `Custom image upload ${response.status}`;
      throw new Error(message);
    }

    return {
      storage_bucket: VIDEO_CANDIDATES_TEMP_BUCKET,
      storage_path: path,
      storage_public_url: buildPublicStorageUrl(VIDEO_CANDIDATES_TEMP_BUCKET, path),
      project_storage_key: projectStorageKey,
    };
  }

  async function addVideoProjectCustomImages({ draftId, customCandidates = [] } = {}) {
    const id = (draftId || '').toString().trim();
    if (!id) throw new Error('draftId is required');
    if (!Array.isArray(customCandidates) || !customCandidates.length) {
      throw new Error('customCandidates is required');
    }

    const response = await fetchImpl(`${SUPABASE_URL}${ADD_CUSTOM_IMAGES_RPC}`, {
      method: 'POST',
      headers: rpcHeaders,
      body: JSON.stringify({
        p_draft_id: id,
        p_custom_candidates: customCandidates,
      }),
    });

    const raw = await response.text();
    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = { raw };
    }

    if (!response.ok || data?.ok === false) {
      const message = data?.message || data?.error || data?.raw || `Add custom images RPC ${response.status}`;
      throw new Error(message);
    }

    return data;
  }

  async function saveVideoProjectAudio({ draftId, voiceAudio = {}, backgroundAudio = {} } = {}) {
    const id = (draftId || '').toString().trim();
    if (!id) throw new Error('draftId is required');

    const response = await fetchImpl(`${SUPABASE_URL}${SAVE_AUDIO_RPC}`, {
      method: 'POST',
      headers: rpcHeaders,
      body: JSON.stringify({
        p_draft_id: id,
        p_voice_audio: voiceAudio || {},
        p_background_audio: backgroundAudio || {},
      }),
    });

    const raw = await response.text();
    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = { raw };
    }

    if (!response.ok || data?.ok === false) {
      const message = data?.message || data?.error || data?.raw || `Save audio RPC ${response.status}`;
      throw new Error(message);
    }

    return data;
  }

  async function saveVideoProjectEditorState({ draftId, editorState = {} } = {}) {
    const id = (draftId || '').toString().trim();
    if (!id) throw new Error('draftId is required');

    const response = await fetchImpl(`${SUPABASE_URL}${SAVE_EDITOR_STATE_RPC}`, {
      method: 'POST',
      headers: rpcHeaders,
      body: JSON.stringify({
        p_draft_id: id,
        p_editor_state: editorState || {},
      }),
    });

    const raw = await response.text();
    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = { raw };
    }

    if (!response.ok || data?.ok === false) {
      const message = data?.message || data?.error || data?.raw || `Save editor state RPC ${response.status}`;
      throw new Error(message);
    }

    return data;
  }

  function createRemotionClient({ resolveBaseUrl }) {
    const ensureBaseUrl = () => {
      const base = (typeof resolveBaseUrl === 'function' ? resolveBaseUrl() : '').toString().trim();
      if (!base) throw new Error('Remotion API URL no configurada');
      return base.replace(/\/+$/, '');
    };

    const jsonFetch = async (endpoint, { method = 'GET', body } = {}) => {
      const response = await fetchImpl(`${ensureBaseUrl()}${endpoint}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
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
      finalDownloadUrl: (projectId) => `${ensureBaseUrl()}/api/projects/${encodeURIComponent(projectId)}/download/final`,
    };
  }

  return {
    listVideoProjects: ({ limit = 50 } = {}) => callVideoProjectsRpc({ limit, includeDetail: false }),
    getVideoProject: (draftId) => callVideoProjectsRpc({ draftId, limit: 1, includeDetail: true }),
    saveVideoProjectSelections,
    uploadAudioFile,
    saveVideoProjectAudio,
    saveVideoProjectEditorState,
    uploadCustomImageFile,
    addVideoProjectCustomImages,
    createRemotionClient,
  };
}
