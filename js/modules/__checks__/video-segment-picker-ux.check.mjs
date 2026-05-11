import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildEditorVideoPicker,
  resolveVideoSelectorOpenAction,
  resolveVideoSegmentSelectionWindow,
} from '../features/video-projects/render/editor-video-picker.js';

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
