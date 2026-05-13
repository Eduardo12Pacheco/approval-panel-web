import { fileURLToPath } from 'node:url';
import { findMotionPreset, MOTION_PRESET_CATEGORIES, MOTION_PRESETS } from '../domain/motion-presets.js';
import { buildEditorEffectTabs } from '../render/editor-effect-tabs.js';
import { buildEditorDetailRailViewModel } from '../render/editor-view-model.js';
import { buildMotionPicker, buildMotionViewportPreviewStyle } from '../render/editor-motion-picker.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function buildMotionPresetGroups() {
  return MOTION_PRESET_CATEGORIES.map((category) => ({
    category,
    presets: MOTION_PRESETS.filter((preset) => preset.category === category),
  })).filter((group) => group.presets.length);
}

function runZoom110PresetCheck() {
  const preset = findMotionPreset('Zoom 110');
  assert(preset, 'Expected Zoom 110 preset to exist');
  assertEqual(preset.fromScale, 1, 'Expected Zoom 110 to start at 100%');
  assertEqual(preset.toScale, 1.1, 'Expected Zoom 110 to end at 110%');

  const zoomGroup = buildMotionPresetGroups().find((group) => group.category === 'ZOOMS');
  assertEqual(zoomGroup?.presets?.[0]?.name, 'Zoom 110', 'Expected Zoom 110 to be first zoom preset');
}

function runDefaultSelectionCheck() {
  const defaultDetail = buildEditorDetailRailViewModel({ row: { id: 'row-1' } });
  const legacyDetail = buildEditorDetailRailViewModel({ row: { id: 'row-1', motion: 'slow-zoom-in' } });

  assertEqual(defaultDetail.motion, 'Zoom 110', 'Expected empty row motion to select Zoom 110');
  assertEqual(legacyDetail.motion, 'Zoom 110', 'Expected legacy slow-zoom-in to select Zoom 110');
}

function runMotionPickerMarkupCheck() {
  const presetsBefore = JSON.stringify(MOTION_PRESETS);
  const markup = buildMotionPicker({
    rowId: 'row-1',
    selectedMotion: 'Zoom 110',
    motionPresetGroups: buildMotionPresetGroups(),
  });

  assert(markup.includes('value="Zoom 110"'), 'Expected Zoom 110 to be selectable');
  assert(markup.includes('aria-pressed="true"'), 'Expected Zoom 110 to render selected state');
  assert(markup.includes('--motion-to-scale:0.977;'), 'Expected Zoom 110 preview frame scale to stay readable while hinting zoom');
  assertEqual(JSON.stringify(MOTION_PRESETS), presetsBefore, 'Expected motion picker rendering to leave preset values untouched');
}

function runViewportSemanticsCheck() {
  const style = buildMotionViewportPreviewStyle({
    sourceScaleBase: 1,
    fromX: 12,
    fromY: -8,
    toX: -18,
    toY: 24,
    fromScale: 1,
    toScale: 1.25,
  });

  assert(style.includes('--motion-from-x:-0.67px;'), 'Expected thumbnail frame X to invert source image fromX');
  assert(style.includes('--motion-from-y:0.44px;'), 'Expected thumbnail frame Y to invert source image fromY');
  assert(style.includes('--motion-to-x:1.00px;'), 'Expected thumbnail frame X to invert source image toX');
  assert(style.includes('--motion-to-y:-1.33px;'), 'Expected thumbnail frame Y to invert source image toY');
  assert(style.includes('--motion-from-scale:1.000;'), 'Expected 100% image scale to keep the viewport frame scale neutral');
  assert(style.includes('--motion-to-scale:0.950;'), 'Expected 125% image scale to keep the preview frame readable');
}

function runManualMotionControlsCheck() {
  const row = {
    id: 'row-1',
    startTime: 10,
    endTime: 15,
    motionPresetId: 'Zoom 110',
    motion: { fromX: 0, fromY: 0, toX: 12, toY: -8, fromScale: 1, toScale: 1.1 },
  };
  const detail = buildEditorDetailRailViewModel({ row });
  const markup = buildEditorEffectTabs({ row, detail, activeTab: 'motion' });
  const manualDetail = buildEditorDetailRailViewModel({ row, project: { _motionEditorTab: 'manual' } });
  const manualMarkup = buildEditorEffectTabs({ row, detail: manualDetail, activeTab: 'motion' });

  assert(markup.includes('video-motion-mode__hint'), 'Expected motion guidance hint to render');
  assert(markup.includes('video-motion-mode__hint-icon'), 'Expected motion guidance info icon to render');
  assert(markup.includes('Elegí un preset y ajustá el movimiento si hace falta.'), 'Expected motion guidance copy to render');
  assert(markup.includes('data-action="switch-motion-editor-tab"'), 'Expected Presets/Ajuste manual tabs to render');
  assert(markup.includes('data-motion-editor-panel="presets"'), 'Expected presets panel to render');
  assert(markup.includes('Ajuste manual'), 'Expected manual motion controls to render');
  assert(markup.includes('data-action="seek-motion-keyframe"'), 'Expected Start/End seek controls');
  assert(markup.includes('data-action="update-row-motion-keyframe"'), 'Expected autosave keyframe inputs');
  assert(markup.includes('data-motion-field="toX"'), 'Expected end X keyframe input');
  assert(markup.includes('value="110"'), 'Expected scale percent values in controls');
  assert(manualMarkup.includes('data-motion-editor-panel="manual"'), 'Expected manual panel to render');
  assert(manualMarkup.includes('data-motion-editor-panel="presets" hidden'), 'Expected presets panel to hide when manual tab is active');
}

export function runEditorMotionPresetsCheck() {
  runZoom110PresetCheck();
  runDefaultSelectionCheck();
  runMotionPickerMarkupCheck();
  runViewportSemanticsCheck();
  runManualMotionControlsCheck();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runEditorMotionPresetsCheck();
  console.log('editor-motion-presets-check: ok');
}
