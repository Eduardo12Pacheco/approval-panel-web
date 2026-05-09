import { createApprovalPipelineClient as createApprovalPipelineClientBase } from './approval-pipeline-client.js';
import { createRemotionClient as createRemotionClientBase } from './remotion-client.js';
import { createSupabaseVideoProjectsClient } from './supabase-client.js';

export function createVideoProjectsApiClient({ fetchImpl = fetch } = {}) {
  return {
    ...createSupabaseVideoProjectsClient({ fetchImpl }),
    createRemotionClient: (options = {}) => createRemotionClientBase({ fetchImpl, ...options }),
    createApprovalPipelineClient: (options = {}) => createApprovalPipelineClientBase({ fetchImpl, ...options }),
  };
}
