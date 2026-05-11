import { fileURLToPath } from 'node:url';
import { findMotionPreset, MOTION_PRESET_CATEGORIES, MOTION_PRESETS } from '../features/video-projects/domain/motion-presets.js';
import { buildEditorDetailRailViewModel } from '../features/video-projects/render/editor-view-model.js';
import { buildMotionPicker } from '../features/video-projects/render/editor-motion-picker.js';

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
  const markup = buildMotionPicker({
    rowId: 'row-1',
    selectedMotion: 'Zoom 110',
    motionPresetGroups: buildMotionPresetGroups(),
  });

  assert(markup.includes('value="Zoom 110"'), 'Expected Zoom 110 to be selectable');
  assert(markup.includes('aria-pressed="true"'), 'Expected Zoom 110 to render selected state');
  assert(markup.includes('--motion-to-scale:1.028;'), 'Expected Zoom 110 preview animation scale to be present');
}

export function runEditorMotionPresetsCheck() {
  runZoom110PresetCheck();
  runDefaultSelectionCheck();
  runMotionPickerMarkupCheck();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runEditorMotionPresetsCheck();
  console.log('editor-motion-presets-check: ok');
}
