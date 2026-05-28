import { fileURLToPath } from 'node:url';
import { resolveGatewayEventsReadPath } from '../../../core/http/shared-read-models.js';
import { normalizeShellView } from '../../../app-shell/navigation.js';
import { createErrorsAuditApiClient } from '../api-client.js';
import { createErrorsAuditController } from '../index.js';
import {
  createErrorsAuditState,
  normalizeGatewayEvent,
  buildGatewayEventsFilters,
} from '../state.js';
import {
  renderErrorsAuditEvents,
  renderErrorsAuditDetail,
} from '../render.js';

const __filename = fileURLToPath(import.meta.url);

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertDeepEqual(actual, expected, message) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
}

function assertIncludes(value, expected, message) {
  if (!value.includes(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(value)} to include ${JSON.stringify(expected)}`);
  }
}

function assertNotIncludes(value, expected, message) {
  if (value.includes(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(value)} not to include ${JSON.stringify(expected)}`);
  }
}

function makeClassList() {
  const values = new Set();
  return {
    add(value) { values.add(value); },
    remove(value) { values.delete(value); },
    toggle(value, force) { force ? values.add(value) : values.delete(value); },
    contains(value) { return values.has(value); },
  };
}

function makeElement({ value = '', textContent = '' } = {}) {
  return {
    value,
    textContent,
    innerHTML: '',
    disabled: false,
    hidden: false,
    dataset: {},
    classList: makeClassList(),
    listeners: new Map(),
    onclick: null,
    addEventListener(type, handler) { this.listeners.set(type, handler); },
    setAttribute(name, value) { this[name] = value; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };
}

const sampleEvent = {
  event_id: 'evt-1',
  timestamp: '2026-05-28T03:00:00Z',
  kind: 'error',
  severity: 'error',
  correlation_id: 'corr-123',
  actor: { email: 'operator@example.test', roles: ['admin'] },
  session_id: 'session-1',
  method: 'POST',
  path: '/panel/read-models/gateway/events',
  route_service: 'gateway',
  action: 'event_read_failed',
  outcome: 'failure',
  status_code: 500,
  reason_code: 'event_read_failed',
  safe_message: 'Event read failed',
  context: { retryable: true, password: '[redacted]', nested: { token: '[redacted]' } },
};

function runStateAndRenderCheck() {
  assertEqual(normalizeShellView('errors-audit'), 'errors-audit', 'Errors/Audit must be a top-level shell view');
  assertEqual(resolveGatewayEventsReadPath(), '/panel/read-models/gateway/events', 'Gateway events read path drift');
  assertEqual(resolveGatewayEventsReadPath({ kind: 'error', status: 'failure', service: 'gateway', actor: 'operator', correlationId: 'corr-123', from: '2026-05-28', to: '2026-05-29', limit: 25 }), '/panel/read-models/gateway/events?kind=error&status=failure&service=gateway&actor=operator&correlation_id=corr-123&from=2026-05-28&to=2026-05-29&limit=25', 'Gateway events filter query drift');

  const state = createErrorsAuditState();
  assertEqual(state.status, 'idle', 'initial errors/audit status drift');
  assertDeepEqual(buildGatewayEventsFilters({ kind: 'error', status: 'failure', service: 'gateway', actor: ' operator ', correlationId: ' corr-123 ', from: '2026-05-28', to: '2026-05-29' }), {
    kind: 'error', status: 'failure', service: 'gateway', actor: 'operator', correlationId: 'corr-123', from: '2026-05-28', to: '2026-05-29', limit: 50,
  }, 'filter normalization drift');

  const normalized = normalizeGatewayEvent(sampleEvent);
  assertEqual(normalized.id, 'evt-1', 'event id normalization drift');
  assertEqual(normalized.status, 'failure', 'event outcome/status normalization drift');
  assertEqual(normalized.actorLabel, 'operator@example.test', 'actor label normalization drift');

  const listEl = makeElement();
  const statusEl = makeElement();
  renderErrorsAuditEvents({ el: { errorsAuditList: listEl, errorsAuditStatus: statusEl }, state: { status: 'ready', events: [sampleEvent], filters: {} } });
  assertIncludes(statusEl.textContent, '1 eventos', 'ready status should expose event count');
  assertIncludes(listEl.innerHTML, 'Event read failed', 'event list should show safe message');
  assertIncludes(listEl.innerHTML, 'corr-123', 'event list should show correlation id');
  assertNotIncludes(listEl.innerHTML, 'password', 'event list must not expose secret field names');
  assertNotIncludes(listEl.innerHTML, 'token', 'event list must not expose nested secret field names');

  renderErrorsAuditEvents({ el: { errorsAuditList: listEl, errorsAuditStatus: statusEl }, state: { status: 'ready', events: [], filters: { kind: 'audit' } } });
  assertIncludes(listEl.innerHTML, 'Sin eventos para estos filtros', 'empty state drift');

  renderErrorsAuditEvents({ el: { errorsAuditList: listEl, errorsAuditStatus: statusEl }, state: { status: 'error', error: 'Gateway events no disponible. Detalle: raw-secret-token' } });
  assertIncludes(listEl.innerHTML, 'Reintentar', 'error state must be retryable');
  assertNotIncludes(listEl.innerHTML, 'raw-secret-token', 'error state must not expose raw service payload');

  const detailEl = makeElement();
  renderErrorsAuditDetail({ el: { errorsAuditDetail: detailEl }, event: sampleEvent });
  assertIncludes(detailEl.innerHTML, 'Correlation ID', 'detail should label correlation id');
  assertIncludes(detailEl.innerHTML, 'operator@example.test', 'detail should show actor label');
  assertIncludes(detailEl.innerHTML, 'event_read_failed', 'detail should show reason/action');
  assertNotIncludes(detailEl.innerHTML, 'super-secret', 'detail must not invent or leak secrets');
}

async function runApiClientAndControllerCheck() {
  const calls = [];
  const api = createErrorsAuditApiClient({
    getSettings: () => ({ apiOrigin: 'https://api.example.test' }),
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, options });
      if (url.includes('kind=error')) return new Response(JSON.stringify({ events: [sampleEvent], next_cursor: null, retention: { max_events: 1000, max_age_days: 14 } }), { status: 200 });
      return new Response(JSON.stringify({ detail: { message: 'raw-secret-token failure' } }), { status: 401 });
    },
  });

  const payload = await api.events({ kind: 'error' });
  assertEqual(calls[0].url, 'https://api.example.test/panel/read-models/gateway/events?kind=error&limit=50', 'events URL drift');
  assertEqual(calls[0].options.credentials, 'include', 'events read must use session credentials');
  assertDeepEqual(payload.events.map((event) => event.event_id), ['evt-1'], 'events payload drift');

  let authMessage = '';
  try { await api.events({ kind: 'audit' }); } catch (error) { authMessage = error?.message || ''; }
  assertIncludes(authMessage, 'Iniciá sesión', '401 must map to auth-gated message');
  assertNotIncludes(authMessage, 'raw-secret-token', 'auth error must not leak raw payload');

  const state = createErrorsAuditState();
  const el = {
    errorsAuditKindFilter: makeElement({ value: 'error' }),
    errorsAuditStatusFilter: makeElement({ value: 'failure' }),
    errorsAuditServiceFilter: makeElement({ value: 'gateway' }),
    errorsAuditActorFilter: makeElement({ value: 'operator' }),
    errorsAuditCorrelationFilter: makeElement({ value: 'corr-123' }),
    errorsAuditFromFilter: makeElement({ value: '2026-05-28' }),
    errorsAuditToFilter: makeElement({ value: '2026-05-29' }),
    errorsAuditRefreshBtn: makeElement(),
    errorsAuditList: makeElement(),
    errorsAuditStatus: makeElement(),
    errorsAuditDetail: makeElement(),
  };
  const controllerCalls = [];
  const controller = createErrorsAuditController({
    state,
    el,
    api: { async events(filters) { controllerCalls.push(filters); return { events: [sampleEvent], retention: { max_events: 1000 } }; } },
    ui: { toast(message) { controllerCalls.push({ toast: message }); } },
  });

  controller.bindEvents();
  await controller.activate();
  assertEqual(controllerCalls[0].kind, 'error', 'controller should read kind filter on activate');
  assertEqual(state.events.length, 1, 'controller should store fetched events');
  el.errorsAuditKindFilter.value = 'audit';
  await el.errorsAuditRefreshBtn.listeners.get('click')({ preventDefault() {} });
  assertEqual(controllerCalls[1].kind, 'audit', 'refresh button should re-read current filters');
  await el.errorsAuditList.listeners.get('click')({ target: { closest: () => ({ dataset: { errorsAuditEventId: 'evt-1' } }) } });
  assertIncludes(el.errorsAuditDetail.innerHTML, 'corr-123', 'detail expansion should render selected event');
}

export async function runErrorsAuditPanelCheck() {
  runStateAndRenderCheck();
  await runApiClientAndControllerCheck();
}

if (process.argv[1] && __filename === process.argv[1]) {
  runErrorsAuditPanelCheck()
    .then(() => console.log('errors-audit-panel-check: ok'))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
