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
import {
  buildGatewayReadHeaders,
  resolveSharedReadModelUrl,
  resolveVideoProjectsSharedReadPath,
} from '../../../core/http/shared-read-models.js';
import { normalizeCustomImageMimeType } from '../domain/image-files.js';

const VIDEO_PROJECTS_RPC = '/rest/v1/rpc/get_video_edit_projects';
const SAVE_AUDIO_RPC = '/rest/v1/rpc/save_video_project_audio';
const ADD_CUSTOM_IMAGES_RPC = '/rest/v1/rpc/add_video_project_custom_images';
const SAVE_EDITOR_STATE_RPC = '/rest/v1/rpc/save_video_project_editor_state';
const SAVE_SELECTIONS_RPC = '/rest/v1/rpc/save_video_project_selections';
const DISABLE_PROJECT_RPC = '/rest/v1/rpc/disable_video_edit_project';
const VOICE_SOURCE_TUS_UPLOAD_URL = 'https://ulzcthcdakjfretjdakd.storage.supabase.co/storage/v1/upload/resumable';
const VOICE_SOURCE_TUS_CHUNK_SIZE = 6 * 1024 * 1024;

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

function encodeTusMetadataValue(value = '') {
  const input = String(value);
  if (typeof btoa === 'function') {
    return btoa(unescape(encodeURIComponent(input)));
  }
  return Buffer.from(input, 'utf8').toString('base64');
}

function buildTusUploadMetadata(metadata = {}) {
  return Object.entries(metadata)
    .map(([key, value]) => `${key} ${encodeTusMetadataValue(value)}`)
    .join(',');
}

function resolveHeader(headers, name) {
  if (!headers) return '';
  if (typeof headers.get === 'function') return headers.get(name) || '';
  return headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()] || '';
}

export function createSupabaseVideoProjectsClient({ fetchImpl = fetch } = {}) {
  const rpcHeaders = {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
    'Content-Type': 'application/json',
  };

  async function callVideoProjectsRpc(payload = {}) {
    const sharedReadPath = resolveVideoProjectsSharedReadPath({
      draftId: payload.draftId,
      limit: payload.limit,
    });
    const sharedResponse = await fetchImpl(resolveSharedReadModelUrl(sharedReadPath), {
      method: 'GET',
      headers: buildGatewayReadHeaders(),
      credentials: 'include',
      cache: 'no-store',
    });

    const sharedData = await parseResponseBody(sharedResponse);

    if (!sharedResponse.ok) {
      const message = responseErrorMessage(sharedData, `Video projects read model ${sharedResponse.status}`);
      throw new Error(message);
    }

    return sharedData;
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
    const mimeType = normalizeCustomImageMimeType(file) || file.type || 'application/octet-stream';
    const response = await fetchImpl(
      `${SUPABASE_URL}/storage/v1/object/${VIDEO_CANDIDATES_TEMP_BUCKET}/${encodeStoragePath(path)}`,
      {
        method: 'POST',
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
          'Content-Type': mimeType,
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

  async function uploadVoiceSourceVideoFile({ draftId, file }) {
    const id = (draftId || '').toString().trim();
    if (!id) throw new Error('draftId is required');
    if (!file) throw new Error('video file is required');

    const path = buildVideoUploadPath({ draftId: id, file });
    const contentType = file.type || 'video/mp4';
    const createResponse = await fetchImpl(VOICE_SOURCE_TUS_UPLOAD_URL, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
        'Tus-Resumable': '1.0.0',
        'Upload-Length': String(Number(file.size || 0)),
        'Upload-Metadata': buildTusUploadMetadata({
          bucketName: VIDEO_PROJECT_VIDEO_BUCKET,
          objectName: path,
          contentType,
          cacheControl: '3600',
        }),
        'x-upsert': 'false',
      },
    });

    if (!createResponse.ok) {
      const data = await parseResponseBody(createResponse);
      const message = responseErrorMessage(data, `Voice source video upload ${createResponse.status}`);
      throw new Error(message);
    }

    const location = resolveHeader(createResponse.headers, 'location');
    if (!location) throw new Error('Voice source video upload location missing');
    const uploadUrl = new URL(location, VOICE_SOURCE_TUS_UPLOAD_URL).href;
    let offset = 0;
    const size = Number(file.size || 0);

    while (offset < size) {
      const nextOffset = Math.min(offset + VOICE_SOURCE_TUS_CHUNK_SIZE, size);
      const chunk = file.slice(offset, nextOffset, contentType);
      const patchResponse = await fetchImpl(uploadUrl, {
        method: 'PATCH',
        headers: {
          'Tus-Resumable': '1.0.0',
          'Upload-Offset': String(offset),
          'Content-Type': 'application/offset+octet-stream',
        },
        body: chunk,
      });

      if (!patchResponse.ok) {
        const data = await parseResponseBody(patchResponse);
        const message = responseErrorMessage(data, `Voice source video chunk upload ${patchResponse.status}`);
        throw new Error(message);
      }

      const responseOffset = Number(resolveHeader(patchResponse.headers, 'upload-offset'));
      if (!Number.isFinite(responseOffset) || responseOffset !== nextOffset) {
        throw new Error('Voice source video upload offset mismatch');
      }
      offset = responseOffset;
    }

    return buildVideoUploadMetadata({ path, file, durationSeconds: 0 });
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
    listVideoProjects: ({ limit = 50 } = {}) => callVideoProjectsRpc({ limit, includeDetail: true }),
    getVideoProject: (draftId) => callVideoProjectsRpc({ draftId, limit: 1, includeDetail: true }),
    saveVideoProjectSelections,
    uploadAudioFile,
    saveVideoProjectAudio,
    saveVideoProjectEditorState,
    uploadCustomImageFile,
    uploadProjectVideoFile,
    uploadVoiceSourceVideoFile,
    addVideoProjectCustomImages,
    disableVideoProject,
  };
}
