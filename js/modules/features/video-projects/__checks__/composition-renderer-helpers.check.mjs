import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCompositionDOM as buildCompositionDOMFromFacade,
  buildVideoSegmentPreviewLayerPlan as buildLayerPlanFromFacade,
  CompositionRenderer,
  frameToSeconds as frameToSecondsFromFacade,
  interpolateLinear as interpolateLinearFromFacade,
  isVideoSource as isVideoSourceFromFacade,
  resolveActiveImageDimensions as resolveActiveImageDimensionsFromFacade,
  resolveActiveSegment as resolveActiveSegmentFromFacade,
  resolveCoverPanImageStyle as resolveCoverPanImageStyleFromFacade,
  resolveCoverPanLayer as resolveCoverPanLayerFromFacade,
  resolveNewspaperImageStyles as resolveNewspaperImageStylesFromFacade,
  secondsToFrame as secondsToFrameFromFacade,
  syncManagedVideoElement as syncManagedVideoElementFromFacade,
} from '../composition/composition-renderer.js';
import {
  buildCompositionDOM,
  buildVideoSegmentPreviewLayerPlan,
  frameToSeconds,
  interpolateLinear,
  isVideoSource,
  resolveActiveImageDimensions,
  resolveActiveSegment,
  resolveCoverPanImageStyle,
  resolveCoverPanLayer,
  resolveNewspaperImageStyles,
  secondsToFrame,
  syncManagedVideoElement,
} from '../composition/renderer/index.js';
import { resolveZoomRange } from '../composition/renderer/frame-math.js';
import { shouldChromaKeyLogo } from '../composition/renderer/logo-chroma.js';

function createElement(tagName) {
  return {
    tagName,
    className: '',
    style: {},
    children: [],
    parentNode: null,
    draggable: false,
    muted: false,
    loop: false,
    playsInline: false,
    paused: true,
    readyState: 1,
    currentTime: 0,
    src: '',
    preload: '',
    innerHTML: '',
    getAttribute(name) {
      return this[name] || '';
    },
    load() {},
    textContent: '',
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    removeChild(child) {
      this.children = this.children.filter((item) => item !== child);
      child.parentNode = null;
      return child;
    },
    addEventListener() {},
    removeEventListener() {},
    play() {
      this.paused = false;
      return Promise.resolve();
    },
    pause() { this.paused = true; },
  };
}

globalThis.document = { createElement, baseURI: 'https://control-panel.test/editor/' };
globalThis.Image = class MockImage {
  constructor() {
    this.src = '';
    this.naturalWidth = 1280;
    this.naturalHeight = 720;
  }

  decode() {
    return Promise.resolve();
  }
};

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

test('renderer helper facade preserves frame math, segment windows, and cover-pan outputs', () => {
  assert.equal(secondsToFrame, secondsToFrameFromFacade);
  assert.equal(frameToSeconds, frameToSecondsFromFacade);
  assert.equal(interpolateLinear, interpolateLinearFromFacade);
  assert.equal(resolveCoverPanLayer, resolveCoverPanLayerFromFacade);
  assert.equal(resolveCoverPanImageStyle, resolveCoverPanImageStyleFromFacade);
  assert.equal(resolveActiveSegment, resolveActiveSegmentFromFacade);
  assert.equal(resolveActiveImageDimensions, resolveActiveImageDimensionsFromFacade);

  assert.equal(secondsToFrame(1.234, 30), 37);
  assert.equal(frameToSeconds(45, 30), 1.5);
  assert.equal(interpolateLinear(10, 20, 1.5), 20);
  assert.deepEqual(resolveZoomRange('pan-left'), { from: 1.1, to: 1.1, fromX: 72, fromY: 0, toX: -72, toY: 0 });
  assert.deepEqual(resolveZoomRange({ fromScale: 1.2, toScale: 1.5, fromX: -2, toY: 8 }), { from: 1.2, to: 1.5, fromX: -2, fromY: 0, toX: 0, toY: 8 });

  const layer = resolveCoverPanLayer({ viewportWidth: 1920, viewportHeight: 1080, imageWidth: 4000, imageHeight: 2000, scale: 1.2, x: -999, y: -999 });
  assert.equal(layer.left, -1335);
  assert.equal(layer.top, -1107);
  assert.equal(resolveCoverPanImageStyle(layer).transform, 'translate3d(-999px, -999px, 0) scale(1.2)');

  assert.deepEqual(resolveActiveSegment(3, [{ startTime: 2, endTime: 6, image: 'a.jpg' }]), {
    type: 'segment',
    segment: { startTime: 2, endTime: 6, image: 'a.jpg' },
    localProgress: 0.25,
    localTime: 1,
  });
  assert.deepEqual(resolveActiveSegment(7, [{ startTime: 2, endTime: 6 }]), { type: 'outro', localProgress: 1 / 30, localTime: 1 });
});

test('renderer helper facade exposes newspaper image layout parity semantics', () => {
  assert.equal(resolveNewspaperImageStyles, resolveNewspaperImageStylesFromFacade);

  const firstFrame = resolveNewspaperImageStyles({ viewportWidth: 1920, viewportHeight: 1080, imageWidth: 720, imageHeight: 1280, progress: 0 });
  const lastFrame = resolveNewspaperImageStyles({ viewportWidth: 1920, viewportHeight: 1080, imageWidth: 720, imageHeight: 1280, progress: 1 });

  assert.equal(firstFrame.background.objectFit, 'cover');
  assert.equal(firstFrame.background.objectPosition, 'center top');
  assert.equal(firstFrame.background.filter, 'blur(15px)');
  assert.equal(firstFrame.foreground.objectFit, 'contain');
  assert.equal(firstFrame.foreground.objectPosition, 'center top');
  assert.equal(firstFrame.foreground.height, '100%');
  assert.equal(firstFrame.foreground.transform, 'scale(1)');
  assert.equal(lastFrame.foreground.transform, 'scale(1.25)');
  assert.equal(firstFrame.label.lines.join('\n'), 'RECREACIÓN\nARTÍSTICA');
  assert.equal(firstFrame.label.fontFamily, 'Versa, VERSA, Inter, Arial, sans-serif');
  assert.equal(firstFrame.label.fontSize, '30px');
});

test('renderer helper facade preserves video layer planning and managed video sync behavior', () => {
  assert.equal(buildVideoSegmentPreviewLayerPlan, buildLayerPlanFromFacade);
  assert.equal(isVideoSource, isVideoSourceFromFacade);
  assert.equal(syncManagedVideoElement, syncManagedVideoElementFromFacade);

  assert.equal(isVideoSource('/assets/source.MP4'), true);
  assert.equal(isVideoSource('/assets/source.jpg'), false);
  assert.deepEqual(buildVideoSegmentPreviewLayerPlan({ media: { kind: 'image' }, localTime: 4 }), { layers: [] });

  const plan = buildVideoSegmentPreviewLayerPlan({
    media: { kind: 'video-segment', sourceVideoSrc: '/videos/source.mp4', sourceInSeconds: 3, durationSeconds: 5 },
    localTime: 9,
  });
  assert.equal(plan.currentTimeSeconds, 8);
  assert.deepEqual(plan.layers.map((layer) => layer.name), ['background-video', 'color-overlay', 'effect-layer-02', 'effect-layer-01', 'foreground-video']);
  assert.match(plan.layers[2].src, /effect-layer-02\.webm$/);
  assert.match(plan.layers[3].src, /effect-layer-01\.webm$/);

  const calls = [];
  const video = {
    currentTime: 0,
    paused: true,
    readyState: 1,
    play: () => { calls.push('play'); return Promise.resolve(); },
    pause: () => calls.push('pause'),
  };
  assert.equal(syncManagedVideoElement({ video, currentTimeSeconds: 4.25, playing: true }), true);
  assert.equal(video.currentTime, 4.25);
  assert.equal(video.muted, true);
  assert.equal(video.playsInline, true);
  assert.deepEqual(calls, ['play']);
});

test('renderer DOM helper preserves preview layer order and logo chroma detection', () => {
  assert.equal(buildCompositionDOM, buildCompositionDOMFromFacade);
  assert.equal(shouldChromaKeyLogo('./assets/logo-green.mp4'), true);
  assert.equal(shouldChromaKeyLogo('./assets/logo-clean.mp4'), false);

  const container = createElement('div');
  const { layers, stage } = buildCompositionDOM(container);

  assert.equal(container.children[0], stage);
  assert.deepEqual(stage.children.map((child) => child.className), [
    'composition-layer composition-layer--bg',
    'composition-layer composition-layer--video-background',
    'composition-layer composition-layer--video-color-overlay',
    'composition-layer composition-layer--video-effect-02',
    'composition-layer composition-layer--video-effect-01',
    'composition-layer composition-layer--video-foreground',
    'composition-layer composition-layer--newspaper-bg',
    'composition-layer composition-layer--newspaper-foreground',
    'composition-layer composition-layer--newspaper-label',
    'composition-layer composition-layer--image',
    'composition-layer composition-layer--dust',
    'composition-layer composition-layer--dust-fallback',
    'composition-layer composition-layer--logo',
    'composition-layer composition-layer--logo-video',
    'composition-layer composition-layer--logo-canvas',
    'composition-layer composition-layer--outro',
  ]);
  assert.equal(layers.videoEffect2.src, './assets/effect-layer-02.webm');
  assert.equal(layers.videoEffect1.src, './assets/effect-layer-01.webm');
  assert.match(layers.newspaperBackground.style.cssText, /filter:blur\(15px\)/);
  assert.match(layers.newspaperLabel.style.cssText, /font-family:Versa, VERSA, Inter, Arial, sans-serif/);
  assert.match(layers.newspaperLabel.style.cssText, /font-size:30px/);
  assert.equal(layers.outroText.textContent, 'Gracias por mirar');
});

test('composition renderer assigns uncached image src for newspaper and normal rows after decode', async () => {
  const container = createElement('div');
  container.clientWidth = 1920;
  container.clientHeight = 1080;
  const renderer = new CompositionRenderer({ container });

  renderer.update({
    rows: [{
      id: 'row-news',
      startTime: 0,
      endTime: 2,
      image: 'https://cdn.test/news.jpg',
      mediaMode: 'newspaper',
      media: { kind: 'image' },
      dust: { enabled: false },
      logo: { enabled: false },
    }],
  });
  await flushMicrotasks();

  const stage = container.children[0];
  const newspaperBackground = stage.children.find((child) => child.className === 'composition-layer composition-layer--newspaper-bg');
  const newspaperForeground = stage.children.find((child) => child.className === 'composition-layer composition-layer--newspaper-foreground');
  const normalImage = stage.children.find((child) => child.className === 'composition-layer composition-layer--image');
  assert.equal(newspaperBackground.src, 'https://cdn.test/news.jpg');
  assert.equal(newspaperForeground.src, 'https://cdn.test/news.jpg');
  assert.equal(newspaperBackground.style.visibility, 'visible');
  assert.equal(newspaperForeground.style.visibility, 'visible');
  assert.equal(normalImage.src, '', 'newspaper rows must not hydrate the normal image layer');
  assert.equal(normalImage.style.visibility, 'hidden', 'newspaper rows must hide the normal image layer after reload/hydration');

  renderer.update({
    rows: [{
      id: 'row-image',
      startTime: 0,
      endTime: 2,
      image: 'https://cdn.test/normal.jpg',
      mediaMode: 'image',
      media: { kind: 'image' },
      dust: { enabled: false },
      logo: { enabled: false },
    }],
  });
  await flushMicrotasks();

  assert.equal(normalImage.src, 'https://cdn.test/normal.jpg');
  assert.equal(normalImage.style.visibility, 'visible');
  assert.equal(newspaperBackground.style.visibility, 'hidden');
  assert.equal(newspaperForeground.style.visibility, 'hidden');

  renderer.update({
    rows: [{
      id: 'row-news-again',
      startTime: 0,
      endTime: 2,
      image: 'https://cdn.test/news-again.jpg',
      mediaMode: 'newspaper',
      media: { kind: 'image' },
      dust: { enabled: false },
      logo: { enabled: false },
    }],
  });
  await flushMicrotasks();

  assert.equal(newspaperBackground.src, 'https://cdn.test/news-again.jpg');
  assert.equal(newspaperForeground.src, 'https://cdn.test/news-again.jpg');
  assert.equal(normalImage.src, '', 'switching back to newspaper must clear stale normal image src');
  assert.equal(normalImage.style.visibility, 'hidden');
});
