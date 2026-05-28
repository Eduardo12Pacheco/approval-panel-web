import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { normalizeShellView } from '../../../app-shell/navigation.js';
import {
  resolveGatewayPresenceReadPath,
  resolveGatewayPresenceHeartbeatPath,
} from '../../../core/http/shared-read-models.js';
import { createActiveUsersApiClient } from '../api.js';
import { createActiveUsersController } from '../controller.js';
import { createActiveUsersState, normalizePresenceSnapshot } from '../state.js';
import { renderActiveUsersView } from '../render.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
    addEventListener(type, handler) { this.listeners.set(type, handler); },
    setAttribute(name, value) { this[name] = value; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };
}

const sampleSnapshot = {
  ttl_seconds: 90,
  sessions: [
    {
      session_id: 'session-1',
      actor: { user_id: 'maria', email: 'maria@example.test', display_name: 'María Editor', password_hash: 'secret-hash' },
      area: 'video-projects',
      resource_type: 'video-project',
      resource_id: 'draft-42',
      mode: 'editing',
      last_activity_at: '2026-05-28T12:00:00Z',
    },
    {
      session_id: 'session-2',
      actor: { user_id: 'joaquin', email: 'joaquin@example.test', display_name: 'Joaquín' },
      area: 'subtitles',
      resource_type: 'subtitle-session',
      resource_id: 'sub-7',
      mode: 'viewing',
      last_activity_at: '2026-05-28T12:01:00Z',
    },
  ],
  resources: [
    { resource_type: 'video-project', resource_id: 'draft-42', area: 'video-projects', sessions: ['session-1'] },
  ],
};

function runStateAndRenderCheck() {
  const indexHtml = readFileSync(resolve(__dirname, '../../../../../index.html'), 'utf8');
  assertIncludes(indexHtml, 'data-view="active-users"', 'sidebar must expose active-users navigation target');
  assertIncludes(indexHtml, 'Activos</span>', 'sidebar must label the active-users target as Activos');
  assertIncludes(indexHtml, 'id="viewActiveUsers"', 'index must include the active users view container');

  assertEqual(normalizeShellView('active-users'), 'active-users', 'Activos must be a top-level shell view');
  assertEqual(resolveGatewayPresenceReadPath(), '/panel/read-models/gateway/presence', 'presence read path drift');
  assertEqual(resolveGatewayPresenceHeartbeatPath(), '/panel/presence/heartbeat', 'presence heartbeat path drift');

  const state = createActiveUsersState();
  assertEqual(state.status, 'idle', 'initial active-users status drift');

  const normalized = normalizePresenceSnapshot(sampleSnapshot);
  assertEqual(normalized.sessions.length, 2, 'presence session normalization count drift');
  assertDeepEqual(normalized.sessions.map((session) => session.actorLabel), ['María Editor', 'Joaquín'], 'presence actor label drift');
  assertEqual(normalized.sessions[0].resourceLabel, 'video-project · draft-42', 'resource label drift');

  const listEl = makeElement();
  const statusEl = makeElement();
  renderActiveUsersView({ el: { activeUsersList: listEl, activeUsersStatus: statusEl }, state: { status: 'ready', snapshot: sampleSnapshot } });
  assertIncludes(statusEl.textContent, '2 sesiones activas', 'ready status should expose active session count');
  assertIncludes(listEl.innerHTML, 'María Editor', 'list should show actor display name');
  assertIncludes(listEl.innerHTML, 'video-projects', 'list should show area');
  assertIncludes(listEl.innerHTML, 'draft-42', 'list should show resource id');
  assertIncludes(listEl.innerHTML, 'editing', 'list should show view/edit mode');
  assertNotIncludes(listEl.innerHTML, 'secret-hash', 'active users must not expose credential fields');

  renderActiveUsersView({ el: { activeUsersList: listEl, activeUsersStatus: statusEl }, state: { status: 'error', error: 'Iniciá sesión para leer presencia.' } });
  assertIncludes(listEl.innerHTML, 'Reintentar', 'auth error must be retryable');
  assertNotIncludes(listEl.innerHTML, 'María Editor', 'auth error must clear stale active user data');
}

async function runApiClientAndControllerCheck() {
  const calls = [];
  const api = createActiveUsersApiClient({
    getSettings: () => ({ apiOrigin: 'https://api.example.test' }),
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, options });
      if (calls.length === 1) return new Response(JSON.stringify(sampleSnapshot), { status: 200 });
      return new Response(JSON.stringify({ detail: { message: 'raw-secret-token failure' } }), { status: 401 });
    },
  });

  const payload = await api.presence();
  assertEqual(calls[0].url, 'https://api.example.test/panel/read-models/gateway/presence', 'presence URL drift');
  assertEqual(calls[0].options.credentials, 'include', 'presence read must use session credentials');
  assertEqual(payload.sessions.length, 2, 'presence payload drift');

  let authMessage = '';
  try { await api.presence(); } catch (error) { authMessage = error?.message || ''; }
  assertIncludes(authMessage, 'Iniciá sesión', '401 must map to auth-gated message');
  assertNotIncludes(authMessage, 'raw-secret-token', 'auth error must not leak raw payload');

  const state = createActiveUsersState();
  const el = {
    activeUsersRefreshBtn: makeElement(),
    activeUsersList: makeElement(),
    activeUsersStatus: makeElement(),
  };
  const controllerCalls = [];
  const controller = createActiveUsersController({
    state,
    el,
    api: {
      async presence() {
        controllerCalls.push('presence');
        if (controllerCalls.length === 1) return sampleSnapshot;
        const error = new Error('Iniciá sesión para leer presencia.');
        error.status = 401;
        throw error;
      },
    },
    ui: { toast(message) { controllerCalls.push({ toast: message }); } },
  });

  controller.bindEvents();
  await controller.activate();
  assertEqual(state.snapshot.sessions.length, 2, 'controller should store fetched sessions');
  await el.activeUsersRefreshBtn.listeners.get('click')({ preventDefault() {} });
  assertEqual(state.snapshot.sessions.length, 0, 'auth failure should clear stale active sessions');
  assertIncludes(el.activeUsersList.innerHTML, 'Reintentar', 'controller should render retry after auth failure');
}

export async function runActiveUsersPanelCheck() {
  runStateAndRenderCheck();
  await runApiClientAndControllerCheck();
}

if (process.argv[1] && __filename === process.argv[1]) {
  runActiveUsersPanelCheck()
    .then(() => console.log('active-users-panel-check: ok'))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
