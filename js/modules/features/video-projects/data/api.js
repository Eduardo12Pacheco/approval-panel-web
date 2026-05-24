import { createApprovalPipelineClient as createApprovalPipelineClientBase } from './approval-pipeline-client.js';
import { createRemotionClient as createRemotionClientBase } from './remotion-client.js';
import { createSupabaseVideoProjectsClient } from './supabase-client.js';
import { resolveServiceConfig } from '../../../core/state/app-store.js';

const MANUAL_VIDEO_PROJECT_ENDPOINT = '/webhook/video-projects/manual-create/v1';

async function parseResponseBody(response) {
  const raw = await response.text();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

async function createManualVideoProject({ settings = {}, payload = {}, fetchImpl = fetch } = {}) {
  const config = resolveServiceConfig(settings, 'n8n');
  const baseUrl = (config.baseUrl || '').toString().trim();
  if (!baseUrl) throw new Error('Falta configurar la URL base de n8n.');

  const headers = { 'Content-Type': 'application/json' };
  if (config.secret) headers['x-approval-secret'] = config.secret;

  const response = await fetchImpl(`${baseUrl}${MANUAL_VIDEO_PROJECT_ENDPOINT}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const data = await parseResponseBody(response);

  if (!response.ok || data?.ok === false || data?.error) {
    throw new Error(data?.message || data?.error || data?.raw || `Crear proyecto ${response.status}`);
  }

  return data;
}

export function createVideoProjectsApiClient({ fetchImpl = fetch } = {}) {
  return {
    ...createSupabaseVideoProjectsClient({ fetchImpl }),
    createManualVideoProject: (options = {}) => createManualVideoProject({ fetchImpl, ...options }),
    createRemotionClient: (options = {}) => createRemotionClientBase({ fetchImpl, ...options }),
    createApprovalPipelineClient: (options = {}) => createApprovalPipelineClientBase({ fetchImpl, ...options }),
  };
}
