import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPreviewTimelineViewModel } from '../render/editor-view-model.js';
import { buildEditorShell } from '../render/editor-shell-view.js';
import { resolvePreviewTimelineCurrentRow } from '../render/preview-lifecycle.js';
import { resolveBrandChannelAssets } from '../composition/overlay-assets.js';
import { resolveVideoProjectCompositionContractForCheck } from '../composition/composition-view-model.js';
import { resolveActiveSegment } from '../composition/renderer/frame-math.js';

test('preview timeline marker positions use effective composition duration including outro', () => {
  const rows = [
    { id: 'row-1', phrase: 'Intro', startTime: 0, endTime: 12.14 },
    { id: 'row-2', phrase: 'Cambio de imagen', startTime: 12.14, endTime: 50.26 },
  ];

  const timeline = buildPreviewTimelineViewModel(rows, 'row-2', { totalDurationSeconds: 52.26 });

  assert.equal(timeline.totalDuration, 52.26);
  assert.equal(timeline.totalDurationLabel, '00:52.26');
  assert.equal(timeline.markers[0].position, 0);
  assert.equal(timeline.markers[1].position, (12.14 / 52.26) * 100);
  assert.equal(timeline.markers[1].isSelected, true);
});

test('preview timeline current row follows effective row ranges and does not fill interior gaps', () => {
  const rows = [
    { id: 'row-1', startTime: 0, endTime: 12.14 },
    { id: 'row-2', startTime: 12.14, endTime: 50.26 },
  ];

  assert.equal(resolvePreviewTimelineCurrentRow(rows, 11.94)?.id, 'row-1');
  assert.equal(resolvePreviewTimelineCurrentRow(rows, 12.14)?.id, 'row-2');
  assert.equal(resolvePreviewTimelineCurrentRow(rows, 51), null);

  const rawRowsWithGap = [
    { id: 'raw-1', startTime: 0, endTime: 11.94 },
    { id: 'raw-2', startTime: 12.14, endTime: 50.26 },
  ];

  assert.equal(resolvePreviewTimelineCurrentRow(rawRowsWithGap, 12), null);

  const rawRowsWithEffectiveEnd = [
    { id: 'effective-1', startTime: 0, endTime: 11.94, effectiveEndTime: 12.14 },
    { id: 'effective-2', startTime: 12.14, endTime: 50.26, effectiveEndTime: 50.26 },
  ];

  assert.equal(resolvePreviewTimelineCurrentRow(rawRowsWithEffectiveEnd, 12)?.id, 'effective-1');
});

test('editor shell renders the transport from effective composition timing', () => {
  const editorRows = [
    { id: 'row-1', phrase: 'Intro', startTime: 0, endTime: 11.94, effectiveEndTime: 12.14 },
    { id: 'row-2', phrase: 'Cambio', startTime: 12.14, endTime: 50.26, effectiveEndTime: 50.26 },
  ];
  const project = {
    _editorRows: editorRows,
    editor_state: {
      phase: 'preview_ready',
      approval_contract_snapshot: {
        outro: { durationSeconds: 2 },
      },
    },
  };

  const html = buildEditorShell(project, {
    editorRows,
    selectedRowId: 'row-2',
    globalAudio: { voice: { volume: 1, muted: false }, music: { volume: 0.16, muted: false } },
    editorState: project.editor_state,
  });

  assert.match(html, /data-duration="52\.26"/);
  assert.match(html, /data-row-id="row-2"[^>]+style="--pos:23\.230/);
  assert.match(html, /<span>Preview local<\/span>/);
});

test('preview contract extends final visual row through official audio duration before outro', () => {
  const rows = [
    { id: 'row-1', phrase: 'Intro', startTime: 0, endTime: 1.5, selectedAssetId: 'img-1' },
    { id: 'row-2', phrase: 'Cierre', startTime: 1.5, endTime: 4.25, selectedAssetId: 'img-2' },
  ];
  const project = {
    editor_state: {
      approval_contract_snapshot: {
        contractVersion: 'approval-editor-service-v1',
        brandChannel: 'pelotazo-colombia',
        audio: { totalDurationSeconds: 9.5 },
        rows,
      },
    },
  };

  const { compositionRows } = resolveVideoProjectCompositionContractForCheck({ project, rows });

  assert.equal(compositionRows[0].endTime, 1.5);
  assert.equal(compositionRows[1].endTime, 9.5);
});

test('preview active segment starts outro at official narration audio boundary', () => {
  const rows = [
    { id: 'row-1', startTime: 0, endTime: 1.5 },
    { id: 'row-2', startTime: 1.5, endTime: 4.25 },
  ];

  assert.equal(resolveActiveSegment(9.49, rows, 2, { compositionDurationSeconds: 9.5 }).type, 'segment');
  assert.equal(resolveActiveSegment(9.5, rows, 2, { compositionDurationSeconds: 9.5 }).type, 'outro');
  assert.equal(resolveActiveSegment(9.5, rows, 2, { compositionDurationSeconds: 9.5 }).localTime, 0);
});

test('brand outro duration metadata matches full final asset durations', () => {
  assert.equal(resolveBrandChannelAssets('pelotazo-colombia').outro.durationSeconds, 30.16);
  assert.equal(resolveBrandChannelAssets('pelotazo-ecuador').outro.durationSeconds, 30.53);
});
