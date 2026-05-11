import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  applyPendingMotionDrafts,
  createVideoProjectsFeature,
  mergeLocalEditorRowPatch,
  patchLocalEditorRows,
} from '../features/video-projects/index.js';
import { createMotionScrubHandlers, resolveMotionScrubValue } from '../features/video-projects/render/index.js';

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
  return {
    body: {
      classList: createFakeClassList(),
      style: { userSelect },
    },
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

function createApprovalMotionHarness({ snapshotRows = [] } = {}) {
  const updateSnapshotCalls = [];
  const savedEditorStates = [];
  const renderEvents = [];
  const state = {
    settings: { approvalPipelineBaseUrl: 'http://approval.local' },
    selectedVideoProject: {
      draft_id: 'draft-1',
      editor_state: {
        pipeline_provider: 'approval',
        pipeline_base_url: 'http://approval.local',
        remotion_project_id: 'remotion-1',
        approval_contract_snapshot: { snapshotHash: 'hash-base', rows: [] },
        snapshot_hash: 'hash-base',
        phase: 'preview_ready',
      },
      _editorRows: [
        { id: 'row-1', motionPresetId: 'custom', motion: { fromX: 0, toX: 10, fromScale: 1, toScale: 1.1 } },
      ],
    },
  };
  const api = {
    createApprovalPipelineClient() {
      return {
        async updateSnapshot(projectId, payload) {
          updateSnapshotCalls.push({ projectId, payload });
          return {
            snapshot: {
              contractVersion: '1',
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
    ui: { toast() {} },
    callbacks: {
      renderSelectedVideoProject: () => renderEvents.push({ motion: state.selectedVideoProject._editorRows[0]?.motion }),
      renderVideoProjects() {},
    },
  });

  return { feature, state, updateSnapshotCalls, savedEditorStates, renderEvents };
}

function createLocalMotionHarness() {
  const savedEditorStates = [];
  const renderEvents = [];
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
      renderVideoProjects() {},
    },
  });

  return { feature, state, savedEditorStates, renderEvents };
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
    const { feature, state, updateSnapshotCalls, renderEvents } = createApprovalMotionHarness();

    await feature.updateRow('row-1', {
      motionPresetId: 'custom',
      motion: { fromX: 0, toX: 44, fromScale: 1, toScale: 1.22 },
      manualMotionDraft: true,
    });

    assertEqual(state.selectedVideoProject._editorRows[0].motion.toX, 44, 'Expected manual motion draft to patch the local row immediately');
    assertEqual(state.selectedVideoProject.editor_state.timed_rows[0].motion.toX, 44, 'Expected optimistic timed_rows to be live before remote snapshot');
    assertEqual(state.selectedVideoProject.editor_state.phase, 'editing_dirty', 'Expected optimistic draft to mark editor dirty');
    assertEqual(updateSnapshotCalls.length, 0, 'Expected manual motion draft to wait for debounce before remote persistence');
    assertEqual(renderEvents.length, 1, 'Expected optimistic patch to render local preview once immediately');
  } finally {
    timers.restore();
  }
}

async function runApprovalMotionDebounceCoalescingCheck() {
  const timers = createFakeTimers();
  try {
    const { feature, updateSnapshotCalls } = createApprovalMotionHarness({
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
    const { feature, state, savedEditorStates } = createApprovalMotionHarness({
      snapshotRows: [{ id: 'row-1', motionPresetId: 'custom', motion: { fromX: 0, toX: 14, fromScale: 1, toScale: 1.14 } }],
    });

    await feature.updateRow('row-1', {
      motionPresetId: 'custom',
      motion: { fromX: 0, toX: 88, fromScale: 1, toScale: 1.88 },
      manualMotionDraft: true,
    });

    timers.runPending();
    await flushMicrotasks();

    assertEqual(state.selectedVideoProject._editorRows[0].motion.toX, 88, 'Expected newer pending draft to survive older canonical row snapshot');
    assertEqual(state.selectedVideoProject.editor_state.timed_rows[0].motion.toX, 88, 'Expected editor state to keep pending draft over stale canonical row');
    assertEqual(savedEditorStates.at(-1).timed_rows[0].motion.toX, 88, 'Expected persisted editor state to save draft-protected rows');
  } finally {
    timers.restore();
  }
}

async function runLocalMotionDebouncedSaveUsesPatchedRowsCheck() {
  const timers = createFakeTimers();
  try {
    const { feature, state, savedEditorStates, renderEvents } = createLocalMotionHarness();

    await feature.updateRow('row-1', {
      motionPresetId: 'custom',
      motion: { toX: 77 },
    });

    assertEqual(state.selectedVideoProject._editorRows[0].motion.toX, 77, 'Expected local non-approval motion patch to update local rows immediately');
    assertEqual(renderEvents.length, 1, 'Expected local non-approval motion patch to render local preview immediately');

    timers.runPending();
    await flushMicrotasks();

    assertEqual(savedEditorStates.length, 1, 'Expected local non-approval motion patch to persist after debounce');
    assertEqual(savedEditorStates[0].timed_rows[0].motion.toX, 77, 'Expected debounced local save to persist patched rows, not stale rows');
  } finally {
    timers.restore();
  }
}

function runManualMotionHandlerSourceCheck() {
  const renderSource = readFileSync(resolve(__dirname, '../features/video-projects/render/index.js'), 'utf8');
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
    handlers.pointermove(moveEvent);

    assertEqual(input.value, '16', 'Expected above-threshold horizontal drag to update the input value live');
    assertDeepEqual(input.dispatchedEvents, ['input'], 'Expected above-threshold drag to dispatch a live input event');
    assertEqual(moveEvent.defaultPrevented, true, 'Expected active scrub move to prevent default browser selection');
    assertEqual(input.classList.contains('is-motion-scrubbing'), true, 'Expected input active scrub class during active scrub');
    assertEqual(documentRef.body.classList.contains('is-motion-scrubbing'), true, 'Expected body active scrub class during active scrub');
    assertEqual(documentRef.body.style.userSelect, 'none', 'Expected body user-select guard during active scrub');
  }

  {
    const input = createFakeMotionScrubInput({ value: '100', motionField: 'toScalePercent' });
    const documentRef = createFakeMotionScrubDocument({ userSelect: 'text' });
    const handlers = createMotionScrubHandlers({ input, documentRef });

    handlers.pointerdown(createPointerEvent({ pointerId: 8, clientX: 10 }));
    handlers.pointermove(createPointerEvent({ pointerId: 8, clientX: 22 }));
    handlers.pointerup(createPointerEvent({ pointerId: 8, clientX: 22 }));

    assertEqual(input.value, '103', 'Expected scale scrub drag to apply scale sensitivity live');
    assertDeepEqual(input.dispatchedEvents, ['input', 'change'], 'Expected pointerup after active scrub to dispatch the final change event');
    assertEqual(input.classList.contains('is-motion-scrubbing'), false, 'Expected input active scrub class to clear after pointerup');
    assertEqual(documentRef.body.classList.contains('is-motion-scrubbing'), false, 'Expected body active scrub class to clear after pointerup');
    assertEqual(documentRef.body.style.userSelect, 'text', 'Expected body user-select guard to restore previous value after pointerup');
    assertDeepEqual(input.pointerReleaseCalls, [8], 'Expected pointer capture release after active pointerup');
  }

  {
    const input = createFakeMotionScrubInput({ value: '5', withPointerCapture: false });
    const documentRef = createFakeMotionScrubDocument();
    const handlers = createMotionScrubHandlers({ input, documentRef });

    handlers.pointerdown(createPointerEvent({ pointerId: 9, clientX: 0 }));
    handlers.pointermove(createPointerEvent({ pointerId: 9, clientX: -5 }));
    handlers.pointercancel(createPointerEvent({ pointerId: 9, clientX: -5 }));

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
  await runApprovalUpdateRowOptimisticPatchCheck();
  await runApprovalMotionDebounceCoalescingCheck();
  await runOlderCanonicalSnapshotDoesNotOverwritePendingDraftCheck();
  await runLocalMotionDebouncedSaveUsesPatchedRowsCheck();
  runManualMotionScrubValueCheck();
  runManualMotionScrubBehaviorCheck();
  runManualMotionHandlerSourceCheck();
}

if (process.argv[1] && __filename === process.argv[1]) {
  await runApprovalMotionDraftCheck();
  console.log('approval-motion-draft-check: ok');
}
