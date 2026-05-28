export function createActiveUsersState() {
  return {
    status: 'idle',
    snapshot: emptyPresenceSnapshot(),
    error: '',
    refreshInFlight: false,
  };
}

export function emptyPresenceSnapshot() {
  return { sessions: [], resources: [], ttl_seconds: 0 };
}

export function normalizePresenceSnapshot(snapshot = {}) {
  const sessions = Array.isArray(snapshot.sessions) ? snapshot.sessions.map(normalizePresenceSession) : [];
  return {
    sessions,
    resources: Array.isArray(snapshot.resources) ? snapshot.resources : [],
    ttl_seconds: Number.isFinite(Number(snapshot.ttl_seconds)) ? Number(snapshot.ttl_seconds) : 0,
  };
}

export function normalizePresenceSession(session = {}) {
  const actor = session.actor && typeof session.actor === 'object' ? session.actor : {};
  const area = clean(session.area) || 'panel';
  const resourceType = clean(session.resource_type || session.resourceType);
  const resourceId = clean(session.resource_id || session.resourceId);
  return {
    sessionId: clean(session.session_id || session.sessionId),
    actorLabel: clean(actor.display_name || actor.displayName || actor.email || actor.user_id || actor.userId) || 'Usuario activo',
    actorEmail: clean(actor.email),
    area,
    resourceType,
    resourceId,
    resourceLabel: [resourceType, resourceId].filter(Boolean).join(' · ') || area,
    mode: clean(session.mode) || 'viewing',
    lastActivityAt: clean(session.last_activity_at || session.lastActivityAt),
  };
}

function clean(value = '') {
  return (value ?? '').toString().trim();
}
