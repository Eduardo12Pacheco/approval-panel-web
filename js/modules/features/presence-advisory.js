function normalizeText(value = '') {
  return (value ?? '').toString().trim();
}

function normalizeMode(value = '') {
  return normalizeText(value).toLowerCase() === 'editing' ? 'editing' : 'viewing';
}

export function resolvePresenceAdvisory({ snapshot = {}, resource = {}, currentSessionId = '' } = {}) {
  const area = normalizeText(resource.area);
  const resourceType = normalizeText(resource.resource_type);
  const resourceId = normalizeText(resource.resource_id);
  if (!area || !resourceType || !resourceId) return null;

  const currentSession = normalizeText(currentSessionId);
  const matches = (Array.isArray(snapshot?.sessions) ? snapshot.sessions : []).filter((session) => {
    if (currentSession && normalizeText(session?.session_id) === currentSession) return false;
    return normalizeText(session?.area) === area
      && normalizeText(session?.resource_type) === resourceType
      && normalizeText(session?.resource_id) === resourceId;
  });
  if (!matches.length) return null;

  const labels = matches.map((session) => (
    normalizeText(session?.actor?.display_name)
    || normalizeText(session?.actor?.email)
    || normalizeText(session?.actor?.user_id)
    || normalizeText(session?.session_id)
    || 'otra sesión'
  ));
  const hasEditor = matches.some((session) => normalizeMode(session?.mode) === 'editing');

  return {
    blocking: false,
    severity: hasEditor ? 'warning' : 'info',
    actors: labels.join(', '),
    message: hasEditor
      ? `Otra sesión está editando este recurso: ${labels.join(', ')}.`
      : `Otra sesión está viendo este recurso: ${labels.join(', ')}.`,
    sessions: matches,
  };
}

export function normalizePresenceMode(value = '') {
  return normalizeMode(value);
}
