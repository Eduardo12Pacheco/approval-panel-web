import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

import { buildSubtitleControllerContext } from '../controller/context.js';
import { createSubtitlePreviewPlayer } from '../controller/preview-player.js';
import { createSubtitleRenderCommands } from '../controller/render-commands.js';
import { createSubtitleSessionController } from '../controller/session.js';
import { createSubtitleTableEditor } from '../controller/table-editor.js';
import { createSubtitleWorkflowRenderer } from '../controller/render-workflow.js';
import { createSubtitlesController } from '../controller.js';
import { createSubtitlesFeature } from '../index.js';

const EXPECTED_CONTROLLER_API = [
  'pollRemoteSubtitleSessionStatus',
  'pollRemoteSubtitleRenderStatus',
  'stopPolling',
  'resetRunState',
  'renderWorkflow',
  'renderSessionHistory',
  'renderDoneCard',
  'refreshRemoteStatus',
  'hydrateSession',
  'setPhaseFromRemoteStatus',
  'resetEditorForAnotherVideo',
  'onUploadSelected',
  'onSourceLanguageChanged',
  'onSaveClicked',
  'onReadyClicked',
  'onDownloadClicked',
  'onAddRowClicked',
  'onTableInput',
  'onTableClick',
  'onDraftDragStart',
  'onDraftDragOver',
  'onDraftDragLeave',
  'onDraftDrop',
  'onDraftDragEnd',
  'onPreviewTimeUpdate',
  'onPreviewLoadedMetadata',
  'onPreviewToggleClicked',
  'onPreviewTimelineClick',
  'onPreviewTimelineDragStart',
  'renameHistorySession',
  'deleteHistorySession',
];

const EXPECTED_SUPPORT_MODULES = [
  ['features/subtitles/controller/context.js', 'buildSubtitleControllerContext'],
  ['features/subtitles/controller/session.js', 'createSubtitleSessionController'],
  ['features/subtitles/controller/render-workflow.js', 'createSubtitleWorkflowRenderer'],
  ['features/subtitles/controller/table-editor.js', 'createSubtitleTableEditor'],
  ['features/subtitles/controller/preview-player.js', 'createSubtitlePreviewPlayer'],
  ['features/subtitles/controller/render-commands.js', 'createSubtitleRenderCommands'],
];

function createMinimalDependencies() {
  return {
    state: { subtitles2: {} },
    el: {},
    api: {},
    ui: { toast() {} },
    helpers: {
      getErrorMessage(error, fallback) { return error?.message || fallback; },
      downloadBlob() {},
      escapeHtml(value) { return (value ?? '').toString(); },
    },
    customDropdowns: { refreshAll() {} },
    browser: {
      URL: { createObjectURL: () => 'blob:check', revokeObjectURL() {} },
      window: { addEventListener() {}, removeEventListener() {}, confirm: () => false, prompt: () => null },
      setTimeout() { return 1; },
      clearTimeout() {},
      clearInterval() {},
    },
  };
}

function createClassList() {
  const values = new Set();
  return {
    values,
    add(value) { values.add(value); },
    remove(...items) { for (const item of items) values.delete(item); },
    toggle(value, force) {
      if (force) values.add(value);
      else values.delete(value);
    },
    contains(value) { return values.has(value); },
  };
}

async function readModule(relativePath) {
  return readFile(new URL(`../../../${relativePath}`, import.meta.url), 'utf8');
}

test('subtitles public facades keep stable exports and controller API shape', () => {
  assert.equal(typeof createSubtitlesFeature, 'function');
  assert.equal(typeof createSubtitlesController, 'function');

  const controller = createSubtitlesController(createMinimalDependencies());

  assert.deepEqual(Object.keys(controller), EXPECTED_CONTROLLER_API);
  for (const key of EXPECTED_CONTROLLER_API) {
    assert.equal(typeof controller[key], 'function', `${key} must stay callable by app-shell bindings`);
  }
});

test('app-shell subtitles bindings only use returned controller methods', async () => {
  const runtimeSource = await readModule('app-shell/runtime.js');
  const boundMethods = [...runtimeSource.matchAll(/subtitlesController\.([A-Za-z0-9_]+)/g)].map((match) => match[1]);

  assert.ok(boundMethods.length > 20, 'expected app-shell to bind subtitles controller methods');
  assert.deepEqual([...new Set(boundMethods)].sort(), [...new Set(boundMethods.filter((key) => EXPECTED_CONTROLLER_API.includes(key)))].sort());
});

test('subtitles controller support seams exist and import with focused public factories', async () => {
  for (const [relativePath, exportName] of EXPECTED_SUPPORT_MODULES) {
    const moduleUrl = new URL(`../../../${relativePath}`, import.meta.url);
    const moduleSource = await readFile(moduleUrl, 'utf8');
    const moduleStats = await stat(moduleUrl);
    const imported = await import(moduleUrl.href);

    assert.equal(typeof imported[exportName], 'function', `${relativePath} must export ${exportName}`);
    assert.doesNotMatch(moduleSource, /from ['"]\.\.\/\.\.\/audio\//, `${relativePath} must not reach into audio feature internals`);
    assert.doesNotMatch(moduleSource, /from ['"]\.\.\/\.\.\/video-projects\//, `${relativePath} must not reach into video-projects internals`);

    const lineCount = moduleSource.split('\n').length;
    if (lineCount > 500) {
      assert.match(moduleSource, /cohesive exception|split plan/i, `${relativePath} exceeds soft size guardrail without a documented cohesive exception`);
    }
    assert.ok(moduleStats.size > 0, `${relativePath} must not be empty`);
  }
});

test('subtitles controller context centralizes browser adapters and render callbacks', () => {
  const browser = {
    URL: { createObjectURL() { return 'blob:ctx'; }, revokeObjectURL() {} },
    window: { addEventListener() {}, removeEventListener() {} },
    setTimeout() { return 'timeout-id'; },
    clearTimeout() {},
    clearInterval() {},
  };
  const renderCallbacks = {
    renderWorkflow() { return 'workflow-rendered'; },
    renderTable() { return 'table-rendered'; },
  };

  const ctx = buildSubtitleControllerContext({
    ...createMinimalDependencies(),
    browser,
    renderCallbacks,
  });

  assert.equal(ctx.URLImpl, browser.URL);
  assert.equal(ctx.windowRef, browser.window);
  assert.equal(ctx.timers.setTimeout(), 'timeout-id');
  assert.equal(ctx.renderCallbacks.renderWorkflow(), 'workflow-rendered');
  assert.equal(ctx.renderCallbacks.renderTable(), 'table-rendered');
});

test('root subtitles controller uses the shared context wiring seam', async () => {
  const controllerSource = await readModule('features/subtitles/controller.js');

  assert.match(controllerSource, /buildSubtitleControllerContext/);
  assert.doesNotMatch(controllerSource, /const URLImpl = browser\.URL \|\| globalThis\.URL/);
  assert.doesNotMatch(controllerSource, /const setTimeoutImpl = browser\.setTimeout \|\| globalThis\.setTimeout/);
});

test('workflow renderer seam preserves visible health and done-card behavior', () => {
  const serviceHealthBanner = { textContent: '', classList: createClassList() };
  const doneTitle = { textContent: '' };
  const doneMessage = { textContent: '' };
  const ctx = buildSubtitleControllerContext({
    ...createMinimalDependencies(),
    state: {
      subtitles2: {
        serviceHealth: { status: 'online', message: 'Servicio remoto disponible.' },
        renderStatus: 'succeeded',
        renderArtifactReady: true,
      },
    },
    el: {
      subtitle2ServiceHealthBanner: serviceHealthBanner,
      subtitle2DoneTitle: doneTitle,
      subtitle2DoneMessage: doneMessage,
    },
  });

  const renderer = createSubtitleWorkflowRenderer(ctx, {
    hasDraftRows: () => false,
    getLastNonDraftRowIndex: () => 0,
    resolvePreviewDurationMs: () => 1000,
  });

  renderer.renderHealthBanner();
  renderer.renderDoneCard();

  assert.equal(serviceHealthBanner.textContent, 'Servidor conectado');
  assert.equal(serviceHealthBanner.classList.contains('is-online'), true);
  assert.equal(doneTitle.textContent, 'Video listo');
  assert.equal(doneMessage.textContent, 'Tu video ya está listo. Descargalo manualmente cuando quieras.');
});

test('preview player seam preserves object URL replacement and latest seek behavior', async () => {
  const revoked = [];
  const video = {
    currentTime: 0,
    paused: true,
    src: '',
    attributes: new Map([['src', 'blob:old']]),
    getAttribute(name) { return this.attributes.get(name) || ''; },
    removeAttribute(name) { this.attributes.delete(name); },
    pause() { this.paused = true; },
    play() { this.paused = false; return Promise.resolve(); },
  };
  const timelineTrack = { getBoundingClientRect: () => ({ left: 100, width: 400 }), innerHTML: '' };
  const ctx = buildSubtitleControllerContext({
    ...createMinimalDependencies(),
    state: {
      subtitles2: {
        previewVideoObjectUrl: 'blob:old',
        previewVideoUrl: '',
        previewCurrentMs: 0,
        previewPlaying: false,
        audioDurationMs: 10000,
        rows: [{ id: 'row-1', start: '00:00.00', end: '00:10.00', phrase: 'hola' }],
      },
    },
    el: {
      subtitle2PreviewVideo: video,
      subtitle2PreviewStage: { classList: createClassList() },
      subtitle2PreviewEmpty: { classList: createClassList() },
      subtitle2PreviewPlayBtn: { disabled: false, textContent: '', setAttribute() {} },
      subtitle2PreviewTimelineTrack: timelineTrack,
    },
    api: { getSubtitlePreviewVideo: async () => new Blob(['video']) },
    browser: {
      URL: {
        createObjectURL() { return 'blob:new'; },
        revokeObjectURL(url) { revoked.push(url); },
      },
      window: { addEventListener() {}, removeEventListener() {} },
      setTimeout() {},
      clearTimeout() {},
      clearInterval() {},
    },
  });
  const renderCalls = [];
  const player = createSubtitlePreviewPlayer(ctx, {
    renderTable: () => renderCalls.push('table'),
    renderPreviewOverlay: () => renderCalls.push('overlay'),
    resolvePreviewDurationMs: () => 10000,
  });

  await player.loadPreviewVideoBlob('session-1');
  player.renderPreviewPlayer();
  player.seekPreviewFromClientX(300);

  assert.deepEqual(revoked, ['blob:old']);
  assert.equal(ctx.state.subtitles2.previewVideoObjectUrl, 'blob:new');
  assert.equal(video.src, 'blob:new');
  assert.equal(ctx.state.subtitles2.previewCurrentMs, 5000);
  assert.equal(video.currentTime, 5);
  assert.deepEqual(renderCalls, ['overlay']);
});

test('root subtitles controller wires renderer and preview player collaborators', async () => {
  const controllerSource = await readModule('features/subtitles/controller.js');

  assert.match(controllerSource, /createSubtitleWorkflowRenderer/);
  assert.match(controllerSource, /createSubtitlePreviewPlayer/);
  assert.doesNotMatch(controllerSource, /function renderSubtitle2HealthBanner\(/);
  assert.doesNotMatch(controllerSource, /function loadSubtitle2PreviewVideoBlob\(/);
});

test('table editor seam preserves row patching, timing validation, and draft placement', () => {
  const toasts = [];
  const renderCalls = [];
  const dropTargetClassList = createClassList();
  const ctx = buildSubtitleControllerContext({
    ...createMinimalDependencies(),
    state: {
      subtitles2: {
        rows: [
          { id: 'row-1', start: '00:00.00', end: '00:01.00', phrase: 'uno', sourceText: 'uno', size: '110', fontFamily: 'Khand', color: '#FFFFFF', align: 'center' },
          { id: 'row-2', start: '00:01.06', end: '00:03.00', phrase: 'dos', sourceText: 'dos', size: '110', fontFamily: 'Khand', color: '#FFFFFF', align: 'center' },
          { id: 'row-3', start: '00:03.06', end: '00:05.00', phrase: 'tres', sourceText: 'tres', size: '110', fontFamily: 'Khand', color: '#FFFFFF', align: 'center' },
          { id: 'row-4', start: '00:05.06', end: '00:07.00', phrase: 'cuatro', sourceText: 'cuatro', size: '110', fontFamily: 'Khand', color: '#FFFFFF', align: 'center' },
          { id: 'draft-1', start: '', end: '', phrase: '', isDraft: true, size: '110', fontFamily: 'Khand', color: '#FFFFFF', align: 'center' },
        ],
        changeVersion: 0,
        dirty: false,
        draggingDraftRowId: 'draft-1',
      },
    },
    el: { subtitle2RowsBody: { querySelectorAll: () => [{ classList: dropTargetClassList }] } },
    ui: { toast(message) { toasts.push(message); } },
  });
  const editor = createSubtitleTableEditor(ctx, {
    renderWorkflow: () => renderCalls.push('workflow'),
    renderTable: () => renderCalls.push('table'),
    renderPreviewOverlay: () => renderCalls.push('overlay'),
    updateButtonsByPhase: () => renderCalls.push('buttons'),
    resolvePreviewDurationMs: () => 5000,
  });

  editor.onTableInput({ target: { dataset: { rowId: 'row-2', field: 'phrase' }, value: 'dos editado' } });
  editor.applyTimingInput('row-2', 'start', '00:00.50');
  editor.placeDraftBetweenRows('draft-1', 2);

  assert.equal(ctx.state.subtitles2.rows.find((row) => row.id === 'row-2').phrase, 'dos editado');
  assert.equal(ctx.state.subtitles2.rows.find((row) => row.id === 'row-2').start, '00:01.06');
  assert.equal(ctx.state.subtitles2.rows.find((row) => row.id === 'draft-1').isDraft, false);
  assert.deepEqual(ctx.state.subtitles2.rows.map((row) => row.id), ['row-1', 'row-2', 'draft-1', 'row-3', 'row-4']);
  assert.equal(ctx.state.subtitles2.rows.find((row) => row.id === 'row-3').start, '00:04.12');
  assert.deepEqual(toasts, ['START inválido: debe ser END anterior + gap.']);
  assert.equal(ctx.state.subtitles2.dirty, true);
  assert.ok(ctx.state.subtitles2.changeVersion >= 2);
  assert.ok(renderCalls.includes('overlay'));
  assert.ok(renderCalls.includes('workflow'));
});

test('session seam preserves polling cadence, hydration, terminal cleanup, and stale guards', async () => {
  const timers = [];
  const cleared = [];
  const renderCalls = [];
  const apiCalls = [];
  const ctx = buildSubtitleControllerContext({
    ...createMinimalDependencies(),
    state: {
      settings: { ttsBaseUrl: 'https://tts.example' },
      subtitles2: {
        rows: [],
        analyzeStatus: '',
        renderStatus: '',
        renderArtifactReady: false,
        snapshotVersion: 0,
        changeVersion: 0,
        savedVersion: 0,
        pollingTimer: 'old-timer',
        sessionHistory: [],
        sourceLanguage: 'auto',
        serviceHealth: {},
      },
    },
    api: {
      async getSubtitleSession(sessionId) {
        apiCalls.push(`session:${sessionId}`);
        return sessionId === 'stale-session'
          ? { status: 'editing', current_snapshot_version: 2, preview: { duration_ms: 1200 } }
          : { status: 'processing', current_snapshot_version: 0, preview: { duration_ms: 1200 } };
      },
      async getSubtitleSegments() { return { version: 2, segments: [{ id: 'seg-1', start_ms: 0, end_ms: 1200, translated_text: 'hola', source_text: 'hola', style: {} }] }; },
      async getSubtitlesHealth() { return { status: 'online' }; },
      async listSubtitleSessions() { return { items: [{ id: 'active-session' }] }; },
    },
    browser: {
      URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
      window: { confirm: () => false, prompt: () => null },
      setTimeout(callback, ms) { timers.push({ callback, ms }); return `timer-${timers.length}`; },
      clearTimeout(id) { cleared.push(`timeout:${id}`); },
      clearInterval(id) { cleared.push(`interval:${id}`); },
    },
  });
  const session = createSubtitleSessionController(ctx, {
    loadPreviewVideoBlob: async () => {},
    ensureRowsCoverDuration: () => false,
    resolvePreviewDurationMs: () => 1200,
    renderWorkflow: () => renderCalls.push('workflow'),
    renderHealthBanner: () => renderCalls.push('health'),
    renderSessionHistory: () => renderCalls.push('history'),
    renderDoneCard: () => renderCalls.push('done'),
    renderSourceLanguagePicker: () => renderCalls.push('language'),
  });

  ctx.state.subtitles2.sessionId = 'active-session';
  await session.pollSessionStatus('active-session');
  assert.equal(ctx.state.subtitles2.pollingTimer, 'timer-1');
  assert.equal(timers[0].ms, 2000);
  assert.ok(cleared.includes('timeout:old-timer'));
  assert.ok(renderCalls.includes('workflow'));

  ctx.state.subtitles2.sessionId = 'active-session';
  await session.pollSessionStatus('stale-session');
  assert.equal(ctx.state.subtitles2.sessionId, 'active-session');
  assert.equal(ctx.state.subtitles2.snapshotVersion, 0);
  assert.deepEqual(apiCalls, ['session:active-session', 'session:stale-session']);
});

test('render commands seam preserves save payload, render polling handoff, and download naming', async () => {
  const calls = [];
  const downloads = [];
  const ctx = buildSubtitleControllerContext({
    ...createMinimalDependencies(),
    state: {
      subtitles2: {
        sessionId: 'session-123',
        snapshotVersion: 4,
        savedVersion: 0,
        changeVersion: 2,
        dirty: true,
        rows: [{ id: 'row-1', start: '00:00.00', end: '00:01.00', sourceText: 'hola', phrase: 'hello', size: '110', fontFamily: 'Khand', color: '#FFFFFF', align: 'center', maxWidthPx: 1080 }],
        renderStatus: '',
        renderProgressPct: 12,
        renderArtifactReady: true,
      },
    },
    api: {
      async updateSubtitleSegments(sessionId, payload) { calls.push({ type: 'save', sessionId, payload }); return { version: 5 }; },
      async startSubtitleRender(sessionId, payload) { calls.push({ type: 'render', sessionId, payload }); return { job: { id: 'job-1', status: 'queued' }, download: { ready: false } }; },
      async downloadSubtitleRender() { return new Blob(['video']); },
    },
    helpers: { ...createMinimalDependencies().helpers, downloadBlob(blob, filename) { downloads.push({ blob, filename }); } },
  });
  const commands = createSubtitleRenderCommands(ctx, {
    hasDraftRows: () => false,
    ensureRowsCoverDuration: () => false,
    refreshRemoteStatus: async () => calls.push({ type: 'refresh' }),
    pollRenderStatus: async (sessionId) => calls.push({ type: 'poll-render', sessionId }),
    transitionPhase: (phase) => calls.push({ type: 'phase', phase }) || true,
    renderDoneCard: () => calls.push({ type: 'done-card' }),
    updateButtonsByPhase: () => calls.push({ type: 'buttons' }),
  });

  await commands.onSaveClicked();
  await commands.onReadyClicked();
  await commands.onDownloadClicked();

  assert.equal(calls[0].type, 'save');
  assert.equal(calls[0].payload.base_version, 4);
  assert.equal(calls[0].payload.save_mode, 'manual');
  assert.deepEqual(calls[0].payload.segments[0], {
    id: 'row-1',
    start_ms: 0,
    end_ms: 1000,
    source_text: 'hola',
    translated_text: 'hello',
    style: { font_size: 110, font_family: 'Khand', font_weight: 'Bold', color: '#FFFFFF', align: 'center', max_width_px: 1080 },
  });
  assert.ok(calls.some((call) => call.type === 'phase' && call.phase === 'Procesando video'));
  assert.ok(calls.some((call) => call.type === 'poll-render' && call.sessionId === 'session-123'));
  assert.equal(ctx.state.subtitles2.renderStatus, 'queued');
  assert.deepEqual(downloads.map((item) => item.filename), ['session-123.mp4']);
});

test('root subtitles controller wires table, session, and render command collaborators', async () => {
  const controllerSource = await readModule('features/subtitles/controller.js');

  assert.match(controllerSource, /createSubtitleTableEditor/);
  assert.match(controllerSource, /createSubtitleSessionController/);
  assert.match(controllerSource, /createSubtitleRenderCommands/);
  assert.doesNotMatch(controllerSource, /function onSubtitle2TableInput\(/);
  assert.doesNotMatch(controllerSource, /function pollRemoteSubtitleSessionStatus\(/);
  assert.doesNotMatch(controllerSource, /function onSubtitle2ReadyClicked\(/);
});
