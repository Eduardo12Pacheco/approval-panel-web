import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveActiveImageDimensions, resolveCoverPanImageStyle, resolveCoverPanLayer, resolveNewspaperImageStyles } from '../composition/composition-renderer.js';
import {
  LOGO_HEIGHT,
  LOGO_LEFT,
  LOGO_TOP,
  LOGO_WIDTH,
  shouldChromaKeyLogo,
} from '../composition/renderer/logo-chroma.js';

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const controlPanelRoot = path.resolve(__dirname, '../../../../..');

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

  assertEqual(shouldChromaKeyLogo('./assets/logo-colombia.webm'), true, 'Expected Colombia preview logo to use chroma-key canvas path');
  assertEqual(shouldChromaKeyLogo('../02-Video-Engine/assets/overlays/logo-green.mp4?cache=1'), true, 'Expected legacy green-screen logo to keep chroma-key path');
  assertEqual(shouldChromaKeyLogo('./assets/logo-alpha.webm'), false, 'Expected alpha logo to keep direct video path');
  assertEqual(LOGO_LEFT, 52, 'Expected chroma fix to preserve logo left placement');
  assertEqual(LOGO_TOP, 38, 'Expected chroma fix to preserve logo top placement');
  assertEqual(LOGO_WIDTH, 220, 'Expected chroma fix to preserve logo width');
  assertEqual(LOGO_HEIGHT, 124, 'Expected chroma fix to preserve logo height');

  const newspaperStart = resolveNewspaperImageStyles({ progress: 0 });
  const newspaperEnd = resolveNewspaperImageStyles({ progress: 1 });
  assertEqual(newspaperStart.background.objectFit, 'cover', 'Expected newspaper background to stay cover');
  assertEqual(newspaperStart.background.objectPosition, 'center top', 'Expected newspaper background to stay top anchored');
  assertEqual(newspaperStart.background.filter, 'blur(15px)', 'Expected newspaper background to stay blurred at 15px');
  assertEqual(newspaperStart.foreground.objectFit, 'contain', 'Expected newspaper foreground to stay contained');
  assertEqual(newspaperStart.foreground.objectPosition, 'center center', 'Expected newspaper foreground zoom to stay vertically centered');
  assertEqual(newspaperStart.foreground.transformOrigin, 'center center', 'Expected newspaper foreground zoom origin to stay centered');
  assertEqual(newspaperStart.foreground.transform, 'scale(1)', 'Expected newspaper foreground to start at 100%');
  assertEqual(newspaperEnd.foreground.transform, 'scale(1.1)', 'Expected newspaper foreground to end at Zoom 110');
  assertEqual(newspaperStart.label.textAlign, 'center', 'Expected newspaper label text to be centered');
  assertEqual(newspaperStart.label.left, 'auto', 'Expected newspaper label to avoid global horizontal centering');
  assertEqual(newspaperStart.label.right, '40px', 'Expected newspaper label block to sit in the upper-right area');
  assertEqual(newspaperStart.label.top, '40px', 'Expected newspaper label block to stay top anchored');
  assertEqual(newspaperStart.label.transform, 'none', 'Expected newspaper label to avoid translateX centering');
  assertEqual(newspaperStart.label.fontFamily, '"Versa Versa", Versa, VERSA, Inter, Arial, sans-serif', 'Expected newspaper label to request the installed Versa Versa face first with honest fallbacks');
  assertEqual(newspaperStart.label.fontSize, '16px', 'Expected newspaper label to be reduced to a small upper-right stamp size');
  assertEqual(newspaperStart.label.lineHeight, 1.12, 'Expected newspaper label leading to separate RECREACIÓN and ARTÍSTICA slightly');

  const versaFontPath = path.join(controlPanelRoot, 'assets/fonts/versa/Versa-Versa.woff2');
  if (!fs.existsSync(versaFontPath)) {
    throw new Error(`Expected local Versa Versa preview font at ${versaFontPath}`);
  }

  const fontsCss = fs.readFileSync(path.join(controlPanelRoot, 'styles/fonts.css'), 'utf8');
  if (!fontsCss.includes("font-family: 'Versa Versa'")) {
    throw new Error('Expected styles/fonts.css to declare a local Versa Versa @font-face');
  }
  if (!fontsCss.includes('../assets/fonts/versa/Versa-Versa.woff2')) {
    throw new Error('Expected styles/fonts.css to load the local Versa Versa WOFF2 asset');
  }
  if (!/font-display:\s*block;/.test(fontsCss)) {
    throw new Error('Expected Versa Versa preview @font-face to use font-display:block for preview fidelity');
  }
}

if (process.argv[1] && __filename === process.argv[1]) {
  runCompositionCoverPanCheck();
  console.log('composition-cover-pan-check: ok');
}
