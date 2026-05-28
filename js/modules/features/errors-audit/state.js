const DEFAULT_LIMIT = 50;

export function createErrorsAuditState() {
  return {
    status: 'idle',
    filters: { limit: DEFAULT_LIMIT },
    events: [],
    selectedEventId: '',
    retention: null,
    error: '',
    refreshInFlight: false,
  };
}

export function buildGatewayEventsFilters(values = {}) {
  const filters = {
    kind: clean(values.kind),
    status: clean(values.status),
    service: clean(values.service),
    actor: clean(values.actor),
    correlationId: clean(values.correlationId ?? values.correlation_id),
    from: clean(values.from),
    to: clean(values.to),
    limit: clampLimit(values.limit),
  };
  return filters;
}

export function normalizeGatewayEvent(event = {}) {
  const actor = event.actor && typeof event.actor === 'object' ? event.actor : {};
  const status = clean(event.outcome || event.status || event.status_code || event.reason_code) || 'unknown';
  return {
    ...event,
    id: clean(event.event_id || event.id || event.correlation_id || event.timestamp),
    timestamp: clean(event.timestamp),
    kind: clean(event.kind) || 'audit',
    severity: clean(event.severity),
    correlationId: clean(event.correlation_id || event.correlationId),
    actorLabel: clean(actor.email || actor.display_name || actor.user_id || event.actor || event.session_id) || 'system',
    sessionId: clean(event.session_id || event.sessionId),
    method: clean(event.method),
    path: clean(event.path),
    routeService: clean(event.route_service || event.service || event.routeService),
    action: clean(event.action),
    status,
    statusCode: event.status_code ?? event.statusCode ?? '',
    reasonCode: clean(event.reason_code || event.reasonCode),
    safeMessage: clean(event.safe_message || event.message || event.safeMessage),
    context: sanitizeDisplayContext(event.context),
  };
}

export function sanitizeDisplayContext(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (depth > 3) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeDisplayContext(item, depth + 1));
  if (typeof value !== 'object') return String(value);

  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (isSensitiveKey(key)) continue;
    result[key] = sanitizeDisplayContext(item, depth + 1);
  }
  return result;
}

function clean(value = '') {
  return (value ?? '').toString().trim();
}

function clampLimit(value = DEFAULT_LIMIT) {
  const numeric = Number(value || DEFAULT_LIMIT);
  if (!Number.isFinite(numeric)) return DEFAULT_LIMIT;
  return Math.min(100, Math.max(1, Math.floor(numeric)));
}

function isSensitiveKey(key = '') {
  return /(authorization|cookie|password|secret|token|api[_-]?key|approval[_-]?secret)/i.test(key);
}
