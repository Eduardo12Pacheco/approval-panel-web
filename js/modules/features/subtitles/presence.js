import { normalizePresenceMode, resolvePresenceAdvisory } from '../presence-advisory.js';

export function resolveSubtitlePresence({ sessionId = '', dirty = false, mode = '' } = {}) {
  const resourceId = (sessionId || '').toString().trim();
  if (!resourceId) return null;
  return {
    area: 'subtitles',
    resource_type: 'subtitle-session',
    resource_id: resourceId,
    mode: normalizePresenceMode(mode || (dirty ? 'editing' : 'viewing')),
  };
}

export { resolvePresenceAdvisory };
