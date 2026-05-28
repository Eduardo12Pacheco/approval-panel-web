import { resolveSubtitlePresence, resolvePresenceAdvisory } from '../presence.js';
import { createSubtitlesController } from '../controller.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

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

const remoteSubtitleSnapshot = {
  sessions: [
    {
      session_id: 'other-subtitle-session',
      actor: { display_name: 'Joaquín Subtítulos' },
      area: 'subtitles',
      resource_type: 'subtitle-session',
      resource_id: 'sub-7',
      mode: 'editing',
    },
  ],
};

function createState(overrides = {}) {
  return {
    settings: { apiOrigin: 'https://api.example.test' },
    subtitles2: {
      sessionId: 'sub-7',
      dirty: false,
      rows: [],
      changeVersion: 0,
      savedVersion: 0,
      snapshotVersion: 1,
      machine: { transition() { return true; }, getPhase() { return 'Edicion'; }, reset() {} },
      ...overrides,
    },
  };
}

function runPureSubtitlePresenceCheck() {
  const viewingPayload = resolveSubtitlePresence({ sessionId: 'sub-7', dirty: false });
  assertDeepEqual(viewingPayload, {
    area: 'subtitles',
    resource_type: 'subtitle-session',
    resource_id: 'sub-7',
    mode: 'viewing',
  }, 'clean subtitles presence payload drift');

  const editingPayload = resolveSubtitlePresence({ sessionId: 'sub-7', dirty: true });
  assertEqual(editingPayload.mode, 'editing', 'dirty subtitles should report editing mode');

  const advisory = resolvePresenceAdvisory({ snapshot: remoteSubtitleSnapshot, resource: editingPayload });
  assert(advisory, 'expected subtitles same-resource advisory');
  assertEqual(advisory.blocking, false, 'subtitles advisory must be non-blocking');
  assertEqual(advisory.actors, 'Joaquín Subtítulos', 'subtitles advisory actor label drift');
}

async function runControllerPresenceCheck() {
  const calls = [];
  const state = createState();
  const controller = createSubtitlesController({
    state,
    el: {},
    api: {
      reportPresence: async (payload) => { calls.push(payload); },
      readPresence: async () => remoteSubtitleSnapshot,
      updateSubtitleSegments: async () => ({ version: 2 }),
      getSubtitlesHealth: async () => ({ status: 'online' }),
      listSubtitleSessions: async () => ({ items: [] }),
    },
    ui: { toast() {} },
    helpers: { getErrorMessage(error, fallback) { return error?.message || fallback; }, downloadBlob() {} },
    customDropdowns: {},
    browser: { setTimeout, clearTimeout, setInterval, clearInterval },
  });

  await controller.reportSubtitlePresence({ currentSessionId: 'local-subtitle-session' });
  assertEqual(calls.length, 1, 'subtitles controller should send one viewing heartbeat');
  assertEqual(calls[0].resource_id, 'sub-7', 'subtitles heartbeat resource id drift');
  assertEqual(controller.getSubtitlePresenceWarning().blocking, false, 'subtitle warning should remain advisory only');

  state.subtitles2.dirty = true;
  await controller.onSaveClicked();
  assertEqual(calls.at(-1).mode, 'editing', 'save flow should report editing heartbeat');

  controller.onTableInput({ target: { dataset: { rowId: 'row-1', field: 'phrase' }, value: 'texto editado' } });
  await Promise.resolve();
  assertEqual(calls.at(-1).mode, 'editing', 'subtitle table edit should report editing heartbeat');
}

export async function runSubtitlesPresenceCheck() {
  runPureSubtitlePresenceCheck();
  await runControllerPresenceCheck();
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  runSubtitlesPresenceCheck()
    .then(() => console.log('subtitles-presence-check: ok'))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
