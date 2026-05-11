import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  buildEditorVideoPicker,
  resolveVideoSelectorOpenAction,
  resolveVideoSegmentSelectionWindow,
} from '../features/video-projects/render/editor-video-picker.js';
import {
  buildVideoSegmentPreviewLayerPlan,
  buildCompositionDOM,
  syncManagedVideoElement,
} from '../features/video-projects/composition/composition-renderer.js';
import { normalizeEditorState } from '../features/video-projects/domain/editor-state.js';
import { buildEditorVideosViewModel } from '../features/video-projects/render/editor-view-model.js';
import { createRowVideoCommands } from '../features/video-projects/data/row-video-commands.js';
import {
  resolveVideoProjectCompositionContractForCheck,
  syncVideoSelectorPreviewLayers,
} from '../features/video-projects/render/index.js';
import { buildEditorRowsTable } from '../features/video-projects/render/editor-markup.js';
import { shouldFallbackApprovalSnapshotOperationError } from '../features/video-projects/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const videoProjectsCss = readFileSync(resolve(__dirname, '../../../styles/features/video-projects.css'), 'utf8');
const compositionRendererSource = readFileSync(resolve(__dirname, '../features/video-projects/composition/composition-renderer.js'), 'utf8');
const { applyContractOperations } = require('../../../approval-editor-service/lib/contract-updates.js');

test('Videos tab initially shows upload and library without opening selector modal', () => {
  const html = buildEditorVideoPicker({
    row: { id: 'row-1', startTime: 1, endTime: 4, phrase: 'Frase larga' },
    videos: [{ id: 'video-1', title: 'Fuente.mp4', src: '/videos/fuente.mp4', durationSeconds: 12 }],
    selector: null,
  });

  assert.match(html, /data-action="upload-row-video"/);
  assert.match(html, /data-action="open-video-selector"/);
  assert.doesNotMatch(html, /data-video-selector-modal/);
  assert.doesNotMatch(html, /video-editor-video-selector__backdrop/);
});

test('Opening selector blocks short source with toast and does not create selector state', () => {
  const result = resolveVideoSelectorOpenAction({
    row: { id: 'row-1', startTime: 10, effectiveEndTime: 15 },
    video: { id: 'video-short', durationSeconds: 3 },
  });

  assert.deepEqual(result, {
    ok: false,
    selector: null,
    toastMessage: 'Video demasiado corto para esta frase',
  });
});

test('Opening selector for long source returns fixed draggable-only window state', () => {
  const result = resolveVideoSelectorOpenAction({
    row: { id: 'row-1', startTime: 10, effectiveEndTime: 15 },
    video: { id: 'video-long', src: '/videos/long.mp4', durationSeconds: 20 },
  });

  assert.equal(result.ok, true);
  assert.equal(result.toastMessage, '');
  assert.deepEqual(result.selector, {
    videoId: 'video-long',
    sourceInSeconds: 0,
    durationSeconds: 5,
    sourceOutSeconds: 5,
    canResize: false,
    ok: true,
    reason: '',
    windowLeftPercent: 0,
    windowWidthPercent: 25,
  });
});

test('Selector modal uses overlay, composition preview frame, fixed window, and explicit accept/cancel actions', () => {
  const selector = resolveVideoSegmentSelectionWindow({
    sourceDurationSeconds: 20,
    targetDurationSeconds: 5,
    requestedSourceInSeconds: 7.5,
  });
  const html = buildEditorVideoPicker({
    row: { id: 'row-1', startTime: 10, effectiveEndTime: 15, phrase: 'Frase larga' },
    videos: [{ id: 'video-long', title: 'Long.mp4', src: '/videos/long.mp4', durationSeconds: 20 }],
    selector: { videoId: 'video-long', ...selector },
  });

  assert.match(html, /class="video-editor-video-selector__backdrop"/);
  assert.match(html, /role="dialog"/);
  assert.match(html, /data-video-selector-composition-preview/);
  assert.match(html, /background-video/);
  assert.match(html, /color-overlay/);
  assert.match(html, /effect-layer-01/);
  assert.match(html, /effect-layer-02/);
  assert.match(html, /foreground-video/);
  assert.match(html, /data-video-selector-window/);
  assert.doesNotMatch(html, /data-action="resize-video-selector"/);
  assert.match(html, /data-action="cancel-video-selector"[^>]*>Cancelar/);
  assert.match(html, /data-action="commit-video-segment"[^>]*>Aceptar/);
});

test('Selector modal uses real effect videos and exposes a play toggle for the preview', () => {
  const selector = resolveVideoSegmentSelectionWindow({
    sourceDurationSeconds: 20,
    targetDurationSeconds: 5,
    requestedSourceInSeconds: 3,
  });
  const html = buildEditorVideoPicker({
    row: { id: 'row-1', startTime: 10, effectiveEndTime: 15, phrase: 'Frase larga' },
    videos: [{ id: 'video-long', title: 'Long.mp4', src: '/videos/long.mp4', durationSeconds: 20 }],
    selector: { videoId: 'video-long', ...selector },
  });

  assert.match(html, /data-action="toggle-video-selector-preview"/);
  assert.match(html, /data-video-selector-preview-toggle/);
  assert.match(html, /<video[^>]+src="\.\/assets\/effect-layer-02\.webm"[^>]+data-layer="effect-layer-02"/);
  assert.match(html, /<video[^>]+src="\.\/assets\/effect-layer-01\.webm"[^>]+data-layer="effect-layer-01"/);
  assert.ok(html.indexOf('data-layer="effect-layer-02"') < html.indexOf('data-layer="effect-layer-01"'));
  assert.match(videoProjectsCss, /\.video-editor-video-selector__layer--effect-01\s*\{[^}]*mix-blend-mode:\s*screen;/s);
  assert.match(videoProjectsCss, /\.video-editor-video-selector__layer--effect-02\s*\{[^}]*mix-blend-mode:\s*multiply;/s);
  assert.match(videoProjectsCss, /\.video-editor-video-selector__layer--overlay\s*\{[^}]*background:\s*#3835AF;[^}]*opacity:\s*0\.3;/s);
});

test('Video effect preview layers stack above the foreground video', () => {
  assert.match(compositionRendererSource, /composition-stage[\s\S]*?isolation:isolate/);
  assert.match(compositionRendererSource, /composition-layer--video-background[\s\S]*?z-index:0/);
  assert.match(compositionRendererSource, /composition-layer--video-color-overlay[\s\S]*?z-index:1/);
  assert.match(compositionRendererSource, /composition-layer--video-foreground[\s\S]*?z-index:2/);
  assert.match(compositionRendererSource, /composition-layer--video-effect-02[\s\S]*?z-index:3/);
  assert.match(compositionRendererSource, /composition-layer--video-effect-01[\s\S]*?z-index:4/);

  assert.match(videoProjectsCss, /\.video-editor-video-selector__preview\s*\{[^}]*isolation:\s*isolate;/s);
  assert.match(videoProjectsCss, /\.video-editor-video-selector__layer--foreground\s*\{[^}]*z-index:\s*2;/s);
  assert.match(videoProjectsCss, /\.video-editor-video-selector__layer--effect-02\s*\{[^}]*z-index:\s*3;/s);
  assert.match(videoProjectsCss, /\.video-editor-video-selector__layer--effect-01\s*\{[^}]*z-index:\s*4;/s);
});

test('Selector modal is centered and backdrop layers above the whole editor', () => {
  assert.match(videoProjectsCss, /\.video-editor-video-selector__backdrop\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0;[^}]*z-index:\s*2147483000;/s);
  assert.match(videoProjectsCss, /\.video-editor-video-selector\s*\{[^}]*position:\s*fixed;[^}]*top:\s*50%;[^}]*left:\s*50%;[^}]*transform:\s*translate\(-50%,\s*-50%\);[^}]*z-index:\s*2147483001;/s);
  assert.match(videoProjectsCss, /\.video-project-detail:has\(\[data-video-selector-modal\]\) \.video-editor-table-wrap,[\s\S]*\.video-project-detail:has\(\[data-video-selector-modal\]\) \.video-editor-actions\s*\{[^}]*opacity:\s*0;[^}]*pointer-events:\s*none;/s);
});

test('Uploaded video library persists through editor_state and survives empty top-level arrays', async () => {
  const calls = [];
  const file = { name: 'clip.mp4', type: 'video/mp4', size: 1024 };
  const project = { draft_id: 'draft-1', video_assets: [], editor_state: {} };
  const commands = createRowVideoCommands({
    api: {
      uploadProjectVideoFile: async () => ({ public_url: 'https://cdn.example/clip.mp4', storage_path: 'projects/x/videos/clip.mp4', bucket: 'video-project-videos' }),
      saveVideoProjectEditorState: async (payload) => { calls.push(payload); return { ok: true }; },
    },
    ui: { toast: () => {} },
    getProject: () => project,
    resolveProjectKey: () => 'draft-1',
    renderSelectedVideoProject: () => {},
    updateRow: async () => {},
  });

  await commands.uploadVideoToLibrary('row-1', file);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].draftId, 'draft-1');
  assert.equal(calls[0].editorState.video_assets[0].src, 'https://cdn.example/clip.mp4');
  assert.equal(project.editor_state.video_assets[0].src, 'https://cdn.example/clip.mp4');

  const refreshed = buildEditorVideosViewModel({ project: { video_assets: [], editor_state: { video_assets: project.editor_state.video_assets } } });
  assert.equal(refreshed.length, 1);
  assert.equal(refreshed[0].src, 'https://cdn.example/clip.mp4');
});

test('Editor state normalization preserves hydrated video assets', () => {
  const normalized = normalizeEditorState({
    phase: 'preview_ready',
    video_assets: [{ id: 'video-1', src: 'https://cdn.example/clip.mp4', durationSeconds: 12 }],
  });

  assert.deepEqual(normalized.video_assets, [
    { id: 'video-1', src: 'https://cdn.example/clip.mp4', durationSeconds: 12 },
  ]);
});

test('Approval fallback detection covers legacy unsupported video segment operation errors only', () => {
  assert.equal(shouldFallbackApprovalSnapshotOperationError(new Error('unsupported operation: setRowVideoSegment'), 'setRowVideoSegment'), true);
  assert.equal(shouldFallbackApprovalSnapshotOperationError({ code: 'unsupported_operation', message: 'unsupported operation: setRowVideoSegment' }, 'setRowVideoSegment'), true);
  assert.equal(shouldFallbackApprovalSnapshotOperationError(new Error('stale snapshot'), 'setRowVideoSegment'), false);
  assert.equal(shouldFallbackApprovalSnapshotOperationError(new Error('unsupported operation: setRowMotion'), 'setRowVideoSegment'), false);
});

test('Timeline drag seeks and syncs all selector preview videos to source-in', () => {
  const calls = [];
  const videos = ['background-video', 'foreground-video', 'effect-layer-01', 'effect-layer-02'].map((layer) => ({
    dataset: { layer },
    currentTime: 0,
    pause: () => calls.push(`pause:${layer}`),
  }));
  const modal = {
    querySelectorAll(selector) {
      assert.equal(selector, 'video[data-layer]');
      return videos;
    },
  };

  const result = syncVideoSelectorPreviewLayers({ modal, sourceInSeconds: 4.25, playing: false });

  assert.equal(result, true);
  assert.deepEqual(videos.map((video) => video.currentTime), [4.25, 4.25, 4.25, 4.25]);
  assert.deepEqual(calls, ['pause:background-video', 'pause:foreground-video', 'pause:effect-layer-01', 'pause:effect-layer-02']);
});

test('Approval editor service accepts client video segment aliases', () => {
  const snapshot = {
    contractVersion: 'approval-contract/v1',
    projectId: 'project-1',
    snapshotId: 'project-1:1',
    rows: [{ rowId: 'seg-002', id: 'seg-002', startTime: 2, endTime: 7, media: { kind: 'image' } }],
    assets: {},
  };

  const next = applyContractOperations(snapshot, [{
    type: 'setRowVideoSegment',
    rowId: 'seg-002',
    sourceVideoAssetId: 'video-asset-1',
    sourceVideoSrc: '/videos/source.mp4',
    sourceInSeconds: 3,
    durationSeconds: 5,
  }]);

  assert.equal(next.rows[0].media.kind, 'video-segment');
  assert.equal(next.rows[0].media.sourceVideoAssetId, 'video-asset-1');
  assert.equal(next.assets['video-asset-1'].previewUrl, '/videos/source.mp4');
  assert.equal(next.assets['effect-layer-01'].renderPath, 'overlays/effect-layer-01.mp4');
  assert.equal(next.assets['effect-layer-01'].previewUrl, './assets/effect-layer-01.webm');
  assert.equal(next.assets['effect-layer-02'].renderPath, 'overlays/effect-layer-02.mp4');
  assert.equal(next.assets['effect-layer-02'].previewUrl, './assets/effect-layer-02.webm');
});

test('Local approval fallback video row wins over stale canonical image row in main composition preview', () => {
  const project = {
    video_assets: [{ id: 'video-asset-1', src: '/videos/source.mp4' }],
    editor_state: {
      approval_contract_snapshot: {
        contractVersion: 'approval-editor-service-v1',
        snapshotHash: 'stale-hash',
        snapshotId: 'project-1:1',
        assets: {
          'image-asset-1': { previewUrl: '/images/old.jpg' },
        },
        rows: [{ rowId: 'seg-002', id: 'seg-002', startTime: 2, endTime: 7, selectedAssetId: 'image-asset-1', media: { kind: 'image' } }],
      },
    },
  };
  const localRows = [{
    rowId: 'seg-002',
    id: 'seg-002',
    startTime: 2,
    endTime: 7,
    media: {
      kind: 'video-segment',
      sourceVideoAssetId: 'video-asset-1',
      sourceVideoSrc: '/videos/source.mp4',
      sourceInSeconds: 1.5,
      durationSeconds: 5,
    },
  }];

  const { compositionRows } = resolveVideoProjectCompositionContractForCheck({ project, rows: localRows });

  assert.equal(compositionRows[0].media.kind, 'video-segment');
  assert.equal(compositionRows[0].media.sourceVideoSrc, '/videos/source.mp4');
  assert.equal(compositionRows[0].media.effect1Src, './assets/effect-layer-01.webm');
  assert.equal(compositionRows[0].media.effect2Src, './assets/effect-layer-02.webm');
});

test('Video segment preview layer plan always includes concrete effect video sources', () => {
  const plan = buildVideoSegmentPreviewLayerPlan({
    localTime: 1,
    media: {
      kind: 'video-segment',
      sourceVideoSrc: '/videos/source.mp4',
      sourceInSeconds: 4,
      durationSeconds: 5,
    },
  });

  assert.deepEqual(plan.layers.map((layer) => layer.name), ['background-video', 'color-overlay', 'effect-layer-02', 'effect-layer-01', 'foreground-video']);
  assert.equal(plan.layers[2].src, './assets/effect-layer-02.webm');
  assert.equal(plan.layers[2].mixBlendMode, 'multiply');
  assert.equal(plan.layers[3].src, './assets/effect-layer-01.webm');
  assert.equal(plan.layers[3].mixBlendMode, 'screen');
});

test('Effect preview videos use preloadable static WebM URLs in selector and main preview', () => {
  const selector = resolveVideoSegmentSelectionWindow({
    sourceDurationSeconds: 20,
    targetDurationSeconds: 5,
    requestedSourceInSeconds: 3,
  });
  const html = buildEditorVideoPicker({
    row: { id: 'row-1', startTime: 10, effectiveEndTime: 15, phrase: 'Frase larga' },
    videos: [{ id: 'video-long', title: 'Long.mp4', src: '/videos/long.mp4', durationSeconds: 20 }],
    selector: { videoId: 'video-long', ...selector },
  });

  assert.match(html, /src="\.\/assets\/effect-layer-02\.webm"[^>]+preload="auto"/);
  assert.match(html, /src="\.\/assets\/effect-layer-01\.webm"[^>]+preload="auto"/);

  const appended = [];
  const makeVideo = () => ({
    style: {},
    muted: false,
    loop: false,
    playsInline: false,
    set className(value) { this._className = value; },
    set src(value) { this._src = value; },
    get src() { return this._src; },
    set preload(value) { this._preload = value; },
    get preload() { return this._preload; },
  });
  const documentRef = globalThis.document;
  globalThis.document = {
    createElement(tag) {
      if (tag === 'video') return makeVideo();
      return {
        style: {},
        appendChild(child) { appended.push(child); },
        set className(value) { this._className = value; },
        set textContent(value) { this._textContent = value; },
        set draggable(value) { this._draggable = value; },
      };
    },
  };
  try {
    const container = { appendChild(child) { appended.push(child); } };
    const dom = buildCompositionDOM(container);
    assert.equal(dom.layers.videoEffect2.src, './assets/effect-layer-02.webm');
    assert.equal(dom.layers.videoEffect2.preload, 'auto');
    assert.equal(dom.layers.videoEffect1.src, './assets/effect-layer-01.webm');
    assert.equal(dom.layers.videoEffect1.preload, 'auto');
  } finally {
    globalThis.document = documentRef;
  }
});

test('Managed video sync seeks, mutes, plays, pauses, and swallows autoplay promise failures', () => {
  const calls = [];
  const video = {
    currentTime: 0,
    paused: true,
    play: () => {
      calls.push('play');
      return Promise.reject(new Error('autoplay blocked'));
    },
    pause: () => calls.push('pause'),
  };

  assert.equal(syncManagedVideoElement({ video, currentTimeSeconds: 2.5, playing: true }), true);
  assert.equal(video.currentTime, 2.5);
  assert.equal(video.muted, true);
  assert.equal(video.playsInline, true);
  assert.deepEqual(calls, ['play']);

  video.paused = false;
  syncManagedVideoElement({ video, currentTimeSeconds: 2.51, playing: true });
  assert.deepEqual(calls, ['play']);

  syncManagedVideoElement({ video, currentTimeSeconds: 3, playing: false });
  assert.equal(video.currentTime, 3);
  assert.deepEqual(calls, ['play', 'pause']);
});

test('Managed video sync defers seek and play until metadata is ready', () => {
  const calls = [];
  const listeners = new Map();
  const video = {
    readyState: 0,
    currentTime: 0,
    paused: true,
    addEventListener: (event, handler, options) => {
      listeners.set(event, { handler, options });
      calls.push(`listen:${event}:${Boolean(options?.once)}`);
    },
    removeEventListener: (event) => calls.push(`remove:${event}`),
    play: () => {
      calls.push('play');
      return Promise.resolve();
    },
    pause: () => calls.push('pause'),
  };

  assert.equal(syncManagedVideoElement({ video, currentTimeSeconds: 2.5, playing: true }), true);
  assert.equal(video.currentTime, 0);
  assert.deepEqual(calls, ['listen:loadedmetadata:true', 'listen:canplay:true']);

  video.readyState = 1;
  listeners.get('loadedmetadata').handler();

  assert.equal(video.currentTime, 2.5);
  assert.equal(video.muted, true);
  assert.equal(video.playsInline, true);
  assert.ok(calls.includes('remove:canplay'));
  assert.ok(calls.includes('play'));
});

test('Editor rows table renders a meaningful video mini-preview instead of a plain black Video placeholder', () => {
  const html = buildEditorRowsTable([
    {
      id: 'seg-002',
      startTime: 2,
      endTime: 7,
      phrase: 'Frase de video',
      media: {
        kind: 'video-segment',
        sourceVideoAssetId: 'video-asset-1',
        sourceVideoSrc: '/videos/source.mp4',
      },
    },
  ]);

  assert.match(html, /<video class="video-editor-row__thumb video-editor-row__thumb--video"[^>]+src="\/videos\/source\.mp4"/);
  assert.match(html, /<span class="video-editor-row__video-badge">Video<\/span>/);
  assert.doesNotMatch(html, /<span class="video-editor-row__thumb video-editor-row__thumb--video">Video<\/span>/);
});
