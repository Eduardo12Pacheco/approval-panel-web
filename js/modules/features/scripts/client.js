export const SCRIPT_DRAFTS_ENDPOINT = '/webhook/mvp-script-drafts-pending/supabase/v2';
export const SCRIPT_DRAFT_SAVE_ENDPOINT = '/webhook/mvp-script-draft-save/supabase/v2';
export const SCRIPT_PUBLISH_ENDPOINT = '/webhook/mvp-script-publish/supabase/v2';
export const SCRIPT_PUBLISH_STATUS_ENDPOINT = '/webhook/mvp-script-publish-status/supabase/v1';
export const SCRIPT_DOWNLOAD_DOCX_ENDPOINT = '/webhook/mvp-script-download-doc/supabase/v1';

export async function fetchScriptDrafts(api) {
  return api.get(SCRIPT_DRAFTS_ENDPOINT);
}

export async function saveScriptDraft(api, ids, edited) {
  return api.post(SCRIPT_DRAFT_SAVE_ENDPOINT, {
    ...ids,
    guion_editado: edited,
  });
}

export async function dismissProcessedScriptDraft(api, ids) {
  return api.post(SCRIPT_DRAFT_SAVE_ENDPOINT, {
    ...ids,
    action: 'dismiss_processed',
  });
}

export async function publishScriptDraft(api, ids) {
  return api.post(SCRIPT_PUBLISH_ENDPOINT, {
    ...ids,
  });
}

export async function fetchScriptPublishStatus(api, jobId) {
  return api.post(SCRIPT_PUBLISH_STATUS_ENDPOINT, { job_id: jobId });
}

export async function downloadScriptDocx(api, ids) {
  return api.postBlob(SCRIPT_DOWNLOAD_DOCX_ENDPOINT, {
    ...ids,
    format: 'docx',
  });
}
