import { fileURLToPath } from 'node:url';
import { findMotionPreset, MOTION_PRESET_CATEGORIES, MOTION_PRESETS } from '../domain/motion-presets.js';
import { buildEditorEffectTabs } from '../render/editor-effect-tabs.js';
import { hydrateEditorPhaseInteractions } from '../render/editor-hydration.js';
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

function runZoomOnlyPresetCheck() {
  const preset110 = findMotionPreset('Zoom 110');
  const preset125 = findMotionPreset('Zoom 125');
  const preset150 = findMotionPreset('Zoom 150');
  const preset200 = findMotionPreset('Zoom 200');
  assert(preset110, 'Expected Zoom 110 preset to remain available');
  assert(preset125, 'Expected Zoom 125 preset to exist');
  assert(preset150, 'Expected Zoom 150 preset to exist');
  assert(preset200, 'Expected Zoom 200 preset to exist');
  assertEqual(preset110.fromScale, 1, 'Expected Zoom 110 to start at 100%');
  assertEqual(preset110.toScale, 1.1, 'Expected Zoom 110 to end at 110%');
  assertEqual(preset125.fromScale, 1, 'Expected Zoom 125 to start at 100%');
  assertEqual(preset125.toScale, 1.25, 'Expected Zoom 125 to end at 125%');
  assertEqual(preset150.fromScale, 1, 'Expected Zoom 150 to start at 100%');
  assertEqual(preset150.toScale, 1.5, 'Expected Zoom 150 to end at 150%');
  assertEqual(preset200.fromScale, 1, 'Expected Zoom 200 to start at 100%');
  assertEqual(preset200.toScale, 2, 'Expected Zoom 200 to end at 200%');

  const zoomGroup = buildMotionPresetGroups().find((group) => group.category === 'ZOOMS');
  assertEqual(zoomGroup?.presets?.[0]?.name, 'Zoom 125', 'Expected Zoom 125 to be first zoom preset');
  assertEqual(zoomGroup?.presets?.[1]?.name, 'Zoom 110', 'Expected Zoom 110 to remain available without becoming default');
  assertEqual(zoomGroup?.presets?.[2]?.name, 'Zoom 150', 'Expected Zoom 150 to sit with zoom-only presets');
  assertEqual(zoomGroup?.presets?.[3]?.name, 'Zoom 200', 'Expected Zoom 200 to sit with zoom-only presets');
}

function runDefaultSelectionCheck() {
  const defaultDetail = buildEditorDetailRailViewModel({ row: { id: 'row-1' } });
  const legacyDetail = buildEditorDetailRailViewModel({ row: { id: 'row-1', motion: 'slow-zoom-in' } });
  const zoom125AliasDetail = buildEditorDetailRailViewModel({ row: { id: 'row-1', motionPresetId: 'zoom-125' } });

  assertEqual(defaultDetail.motion, 'Zoom 150', 'Expected empty row motion to select Zoom 150');
  assertEqual(legacyDetail.motion, 'Zoom 150', 'Expected legacy slow-zoom-in to select Zoom 150');
  assertEqual(zoom125AliasDetail.motion, 'zoom-125', 'Expected explicit Zoom 125 alias not to be treated as the default Zoom 150');
}

function runMotionPickerMarkupCheck() {
  const presetsBefore = JSON.stringify(MOTION_PRESETS);
  const markup = buildMotionPicker({
    rowId: 'row-1',
    selectedMotion: 'Zoom 150',
    motionPresetGroups: buildMotionPresetGroups(),
  });

  assert(markup.includes('value="Zoom 125"'), 'Expected Zoom 125 to be selectable');
  assert(markup.includes('value="Zoom 110"'), 'Expected Zoom 110 to remain selectable');
  assert(markup.includes('value="Zoom 150"'), 'Expected Zoom 150 to be selectable');
  assert(markup.includes('value="Zoom 200"'), 'Expected Zoom 200 to be selectable');
  assert(markup.includes('aria-pressed="true"'), 'Expected Zoom 150 to render selected state');
  assert(markup.includes('--motion-to-scale:0.667;'), 'Expected Zoom 150 preview frame to shrink as image zoom increases');
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
  assert(style.includes('--motion-to-scale:0.800;'), 'Expected 125% image scale to render the viewport frame at inverse scale');
}

function runManualMotionControlsCheck() {
  const row = {
    id: 'row-1',
    startTime: 10,
    endTime: 15,
    motionPresetId: 'Zoom 125',
    motion: { fromX: 0, fromY: 0, toX: 12, toY: -8, fromScale: 1, toScale: 1.25 },
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
  assert(markup.includes('value="125"'), 'Expected scale percent values in controls');
  assert(manualMarkup.includes('data-motion-editor-panel="manual"'), 'Expected manual panel to render');
  assert(manualMarkup.includes('data-motion-editor-panel="presets" hidden'), 'Expected presets panel to hide when manual tab is active');
}

function runPresetSelectionSyncsManualControlsCheck() {
  const listeners = new Map();
  const presetButton = {
    tagName: 'BUTTON',
    value: 'Zoom-Esquina-Arriba-Derecha',
    dataset: { rowId: 'row-1' },
    classList: { toggle() {} },
    setAttribute() {},
    addEventListener(type, listener) { listeners.set(type, listener); },
  };
  const inputs = new Map(['fromX', 'fromY', 'toX', 'toY', 'fromScalePercent', 'toScalePercent'].map((field) => [field, { value: 'stale' }]));
  const manualPanel = {
    dataset: { rowId: 'row-1', motionPreset: 'Zoom 125' },
    querySelector(selector) {
      const field = selector.match(/data-motion-field="([^"]+)"/)?.[1];
      return inputs.get(field) || null;
    },
  };
  const patches = [];
  const root = {
    querySelectorAll(selector) {
      if (selector === '[data-action="update-row-motion"]') return [presetButton];
      if (selector === '[data-motion-manual]') return [manualPanel];
      return [];
    },
    querySelector() { return null; },
  };

  hydrateEditorPhaseInteractions({
    root,
    project: {},
    editorPhase: 'preview_ready',
    editorRows: [],
    updateRow(rowId, patch) { patches.push({ rowId, patch }); },
  });

  listeners.get('click')();

  assertEqual(manualPanel.dataset.motionPreset, 'Zoom-Esquina-Arriba-Derecha', 'Expected manual panel preset dataset to sync after preset click');
  assertEqual(inputs.get('toX').value, '-120', 'Expected manual End X to mirror selected preset');
  assertEqual(inputs.get('toY').value, '65', 'Expected manual End Y to mirror selected preset');
  assertEqual(inputs.get('toScalePercent').value, '125', 'Expected manual End scale to mirror selected preset');
  assertEqual(patches[0]?.patch?.motionPresetId, 'Zoom-Esquina-Arriba-Derecha', 'Expected preset patch to keep selected preset id');
}

export function runEditorMotionPresetsCheck() {
  runZoomOnlyPresetCheck();
  runDefaultSelectionCheck();
  runMotionPickerMarkupCheck();
  runViewportSemanticsCheck();
  runManualMotionControlsCheck();
  runPresetSelectionSyncsManualControlsCheck();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runEditorMotionPresetsCheck();
  console.log('editor-motion-presets-check: ok');
}
