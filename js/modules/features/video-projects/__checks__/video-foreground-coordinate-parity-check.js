import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CANONICAL_VIDEO_RENDER_HEIGHT,
  CANONICAL_VIDEO_RENDER_WIDTH,
  buildVideoForegroundTransformStyle,
  convertVideoForegroundTransformToPreview,
  convertVideoForegroundTransformToRender,
} from '../composition/renderer/video-layers.js';
import { buildEditorEffectTabs } from '../render/editor-effect-tabs.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertClose(actual, expected, message) {
  if (Math.abs(actual - expected) > 0.000001) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

export function runVideoForegroundCoordinateParityCheck() {
  assertEqual(CANONICAL_VIDEO_RENDER_WIDTH, 1920, 'Expected canonical render width to match Remotion output');
  assertEqual(CANONICAL_VIDEO_RENDER_HEIGHT, 1080, 'Expected canonical render height to match Remotion output');

  const previewTransform = convertVideoForegroundTransformToPreview(
    { x: 1920, y: -1080, scale: 1.25 },
    { width: 960, height: 540 },
  );
  assertClose(previewTransform.x, 960, 'Expected preview X to scale down from canonical render coordinates');
  assertClose(previewTransform.y, -540, 'Expected preview Y to scale down from canonical render coordinates');
  assertClose(previewTransform.scale, 1.25, 'Expected scale to remain unchanged for preview');

  const style = buildVideoForegroundTransformStyle(
    { x: 1920, y: -1080, scale: 1.25 },
    { width: 960, height: 540 },
  );
  assertEqual(style, 'translate(960px, -540px) scale(1.25)', 'Expected preview style to use scaled translate values');

  const renderTransform = convertVideoForegroundTransformToRender(
    { x: 266, y: -12, scale: 1.4 },
    { width: 950.5, height: 533.8 },
  );
  assertClose(renderTransform.x, 266 * 1920 / 950.5, 'Expected typed preview X to scale up before saving');
  assertClose(renderTransform.y, -12 * 1080 / 533.8, 'Expected typed preview Y to scale up before saving');
  assertClose(renderTransform.scale, 1.4, 'Expected scale to remain unchanged before saving');

  const markup = buildEditorEffectTabs({
    row: {
      id: 'seg-001',
      media: { kind: 'video-segment', sourceInSeconds: 0, durationSeconds: 3, foregroundTransform: { x: 537, y: -40, scale: 1.2 } },
    },
    detail: { voice: { volume: 1, muted: false }, music: { volume: 0.1, muted: false }, previewViewport: { width: 950.5, height: 533.8 } },
    activeTab: 'framing',
  });
  if (!markup.includes('data-video-foreground-field="x"') || !markup.includes('value="266"')) {
    throw new Error('Expected video foreground X control to display preview-space pixels for canonical render X');
  }
  if (!markup.includes('data-video-foreground-field="y"') || !markup.includes('value="-20"')) {
    throw new Error('Expected video foreground Y control to display preview-space pixels for canonical render Y');
  }

  const hydrationSource = fs.readFileSync(path.join(__dirname, '../render/editor-hydration.js'), 'utf8');
  if (!hydrationSource.includes('convertVideoForegroundTransformToRender')) {
    throw new Error('Expected video foreground controls to scale typed preview pixels up before updateRow persistence');
  }
}

if (process.argv[1] && __filename === process.argv[1]) {
  runVideoForegroundCoordinateParityCheck();
  console.log('video-foreground-coordinate-parity-check: ok');
}
