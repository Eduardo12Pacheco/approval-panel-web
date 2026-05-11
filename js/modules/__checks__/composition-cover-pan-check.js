import { fileURLToPath } from 'node:url';
import { resolveActiveImageDimensions, resolveCoverPanLayer } from '../features/video-projects/composition/composition-renderer.js';

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

export function runCompositionCoverPanCheck() {
  const squareImageLayer = resolveCoverPanLayer({
    viewportWidth: 1920,
    viewportHeight: 1080,
    imageWidth: 1000,
    imageHeight: 1000,
    scale: 1,
    x: 0,
    y: 500,
  });

  assertEqual(squareImageLayer.layerWidth, 1920, 'Expected square image to cover viewport width');
  assertEqual(squareImageLayer.layerHeight, 1920, 'Expected square image layer to preserve source aspect overflow');
  assertEqual(squareImageLayer.maxY, 420, 'Expected vertical pan range from hidden source pixels');
  assertEqual(squareImageLayer.clampedY, 420, 'Expected Y pan to clamp at available overflow');
  assertEqual(squareImageLayer.top, 0, 'Expected max downward pan to align layer top without background gap');

  const wideImageLayer = resolveCoverPanLayer({
    viewportWidth: 1920,
    viewportHeight: 1080,
    imageWidth: 4000,
    imageHeight: 2000,
    scale: 1.2,
    x: -999,
    y: -999,
  });

  assertEqual(wideImageLayer.maxX, 336, 'Expected horizontal pan range after extra scale');
  assertEqual(wideImageLayer.maxY, 108, 'Expected vertical pan range after extra scale');
  assertEqual(wideImageLayer.clampedX, -336, 'Expected X pan to clamp negative overflow');
  assertEqual(wideImageLayer.clampedY, -108, 'Expected Y pan to clamp negative overflow');
  assertEqual(wideImageLayer.left, -672, 'Expected max left pan to keep right edge covered');
  assertEqual(wideImageLayer.top, -216, 'Expected max upward pan to keep bottom edge covered');

  const staleDomDimensions = resolveActiveImageDimensions({
    activeUrl: 'portrait.jpg',
    segment: { imageWidth: 900, imageHeight: 1600 },
    cacheImage: { naturalWidth: 900, naturalHeight: 1600 },
    imageElement: { src: 'wide.jpg', currentSrc: 'wide.jpg', naturalWidth: 4000, naturalHeight: 2000 },
  });

  assertEqual(staleDomDimensions.imageWidth, 900, 'Expected active cache/metadata width to win over stale DOM image width');
  assertEqual(staleDomDimensions.imageHeight, 1600, 'Expected active cache/metadata height to win over stale DOM image height');

  const matchingDomDimensions = resolveActiveImageDimensions({
    activeUrl: 'portrait.jpg',
    segment: {},
    cacheImage: null,
    imageElement: { src: 'portrait.jpg', currentSrc: 'portrait.jpg', naturalWidth: 901, naturalHeight: 1601 },
  });

  assertEqual(matchingDomDimensions.imageWidth, 901, 'Expected DOM width to be trusted when src matches active image URL');
  assertEqual(matchingDomDimensions.imageHeight, 1601, 'Expected DOM height to be trusted when src matches active image URL');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runCompositionCoverPanCheck();
  console.log('composition-cover-pan-check: ok');
}
