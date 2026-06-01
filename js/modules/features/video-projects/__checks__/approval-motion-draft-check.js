import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  applyPendingMotionDrafts,
  createVideoProjectsFeature,
  mergeLocalEditorRowPatch,
  patchLocalEditorRows,
} from '../index.js';
import {
  destroyCompositionRenderer,
  getCompositionRendererForPreview,
  hydrateCompositionPreview,
  hydratePreviewTransport,
  updateSelectedVideoProjectCompositionPreview,
} from '../render/preview-lifecycle.js';
import { createMotionScrubHandlers, resolveMotionScrubValue } from '../render/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertNotEqual(actual, expected, message) {
  if (actual === expected) {
    throw new Error(`${message}: expected values to differ`);
  }
}

function assertDeepEqual(actual, expected, message) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
}

function createFakeClassList() {
  const values = new Set();
  return {
    add(value) {
      values.add(value);
    },
    remove(value) {
      values.delete(value);
    },
    toggle(value, force) {
      const shouldAdd = force === undefined ? !values.has(value) : Boolean(force);
      if (shouldAdd) values.add(value);
      else values.delete(value);
      return shouldAdd;
    },
    contains(value) {
      return values.has(value);
    },
  };
}

function createFakeMotionScrubInput({ value = '10', motionField = 'toX', withPointerCapture = true } = {}) {
  const dispatchedEvents = [];
  const listeners = new Map();
  const pointerCaptureCalls = [];
  const pointerReleaseCalls = [];
  return {
    value,
    dataset: { motionField },
    classList: createFakeClassList(),
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    dispatchEvent(event) {
      dispatchedEvents.push(event.type);
      return true;
    },
    ...(withPointerCapture
      ? {
        setPointerCapture(pointerId) {
          pointerCaptureCalls.push(pointerId);
        },
        releasePointerCapture(pointerId) {
          pointerReleaseCalls.push(pointerId);
        },
      }
      : {}),
    dispatchedEvents,
    listeners,
    pointerCaptureCalls,
    pointerReleaseCalls,
  };
}

function createFakeMotionScrubDocument({ userSelect = '' } = {}) {
  const listeners = new Map();
  const addCalls = [];
  const removeCalls = [];
  return {
    body: {
      classList: createFakeClassList(),
      style: { userSelect },
    },
    addEventListener(type, handler) {
      listeners.set(type, handler);
      addCalls.push(type);
    },
    removeEventListener(type) {
      listeners.delete(type);
      removeCalls.push(type);
    },
    dispatchPointer(type, event) {
      listeners.get(type)?.(event);
    },
    listeners,
    addCalls,
    removeCalls,
  };
}

function createPointerEvent({ pointerId = 7, clientX = 0, button = 0, shiftKey = false, altKey = false } = {}) {
  const event = {
    pointerId,
    clientX,
    button,
    shiftKey,
    altKey,
    defaultPrevented: false,
    preventDefault() {
      event.defaultPrevented = true;
    },
  };
  return event;
}

function createFakeTimers() {
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const timers = new Map();
  let nextId = 1;

  globalThis.setTimeout = (callback, delay = 0) => {
    const id = nextId;
    nextId += 1;
    timers.set(id, { callback, delay, cleared: false });
    return id;
  };

  globalThis.clearTimeout = (id) => {
    const timer = timers.get(id);
    if (timer) timer.cleared = true;
  };

  return {
    runPending() {
      const pending = Array.from(timers.entries());
      timers.clear();
      pending.forEach(([, timer]) => {
        if (!timer.cleared) timer.callback();
      });
    },
    restore() {
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
    },
  };
}

function flushMicrotasks() {
  return new Promise((resolvePromise) => {
    const enqueue = typeof queueMicrotask === 'function'
      ? queueMicrotask
      : (callback) => Promise.resolve().then(callback);
    enqueue(() => enqueue(resolvePromise));
  });
}

function createFakeElement(tagName = 'div') {
  const attributes = new Map();
  const element = {
    tagName: tagName.toUpperCase(),
    children: [],
    style: {},
    dataset: {},
    className: '',
    parentElement: null,
    clientWidth: 1920,
    clientHeight: 1080,
    readyState: 0,
    videoWidth: 0,
    videoHeight: 0,
    appendChild(child) {
      child.parentElement = element;
      element.children.push(child);
      return child;
    },
    remove() {},
    setAttribute(name, value) {
      attributes.set(name, String(value));
      if (name === 'src') element.src = String(value);
    },
    getAttribute(name) {
      if (name === 'src') return element.src || attributes.get(name) || '';
      return attributes.get(name) || '';
    },
    load() {},
    play() { return Promise.resolve(); },
    pause() {},
    getContext() { return null; },
  };
  return element;
}

function installFakeCompositionDom() {
  const previousDocument = globalThis.document;
  const previousImage = globalThis.Image;
  const previousWindow = globalThis.window;
  globalThis.window = { devicePixelRatio: 1 };
  globalThis.document = {
    createElement(tagName) {
      return createFakeElement(tagName);
    },
  };
  globalThis.Image = class FakeImage {
    constructor() {
      this.src = '';
      this.naturalWidth = 1920;
      this.naturalHeight = 1080;
    }

    decode() { return Promise.resolve(); }
  };
  return () => {
    globalThis.document = previousDocument;
    globalThis.Image = previousImage;
    globalThis.window = previousWindow;
  };
}

function createApprovalMotionHarness({ snapshotRows = [], failSnapshotUpdate = false } = {}) {
  const updateSnapshotCalls = [];
  const savedEditorStates = [];
  const renderEvents = [];
  const previewUpdateEvents = [];
  const toasts = [];
  const state = {
    settings: { approvalPipelineBaseUrl: 'http://approval.local' },
    selectedVideoProject: {
      draft_id: 'draft-1',
      editor_state: {
        pipeline_provider: 'approval',
        pipeline_base_url: 'http://approval.local',
        remotion_project_id: 'remotion-1',
        approval_contract_snapshot: {
          contractVersion: 'approval-editor-service-v1',
          projectId: 'remotion-1',
          snapshotHash: 'hash-base',
          rows: [],
          brandChannel: 'pelotazo-ecuador',
          assets: {
            'brand-logo-ecuador': { assetId: 'brand-logo-ecuador', previewUrl: './assets/logo-alpha.webm', renderPath: 'overlays/logo-alpha.webm' },
            'brand-logo-colombia': { assetId: 'brand-logo-colombia', previewUrl: './assets/logo-colombia.webm', renderPath: 'overlays/logo-colombia.mp4' },
            'asset-a': { assetId: 'asset-a', previewUrl: 'https://cdn.example.com/a.jpg', renderPath: 'https://cdn.example.com/a.jpg' },
            'asset-b': { assetId: 'asset-b', previewUrl: 'https://cdn.example.com/b.jpg', renderPath: 'https://cdn.example.com/b.jpg' },
          },
          globalLayers: {
            logoAssetId: 'brand-logo-ecuador',
            logo: { enabled: true, source: 'logo-alpha.webm', assetId: 'brand-logo-ecuador' },
          },
        },
        snapshot_hash: 'hash-base',
        phase: 'preview_ready',
      },
      _editorRows: [
        { id: 'row-1', motionPresetId: 'custom', motion: { fromX: 0, toX: 10, fromScale: 1, toScale: 1.1 }, selectedAssetId: 'asset-a', dust: { enabled: false, type: 'dust-1' }, logo: { enabled: true, source: 'logo-alpha.webm', assetId: 'brand-logo-ecuador' } },
        { id: 'row-2', motionPresetId: 'custom', motion: { fromX: 0, toX: 0, fromScale: 1, toScale: 1.1 }, selectedAssetId: 'asset-b', dust: { enabled: false, type: 'dust-1' }, logo: { enabled: true, source: 'logo-alpha.webm', assetId: 'brand-logo-ecuador' } },
      ],
    },
  };
  const api = {
    createApprovalPipelineClient() {
      return {
        async updateSnapshot(projectId, payload) {
          updateSnapshotCalls.push({ projectId, payload });
          if (failSnapshotUpdate) throw new Error('remote snapshot unavailable');
          return {
            snapshot: {
              contractVersion: 'approval-editor-service-v1',
              projectId,
              snapshotId: `snapshot-${updateSnapshotCalls.length}`,
              snapshotHash: `hash-${updateSnapshotCalls.length}`,
              rows: snapshotRows.length ? snapshotRows : state.selectedVideoProject._editorRows,
              audio: {},
            },
          };
        },
      };
    },
    async saveVideoProjectEditorState({ editorState }) {
      savedEditorStates.push(editorState);
    },
  };
  const feature = createVideoProjectsFeature({
    api,
    store: { getState: () => state },
    ui: { toast(message) { toasts.push(message); } },
    callbacks: {
      renderSelectedVideoProject: () => renderEvents.push({ motion: state.selectedVideoProject._editorRows[0]?.motion }),
      updateSelectedVideoProjectCompositionPreview: ({ project }) => {
        previewUpdateEvents.push({ motion: project._editorRows[0]?.motion });
        return true;
      },
      renderVideoProjects() {},
    },
  });

  return { feature, state, updateSnapshotCalls, savedEditorStates, renderEvents, previewUpdateEvents, toasts };
}

async function runApprovalRowImageSwapPreservesAssetUrlsCheck() {
  const { feature, updateSnapshotCalls } = createApprovalMotionHarness();

  await feature.swapRowImages('row-1', 'row-2');

  assertEqual(updateSnapshotCalls.length, 1, 'Expected image swap to persist one atomic snapshot update');
  const imageOperations = updateSnapshotCalls[0].payload.operations.filter((operation) => operation.type === 'setRowImage');
  assertEqual(imageOperations.length, 2, 'Expected image swap to include both row image operations');
  assertDeepEqual(
    imageOperations,
    [
      { type: 'setRowImage', rowId: 'row-1', asset: { assetId: 'asset-b', previewUrl: 'https://cdn.example.com/b.jpg', renderPath: 'https://cdn.example.com/b.jpg', id: 'asset-b' } },
      { type: 'setRowImage', rowId: 'row-2', asset: { assetId: 'asset-a', previewUrl: 'https://cdn.example.com/a.jpg', renderPath: 'https://cdn.example.com/a.jpg', id: 'asset-a' } },
    ],
    'Expected image swap to send existing canonical asset URLs, not bare asset ids as URLs',
  );
}

function createLocalMotionHarness() {
  const savedEditorStates = [];
  const renderEvents = [];
  const previewUpdateEvents = [];
  const state = {
    settings: {},
    selectedVideoProject: {
      draft_id: 'draft-local-1',
      editor_state: {
        phase: 'preview_ready',
        last_rendered_hash: 'outdated-hash',
        timed_rows: [
          { id: 'row-1', motionPresetId: 'custom', motion: { toX: 10 } },
        ],
      },
      _editorRows: [
        { id: 'row-1', motionPresetId: 'custom', motion: { toX: 10 } },
      ],
    },
  };
  const feature = createVideoProjectsFeature({
    api: {
      async saveVideoProjectEditorState({ editorState }) {
        savedEditorStates.push(editorState);
      },
    },
    store: { getState: () => state },
    ui: { toast() {} },
    callbacks: {
      renderSelectedVideoProject: () => renderEvents.push({ motion: state.selectedVideoProject._editorRows[0]?.motion }),
      updateSelectedVideoProjectCompositionPreview: ({ project }) => {
        previewUpdateEvents.push({ motion: project._editorRows[0]?.motion });
        return true;
      },
      renderVideoProjects() {},
    },
  });

  return { feature, state, savedEditorStates, renderEvents, previewUpdateEvents };
}

function runLocalMotionPatchMergeCheck() {
  const current = {
    id: 'row-1',
    selectedAssetId: 'asset-a',
    motionPresetId: 'Zoom 110',
    motion: { fromX: 0, toX: 10, fromScale: 1, toScale: 1.1 },
  };

  const next = mergeLocalEditorRowPatch(current, {
    motionPresetId: 'custom',
    motion: { fromX: 4, toX: 18, fromScale: 1.05, toScale: 1.18 },
  });

  assertNotEqual(next, current, 'Expected merge to create a new row object');
  assertEqual(next.selectedAssetId, 'asset-a', 'Expected unrelated row fields to be preserved');
  assertEqual(next.motionPresetId, 'custom', 'Expected local motion preset draft to be applied');
  assertEqual(next.motion.toX, 18, 'Expected local manual X draft to be applied');
  assertEqual(current.motion.toX, 10, 'Expected current row object to remain unchanged');
}

function runPatchLocalRowsCheck() {
  const rows = [
    { id: 'row-1', motion: { toX: 10 } },
    { id: 'row-2', motion: { toX: 20 } },
  ];

  const nextRows = patchLocalEditorRows(rows, 'row-2', { motion: { toX: 42 } });

  assertNotEqual(nextRows, rows, 'Expected row patch to create a new rows array');
  assertEqual(nextRows[0], rows[0], 'Expected untouched rows to preserve identity');
  assertNotEqual(nextRows[1], rows[1], 'Expected patched row to be replaced');
  assertEqual(nextRows[1].motion.toX, 42, 'Expected target row motion draft to be applied');
  assertEqual(rows[1].motion.toX, 20, 'Expected original target row to remain unchanged');
}

function runCanonicalDraftProtectionCheck() {
  const canonicalRows = [
    { id: 'row-1', motionPresetId: 'custom', motion: { toX: 10, toScale: 1.1 } },
    { id: 'row-2', motionPresetId: 'custom', motion: { toX: 20, toScale: 1.2 } },
  ];
  const drafts = new Map([
    ['row-1', { patch: { motionPresetId: 'custom', motion: { toX: 99, toScale: 1.35 } } }],
  ]);

  const protectedRows = applyPendingMotionDrafts(canonicalRows, drafts);

  assertEqual(protectedRows[0].motion.toX, 99, 'Expected newer local draft to win over older canonical snapshot');
  assertEqual(protectedRows[0].motion.toScale, 1.35, 'Expected newer local scale draft to win over older canonical snapshot');
  assertEqual(protectedRows[1].motion.toX, 20, 'Expected canonical row without a draft to remain canonical');
}

async function runApprovalUpdateRowOptimisticPatchCheck() {
  const timers = createFakeTimers();
  try {
    const { feature, state, updateSnapshotCalls, renderEvents, previewUpdateEvents } = createApprovalMotionHarness();

    await feature.updateRow('row-1', {
      motionPresetId: 'custom',
      motion: { fromX: 0, toX: 44, fromScale: 1, toScale: 1.22 },
      manualMotionDraft: true,
    });

    assertEqual(state.selectedVideoProject._editorRows[0].motion.toX, 44, 'Expected manual motion draft to patch the local row immediately');
    assertEqual(state.selectedVideoProject.editor_state.timed_rows[0].motion.toX, 44, 'Expected optimistic timed_rows to be live before remote snapshot');
    assertEqual(state.selectedVideoProject.editor_state.phase, 'editing_dirty', 'Expected optimistic draft to mark editor dirty');
    assertEqual(updateSnapshotCalls.length, 0, 'Expected manual motion draft to wait for debounce before remote persistence');
    assertEqual(previewUpdateEvents.length, 1, 'Expected optimistic patch to update the existing composition preview once immediately');
    assertEqual(previewUpdateEvents[0].motion.toX, 44, 'Expected lightweight preview update to receive the local manual motion draft');
    assertEqual(renderEvents.length, 0, 'Expected manual motion draft input not to trigger a full detail render');
  } finally {
    timers.restore();
  }
}

async function runApprovalPresetMotionUsesOptimisticDraftCheck() {
  const timers = createFakeTimers();
  try {
    const { feature, state, updateSnapshotCalls, renderEvents, previewUpdateEvents } = createApprovalMotionHarness();

    await feature.updateRow('row-1', {
      motionPresetId: 'Movimiento-Derecha-Izquierda',
      motion: { fromX: -120, toX: 120, fromScale: 1.25, toScale: 1.25 },
    });

    assertEqual(state.selectedVideoProject._editorRows[0].motionPresetId, 'Movimiento-Derecha-Izquierda', 'Expected preset motion selection to patch the local preset immediately');
    assertEqual(state.selectedVideoProject._editorRows[0].motion.toX, 120, 'Expected preset motion selection to patch local motion immediately');
    assertEqual(state.selectedVideoProject.editor_state.timed_rows[0].motion.toX, 120, 'Expected preset motion selection to keep editor state in sync before remote snapshot save');
    assertEqual(updateSnapshotCalls.length, 0, 'Expected preset motion selection to use debounced snapshot persistence, not an immediate remote update');
    assertEqual(previewUpdateEvents.length, 1, 'Expected preset motion selection to update the existing composition preview once immediately');
    assertEqual(renderEvents.length, 0, 'Expected preset motion selection not to trigger a full detail render before debounce persistence');
  } finally {
    timers.restore();
  }
}

async function runApprovalGlobalRowLayerUsesOptimisticDraftCheck() {
  const timers = createFakeTimers();
  try {
    const { feature, state, updateSnapshotCalls, renderEvents, previewUpdateEvents, toasts } = createApprovalMotionHarness({ failSnapshotUpdate: true });

    await feature.updateRow('row-1', { dust: { enabled: true, type: 'dust-2' } });
    await feature.updateRow('row-1', { logo: { enabled: false } });

    assertEqual(state.selectedVideoProject._editorRows[0].dust.enabled, true, 'Expected global dust change to patch the local row immediately');
    assertEqual(state.selectedVideoProject._editorRows[0].dust.type, 'dust-2', 'Expected global dust type to patch the local row immediately');
    assertEqual(state.selectedVideoProject._editorRows[0].logo.enabled, false, 'Expected global logo change to patch local rows immediately');
    assertEqual(state.selectedVideoProject.editor_state.timed_rows[0].dust.type, 'dust-2', 'Expected global dust change to keep editor state in sync before remote snapshot save');
    assertEqual(updateSnapshotCalls.length, 0, 'Expected global dust/logo changes to use debounced snapshot persistence, not immediate remote update');
    assertEqual(previewUpdateEvents.length, 2, 'Expected each global row layer change to update the existing composition preview immediately');
    assertEqual(renderEvents.length, 0, 'Expected global row layer changes not to trigger a full detail render before debounce persistence');
    assertDeepEqual(toasts, [], 'Expected no snapshot error toast before debounced persistence runs');
  } finally {
    timers.restore();
  }
}

async function runApprovalBrandChannelUsesOptimisticDraftCheck() {
  const timers = createFakeTimers();
  try {
    const { feature, state, updateSnapshotCalls, renderEvents, previewUpdateEvents, toasts } = createApprovalMotionHarness({ failSnapshotUpdate: true });

    await feature.updateBrandChannel('pelotazo-colombia');

    const snapshot = state.selectedVideoProject.editor_state.approval_contract_snapshot;
    assertEqual(state.selectedVideoProject.editor_state.brandChannel, 'pelotazo-colombia', 'Expected project selection to patch the editor brand immediately');
    assertEqual(snapshot.brandChannel, 'pelotazo-colombia', 'Expected project selection to patch canonical snapshot brand immediately');
    assertEqual(snapshot.globalLayers.logo.assetId, 'brand-logo-colombia', 'Expected Colombia selection to apply Colombia logo asset immediately');
    assertEqual(state.selectedVideoProject._editorRows[0].logo.source, 'logo-colombia.webm', 'Expected Colombia selection to apply row logo source immediately');
    assertEqual(updateSnapshotCalls.length, 0, 'Expected project selection to use debounced snapshot persistence, not immediate remote update');
    assertEqual(previewUpdateEvents.length, 1, 'Expected project selection to update the existing composition preview immediately');
    assertEqual(renderEvents.length, 0, 'Expected project selection not to trigger a full detail render before debounce persistence');
    assertDeepEqual(toasts, [], 'Expected no snapshot error toast before debounced project persistence runs');
  } finally {
    timers.restore();
  }
}

async function runBrandChannelPreviewAssetReloadCheck() {
  const restoreDom = installFakeCompositionDom();
  try {
    const container = createFakeElement('div');
    const root = {
      querySelector(selector) {
        return selector === '[data-composition-container]' ? container : null;
      },
    };
    const project = {
      draft_id: 'draft-brand-preview',
      _previewSeekTime: 1.25,
      _editorRows: [
        { id: 'row-1', rowId: 'row-1', image: 'https://cdn.example.com/a.jpg', startTime: 0, endTime: 3, effectiveEndTime: 3, logo: { enabled: true }, dust: { enabled: false, type: 'dust-1' } },
      ],
      editor_state: {
        brandChannel: 'pelotazo-ecuador',
        approval_contract_snapshot: {
          brandChannel: 'pelotazo-ecuador',
          rows: [],
          assets: {
            'brand-logo-ecuador': { assetId: 'brand-logo-ecuador', previewUrl: './assets/logo-alpha.webm' },
            'brand-outro-ecuador': { assetId: 'brand-outro-ecuador', previewUrl: './assets/final-ecuador.webm' },
          },
          globalLayers: {
            logo: { enabled: true, source: 'logo-alpha.webm', assetId: 'brand-logo-ecuador' },
            outro: { enabled: true, assetId: 'brand-outro-ecuador' },
          },
        },
      },
    };

    hydrateCompositionPreview({ root, project, editorRows: project._editorRows });
    await flushMicrotasks();
    await flushMicrotasks();

    const renderer = getCompositionRendererForPreview();
    assertEqual(renderer?._logoUrl, './assets/logo-alpha.webm', 'Expected initial preview renderer to preload Ecuador logo');
    assertEqual(renderer?._outroUrl, './assets/final-ecuador.webm', 'Expected initial preview renderer to preload Ecuador outro');

    project.editor_state = {
      ...project.editor_state,
      brandChannel: 'pelotazo-colombia',
      approval_contract_snapshot: {
        brandChannel: 'pelotazo-colombia',
        rows: [],
        assets: {
          'brand-logo-colombia': { assetId: 'brand-logo-colombia', previewUrl: './assets/logo-colombia.webm' },
          'brand-outro-colombia': { assetId: 'brand-outro-colombia', previewUrl: './assets/final-colombia.webm' },
        },
        globalLayers: {
          logo: { enabled: true, source: 'logo-colombia.webm', assetId: 'brand-logo-colombia' },
          outro: { enabled: true, assetId: 'brand-outro-colombia' },
        },
      },
    };

    const updated = updateSelectedVideoProjectCompositionPreview({ project });
    await flushMicrotasks();
    await flushMicrotasks();

    assertEqual(updated, true, 'Expected lightweight preview update to run for brand asset changes');
    assertEqual(renderer._logoUrl, './assets/logo-colombia.webm', 'Expected brand change to reload Colombia logo without full rerender');
    assertEqual(renderer._outroUrl, './assets/final-colombia.webm', 'Expected brand change to reload Colombia outro without full rerender');
    assertEqual(renderer.currentTime, 1.25, 'Expected brand asset reload to preserve preview seek time');
  } finally {
    destroyCompositionRenderer();
    restoreDom();
  }
}

function createFakeTransportElement({ dataset = {} } = {}) {
  const listeners = new Map();
  return {
    dataset: { ...dataset },
    style: {},
    classList: createFakeClassList(),
    addEventListener(type, handler) { listeners.set(type, handler); },
    closest() { return null; },
    getBoundingClientRect() { return { left: 0, width: 100 }; },
    listeners,
  };
}

function runPreviewTimelineAutoSelectsCurrentRowCheck() {
  destroyCompositionRenderer();
  const progressEl = createFakeTransportElement();
  const playheadEl = createFakeTransportElement();
  const currentTimeEl = createFakeTransportElement();
  const scrubber = createFakeTransportElement({ dataset: { duration: '6' } });
  const markerA = createFakeTransportElement({ dataset: { rowId: 'row-1' } });
  const markerB = createFakeTransportElement({ dataset: { rowId: 'row-2' } });
  const rowA = createFakeTransportElement({ dataset: { rowId: 'row-1' } });
  const rowB = createFakeTransportElement({ dataset: { rowId: 'row-2' } });
  const project = { _selectedEditorRowId: 'row-1', _previewSeekTime: 0 };
  const rows = [
    { id: 'row-1', startTime: 0, endTime: 3, effectiveEndTime: 3, selectedAssetId: 'image-1' },
    { id: 'row-2', startTime: 3, endTime: 6, effectiveEndTime: 6, selectedAssetId: 'image-2' },
  ];
  const calls = [];
  const root = {
    ownerDocument: { body: {}, activeElement: null },
    querySelector(selector) {
      if (selector === '[data-preview-scrubber]') return scrubber;
      if (selector === '[data-preview-progress]') return progressEl;
      if (selector === '[data-preview-playhead]') return playheadEl;
      if (selector === '[data-preview-current-time]') return currentTimeEl;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '.video-preview-timeline__marker') return [markerA, markerB];
      if (selector === '.video-editor-row[data-row-id]') return [rowA, rowB];
      return [];
    },
  };

  const controls = hydratePreviewTransport({
    root,
    project,
    editorRows: rows,
    selectEditorRow(rowId, startTime, options) { calls.push({ rowId, startTime, options }); },
  });

  assertEqual(calls.length, 0, 'Expected initial current selected row not to trigger redundant selection');
  controls.updatePreviewTimeline(3.25, 6);
  assertEqual(calls.length, 1, 'Expected preview timeline to select row when playhead enters a new segment');
  assertEqual(calls[0].rowId, 'row-2', 'Expected second row to be selected from preview time');
  assertEqual(calls[0].startTime, 3, 'Expected auto selection to pass current row start time');
  assertDeepEqual(calls[0].options, { syncPreview: false, source: 'preview-timeline', render: true }, 'Expected auto selection not to seek the preview backwards');
  assertEqual(project._selectedEditorRowId, 'row-2', 'Expected project selected row to track preview row');
  assertEqual(project._previewSeekTime, 3.25, 'Expected auto selection to preserve current preview time for rerender hydration');
  assertEqual(markerB.classList.contains('is-current'), true, 'Expected timeline marker to show current row');
  assertEqual(rowB.classList.contains('is-current'), true, 'Expected editor row to show current row');
  controls.updatePreviewTimeline(3.75, 6);
  assertEqual(calls.length, 1, 'Expected repeated ticks in same segment not to reselect row');

  controls.updatePreviewTimeline(0.5, 6);
  controls.updatePreviewTimeline(3.25, 6, { playing: true });
  assertEqual(calls.length, 3, 'Expected playing timeline transition to still update selected row state');
  assertDeepEqual(calls[2].options, { syncPreview: false, source: 'preview-timeline', render: false }, 'Expected playing timeline auto selection not to rerender and reset playback');

  controls.updatePreviewTimeline(0.5, 6);
  controls.updatePreviewTimeline(3.25, 6, { render: false });
  assertEqual(calls.length, 5, 'Expected scrubbed timeline transition to still update selected row state');
  assertDeepEqual(calls[4].options, { syncPreview: false, source: 'preview-timeline', render: false }, 'Expected scrubbed timeline auto selection not to rerender and reset seek position');
}

async function runApprovalGlobalDraftsPersistAfterDebounceCheck() {
  const timers = createFakeTimers();
  try {
    const { feature, updateSnapshotCalls, toasts } = createApprovalMotionHarness();

    await feature.updateRow('row-1', { dust: { enabled: true, type: 'dust-2' } });
    await feature.updateRow('row-1', { logo: { enabled: false } });
    await feature.updateBrandChannel('pelotazo-colombia');

    assertEqual(updateSnapshotCalls.length, 0, 'Expected global drafts to wait for debounce before remote persistence');
    timers.runPending();
    await flushMicrotasks();
    await flushMicrotasks();

    assertEqual(updateSnapshotCalls.length, 1, 'Expected global drafts to persist with one debounced remote snapshot update');
    assertDeepEqual(
      updateSnapshotCalls[0].payload.operations,
      [
        { type: 'setRowDust', rowId: 'row-1', enabled: true, dustType: 'dust-2' },
        { type: 'setLogo', enabled: false, source: 'logo-alpha.webm', assetId: 'brand-logo-ecuador' },
        { type: 'setBrandChannel', brandChannel: 'pelotazo-colombia' },
      ],
      'Expected debounced remote persistence to include dust, logo, and project operations in order',
    );
    assertDeepEqual(toasts, [], 'Expected successful global debounce persistence not to show snapshot errors');
  } finally {
    timers.restore();
  }
}

async function runApprovalMotionDebounceCoalescingCheck() {
  const timers = createFakeTimers();
  try {
    const { feature, updateSnapshotCalls, renderEvents, previewUpdateEvents } = createApprovalMotionHarness({
      snapshotRows: [{ id: 'row-1', motionPresetId: 'custom', motion: { fromX: 0, toX: 12, fromScale: 1, toScale: 1.12 } }],
    });

    await feature.updateRow('row-1', {
      motionPresetId: 'custom',
      motion: { fromX: 0, toX: 21, fromScale: 1, toScale: 1.21 },
      manualMotionDraft: true,
    });
    await feature.updateRow('row-1', {
      motionPresetId: 'custom',
      motion: { fromX: 0, toX: 33, fromScale: 1, toScale: 1.33 },
      manualMotionDraft: true,
    });
    await feature.updateRow('row-1', {
      motionPresetId: 'custom',
      motion: { fromX: 0, toX: 55, fromScale: 1, toScale: 1.55 },
      manualMotionDraft: true,
    });

    assertEqual(updateSnapshotCalls.length, 0, 'Expected repeated manual changes to remain local until debounce fires');
    assertEqual(previewUpdateEvents.length, 3, 'Expected each manual draft input to update the existing composition preview');
    assertEqual(renderEvents.length, 0, 'Expected repeated manual draft inputs not to trigger full detail renders before debounce persistence');

    timers.runPending();
    await flushMicrotasks();

    assertEqual(updateSnapshotCalls.length, 1, 'Expected coalesced manual changes to persist with one remote snapshot update');
    assertEqual(updateSnapshotCalls[0].payload.operations.length, 1, 'Expected repeated changes for the same row to coalesce to one operation');
    assertDeepEqual(
      updateSnapshotCalls[0].payload.operations[0],
      { type: 'setRowMotion', rowId: 'row-1', motionPresetId: 'custom', motion: { fromX: 0, toX: 55, fromScale: 1, toScale: 1.55 } },
      'Expected remote persistence to receive only the latest manual motion value',
    );
  } finally {
    timers.restore();
  }
}

async function runOlderCanonicalSnapshotDoesNotOverwritePendingDraftCheck() {
  const timers = createFakeTimers();
  try {
    const { feature, state, savedEditorStates, previewUpdateEvents } = createApprovalMotionHarness({
      snapshotRows: [{ id: 'row-1', motionPresetId: 'custom', motion: { fromX: 0, toX: 14, fromScale: 1, toScale: 1.14 } }],
    });

    await feature.updateRow('row-1', {
      motionPresetId: 'custom',
      motion: { fromX: 0, toX: 88, fromScale: 1, toScale: 1.88 },
      manualMotionDraft: true,
    });

    timers.runPending();
    await flushMicrotasks();
    await flushMicrotasks();

    assertEqual(state.selectedVideoProject._editorRows[0].motion.toX, 88, 'Expected newer pending draft to survive older canonical row snapshot');
    assertEqual(state.selectedVideoProject.editor_state.timed_rows[0].motion.toX, 88, 'Expected editor state to keep pending draft over stale canonical row');
    assertEqual(savedEditorStates.at(-1).timed_rows[0].motion.toX, 88, 'Expected persisted editor state to save draft-protected rows');
    assertEqual(previewUpdateEvents.length, 1, 'Expected pending draft to update the existing composition preview before remote save');
  } finally {
    timers.restore();
  }
}

async function runLocalMotionDebouncedSaveUsesPatchedRowsCheck() {
  const timers = createFakeTimers();
  try {
    const { feature, state, savedEditorStates, renderEvents, previewUpdateEvents } = createLocalMotionHarness();

    await feature.updateRow('row-1', {
      motionPresetId: 'custom',
      motion: { toX: 77 },
    });

    assertEqual(state.selectedVideoProject._editorRows[0].motion.toX, 77, 'Expected local non-approval motion patch to update local rows immediately');
    assertEqual(previewUpdateEvents.length, 1, 'Expected local non-approval motion patch to update the existing composition preview');
    assertEqual(previewUpdateEvents[0].motion.toX, 77, 'Expected local lightweight preview update to receive the local motion patch');
    assertEqual(renderEvents.length, 0, 'Expected local non-approval motion patch not to trigger a full detail render');

    timers.runPending();
    await flushMicrotasks();

    assertEqual(savedEditorStates.length, 1, 'Expected local non-approval motion patch to persist after debounce');
    assertEqual(savedEditorStates[0].timed_rows[0].motion.toX, 77, 'Expected debounced local save to persist patched rows, not stale rows');
  } finally {
    timers.restore();
  }
}

async function runLocalManualMotionDraftUsesLightweightPreviewCheck() {
  const timers = createFakeTimers();
  try {
    const { feature, state, savedEditorStates, renderEvents, previewUpdateEvents } = createLocalMotionHarness();

    await feature.updateRow('row-1', {
      motionPresetId: 'custom',
      motion: { toX: 91 },
      manualMotionDraft: true,
    });

    assertEqual(state.selectedVideoProject._editorRows[0].motion.toX, 91, 'Expected local manual motion draft to update local rows immediately');
    assertEqual(previewUpdateEvents.length, 1, 'Expected local manual motion draft to update the existing composition preview');
    assertEqual(previewUpdateEvents[0].motion.toX, 91, 'Expected local lightweight preview update to receive the local manual draft');
    assertEqual(renderEvents.length, 0, 'Expected local manual motion draft not to trigger a full detail render');

    timers.runPending();
    await flushMicrotasks();

    assertEqual(savedEditorStates.length, 1, 'Expected local manual motion draft to keep debounced persistence unchanged');
    assertEqual(savedEditorStates[0].timed_rows[0].motion.toX, 91, 'Expected local manual draft save to persist patched rows');
  } finally {
    timers.restore();
  }
}

function runManualMotionHandlerSourceCheck() {
  const renderSource = [
    '../render/index.js',
    '../render/editor-hydration.js',
    '../render/motion-scrub.js',
  ].map((relativePath) => readFileSync(resolve(__dirname, relativePath), 'utf8')).join('\n');
  const handlerBlock = renderSource.match(/const updateManualMotionKeyframe = \(\) => \{[\s\S]*?hydrateMotionScrubberInput\(input\);/);
  if (!handlerBlock) throw new Error('Expected manual motion keyframe hydration block to be present');
  assertEqual(
    handlerBlock[0].includes("input.addEventListener('input', updateManualMotionKeyframe)"),
    true,
    'Expected live input events to use the shared manual motion update path',
  );
  assertEqual(
    handlerBlock[0].includes("input.addEventListener('change', updateManualMotionKeyframe)"),
    true,
    'Expected final change events to use the shared manual motion update path',
  );
  assertEqual(
    handlerBlock[0].includes('manualMotionDraft: true'),
    true,
    'Expected shared handler to flag manual motion drafts for approval-service coalescing',
  );
  assertEqual(
    handlerBlock[0].includes('hydrateMotionScrubberInput'),
    true,
    'Expected scrubber hydration to reuse the shared manual motion update path',
  );
  assertEqual(
    renderSource.includes("input.dispatchEvent(new Event('input', { bubbles: true }))"),
    true,
    'Expected scrub changes to dispatch input events through the shared live update path',
  );
  assertEqual(
    renderSource.includes('setPointerCapture'),
    true,
    'Expected manual motion scrubber to use pointer capture when available',
  );
}

function runManualMotionScrubValueCheck() {
  assertEqual(
    resolveMotionScrubValue({ startValue: 10, deltaX: 7, kind: 'position' }),
    17,
    'Expected X/Y scrub sensitivity to map 1px to 1 value unit',
  );
  assertEqual(
    resolveMotionScrubValue({ startValue: 100, deltaX: 12, kind: 'scalePercent' }),
    103,
    'Expected scale scrub sensitivity to map 4px to 1 percent',
  );
  assertEqual(
    resolveMotionScrubValue({ startValue: 10, deltaX: 4, kind: 'position', shiftKey: true }),
    18,
    'Expected Shift to scrub faster',
  );
  assertEqual(
    resolveMotionScrubValue({ startValue: 10, deltaX: 4, kind: 'position', altKey: true }),
    11,
    'Expected Alt to scrub slower',
  );
}

function runManualMotionScrubBehaviorCheck() {
  {
    const input = createFakeMotionScrubInput({ value: '10' });
    const documentRef = createFakeMotionScrubDocument();
    const handlers = createMotionScrubHandlers({ input, documentRef });
    const moveEvent = createPointerEvent({ pointerId: 7, clientX: 3 });

    handlers.pointerdown(createPointerEvent({ pointerId: 7, clientX: 0 }));
    handlers.pointermove(moveEvent);
    handlers.pointerup(createPointerEvent({ pointerId: 7, clientX: 3 }));

    assertDeepEqual(input.dispatchedEvents, [], 'Expected below-threshold move and pointerup to dispatch no input/change events');
    assertEqual(input.value, '10', 'Expected below-threshold move to keep the original input value');
    assertEqual(moveEvent.defaultPrevented, false, 'Expected below-threshold move not to prevent normal click/focus behavior');
    assertEqual(input.classList.contains('is-motion-scrubbing'), false, 'Expected input active scrub class to stay off below threshold');
    assertEqual(documentRef.body.classList.contains('is-motion-scrubbing'), false, 'Expected body active scrub class to stay off below threshold');
    assertEqual(documentRef.body.style.userSelect, '', 'Expected body user-select guard to stay untouched below threshold');
    assertDeepEqual(input.pointerCaptureCalls, [7], 'Expected pointer capture to start on pointerdown when available');
    assertDeepEqual(input.pointerReleaseCalls, [7], 'Expected pointer capture to release on pointerup when available');
  }

  {
    const input = createFakeMotionScrubInput({ value: '10' });
    const documentRef = createFakeMotionScrubDocument();
    const handlers = createMotionScrubHandlers({ input, documentRef });
    const moveEvent = createPointerEvent({ pointerId: 7, clientX: 6 });

    handlers.pointerdown(createPointerEvent({ pointerId: 7, clientX: 0 }));
    documentRef.dispatchPointer('pointermove', moveEvent);

    assertEqual(input.value, '16', 'Expected above-threshold horizontal drag to update the input value live');
    assertDeepEqual(input.dispatchedEvents, ['input'], 'Expected above-threshold drag to dispatch a live input event');
    assertEqual(moveEvent.defaultPrevented, true, 'Expected active scrub move to prevent default browser selection');
    assertEqual(input.classList.contains('is-motion-scrubbing'), true, 'Expected input active scrub class during active scrub');
    assertEqual(documentRef.body.classList.contains('is-motion-scrubbing'), true, 'Expected body active scrub class during active scrub');
    assertEqual(documentRef.body.style.userSelect, 'none', 'Expected body user-select guard during active scrub');
    assertDeepEqual(documentRef.addCalls, ['pointermove', 'pointerup', 'pointercancel'], 'Expected document-level pointer listeners to keep scrubbing after input rerenders');
  }

  {
    const input = createFakeMotionScrubInput({ value: '100', motionField: 'toScalePercent' });
    const documentRef = createFakeMotionScrubDocument({ userSelect: 'text' });
    const handlers = createMotionScrubHandlers({ input, documentRef });

    handlers.pointerdown(createPointerEvent({ pointerId: 8, clientX: 10 }));
    documentRef.dispatchPointer('pointermove', createPointerEvent({ pointerId: 8, clientX: 22 }));
    documentRef.dispatchPointer('pointerup', createPointerEvent({ pointerId: 8, clientX: 22 }));

    assertEqual(input.value, '103', 'Expected scale scrub drag to apply scale sensitivity live');
    assertDeepEqual(input.dispatchedEvents, ['input', 'change'], 'Expected pointerup after active scrub to dispatch the final change event');
    assertEqual(input.classList.contains('is-motion-scrubbing'), false, 'Expected input active scrub class to clear after pointerup');
    assertEqual(documentRef.body.classList.contains('is-motion-scrubbing'), false, 'Expected body active scrub class to clear after pointerup');
    assertEqual(documentRef.body.style.userSelect, 'text', 'Expected body user-select guard to restore previous value after pointerup');
    assertDeepEqual(input.pointerReleaseCalls, [8], 'Expected pointer capture release after active pointerup');
    assertDeepEqual(documentRef.removeCalls, ['pointermove', 'pointerup', 'pointercancel'], 'Expected document-level pointer listeners to be removed after pointerup');
  }

  {
    const input = createFakeMotionScrubInput({ value: '5', withPointerCapture: false });
    const documentRef = createFakeMotionScrubDocument();
    const handlers = createMotionScrubHandlers({ input, documentRef });

    handlers.pointerdown(createPointerEvent({ pointerId: 9, clientX: 0 }));
    documentRef.dispatchPointer('pointermove', createPointerEvent({ pointerId: 9, clientX: -5 }));
    documentRef.dispatchPointer('pointercancel', createPointerEvent({ pointerId: 9, clientX: -5 }));

    assertEqual(input.value, '0', 'Expected active negative drag to update before cancellation');
    assertDeepEqual(input.dispatchedEvents, ['input', 'change'], 'Expected pointercancel after active scrub to dispatch the final change event');
    assertEqual(input.classList.contains('is-motion-scrubbing'), false, 'Expected input active scrub class to clear after pointercancel');
    assertEqual(documentRef.body.classList.contains('is-motion-scrubbing'), false, 'Expected body active scrub class to clear after pointercancel');
  }
}

export async function runApprovalMotionDraftCheck() {
  runLocalMotionPatchMergeCheck();
  runPatchLocalRowsCheck();
  runCanonicalDraftProtectionCheck();
  await runApprovalRowImageSwapPreservesAssetUrlsCheck();
  await runApprovalUpdateRowOptimisticPatchCheck();
  await runApprovalPresetMotionUsesOptimisticDraftCheck();
  await runApprovalGlobalRowLayerUsesOptimisticDraftCheck();
  await runApprovalBrandChannelUsesOptimisticDraftCheck();
  await runApprovalGlobalDraftsPersistAfterDebounceCheck();
  await runApprovalMotionDebounceCoalescingCheck();
  await runOlderCanonicalSnapshotDoesNotOverwritePendingDraftCheck();
  await runLocalMotionDebouncedSaveUsesPatchedRowsCheck();
  await runLocalManualMotionDraftUsesLightweightPreviewCheck();
  runManualMotionScrubValueCheck();
  runManualMotionScrubBehaviorCheck();
  runManualMotionHandlerSourceCheck();
  await runBrandChannelPreviewAssetReloadCheck();
  runPreviewTimelineAutoSelectsCurrentRowCheck();
}

if (process.argv[1] && __filename === process.argv[1]) {
  await runApprovalMotionDraftCheck();
  console.log('approval-motion-draft-check: ok');
}
