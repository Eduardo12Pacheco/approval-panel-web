import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

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
    duration: 60,
    currentTime: 0,
    volume: 1,
    src: '',
    preload: '',
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
    removeAttribute(name) { this[name] = ''; },
    load() {},
    play() {
      this.paused = false;
      return Promise.resolve();
    },
    pause() { this.paused = true; },
  };
}

globalThis.document = { createElement };
globalThis.requestAnimationFrame = () => 1;
globalThis.cancelAnimationFrame = () => {};

let decodeCalls = 0;
class FakeAudioContext {
  constructor() {
    this.currentTime = 0;
    this.state = 'suspended';
    this.destination = {};
  }

  createGain() {
    return {
      connect() {},
      gain: {
        value: 1,
        cancelScheduledValues() {},
        setValueAtTime() {},
        linearRampToValueAtTime() {},
      },
    };
  }

  decodeAudioData() {
    decodeCalls += 1;
    return Promise.resolve({ duration: 1 });
  }

  async resume() { this.state = 'running'; }
  async suspend() { this.state = 'suspended'; }
  async close() { this.state = 'closed'; }
}

globalThis.window = { AudioContext: FakeAudioContext, webkitAudioContext: FakeAudioContext };

let decodedUrls = [];
let fetchCalls = [];
globalThis.Image = class FakeImage {
  set src(value) { this._src = value; }
  get src() { return this._src; }
  async decode() { decodedUrls.push(this._src); }
};
globalThis.fetch = async (url) => {
  fetchCalls.push(url);
  return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
};

const { CompositionRenderer } = await import('../composition-renderer.js');

async function testPreloadUsesSmallImageWindowInsteadOfEveryRow() {
  decodedUrls = [];
  const container = createElement('div');
  const renderer = new CompositionRenderer({ container });
  await renderer.preload({
    rows: [
      { image: 'https://example.test/1.jpg' },
      { image: 'https://example.test/2.jpg' },
      { image: 'https://example.test/3.jpg' },
      { image: 'https://example.test/4.jpg' },
      { image: 'https://example.test/5.jpg' },
    ],
  });

  assert.ok(decodedUrls.length > 0, 'preload should still warm at least the active image');
  assert.ok(decodedUrls.length <= 2, `expected a small preload window, decoded ${decodedUrls.length}`);
  assert.deepEqual(decodedUrls, ['https://example.test/1.jpg', 'https://example.test/2.jpg']);
}

async function testPreloadDoesNotFetchLargeAudioBeforePlay() {
  fetchCalls = [];
  const container = createElement('div');
  const renderer = new CompositionRenderer({ container });
  await renderer.preload({
    voiceUrl: 'https://example.test/voice.wav',
    musicUrl: 'https://example.test/music.wav',
  });

  assert.deepEqual(fetchCalls, []);
}

async function testPlayStreamsAudioWithoutFetchOrDecode() {
  fetchCalls = [];
  decodeCalls = 0;
  const container = createElement('div');
  const renderer = new CompositionRenderer({ container });
  await renderer.preload({
    voiceUrl: 'https://example.test/voice.wav',
    musicUrl: 'https://example.test/music.wav',
    rows: [{ startTime: 0, endTime: 2, image: 'https://example.test/1.jpg' }],
  });

  await renderer.play();
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(fetchCalls, [], 'play must not fetch full WAV files into ArrayBuffers');
  assert.equal(decodeCalls, 0, 'play must not call decodeAudioData for preview audio');
  renderer.pause();
}

export async function runCompositionRendererPreloadWindowCheck() {
  await testPreloadUsesSmallImageWindowInsteadOfEveryRow();
  await testPreloadDoesNotFetchLargeAudioBeforePlay();
  await testPlayStreamsAudioWithoutFetchOrDecode();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
try {
  await runCompositionRendererPreloadWindowCheck();
  console.log('PASS composition-renderer-preload-window.check');
} catch (error) {
  console.error('FAIL composition-renderer-preload-window.check');
  console.error(error);
  process.exitCode = 1;
}
}
