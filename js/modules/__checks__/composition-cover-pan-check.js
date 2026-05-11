import { fileURLToPath } from 'node:url';
import { resolveActiveImageDimensions, resolveCoverPanImageStyle, resolveCoverPanLayer } from '../features/video-projects/composition/composition-renderer.js';

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
  assertEqual(squareImageLayer.appliedY, 500, 'Expected Y pan to apply raw manual keyframe value');
  assertEqual(squareImageLayer.top, 80, 'Expected raw downward pan to allow leaving the image bounds');

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
  assertEqual(wideImageLayer.appliedX, -999, 'Expected X pan to preserve raw manual keyframe value');
  assertEqual(wideImageLayer.appliedY, -999, 'Expected Y pan to preserve raw manual keyframe value');
  assertEqual(wideImageLayer.left, -1335, 'Expected raw left pan to allow visible black background when overdone');
  assertEqual(wideImageLayer.top, -1107, 'Expected raw upward pan to allow visible black background when overdone');

  const wideImageStyle = resolveCoverPanImageStyle(wideImageLayer);
  assertEqual(wideImageStyle.width, '2160px', 'Expected transform-friendly style to keep stable base cover width');
  assertEqual(wideImageStyle.height, '1080px', 'Expected transform-friendly style to keep stable base cover height');
  assertEqual(wideImageStyle.left, '-120px', 'Expected transform-friendly style to keep stable centered base left');
  assertEqual(wideImageStyle.top, '0px', 'Expected transform-friendly style to keep stable centered base top');
  assertEqual(wideImageStyle.transform, 'translate3d(-999px, -999px, 0) scale(1.2)', 'Expected movement and zoom to use compositor-friendly transform');
  assertEqual(wideImageStyle.transformOrigin, 'center center', 'Expected transform to scale around the cover layer center');
  assertEqual(wideImageStyle.willChange, 'transform', 'Expected compositor-friendly will-change');
  assertClose(wideImageStyle.visualLeft, wideImageLayer.left, 'Expected transform visual left to match legacy left math');
  assertClose(wideImageStyle.visualTop, wideImageLayer.top, 'Expected transform visual top to match legacy top math');

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
