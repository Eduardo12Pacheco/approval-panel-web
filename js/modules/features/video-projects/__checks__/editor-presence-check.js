import { resolveVideoEditorPresence, resolvePresenceAdvisory } from '../presence.js';
import { createVideoProjectsController } from '../controller/create-video-projects-controller.js';

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

const sameResourceSnapshot = {
  sessions: [
    {
      session_id: 'local-session',
      actor: { display_name: 'Local Editor' },
      area: 'video-projects',
      resource_type: 'video-project',
      resource_id: 'draft-42',
      mode: 'editing',
    },
    {
      session_id: 'remote-session',
      actor: { display_name: 'María Editor', user_id: 'maria' },
      area: 'video-projects',
      resource_type: 'video-project',
      resource_id: 'draft-42',
      mode: 'editing',
    },
    {
      session_id: 'other-resource',
      actor: { display_name: 'Joaquín' },
      area: 'video-projects',
      resource_type: 'video-project',
      resource_id: 'draft-99',
      mode: 'editing',
    },
  ],
};

function makeStore(project) {
  return {
    getState() {
      return {
        selectedVideoProject: project,
        videoProjects: [],
        settings: { apiOrigin: 'https://api.example.test' },
      };
    },
    setState() {},
  };
}

function runPurePresenceCheck() {
  const viewingPayload = resolveVideoEditorPresence({ draft_id: 'draft-42', editor_state: { dirty: false } });
  assertDeepEqual(viewingPayload, {
    area: 'video-projects',
    resource_type: 'video-project',
    resource_id: 'draft-42',
    mode: 'viewing',
  }, 'clean editor presence payload drift');

  const editingPayload = resolveVideoEditorPresence({ draft_id: 'draft-42', editor_state: { dirty: true } });
  assertEqual(editingPayload.mode, 'editing', 'dirty editor should report editing mode');

  const advisory = resolvePresenceAdvisory({
    snapshot: sameResourceSnapshot,
    resource: editingPayload,
    currentSessionId: 'local-session',
  });
  assert(advisory, 'expected same-resource advisory when another editor is active');
  assertEqual(advisory.blocking, false, 'presence advisory must be non-blocking');
  assertEqual(advisory.actors, 'María Editor', 'advisory actor label drift');
}

async function runControllerHeartbeatCheck() {
  const calls = [];
  const project = { draft_id: 'draft-42', editor_state: { dirty: false } };
  const controller = createVideoProjectsController({
    api: {
      reportPresence: async (payload) => { calls.push({ type: 'heartbeat', payload }); },
      readPresence: async () => sameResourceSnapshot,
      getVideoProject: async () => [project],
    },
    store: makeStore(project),
    ui: { toast() {} },
    callbacks: { renderVideoProjects() {}, renderSelectedVideoProject() {} },
  });

  await controller.reportEditorPresence({ mode: 'viewing', currentSessionId: 'local-session' });
  assertEqual(calls.length, 1, 'controller should send one editor heartbeat');
  assertEqual(calls[0].payload.resource_id, 'draft-42', 'controller heartbeat resource id drift');
  assertEqual(controller.getEditorPresenceWarning().blocking, false, 'controller warning should remain advisory only');

  project.editor_state.dirty = true;
  await controller.reportEditorPresence({ currentSessionId: 'local-session' });
  assertEqual(calls[1].payload.mode, 'editing', 'dirty controller heartbeat should report editing');

  await controller.openVideoProject('draft-42');
  assertEqual(calls[2].payload.mode, 'editing', 'opening editor should report current edit/view presence');
}

export async function runEditorPresenceCheck() {
  runPurePresenceCheck();
  await runControllerHeartbeatCheck();
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  runEditorPresenceCheck()
    .then(() => console.log('editor-presence-check: ok'))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
