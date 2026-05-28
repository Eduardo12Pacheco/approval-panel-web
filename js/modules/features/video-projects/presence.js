import { normalizePresenceMode, resolvePresenceAdvisory } from '../presence-advisory.js';

function resolveVideoProjectResourceId(project = {}) {
  return (project?.draft_id || project?.project_id || project?.id || '').toString().trim();
}

export function resolveVideoEditorPresence(project = {}, { mode } = {}) {
  const resourceId = resolveVideoProjectResourceId(project);
  if (!resourceId) return null;
  const resolvedMode = mode || (project?.editor_state?.dirty === true ? 'editing' : 'viewing');
  return {
    area: 'video-projects',
    resource_type: 'video-project',
    resource_id: resourceId,
    mode: normalizePresenceMode(resolvedMode),
  };
}

export { resolvePresenceAdvisory };
