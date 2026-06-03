import { fileURLToPath } from 'node:url';
import {
  EDITOR_EFFECT_TABS,
  buildEditorEffectTabs,
  deriveRowSettingsCapabilities,
  resolveEditorEffectTab,
} from '../render/editor-effect-tabs.js';

const __filename = fileURLToPath(import.meta.url);

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertDeepEqual(actual, expected, message) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
}

function assertIncludes(haystack, needle, message) {
  if (!haystack.includes(needle)) {
    throw new Error(`${message}: expected markup to include ${JSON.stringify(needle)}`);
  }
}

function assertNotIncludes(haystack, needle, message) {
  if (haystack.includes(needle)) {
    throw new Error(`${message}: expected markup not to include ${JSON.stringify(needle)}`);
  }
}

function createDetail(overrides = {}) {
  return {
    activeMotionEditorTab: 'presets',
    motion: 'Zoom 150',
    motionPresetGroups: [{ category: 'Base', presets: [{ name: 'Zoom 150', label: 'Zoom 150' }] }],
    manualMotion: { presetName: 'Zoom 150', fromX: 0, fromY: 0, toX: 0, toY: 0, fromScalePercent: 100, toScalePercent: 150 },
    newspaper: { labelEnabled: true, fromX: 0, fromY: 0, toX: 10, toY: -10, fromScalePercent: 100, toScalePercent: 110 },
    assets: [{ id: 'asset-a', url: 'https://cdn.example.com/a.jpg', title: 'Imagen A', isSelected: true }],
    videos: [{ id: 'video-a', src: 'https://cdn.example.com/a.mp4', title: 'Video A', durationSeconds: 8 }],
    videoSelector: null,
    assetsUploading: false,
    videosUploading: false,
    voice: { volume: 1, muted: false },
    music: { volume: 0.15, muted: false },
    voiceVolumePercent: 100,
    voiceVolumeValue: 1,
    musicVolumePercent: 15,
    musicVolumeValue: 0.15,
    brandChannel: 'pelotazo-ecuador',
    dustType: 'dust-1',
    logoEnabled: true,
    ...overrides,
  };
}

export function runEditorRowCapabilitiesCheck() {
  assertDeepEqual(
    EDITOR_EFFECT_TABS.map((tab) => tab.id),
    ['content', 'framing', 'layers', 'audio'],
    'Expected editor settings tabs to use scalable sections instead of source-specific tabs',
  );
  assertEqual(resolveEditorEffectTab('assets'), 'content', 'Expected legacy assets tab state to land in content');
  assertEqual(resolveEditorEffectTab('videos'), 'content', 'Expected legacy videos tab state to land in content');
  assertEqual(resolveEditorEffectTab('newspaper'), 'framing', 'Expected legacy newspaper tab state to land in framing');
  assertEqual(resolveEditorEffectTab('motion'), 'framing', 'Expected legacy motion tab state to land in framing');
  assertEqual(resolveEditorEffectTab('global'), 'layers', 'Expected legacy global tab state to land in layers');

  const imageCapabilities = deriveRowSettingsCapabilities({ id: 'row-image', mediaMode: 'image' });
  assertDeepEqual(
    imageCapabilities,
    {
      format: 'image',
      content: 'image',
      framing: 'image-motion',
      layers: { projectBrand: true, dust: true, logo: true, newspaperLabel: false },
    },
    'Expected image rows to expose image content, normal motion, dust, and logo',
  );

  const videoCapabilities = deriveRowSettingsCapabilities({ id: 'row-video', media: { kind: 'video-segment' }, mediaMode: 'newspaper' });
  assertDeepEqual(
    videoCapabilities,
    {
      format: 'video',
      content: 'video',
      framing: 'video-window',
      layers: { projectBrand: true, dust: false, logo: false, newspaperLabel: false },
    },
    'Expected video rows to win over newspaper mode and hide unsupported row layers',
  );

  const newspaperCapabilities = deriveRowSettingsCapabilities({ id: 'row-news', mediaMode: 'newspaper', media: { kind: 'image' } });
  assertDeepEqual(
    newspaperCapabilities,
    {
      format: 'newspaper',
      content: 'image',
      framing: 'newspaper-motion',
      layers: { projectBrand: true, dust: false, logo: true, newspaperLabel: true },
    },
    'Expected newspaper rows to expose base image content, newspaper motion, label, and logo only',
  );

  const imageMarkup = buildEditorEffectTabs({ row: { id: 'row-image', mediaMode: 'image' }, detail: createDetail(), activeTab: 'framing' });
  assertIncludes(imageMarkup, 'Tipo actual', 'Expected content panel to show the current row content type');
  assertIncludes(imageMarkup, 'data-content-type-switch="image"', 'Expected content panel to expose an image type switch');
  assertIncludes(imageMarkup, 'data-content-type-switch="video"', 'Expected content panel to expose a video type switch');
  assertIncludes(imageMarkup, 'data-content-type-switch="newspaper"', 'Expected content panel to expose a newspaper type switch');
  assertIncludes(imageMarkup, 'Movimiento', 'Expected image framing panel to keep normal motion controls');
  assertIncludes(imageMarkup, 'data-action="update-row-dust"', 'Expected image layers panel to include dust controls');
  assertIncludes(imageMarkup, 'data-action="update-row-logo"', 'Expected image layers panel to include logo controls');
  assertNotIncludes(imageMarkup, 'data-action="update-row-newspaper"', 'Expected image rows not to show newspaper motion controls');

  const videoMarkup = buildEditorEffectTabs({ row: { id: 'row-video', media: { kind: 'video-segment', sourceInSeconds: 1.5, durationSeconds: 3, foregroundTransform: { x: -25, y: 12, scale: 1.5 } } }, detail: createDetail(), activeTab: 'framing' });
  assertIncludes(videoMarkup, '<strong>Video</strong>', 'Expected video rows to display Video as the current content type');
  assertIncludes(videoMarkup, 'Ventana de video', 'Expected video framing panel to show video window context');
  assertIncludes(videoMarkup, 'data-action="update-row-video-foreground"', 'Expected video framing panel to expose foreground video transform controls');
  assertIncludes(videoMarkup, 'data-video-foreground-field="x"', 'Expected video framing panel to expose foreground X control');
  assertIncludes(videoMarkup, 'data-video-foreground-field="y"', 'Expected video framing panel to expose foreground Y control');
  assertIncludes(videoMarkup, 'data-video-foreground-field="scalePercent"', 'Expected video framing panel to expose foreground scale as a percent control');
  assertIncludes(videoMarkup, 'value="-25"', 'Expected video foreground X control to hydrate from media transform');
  assertIncludes(videoMarkup, 'value="12"', 'Expected video foreground Y control to hydrate from media transform');
  assertIncludes(videoMarkup, 'Escala %', 'Expected video foreground scale label to make percent semantics explicit');
  assertIncludes(videoMarkup, 'min="10"', 'Expected video foreground scale percent to have a safe minimum');
  assertIncludes(videoMarkup, 'step="1"', 'Expected video foreground scale percent to use whole-percent steps');
  assertIncludes(videoMarkup, 'value="150"', 'Expected stored foreground scale ratio 1.5 to display as 150 percent');
  assertIncludes(videoMarkup, 'data-action="upload-row-video"', 'Expected video content panel to expose video picker/upload');
  assertNotIncludes(videoMarkup, 'data-framing-keyframe-controls', 'Expected video foreground X/Y/scale controls not to opt into image/newspaper keyframe UX');
  assertNotIncludes(videoMarkup, 'data-action="update-row-motion"', 'Expected video rows not to show normal image motion');
  assertNotIncludes(videoMarkup, 'data-action="update-row-newspaper"', 'Expected video rows not to show newspaper controls');
  assertNotIncludes(videoMarkup, 'data-action="update-row-dust"', 'Expected video rows not to show dust controls');
  assertNotIncludes(videoMarkup, 'data-action="update-row-logo"', 'Expected video rows not to show row logo controls');

  const newspaperMarkup = buildEditorEffectTabs({ row: { id: 'row-news', mediaMode: 'newspaper', media: { kind: 'image' } }, detail: createDetail(), activeTab: 'framing' });
  assertIncludes(newspaperMarkup, '<strong>Periódico</strong>', 'Expected newspaper rows to display Periódico as the current content type');
  assertIncludes(newspaperMarkup, 'data-action="upload-assets-image"', 'Expected newspaper content panel to expose base image picker/upload');
  assertIncludes(newspaperMarkup, 'data-action="update-row-newspaper"', 'Expected newspaper framing panel to expose foreground motion controls');
  assertIncludes(newspaperMarkup, 'data-keyframe="start"', 'Expected newspaper framing panel to expose a Start keyframe seek control');
  assertIncludes(newspaperMarkup, 'data-keyframe="end"', 'Expected newspaper framing panel to expose an End keyframe seek control');
  assertIncludes(newspaperMarkup, 'Mostrar “Recreación artística”', 'Expected newspaper framing panel to include the artistic recreation toggle');
  assertIncludes(newspaperMarkup, 'data-action="update-row-newspaper-label"', 'Expected newspaper layers panel to expose label controls');
  assertIncludes(newspaperMarkup, 'data-action="update-row-logo"', 'Expected newspaper layers panel to keep logo controls');
  assertNotIncludes(newspaperMarkup, 'data-action="update-row-motion"', 'Expected newspaper rows not to show normal image motion as primary control');
  assertNotIncludes(newspaperMarkup, 'data-action="update-row-dust"', 'Expected newspaper rows not to show dust controls yet');

  const videoDraftMarkup = buildEditorEffectTabs({
    row: { id: 'row-image-to-video', mediaMode: 'image', startTime: 0, endTime: 3 },
    detail: createDetail({ activeContentType: 'video' }),
    activeTab: 'content',
  });
  assertIncludes(videoDraftMarkup, '<strong>Video</strong>', 'Expected a pending video switch to display Video in the content panel');
  assertIncludes(videoDraftMarkup, 'data-action="upload-row-video"', 'Expected a pending video switch to make the video picker reachable');
  assertIncludes(videoDraftMarkup, 'Biblioteca de videos', 'Expected a pending video switch to show the video library');
}

if (process.argv[1] && __filename === process.argv[1]) {
  runEditorRowCapabilitiesCheck();
  console.log('editor-row-capabilities-check: ok');
}
