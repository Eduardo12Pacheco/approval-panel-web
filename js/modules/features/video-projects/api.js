const SUPABASE_URL = 'https://ulzcthcdakjfretjdakd.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_RDUiyePyvXCkdU5k17Ue6g_nmxgSsQf';
const VIDEO_PROJECTS_RPC = '/rest/v1/rpc/get_video_edit_projects';

function normalizeRpcPayload(payload = {}) {
  return {
    p_draft_id: payload.draftId || null,
    p_limit: Number.isFinite(Number(payload.limit)) ? Number(payload.limit) : 50,
    p_include_detail: Boolean(payload.includeDetail),
  };
}

export function createVideoProjectsApiClient({ fetchImpl = fetch } = {}) {
  async function callVideoProjectsRpc(payload = {}) {
    const response = await fetchImpl(`${SUPABASE_URL}${VIDEO_PROJECTS_RPC}`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
        'Content-Type': 'application/json',
      },
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

  return {
    listVideoProjects: ({ limit = 50 } = {}) => callVideoProjectsRpc({ limit, includeDetail: false }),
    getVideoProject: (draftId) => callVideoProjectsRpc({ draftId, limit: 1, includeDetail: true }),
  };
}
