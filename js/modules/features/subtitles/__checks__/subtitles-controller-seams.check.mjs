import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

import { SUBTITLE_SIZE_PRESETS } from '../../../subtitles-workflow.mjs';
import { buildSubtitleControllerContext } from '../controller/context.js';
import { createSubtitlePreviewPlayer } from '../controller/preview-player.js';
import { createSubtitleRenderCommands } from '../controller/render-commands.js';
import { createSubtitleSessionController } from '../controller/session.js';
import { createSubtitleTableEditor } from '../controller/table-editor.js';
import { createSubtitleWorkflowRenderer } from '../controller/render-workflow.js';
import { createSubtitleAutoSaveController } from '../controller/auto-save.js';
import { createSubtitlesController } from '../controller.js';
import { createSubtitlesFeature } from '../index.js';
import { buildSubtitlesTableRowsMarkupRuntime } from '../runtime/presentation.js';

const EXPECTED_CONTROLLER_API = [
  'pollRemoteSubtitleSessionStatus',
  'pollRemoteSubtitleRenderStatus',
  'stopPolling',
  'resetRunState',
  'renderWorkflow',
  'renderPreviewPlaybackState',
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
  'onTablePointerDown',
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
  'seekPreviewToRow',
  'renameHistorySession',
  'deleteHistorySession',
  'reportSubtitlePresence',
  'getSubtitlePresenceWarning',
  'activate',
];

const EXPECTED_SUPPORT_MODULES = [
  ['features/subtitles/controller/context.js', 'buildSubtitleControllerContext'],
  ['features/subtitles/controller/session.js', 'createSubtitleSessionController'],
  ['features/subtitles/controller/render-workflow.js', 'createSubtitleWorkflowRenderer'],
  ['features/subtitles/controller/table-editor.js', 'createSubtitleTableEditor'],
  ['features/subtitles/controller/undo-history.js', 'createSubtitleUndoHistory'],
  ['features/subtitles/controller/auto-save.js', 'createSubtitleAutoSaveController'],
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
    setTimeout() { return this === browser ? 'timeout-id' : 'illegal-invocation'; },
    clearTimeout() { return this === browser ? 'cleared-timeout' : 'illegal-invocation'; },
    clearInterval() { return this === browser ? 'cleared-interval' : 'illegal-invocation'; },
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
  assert.equal(ctx.timers.clearTimeout(), 'cleared-timeout');
  assert.equal(ctx.timers.clearInterval(), 'cleared-interval');
  assert.equal(ctx.renderCallbacks.renderWorkflow(), 'workflow-rendered');
  assert.equal(ctx.renderCallbacks.renderTable(), 'table-rendered');
});

test('subtitles controller context safely invokes unbound host timers', () => {
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  try {
    globalThis.setTimeout = function setTimeoutCheck() {
      if (this !== globalThis) throw new TypeError('Illegal invocation');
      return 'global-timeout-id';
    };
    globalThis.clearTimeout = function clearTimeoutCheck() {
      if (this !== globalThis) throw new TypeError('Illegal invocation');
      return 'global-timeout-cleared';
    };
    const browser = {
      URL: { createObjectURL: () => 'blob:ctx', revokeObjectURL() {} },
      window: { addEventListener() {}, removeEventListener() {} },
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
      clearInterval() {},
    };

    const ctx = buildSubtitleControllerContext({ ...createMinimalDependencies(), browser });

    assert.equal(ctx.timers.setTimeout(() => {}, 1), 'global-timeout-id');
    assert.equal(ctx.timers.clearTimeout('global-timeout-id'), 'global-timeout-cleared');
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
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
  assert.equal(doneMessage.textContent, 'Tu video ya está listo para descargar; podés seguir editando y renderizar de nuevo.');
});

test('workflow renderer keeps the editor and inline render card usable during and after render', () => {
  const upload = { classList: createClassList() };
  const processing = { classList: createClassList() };
  const edition = { classList: createClassList() };
  const renderCard = { classList: createClassList() };
  const saveButton = { disabled: true };
  const readyButton = { disabled: true, textContent: '' };
  const downloadButton = { disabled: true };
  const doneTitle = { textContent: '' };
  const doneMessage = { textContent: '' };
  const state = {
    subtitles2: {
      machine: { getPhase: () => 'Procesando video' },
      sessionId: 'session-123',
      snapshotVersion: 4,
      dirty: false,
      renderStatus: 'running',
      renderProgressPct: 42,
      renderArtifactReady: false,
    },
  };
  const ctx = buildSubtitleControllerContext({
    ...createMinimalDependencies(),
    state,
    el: {
      subtitle2PhaseUpload: upload,
      subtitle2PhaseProcessing: processing,
      subtitle2PhaseEdition: edition,
      subtitle2PhaseDone: renderCard,
      subtitle2SaveBtn: saveButton,
      subtitle2ReadyBtn: readyButton,
      subtitle2DownloadBtn: downloadButton,
      subtitle2DoneTitle: doneTitle,
      subtitle2DoneMessage: doneMessage,
    },
  });
  const renderer = createSubtitleWorkflowRenderer(ctx, {
    hasDraftRows: () => false,
    getLastNonDraftRowIndex: () => 0,
  });

  renderer.renderPhaseSections();
  renderer.renderDoneCard();
  renderer.updateButtonsByPhase();

  assert.equal(edition.classList.contains('hidden'), false);
  assert.equal(renderCard.classList.contains('hidden'), false);
  assert.equal(processing.classList.contains('hidden'), true);
  assert.equal(readyButton.disabled, true);
  assert.equal(downloadButton.disabled, true);
  assert.equal(doneTitle.textContent, 'Renderizando video');
  assert.match(doneMessage.textContent, /42%/);

  state.subtitles2.machine = { getPhase: () => 'Terminado' };
  state.subtitles2.dirty = true;
  state.subtitles2.renderStatus = 'succeeded';
  state.subtitles2.renderProgressPct = 100;
  state.subtitles2.renderArtifactReady = true;
  renderer.renderPhaseSections();
  renderer.renderDoneCard();
  renderer.updateButtonsByPhase();

  assert.equal(edition.classList.contains('hidden'), false);
  assert.equal(renderCard.classList.contains('hidden'), false);
  assert.equal(saveButton.disabled, false);
  assert.equal(readyButton.disabled, false);
  assert.equal(downloadButton.disabled, false);
  assert.equal(readyButton.textContent, 'Renderizar de nuevo');
  assert.match(doneMessage.textContent, /podés seguir editando/i);
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

test('preview player exposes seekPreviewToRow that seeks to start and pauses for click-to-seek UX', () => {
  let lastCurrentTime = 0;
  let pauseCount = 0;
  const video = {
    currentTime: 0,
    paused: false,
    src: 'blob:keep',
    attributes: new Map([['src', 'blob:keep']]),
    getAttribute(name) { return this.attributes.get(name) || ''; },
    removeAttribute(name) { this.attributes.delete(name); },
    set currentTime(value) { lastCurrentTime = value; },
    pause() { this.paused = true; pauseCount += 1; },
    play() { this.paused = false; return Promise.resolve(); },
  };
  const ctx = buildSubtitleControllerContext({
    ...createMinimalDependencies(),
    state: {
      subtitles2: {
        previewVideoObjectUrl: 'blob:keep',
        previewVideoUrl: '',
        previewCurrentMs: 0,
        previewPlaying: true,
        audioDurationMs: 10000,
        rows: [{ id: 'row-7', start: '00:05.00', end: '00:08.00', phrase: 'hola' }],
      },
    },
    el: {
      subtitle2PreviewVideo: video,
      subtitle2PreviewStage: { classList: createClassList() },
      subtitle2PreviewEmpty: { classList: createClassList() },
      subtitle2PreviewPlayBtn: { disabled: false, textContent: '', setAttribute() {} },
    },
  });
  const player = createSubtitlePreviewPlayer(ctx, {
    renderTable: () => {},
    renderPreviewOverlay: () => {},
    resolvePreviewDurationMs: () => 10000,
  });

  player.seekPreviewToRow('row-7');

  assert.equal(lastCurrentTime, 5);
  assert.equal(pauseCount, 1);
});

test('seekPreviewToRow is a no-op when the row id is not found', () => {
  let lastCurrentTime = 0;
  let pauseCount = 0;
  const video = {
    currentTime: 0,
    paused: false,
    src: 'blob:keep',
    attributes: new Map([['src', 'blob:keep']]),
    getAttribute(name) { return this.attributes.get(name) || ''; },
    removeAttribute(name) { this.attributes.delete(name); },
    set currentTime(value) { lastCurrentTime = value; },
    pause() { this.paused = true; pauseCount += 1; },
    play() { this.paused = false; return Promise.resolve(); },
  };
  const ctx = buildSubtitleControllerContext({
    ...createMinimalDependencies(),
    state: {
      subtitles2: {
        previewVideoObjectUrl: 'blob:keep',
        previewVideoUrl: '',
        previewCurrentMs: 0,
        previewPlaying: true,
        audioDurationMs: 10000,
        rows: [{ id: 'row-7', start: '00:05.00', end: '00:08.00', phrase: 'hola' }],
      },
    },
    el: {
      subtitle2PreviewVideo: video,
      subtitle2PreviewStage: { classList: createClassList() },
      subtitle2PreviewEmpty: { classList: createClassList() },
      subtitle2PreviewPlayBtn: { disabled: false, textContent: '', setAttribute() {} },
    },
  });
  const player = createSubtitlePreviewPlayer(ctx, {
    renderTable: () => {},
    renderPreviewOverlay: () => {},
    resolvePreviewDurationMs: () => 10000,
  });

  player.seekPreviewToRow('row-missing');

  assert.equal(lastCurrentTime, 0);
  assert.equal(pauseCount, 0);
});

test('seekPreviewToRow is a no-op when no preview video is loaded', () => {
  let lastCurrentTime = 0;
  let pauseCount = 0;
  const video = {
    currentTime: 0,
    paused: false,
    src: '',
    attributes: new Map(),
    getAttribute(name) { return this.attributes.get(name) || ''; },
    removeAttribute(name) { this.attributes.delete(name); },
    set currentTime(value) { lastCurrentTime = value; },
    pause() { this.paused = true; pauseCount += 1; },
    play() { this.paused = false; return Promise.resolve(); },
  };
  const ctx = buildSubtitleControllerContext({
    ...createMinimalDependencies(),
    state: {
      subtitles2: {
        previewVideoObjectUrl: '',
        previewVideoUrl: '',
        previewCurrentMs: 0,
        previewPlaying: true,
        audioDurationMs: 10000,
        rows: [{ id: 'row-7', start: '00:05.00', end: '00:08.00', phrase: 'hola' }],
      },
    },
    el: {
      subtitle2PreviewVideo: video,
      subtitle2PreviewStage: { classList: createClassList() },
      subtitle2PreviewEmpty: { classList: createClassList() },
      subtitle2PreviewPlayBtn: { disabled: true, textContent: '', setAttribute() {} },
    },
  });
  const player = createSubtitlePreviewPlayer(ctx, {
    renderTable: () => {},
    renderPreviewOverlay: () => {},
    resolvePreviewDurationMs: () => 10000,
  });

  player.seekPreviewToRow('row-7');

  assert.equal(lastCurrentTime, 0);
  assert.equal(pauseCount, 0);
});

test('seekPreviewToRow pauses the video even when the video was already playing', () => {
  let lastCurrentTime = 0;
  let pauseCount = 0;
  const video = {
    currentTime: 0,
    paused: false,
    src: 'blob:keep',
    attributes: new Map([['src', 'blob:keep']]),
    getAttribute(name) { return this.attributes.get(name) || ''; },
    removeAttribute(name) { this.attributes.delete(name); },
    set currentTime(value) { lastCurrentTime = value; },
    pause() { this.paused = true; pauseCount += 1; },
    play() { this.paused = false; return Promise.resolve(); },
  };
  const ctx = buildSubtitleControllerContext({
    ...createMinimalDependencies(),
    state: {
      subtitles2: {
        previewVideoObjectUrl: 'blob:keep',
        previewVideoUrl: '',
        previewCurrentMs: 0,
        previewPlaying: true,
        audioDurationMs: 10000,
        rows: [{ id: 'row-9', start: '00:03.00', end: '00:06.00', phrase: 'mundo' }],
      },
    },
    el: {
      subtitle2PreviewVideo: video,
      subtitle2PreviewStage: { classList: createClassList() },
      subtitle2PreviewEmpty: { classList: createClassList() },
      subtitle2PreviewPlayBtn: { disabled: false, textContent: '', setAttribute() {} },
    },
  });
  const player = createSubtitlePreviewPlayer(ctx, {
    renderTable: () => {},
    renderPreviewOverlay: () => {},
    resolvePreviewDurationMs: () => 10000,
  });

  assert.equal(video.paused, false);
  player.seekPreviewToRow('row-9');
  assert.equal(video.paused, true);
  assert.equal(pauseCount, 1);
  assert.equal(lastCurrentTime, 3);
});

function buildClickTargetMock(rowId) {
  return {
    dataset: { rowId },
    closest(selector) {
      if (selector === 'tr[data-row-id]') return this;
      if (selector === 'button[data-action="insert-subtitle-row"]') return null;
      if (selector === 'button[data-action="nudge-subtitle-time"]') return null;
      if (selector === 'button[data-action="step-subtitle-number"]') return null;
      if (selector === 'button[data-action="delete-subtitle-row"]') return null;
      if (selector === 'button[data-field="align"]') return null;
      if (selector === 'input, textarea, select, button') return null;
      return null;
    },
  };
}

function buildTextareaClickTarget(rowId) {
  const textarea = {
    dataset: { rowId, field: 'phrase' },
    closest(selector) {
      if (selector === 'tr[data-row-id]') return this;
      if (selector === 'button[data-action="insert-subtitle-row"]') return null;
      if (selector === 'button[data-action="nudge-subtitle-time"]') return null;
      if (selector === 'button[data-action="step-subtitle-number"]') return null;
      if (selector === 'button[data-action="delete-subtitle-row"]') return null;
      if (selector === 'button[data-field="align"]') return null;
      if (selector === 'input, textarea, select, button') return this;
      return null;
    },
  };
  return textarea;
}

test('table editor onTableClick row-body fallback seeks the preview to that row', () => {
  const seekCalls = [];
  const ctx = buildSubtitleControllerContext({
    ...createMinimalDependencies(),
    state: {
      subtitles2: {
        rows: [
          { id: 'row-7', start: '00:05.00', end: '00:08.00', phrase: 'hola' },
          { id: 'row-8', start: '00:08.06', end: '00:10.00', phrase: 'mundo' },
        ],
        previewVideoObjectUrl: 'blob:loaded',
        previewVideoUrl: '',
        changeVersion: 0,
        dirty: false,
      },
    },
  });
  const editor = createSubtitleTableEditor(ctx, {
    renderWorkflow: () => {},
    renderTable: () => {},
    renderPreviewOverlay: () => {},
    updateButtonsByPhase: () => {},
    onSeekPreviewToRow: (rowId) => seekCalls.push(rowId),
  });

  editor.onTableClick({ target: buildClickTargetMock('row-7') });

  assert.deepEqual(seekCalls, ['row-7']);
});

test('table editor onTableClick does not seek when the click lands inside a textarea', () => {
  const seekCalls = [];
  const ctx = buildSubtitleControllerContext({
    ...createMinimalDependencies(),
    state: {
      subtitles2: {
        rows: [{ id: 'row-7', start: '00:05.00', end: '00:08.00', phrase: 'hola' }],
        previewVideoObjectUrl: 'blob:loaded',
        previewVideoUrl: '',
        changeVersion: 0,
        dirty: false,
      },
    },
  });
  const editor = createSubtitleTableEditor(ctx, {
    renderWorkflow: () => {},
    renderTable: () => {},
    renderPreviewOverlay: () => {},
    updateButtonsByPhase: () => {},
    onSeekPreviewToRow: (rowId) => seekCalls.push(rowId),
  });

  editor.onTableClick({ target: buildTextareaClickTarget('row-7') });

  assert.deepEqual(seekCalls, []);
});

test('table editor onTableClick does not seek when the row is a draft', () => {
  const seekCalls = [];
  const ctx = buildSubtitleControllerContext({
    ...createMinimalDependencies(),
    state: {
      subtitles2: {
        rows: [
          { id: 'row-1', start: '00:00.00', end: '00:01.00', phrase: 'uno' },
          { id: 'draft-1', start: '', end: '', phrase: '', isDraft: true },
        ],
        previewVideoObjectUrl: 'blob:loaded',
        previewVideoUrl: '',
        changeVersion: 0,
        dirty: false,
      },
    },
  });
  const editor = createSubtitleTableEditor(ctx, {
    renderWorkflow: () => {},
    renderTable: () => {},
    renderPreviewOverlay: () => {},
    updateButtonsByPhase: () => {},
    onSeekPreviewToRow: (rowId) => seekCalls.push(rowId),
  });

  editor.onTableClick({ target: buildClickTargetMock('draft-1') });

  assert.deepEqual(seekCalls, []);
});

test('table editor onTableClick does not seek when no preview video is loaded', () => {
  const seekCalls = [];
  const ctx = buildSubtitleControllerContext({
    ...createMinimalDependencies(),
    state: {
      subtitles2: {
        rows: [{ id: 'row-7', start: '00:05.00', end: '00:08.00', phrase: 'hola' }],
        previewVideoObjectUrl: '',
        previewVideoUrl: '',
        changeVersion: 0,
        dirty: false,
      },
    },
  });
  const editor = createSubtitleTableEditor(ctx, {
    renderWorkflow: () => {},
    renderTable: () => {},
    renderPreviewOverlay: () => {},
    updateButtonsByPhase: () => {},
    onSeekPreviewToRow: (rowId) => seekCalls.push(rowId),
  });

  assert.doesNotThrow(() => editor.onTableClick({ target: buildClickTargetMock('row-7') }));
  assert.deepEqual(seekCalls, []);
});

function buildAutoScrollHarness({ rows, containerRect, initialUserScrolledAt = 0 } = {}) {
  const rowMocks = new Map();
  for (const row of rows) {
    const classList = createClassList();
    rowMocks.set(row.id, {
      dataset: { rowId: row.id },
      classList,
      rect: row.rect,
      scrollIntoViewCalls: [],
      getBoundingClientRect() { return this.rect; },
      scrollIntoView(options) { this.scrollIntoViewCalls.push(options); },
    });
  }
  const rowsBody = {
    _rowMocks: rowMocks,
    querySelector(selector) {
      if (selector === 'tr[data-row-id]') {
        return rowMocks.values().next().value || null;
      }
      return null;
    },
    querySelectorAll(selector) {
      if (selector === 'tr[data-row-id]') {
        return Array.from(rowMocks.values());
      }
      return [];
    },
    closest(selector) {
      if (selector === '.subtitle-table-scroll') {
        return {
          getBoundingClientRect() { return containerRect; },
        };
      }
      return null;
    },
  };
  const rafCallbacks = [];
  const ctx = buildSubtitleControllerContext({
    ...createMinimalDependencies(),
    state: {
      subtitles2: {
        previewVideoObjectUrl: 'blob:keep',
        previewVideoUrl: '',
        previewCurrentMs: 0,
        previewPlaying: false,
        audioDurationMs: 10000,
        rows: rows.map((row) => ({ id: row.id, start: '00:00.00', end: '00:01.00', phrase: row.id })),
        activeRowId: '',
        userScrolledAt: initialUserScrolledAt,
      },
    },
    el: { subtitle2RowsBody: rowsBody },
    browser: {
      URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
      window: {
        addEventListener() {},
        removeEventListener() {},
        requestAnimationFrame(callback) { rafCallbacks.push(callback); return rafCallbacks.length; },
        cancelAnimationFrame() {},
      },
      setTimeout() {},
      clearTimeout() {},
      clearInterval() {},
    },
  });
  const player = createSubtitlePreviewPlayer(ctx, {
    renderTable: () => {},
    renderPreviewOverlay: () => {},
    resolvePreviewDurationMs: () => 10000,
  });
  return { player, ctx, rowMocks, rafCallbacks };
}

test('syncActiveTableRow scrolls the active row into view when off-screen and cooldown elapsed', () => {
  const { player, rowMocks, rafCallbacks } = buildAutoScrollHarness({
    rows: [
      { id: 'row-5', rect: { top: 50, bottom: 80 } },
      { id: 'row-12', rect: { top: 800, bottom: 830 } },
    ],
    containerRect: { top: 0, bottom: 400 },
  });

  player.syncActiveTableRow('row-12');
  // requestAnimationFrame callback must run to actually invoke scrollIntoView
  for (const cb of rafCallbacks) cb();

  assert.equal(rowMocks.get('row-12').scrollIntoViewCalls.length, 1);
  assert.deepEqual(rowMocks.get('row-12').scrollIntoViewCalls[0], { behavior: 'smooth', block: 'center' });
  assert.equal(rowMocks.get('row-5').scrollIntoViewCalls.length, 0);
});

test('syncActiveTableRow does not scroll when the active row is already inside the viewport', () => {
  const { player, rowMocks, rafCallbacks } = buildAutoScrollHarness({
    rows: [
      { id: 'row-5', rect: { top: 50, bottom: 80 } },
    ],
    containerRect: { top: 0, bottom: 400 },
  });

  player.syncActiveTableRow('row-5');
  for (const cb of rafCallbacks) cb();

  assert.equal(rowMocks.get('row-5').scrollIntoViewCalls.length, 0);
});

test('syncActiveTableRow does not scroll within the 500ms user-scroll cooldown', () => {
  const now = Date.now();
  const originalNow = Date.now;
  Date.now = () => now;
  try {
    const { player, rowMocks, rafCallbacks } = buildAutoScrollHarness({
      rows: [
        { id: 'row-12', rect: { top: 800, bottom: 830 } },
      ],
      containerRect: { top: 0, bottom: 400 },
      initialUserScrolledAt: now - 200,
    });

    player.syncActiveTableRow('row-12');
    for (const cb of rafCallbacks) cb();

    assert.equal(rowMocks.get('row-12').scrollIntoViewCalls.length, 0);
  } finally {
    Date.now = originalNow;
  }
});

test('syncActiveTableRow scrolls again once the user-scroll cooldown elapses', () => {
  const now = Date.now();
  const originalNow = Date.now;
  Date.now = () => now;
  try {
    const { player, rowMocks, rafCallbacks } = buildAutoScrollHarness({
      rows: [
        { id: 'row-12', rect: { top: 800, bottom: 830 } },
      ],
      containerRect: { top: 0, bottom: 400 },
      initialUserScrolledAt: now - 600,
    });

    player.syncActiveTableRow('row-12');
    for (const cb of rafCallbacks) cb();

    assert.equal(rowMocks.get('row-12').scrollIntoViewCalls.length, 1);
    assert.deepEqual(rowMocks.get('row-12').scrollIntoViewCalls[0], { behavior: 'smooth', block: 'center' });
  } finally {
    Date.now = originalNow;
  }
});

test('syncActiveTableRow does not scroll when the active row id has not changed', () => {
  const { player, rowMocks, rafCallbacks } = buildAutoScrollHarness({
    rows: [
      { id: 'row-12', rect: { top: 800, bottom: 830 } },
    ],
    containerRect: { top: 0, bottom: 400 },
  });

  player.syncActiveTableRow('row-12');
  for (const cb of rafCallbacks) cb();
  // Second call with the same id: id-equality guard kicks in
  player.syncActiveTableRow('row-12');

  assert.equal(rowMocks.get('row-12').scrollIntoViewCalls.length, 1);
});

test('root subtitles controller forwards preview video events so playhead follows playback', () => {
  const timelineTrack = { getBoundingClientRect: () => ({ left: 0, width: 400 }), innerHTML: '' };
  const controller = createSubtitlesController({
    ...createMinimalDependencies(),
    state: {
      subtitles2: {
        previewVideoUrl: 'preview.mp4',
        previewVideoObjectUrl: '',
        previewCurrentMs: 0,
        previewPlaying: true,
        audioDurationMs: 10000,
        rows: [{ id: 'row-1', start: '00:00.00', end: '00:10.00', phrase: 'hola' }],
        changeVersion: 0,
        dirty: false,
      },
    },
    el: {
      subtitle2PreviewTimelineTrack: timelineTrack,
      subtitle2PreviewTimecode: { textContent: '' },
      subtitle2RowsBody: { querySelectorAll: () => [] },
      subtitle2PreviewStage: { getBoundingClientRect: () => ({ width: 960, height: 540 }) },
      subtitle2PreviewOverlay: { style: {} },
      subtitle2PreviewCue: { textContent: '', style: {}, classList: createClassList(), removeAttribute() {} },
      subtitle2PreviewPlayBtn: { textContent: '', setAttribute() {} },
    },
  });

  controller.onPreviewTimeUpdate({ target: { currentTime: 2.37, duration: 10 } });

  assert.equal(timelineTrack.innerHTML.includes('left:23.7%'), true);
});

test('table editor max-width stepper handles nested arrow targets and repeat hold', () => {
  const timers = [];
  const clearedTimers = [];
  const windowListeners = new Map();
  const buttonListeners = new Map();
  const input = { value: '1080', step: '10', min: '1', dataset: { rowId: 'row-1', field: 'maxWidthPx' } };
  const buttonClassList = createClassList();
  const button = {
    disabled: false,
    dataset: { rowId: 'row-1', field: 'maxWidthPx', direction: 'up' },
    classList: buttonClassList,
    closest(selector) {
      if (selector.includes('step-subtitle-number')) return this;
      return null;
    },
    addEventListener(name, callback) { buttonListeners.set(name, callback); },
    removeEventListener(name) { buttonListeners.delete(name); },
    setPointerCapture(pointerId) { this.capturedPointerId = pointerId; },
    releasePointerCapture(pointerId) { this.releasedPointerId = pointerId; },
  };
  const textNodeTarget = { parentElement: button };
  const ctx = buildSubtitleControllerContext({
    ...createMinimalDependencies(),
    state: {
      subtitles2: {
        rows: [{ id: 'row-1', start: '00:00.00', end: '00:01.00', phrase: 'uno', maxWidthPx: 1080 }],
        changeVersion: 0,
        dirty: false,
        numberHoldTimer: null,
      },
    },
    el: { subtitle2RowsBody: { querySelectorAll: () => [input] } },
    browser: {
      URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
      window: {
        addEventListener(name, callback) { windowListeners.set(name, callback); },
        removeEventListener(name) { windowListeners.delete(name); },
      },
      setTimeout(callback, ms) { timers.push({ callback, ms }); return `timer-${timers.length}`; },
      clearTimeout(id) { clearedTimers.push(id); },
      clearInterval() {},
    },
  });
  const editor = createSubtitleTableEditor(ctx, {
    renderPreviewOverlay() {},
    updateButtonsByPhase() {},
  });

  editor.onTablePointerDown({ target: textNodeTarget, button: 0, pointerId: 17, preventDefault() {} });
  timers.find((timer) => timer.ms === 320).callback();
  timers.filter((timer) => timer.ms === 75).at(-1).callback();
  windowListeners.get('pointerup')();
  timers.filter((timer) => timer.ms === 75).at(-1).callback();

  assert.equal(input.value, '1110');
  assert.equal(ctx.state.subtitles2.rows[0].maxWidthPx, 1110);
  assert.equal(buttonClassList.contains('is-holding'), false);
  assert.equal(ctx.state.subtitles2.numberHoldTimer, null);
  assert.equal(ctx.state.subtitles2.numberHoldState, null);
  assert.equal(button.capturedPointerId, 17);
  assert.equal(button.releasedPointerId, 17);
  assert.ok(clearedTimers.includes('timer-3'));
  assert.equal(windowListeners.has('pointerup'), false);
  assert.equal(buttonListeners.has('mouseleave'), false);
});

test('table editor time nudge button press-and-hold advances start time and silences boundary toasts', () => {
  const timers = [];
  const clearedTimers = [];
  const windowListeners = new Map();
  const buttonListeners = new Map();
  const toasts = [];
  const buttonClassList = createClassList();
  const button = {
    disabled: false,
    dataset: { rowId: 'row-2', field: 'start', direction: 'up' },
    classList: buttonClassList,
    closest(selector) {
      if (selector.includes('nudge-subtitle-time')) return this;
      return null;
    },
    addEventListener(name, callback) { buttonListeners.set(name, callback); },
    removeEventListener(name) { buttonListeners.delete(name); },
    setPointerCapture(pointerId) { this.capturedPointerId = pointerId; },
    releasePointerCapture(pointerId) { this.releasedPointerId = pointerId; },
  };
  const textNodeTarget = { parentElement: button };
  const ctx = buildSubtitleControllerContext({
    ...createMinimalDependencies(),
    state: {
      subtitles2: {
        rows: [
          { id: 'row-1', start: '00:00.00', end: '00:01.00', phrase: 'uno' },
          { id: 'row-2', start: '00:01.20', end: '00:03.00', phrase: 'dos' },
          { id: 'row-3', start: '00:03.20', end: '00:05.00', phrase: 'tres' },
        ],
        changeVersion: 0,
        dirty: false,
        numberHoldTimer: null,
      },
    },
    el: { subtitle2RowsBody: { querySelectorAll: () => [] } },
    ui: { toast(message) { toasts.push(message); } },
    browser: {
      URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
      window: {
        addEventListener(name, callback) { windowListeners.set(name, callback); },
        removeEventListener(name) { windowListeners.delete(name); },
      },
      setTimeout(callback, ms) { timers.push({ callback, ms }); return `timer-${timers.length}`; },
      clearTimeout(id) { clearedTimers.push(id); },
      clearInterval() {},
    },
  });
  const editor = createSubtitleTableEditor(ctx, {
    renderPreviewOverlay() {},
    updateButtonsByPhase() {},
  });

  editor.onTablePointerDown({ target: textNodeTarget, button: 0, pointerId: 17, preventDefault() {} });
  timers.find((timer) => timer.ms === 320).callback();
  timers.filter((timer) => timer.ms === 75).at(-1).callback();
  windowListeners.get('pointerup')();
  timers.filter((timer) => timer.ms === 75).at(-1).callback();

  // 1 immediate nudge + 2 repeats (320ms + 75ms after pointerdown) = 3 nudges of -0.1s each.
  // start 1200ms → 1100 → 1000 → 900 = 00:00.90. previous end compensates: 900 - 60 = 840 = 00:00.84.
  assert.equal(ctx.state.subtitles2.rows[1].start, '00:00.90');
  assert.equal(ctx.state.subtitles2.rows[0].end, '00:00.84');
  assert.equal(buttonClassList.contains('is-holding'), false);
  assert.equal(ctx.state.subtitles2.numberHoldTimer, null);
  assert.equal(ctx.state.subtitles2.numberHoldState, null);
  assert.equal(button.capturedPointerId, 17);
  assert.equal(button.releasedPointerId, 17);
  assert.deepEqual(toasts, []);
});

test('table editor time nudge press-and-hold at boundary fires only the first toast', () => {
  const timers = [];
  const clearedTimers = [];
  const windowListeners = new Map();
  const buttonListeners = new Map();
  const toasts = [];
  const buttonClassList = createClassList();
  const button = {
    disabled: false,
    dataset: { rowId: 'row-1', field: 'start', direction: 'up' },
    classList: buttonClassList,
    closest(selector) {
      if (selector.includes('nudge-subtitle-time')) return this;
      return null;
    },
    addEventListener(name, callback) { buttonListeners.set(name, callback); },
    removeEventListener(name) { buttonListeners.delete(name); },
    setPointerCapture(pointerId) { this.capturedPointerId = pointerId; },
    releasePointerCapture(pointerId) { this.releasedPointerId = pointerId; },
  };
  const textNodeTarget = { parentElement: button };
  const ctx = buildSubtitleControllerContext({
    ...createMinimalDependencies(),
    state: {
      subtitles2: {
        rows: [
          { id: 'row-1', start: '00:00.00', end: '00:01.00', phrase: 'uno' },
          { id: 'row-2', start: '00:01.20', end: '00:03.00', phrase: 'dos' },
        ],
        changeVersion: 0,
        dirty: false,
        numberHoldTimer: null,
      },
    },
    el: { subtitle2RowsBody: { querySelectorAll: () => [] } },
    ui: { toast(message) { toasts.push(message); } },
    browser: {
      URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
      window: {
        addEventListener(name, callback) { windowListeners.set(name, callback); },
        removeEventListener(name) { windowListeners.delete(name); },
      },
      setTimeout(callback, ms) { timers.push({ callback, ms }); return `timer-${timers.length}`; },
      clearTimeout(id) { clearedTimers.push(id); },
      clearInterval() {},
    },
  });
  const editor = createSubtitleTableEditor(ctx, {
    renderPreviewOverlay() {},
    updateButtonsByPhase() {},
  });

  editor.onTablePointerDown({ target: textNodeTarget, button: 0, pointerId: 17, preventDefault() {} });
  timers.find((timer) => timer.ms === 320).callback();
  timers.filter((timer) => timer.ms === 75).at(-1).callback();
  windowListeners.get('pointerup')();

  // Immediate action toasts once; repeats are silent.
  assert.deepEqual(toasts, ['El START de la primera frase es fijo en 00:00.00']);
  assert.equal(ctx.state.subtitles2.rows[0].start, '00:00.00');
  assert.equal(buttonClassList.contains('is-holding'), false);
  assert.equal(ctx.state.subtitles2.numberHoldState, null);
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
  editor.onTableClick({ target: { dataset: { rowId: 'row-3' }, closest(selector) { return selector === 'button[data-action="insert-subtitle-row"]' ? this : null; } } });

  assert.equal(ctx.state.subtitles2.rows.find((row) => row.id === 'row-2').phrase, 'dos editado');
  assert.equal(ctx.state.subtitles2.rows.find((row) => row.id === 'row-2').start, '00:01.06');
  assert.equal(ctx.state.subtitles2.rows.find((row) => row.id === 'draft-1').isDraft, false);
  assert.deepEqual(ctx.state.subtitles2.rows.map((row) => row.id).map((id) => id.startsWith('insert-') ? 'inserted' : id), ['row-1', 'row-2', 'draft-1', 'row-3', 'inserted', 'row-4']);
  assert.equal(ctx.state.subtitles2.rows.find((row) => row.id === 'row-3').start, '00:04.12');
  assert.equal(ctx.state.subtitles2.rows.find((row) => row.id === 'row-4').start, '00:06.12');
  assert.deepEqual(toasts, ['START inválido: debe ser END anterior + gap.']);
  assert.equal(ctx.state.subtitles2.dirty, true);
  assert.ok(ctx.state.subtitles2.changeVersion >= 2);
  assert.ok(renderCalls.includes('overlay'));
  assert.ok(renderCalls.includes('workflow'));
});

test('table editor undo restores previous subtitle rows and coalesces phrase typing', () => {
  const timers = [];
  const cleared = [];
  const renderCalls = [];
  const ctx = buildSubtitleControllerContext({
    ...createMinimalDependencies(),
    state: {
      subtitles2: {
        rows: [{ id: 'row-1', start: '00:00.00', end: '00:01.00', phrase: 'uno', maxWidthPx: 1080 }],
        changeVersion: 0,
        savedVersion: 0,
        dirty: false,
      },
    },
    browser: {
      URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
      window: { addEventListener() {}, removeEventListener() {} },
      setTimeout(callback, ms) { timers.push({ callback, ms }); return `timer-${timers.length}`; },
      clearTimeout(id) { cleared.push(id); },
      clearInterval() {},
    },
  });
  const editor = createSubtitleTableEditor(ctx, {
    renderWorkflow: () => renderCalls.push('workflow'),
    renderTable: () => renderCalls.push('table'),
    renderPreviewOverlay: () => renderCalls.push('overlay'),
    updateButtonsByPhase: () => renderCalls.push('buttons'),
  });

  editor.onTableInput({ target: { dataset: { rowId: 'row-1', field: 'phrase' }, value: 'uno dos' } });
  editor.onTableInput({ target: { dataset: { rowId: 'row-1', field: 'phrase' }, value: 'uno dos tres' } });
  editor.patchRow('row-1', { maxWidthPx: 900 });

  assert.equal(ctx.state.subtitles2.undoStack.length, 2);
  assert.equal(editor.undoLastRowsChange(), true);
  assert.equal(ctx.state.subtitles2.rows[0].phrase, 'uno dos tres');
  assert.equal(ctx.state.subtitles2.rows[0].maxWidthPx, 1080);
  assert.equal(editor.undoLastRowsChange(), true);
  assert.equal(ctx.state.subtitles2.rows[0].phrase, 'uno');
  assert.equal(ctx.state.subtitles2.dirty, true);
  assert.ok(renderCalls.includes('workflow'));
  assert.ok(cleared.includes('timer-1'));
});

test('subtitle auto-save debounces dirty valid sessions and skips overlapping saves', async () => {
  const timers = [];
  const intervals = [];
  const clearedIntervals = [];
  const calls = [];
  let releaseSave;
  const pendingSave = new Promise((resolve) => { releaseSave = resolve; });
  const autosaveStatus = { textContent: '' };
  const windowListeners = new Map();
  const documentListeners = new Map();
  const ctx = buildSubtitleControllerContext({
    ...createMinimalDependencies(),
    state: {
      subtitles2: {
        sessionId: 'session-1',
        snapshotVersion: 2,
        dirty: true,
        autoSaveStatus: '',
      },
    },
    el: { subtitle2AutosaveStatus: autosaveStatus },
    browser: {
      URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
      document: {
        visibilityState: 'visible',
        addEventListener(name, callback) { documentListeners.set(name, callback); },
        removeEventListener(name) { documentListeners.delete(name); },
      },
      window: {
        addEventListener(name, callback) { windowListeners.set(name, callback); },
        removeEventListener(name) { windowListeners.delete(name); },
      },
      setTimeout(callback, ms) { timers.push({ callback, ms }); return `timer-${timers.length}`; },
      setInterval(callback, ms) { intervals.push({ callback, ms }); return `interval-${intervals.length}`; },
      clearTimeout() {},
      clearInterval(id) { clearedIntervals.push(id); },
    },
  });
  const autosave = createSubtitleAutoSaveController(ctx, {
    hasDraftRows: () => false,
    reportPresence: async () => calls.push('presence'),
    enqueueSave: async (mode) => {
      calls.push(`save:${mode}`);
      await pendingSave;
      ctx.state.subtitles2.dirty = false;
    },
    updateButtonsByPhase: () => calls.push('buttons'),
  });

  autosave.activate();
  autosave.requestAutoSave();
  assert.equal(timers[0].ms, 2500);
  const firstFlush = timers[0].callback();
  const overlapFlush = autosave.flush('interval');
  assert.equal(ctx.state.subtitles2.autoSaveStatus, 'Autoguardado pendiente');
  releaseSave();
  await firstFlush;
  await overlapFlush;
  autosave.deactivate();

  assert.deepEqual(calls.filter((call) => call.startsWith('save:')), ['save:auto']);
  assert.ok(calls.includes('presence'));
  assert.ok(calls.includes('buttons'));
  assert.equal(autosaveStatus.textContent.startsWith('Guardado automáticamente'), true);
  assert.equal(intervals[0].ms, 15000);
  assert.ok(clearedIntervals.includes('interval-1'));
  assert.equal(documentListeners.has('visibilitychange'), false);
  assert.equal(windowListeners.has('pagehide'), false);
});

test('subtitles table markup supports extended size presets, compact dropdown, active row, and hold stepper controls', () => {
  const markup = buildSubtitlesTableRowsMarkupRuntime({
    rows: [{ id: 'row-1', start: '00:00.00', end: '00:01.00', phrase: 'uno', size: '200', maxWidthPx: 1080, fontFamily: 'Khand', color: '#FFFFFF', align: 'center' }],
    activeRowId: 'row-1',
    sizeOptions: SUBTITLE_SIZE_PRESETS,
    fontOptions: ['Khand'],
    colorOptions: ['#FFFFFF'],
    lastNonDraftRowIndex: 0,
    escapeHtml(value) { return (value ?? '').toString(); },
    formatDisplayTime(value) { return value; },
    getAlignmentButtonState: () => ({
      left: { className: '', selected: false },
      center: { className: 'selected-green', selected: true },
      right: { className: '', selected: false },
    }),
    resolveFontWeight: () => 'Bold',
  });

  assert.ok(SUBTITLE_SIZE_PRESETS.includes('200'));
  assert.match(markup, /<option value="200" selected>200<\/option>/);
  assert.match(markup, /class="subtitle-row--active"/);
  assert.match(markup, /class="subtitle-size-select" data-custom-dropdown/);
  assert.match(markup, /data-action="insert-subtitle-row"/);
  assert.match(markup, /aria-label="Insertar subtítulo después de esta frase"/);
  assert.match(markup, /data-action="step-subtitle-number"/);
  assert.match(markup, /aria-label="Subir ancho máximo"/);
});

test('subtitles table markup separates insert and delete actions and disables insert at non-insertable rows', () => {
  const markup = buildSubtitlesTableRowsMarkupRuntime({
    rows: [
      { id: 'row-1', start: '00:00.00', end: '00:01.00', phrase: 'uno', size: '110', maxWidthPx: 1080, fontFamily: 'Khand', color: '#FFFFFF', align: 'center' },
      { id: 'row-2', start: '00:01.06', end: '00:02.00', phrase: 'dos', size: '110', maxWidthPx: 1080, fontFamily: 'Khand', color: '#FFFFFF', align: 'center' },
      { id: 'draft-1', start: '', end: '', phrase: '', isDraft: true, size: '110', maxWidthPx: 1080, fontFamily: 'Khand', color: '#FFFFFF', align: 'center' },
    ],
    lastNonDraftRowIndex: 1,
    escapeHtml(value) { return (value ?? '').toString(); },
    formatDisplayTime(value) { return value; },
    getAlignmentButtonState: () => ({
      left: { className: '', selected: false },
      center: { className: 'selected-green', selected: true },
      right: { className: '', selected: false },
    }),
    resolveFontWeight: () => 'Bold',
  });

  assert.match(markup, /<td class="subtitle-table__cell--insert"><button[^>]+data-row-id="row-1"[^>]*>\+<\/button><\/td>\s*<td class="subtitle-table__cell--delete">/);
  assert.doesNotMatch(markup, /data-row-id="row-1"[^>]+disabled[^>]*>\+<\/button>/);
  assert.match(markup, /data-row-id="row-2"[^>]+disabled[^>]*>\+<\/button>/);
  assert.match(markup, /data-row-id="draft-1"[^>]+disabled[^>]*>\+<\/button>/);
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
    style: {
      font_size: 110,
      font_family: 'Khand',
      font_weight: 'Bold',
      color: '#FFFFFF',
      align: 'center',
      max_width_px: 1080,
      text_transform: 'uppercase',
      text_align: 'center',
      line_height: 1.02,
      padding_x_px: 22,
      padding_y_px: 14,
      stripe_enabled: true,
      stripe_thickness_px: 3,
      text_shadow: 'none',
    },
  });
  assert.equal(calls.some((call) => call.type === 'phase' && call.phase === 'Procesando video'), false);
  assert.ok(calls.some((call) => call.type === 'poll-render' && call.sessionId === 'session-123'));
  assert.equal(ctx.state.subtitles2.renderStatus, 'queued');
  assert.equal(ctx.state.subtitles2.renderArtifactReady, false);
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

// ============================================================================
// Tests for: subtitles-global-and-individual-row-controls-fix
// Seven new tests covering (1) the global stepper patch path that previously
// returned early because the global row is virtual, and (2) the rerender:
// false fix on the input handlers for maxWidthPx / size / color / fontFamily /
// showStripes that previously destroyed the focused input/select mid-edit.
// ============================================================================

function buildStepperHarness({
  rowId = 'global',
  direction = 'up',
  inputValue = '1080',
  inputMin = '1',
  inputStep = '10',
  initialRows = [
    { id: 'row-1', start: '00:00.00', end: '00:01.00', phrase: 'uno', maxWidthPx: 1080 },
    { id: 'row-2', start: '00:01.06', end: '00:02.00', phrase: 'dos', maxWidthPx: 1080 },
  ],
} = {}) {
  const timers = [];
  const clearedTimers = [];
  const windowListeners = new Map();
  const input = {
    value: inputValue,
    min: inputMin,
    step: inputStep,
    dataset: { rowId, field: 'maxWidthPx' },
  };
  const buttonClassList = createClassList();
  const button = {
    disabled: false,
    dataset: { rowId, field: 'maxWidthPx', direction },
    classList: buttonClassList,
    closest(selector) {
      if (selector.includes('step-subtitle-number')) return this;
      return null;
    },
    addEventListener() {},
    removeEventListener() {},
    setPointerCapture() {},
    releasePointerCapture() {},
  };
  const textNodeTarget = { parentElement: button };
  const ctx = buildSubtitleControllerContext({
    ...createMinimalDependencies(),
    state: {
      subtitles2: {
        rows: initialRows.map((row) => ({ ...row })),
        changeVersion: 0,
        dirty: false,
        numberHoldTimer: null,
      },
    },
    el: { subtitle2RowsBody: { querySelectorAll: () => [input] } },
    browser: {
      URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
      window: {
        addEventListener(name, callback) { windowListeners.set(name, callback); },
        removeEventListener(name) { windowListeners.delete(name); },
      },
      setTimeout(callback, ms) { timers.push({ callback, ms }); return `timer-${timers.length}`; },
      clearTimeout(id) { clearedTimers.push(id); },
      clearInterval() {},
    },
  });
  const editor = createSubtitleTableEditor(ctx, {
    renderPreviewOverlay() {},
    updateButtonsByPhase() {},
  });
  return {
    editor,
    ctx,
    input,
    button,
    buttonClassList,
    textNodeTarget,
    windowListeners,
    timers,
    clearedTimers,
  };
}

function buildInputHandlerHarness({ field, value, rowId, initialRows }) {
  const renderCalls = [];
  const liveElements = new Set();
  const target = {
    dataset: { rowId, field },
    value: typeof value === 'boolean' ? undefined : value,
    checked: typeof value === 'boolean' ? value : undefined,
  };
  // Simulate the focused <input>/<select> being attached to the table DOM.
  liveElements.add(target);
  const ctx = buildSubtitleControllerContext({
    ...createMinimalDependencies(),
    state: {
      subtitles2: {
        rows: initialRows.map((row) => ({ ...row })),
        changeVersion: 0,
        dirty: false,
      },
    },
    el: { subtitle2RowsBody: { querySelectorAll: () => [] } },
  });
  const editor = createSubtitleTableEditor(ctx, {
    renderWorkflow: () => renderCalls.push('workflow'),
    renderTable: () => {
      // Simulate the table being torn down + rebuilt by a full re-render.
      renderCalls.push('table');
      liveElements.clear();
    },
    renderPreviewOverlay: () => renderCalls.push('overlay'),
    updateButtonsByPhase: () => renderCalls.push('buttons'),
  });
  return { editor, ctx, target, renderCalls, liveElements };
}

test('table editor stepper arrow on global row patches every row maxWidthPx and updates the global input value', () => {
  const { editor, ctx, input, textNodeTarget } = buildStepperHarness({ direction: 'up' });

  editor.onTablePointerDown({ target: textNodeTarget, button: 0, pointerId: 17, preventDefault() {} });

  assert.equal(input.value, '1090');
  for (const row of ctx.state.subtitles2.rows) {
    assert.equal(row.maxWidthPx, 1090, `row ${row.id} should be patched to 1090`);
  }
});

test('table editor stepper arrow down on global row respects input min and step attributes', () => {
  const { editor, ctx, input, textNodeTarget } = buildStepperHarness({
    direction: 'down',
    inputValue: '50',
    inputMin: '50',
    inputStep: '5',
  });

  editor.onTablePointerDown({ target: textNodeTarget, button: 0, pointerId: 17, preventDefault() {} });

  // Already at min: a down step of 5 must clamp to 50.
  assert.equal(input.value, '50');
  for (const row of ctx.state.subtitles2.rows) {
    assert.equal(row.maxWidthPx, 50, `row ${row.id} should stay at min 50`);
  }
});

test('table editor global size change patches every row without destroying the focused select', () => {
  const { editor, ctx, target, renderCalls, liveElements } = buildInputHandlerHarness({
    field: 'size',
    value: '200',
    rowId: 'global',
    initialRows: [
      { id: 'row-1', start: '00:00.00', end: '00:01.00', phrase: 'uno', size: '110' },
      { id: 'row-2', start: '00:01.06', end: '00:02.00', phrase: 'dos', size: '110' },
    ],
  });

  editor.onTableInput({ target });

  for (const row of ctx.state.subtitles2.rows) {
    assert.equal(row.size, '200', `row ${row.id} should have size 200`);
  }
  assert.equal(renderCalls.includes('table'), false, 'renderTable must not be called (rerender: false)');
  assert.equal(liveElements.has(target), true, 'the original <select> reference must still be in the DOM');
});

test('table editor individual size change patches only that row and keeps focus', () => {
  const { editor, ctx, target, renderCalls, liveElements } = buildInputHandlerHarness({
    field: 'size',
    value: '180',
    rowId: 'row-2',
    initialRows: [
      { id: 'row-1', start: '00:00.00', end: '00:01.00', phrase: 'uno', size: '110' },
      { id: 'row-2', start: '00:01.06', end: '00:02.00', phrase: 'dos', size: '110' },
      { id: 'row-3', start: '00:02.06', end: '00:03.00', phrase: 'tres', size: '110' },
    ],
  });

  editor.onTableInput({ target });

  assert.equal(ctx.state.subtitles2.rows[0].size, '110');
  assert.equal(ctx.state.subtitles2.rows[1].size, '180');
  assert.equal(ctx.state.subtitles2.rows[2].size, '110');
  assert.equal(renderCalls.includes('table'), false, 'renderTable must not be called (rerender: false)');
  assert.equal(liveElements.has(target), true, 'the original <select> reference must still be in the DOM');
});

test('table editor individual color change patches only that row and keeps focus', () => {
  const { editor, ctx, target, renderCalls, liveElements } = buildInputHandlerHarness({
    field: 'color',
    value: '#FFF000',
    rowId: 'row-2',
    initialRows: [
      { id: 'row-1', start: '00:00.00', end: '00:01.00', phrase: 'uno', color: '#FFFFFF' },
      { id: 'row-2', start: '00:01.06', end: '00:02.00', phrase: 'dos', color: '#FFFFFF' },
    ],
  });

  editor.onTableInput({ target });

  assert.equal(ctx.state.subtitles2.rows[0].color, '#FFFFFF');
  assert.equal(ctx.state.subtitles2.rows[1].color, '#FFF000');
  assert.equal(renderCalls.includes('table'), false, 'renderTable must not be called (rerender: false)');
  assert.equal(liveElements.has(target), true, 'the original <select> reference must still be in the DOM');
});

test('table editor individual maxWidthPx typing keeps the focused input across keystrokes', () => {
  const { editor, ctx, target, renderCalls, liveElements } = buildInputHandlerHarness({
    field: 'maxWidthPx',
    value: '1',
    rowId: 'row-1',
    initialRows: [
      { id: 'row-1', start: '00:00.00', end: '00:01.00', phrase: 'uno', maxWidthPx: 1080 },
    ],
  });

  for (const value of ['1', '12', '120', '1200']) {
    target.value = value;
    editor.onTableInput({ target });
    assert.equal(liveElements.has(target), true, `input must survive after typing ${value}`);
  }
  assert.equal(ctx.state.subtitles2.rows[0].maxWidthPx, 1200);
  assert.equal(renderCalls.includes('table'), false, 'table must not be re-rendered across keystrokes');
});

test('table editor global and individual maxWidthPx edits use distinct coalesceKeys so undo does not merge them', () => {
  // Global stepper edit.
  const g = buildStepperHarness({
    direction: 'up',
    initialRows: [{ id: 'row-1', start: '00:00.00', end: '00:01.00', phrase: 'uno', maxWidthPx: 1080 }],
  });
  g.editor.onTablePointerDown({ target: g.textNodeTarget, button: 0, pointerId: 17, preventDefault() {} });
  const globalKey = g.ctx.state.subtitles2.undoCoalesce?.key;

  // Individual stepper edit on row-1.
  const i = buildStepperHarness({
    rowId: 'row-1',
    direction: 'up',
    initialRows: [{ id: 'row-1', start: '00:00.00', end: '00:01.00', phrase: 'uno', maxWidthPx: 1080 }],
  });
  i.editor.onTablePointerDown({ target: i.textNodeTarget, button: 0, pointerId: 18, preventDefault() {} });
  const individualKey = i.ctx.state.subtitles2.undoCoalesce?.key;

  assert.ok(globalKey, 'global coalesce key should be set');
  assert.ok(individualKey, 'individual coalesce key should be set');
  assert.ok(globalKey.startsWith('global:'), `global key should start with 'global:', got ${globalKey}`);
  assert.ok(!individualKey.startsWith('global:'), `individual key should not start with 'global:', got ${individualKey}`);
  assert.notEqual(globalKey, individualKey);
});

// ============================================================================
// Tests for: subtitles-global-and-individual-row-controls-fix (align follow-up)
// Two new tests covering the align (I·C·D) button in `onTableClick` that
// previously dispatched the patch through a `patchFn` closure with the wrong
// argument order. The individual path therefore never matched `row.id ===
// rowId` and silently no-op'd, while both paths also re-rendered the table
// unnecessarily. The fix normalizes the closure to a 2-arg signature and
// passes `rerender: false` so the clicked button reference is preserved.
// ============================================================================

function buildClickHarness({ rowId, align, initialRows }) {
  const renderCalls = [];
  const liveElements = new Set();
  const target = {
    dataset: { rowId, align, field: 'align' },
    closest(selector) {
      if (selector === 'button[data-field="align"]') return this;
      return null;
    },
  };
  // Simulate the clicked <button> being attached to the table DOM.
  liveElements.add(target);
  const ctx = buildSubtitleControllerContext({
    ...createMinimalDependencies(),
    state: {
      subtitles2: {
        rows: initialRows.map((row) => ({ ...row })),
        changeVersion: 0,
        dirty: false,
      },
    },
    el: { subtitle2RowsBody: { querySelectorAll: () => [] } },
  });
  const editor = createSubtitleTableEditor(ctx, {
    renderWorkflow: () => renderCalls.push('workflow'),
    renderTable: () => {
      // Simulate the table being torn down + rebuilt by a full re-render.
      renderCalls.push('table');
      liveElements.clear();
    },
    renderPreviewOverlay: () => renderCalls.push('overlay'),
    updateButtonsByPhase: () => renderCalls.push('buttons'),
  });
  return { editor, ctx, target, renderCalls, liveElements };
}

test('table editor individual align click patches only that row and keeps focus', () => {
  const { editor, ctx, target, renderCalls, liveElements } = buildClickHarness({
    rowId: 'row-2',
    align: 'center',
    initialRows: [
      { id: 'row-1', start: '00:00.00', end: '00:01.00', phrase: 'uno', align: 'left', size: '110' },
      { id: 'row-2', start: '00:01.06', end: '00:02.00', phrase: 'dos', align: 'left', size: '110' },
      { id: 'row-3', start: '00:02.06', end: '00:03.00', phrase: 'tres', align: 'left', size: '110' },
    ],
  });

  editor.onTableClick({ target });

  // Only row-2 should have been patched: align=center, size=50 (C-button preset).
  assert.equal(ctx.state.subtitles2.rows[0].align, 'left', 'row-1 align should be unchanged');
  assert.equal(ctx.state.subtitles2.rows[0].size, '110', 'row-1 size should be unchanged');
  assert.equal(ctx.state.subtitles2.rows[1].align, 'center', 'row-2 align should be patched to center');
  assert.equal(ctx.state.subtitles2.rows[1].size, '50', 'row-2 size should be patched to 50 (C-button preset)');
  assert.equal(ctx.state.subtitles2.rows[2].align, 'left', 'row-3 align should be unchanged');
  assert.equal(ctx.state.subtitles2.rows[2].size, '110', 'row-3 size should be unchanged');
  // The clicked button reference must survive the dispatch (rerender: false).
  assert.equal(renderCalls.includes('table'), false, 'renderTable must not be called (rerender: false)');
  assert.equal(liveElements.has(target), true, 'the original <button> reference must still be in the DOM');
});

test('table editor global align click patches every row', () => {
  const { editor, ctx, target, renderCalls, liveElements } = buildClickHarness({
    rowId: 'global',
    align: 'center',
    initialRows: [
      { id: 'row-1', start: '00:00.00', end: '00:01.00', phrase: 'uno', align: 'left', size: '110' },
      { id: 'row-2', start: '00:01.06', end: '00:02.00', phrase: 'dos', align: 'left', size: '110' },
    ],
  });

  editor.onTableClick({ target });

  for (const row of ctx.state.subtitles2.rows) {
    assert.equal(row.align, 'center', `row ${row.id} should be aligned to center`);
    assert.equal(row.size, '50', `row ${row.id} should have size 50 (C-button preset)`);
  }
  // Global align dispatch must also avoid the table re-render (rerender: false).
  assert.equal(renderCalls.includes('table'), false, 'renderTable must not be called (rerender: false)');
  assert.equal(liveElements.has(target), true, 'the original <button> reference must still be in the DOM');
});
