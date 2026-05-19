import {
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL,
  VIDEO_CANDIDATES_TEMP_BUCKET,
  VIDEO_PROJECT_AUDIO_BUCKET,
  VIDEO_PROJECT_VIDEO_BUCKET,
  buildAudioMetadata,
  buildAudioPath,
  buildCustomImagePath,
  buildPublicStorageUrl,
  buildVideoUploadMetadata,
  buildVideoUploadPath,
  encodeStoragePath,
  md5ProjectStorageKey,
} from './storage-paths.js';

const VIDEO_PROJECTS_RPC = '/rest/v1/rpc/get_video_edit_projects';
const SAVE_AUDIO_RPC = '/rest/v1/rpc/save_video_project_audio';
const ADD_CUSTOM_IMAGES_RPC = '/rest/v1/rpc/add_video_project_custom_images';
const SAVE_EDITOR_STATE_RPC = '/rest/v1/rpc/save_video_project_editor_state';
const SAVE_SELECTIONS_RPC = '/rest/v1/rpc/save_video_project_selections';
const DISABLE_PROJECT_RPC = '/rest/v1/rpc/disable_video_edit_project';

function normalizeRpcPayload(payload = {}) {
  return {
    p_draft_id: payload.draftId || null,
    p_limit: Number.isFinite(Number(payload.limit)) ? Number(payload.limit) : 50,
    p_include_detail: Boolean(payload.includeDetail),
  };
}

async function parseResponseBody(response) {
  const raw = await response.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { raw };
  }
  return data;
}

function responseErrorMessage(data, fallback) {
  return data?.message || data?.error || data?.raw || fallback;
}

export function createSupabaseVideoProjectsClient({ fetchImpl = fetch } = {}) {
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

    const data = await parseResponseBody(response);

    if (!response.ok) {
      const message = responseErrorMessage(data, `Video projects RPC ${response.status}`);
      throw new Error(message);
    }

    return data;
  }

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

    const data = await parseResponseBody(response);

    if (!response.ok) {
      const message = responseErrorMessage(data, `Save selections RPC ${response.status}`);
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

    const data = await parseResponseBody(response);

    if (!response.ok) {
      const message = responseErrorMessage(data, `Audio upload ${response.status}`);
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

    const data = await parseResponseBody(response);

    if (!response.ok) {
      const message = responseErrorMessage(data, `Custom image upload ${response.status}`);
      throw new Error(message);
    }

    return {
      storage_bucket: VIDEO_CANDIDATES_TEMP_BUCKET,
      storage_path: path,
      storage_public_url: buildPublicStorageUrl(VIDEO_CANDIDATES_TEMP_BUCKET, path),
      project_storage_key: projectStorageKey,
    };
  }

  async function uploadProjectVideoFile({ draftId, file, durationSeconds = 0 }) {
    const id = (draftId || '').toString().trim();
    if (!id) throw new Error('draftId is required');
    if (!file) throw new Error('video file is required');

    const path = buildVideoUploadPath({ draftId: id, file });
    const response = await fetchImpl(
      `${SUPABASE_URL}/storage/v1/object/${VIDEO_PROJECT_VIDEO_BUCKET}/${encodeStoragePath(path)}`,
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
    const data = await parseResponseBody(response);
    if (!response.ok) {
      const message = responseErrorMessage(data, `Video upload ${response.status}`);
      throw new Error(message);
    }
    return buildVideoUploadMetadata({ path, file, durationSeconds });
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

    const data = await parseResponseBody(response);

    if (!response.ok || data?.ok === false) {
      const message = responseErrorMessage(data, `Add custom images RPC ${response.status}`);
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

    const data = await parseResponseBody(response);

    if (!response.ok || data?.ok === false) {
      const message = responseErrorMessage(data, `Save audio RPC ${response.status}`);
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

    const data = await parseResponseBody(response);

    if (!response.ok || data?.ok === false) {
      const message = responseErrorMessage(data, `Save editor state RPC ${response.status}`);
      throw new Error(message);
    }

    return data;
  }

  async function disableVideoProject({ draftId } = {}) {
    const id = (draftId || '').toString().trim();
    if (!id) throw new Error('draftId is required');

    const response = await fetchImpl(`${SUPABASE_URL}${DISABLE_PROJECT_RPC}`, {
      method: 'POST',
      headers: rpcHeaders,
      body: JSON.stringify({ p_draft_id: id }),
    });

    const data = await parseResponseBody(response);

    if (!response.ok || data?.ok === false) {
      const message = responseErrorMessage(data, `Disable project RPC ${response.status}`);
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
    saveVideoProjectEditorState,
    uploadCustomImageFile,
    uploadProjectVideoFile,
    addVideoProjectCustomImages,
    disableVideoProject,
  };
}
