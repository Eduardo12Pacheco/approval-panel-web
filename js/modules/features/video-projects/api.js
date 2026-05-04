const SUPABASE_URL = 'https://ulzcthcdakjfretjdakd.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_RDUiyePyvXCkdU5k17Ue6g_nmxgSsQf';
const VIDEO_PROJECTS_RPC = '/rest/v1/rpc/get_video_edit_projects';
const SAVE_AUDIO_RPC = '/rest/v1/rpc/save_video_project_audio';
const VIDEO_PROJECT_AUDIO_BUCKET = 'video-project-audio';

function sanitizePathPart(value = '') {
  return (value || '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || 'audio';
}

function encodeStoragePath(path = '') {
  return path.split('/').map(encodeURIComponent).join('/');
}

function buildAudioPath({ draftId, kind, file }) {
  const safeDraftId = sanitizePathPart(draftId);
  const safeKind = kind === 'background' ? 'background' : 'voice';
  const safeName = sanitizePathPart(file?.name || `${safeKind}-audio`);
  return `projects/${safeDraftId}/${safeKind}/${Date.now()}-${safeName}`;
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

  return {
    listVideoProjects: ({ limit = 50 } = {}) => callVideoProjectsRpc({ limit, includeDetail: false }),
    getVideoProject: (draftId) => callVideoProjectsRpc({ draftId, limit: 1, includeDetail: true }),
    saveVideoProjectSelections,
    uploadAudioFile,
    saveVideoProjectAudio,
  };
}
