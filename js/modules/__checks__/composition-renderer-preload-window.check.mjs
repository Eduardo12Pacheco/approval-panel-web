import assert from 'node:assert/strict';

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
  };
}

globalThis.document = { createElement };
globalThis.requestAnimationFrame = () => 1;
globalThis.cancelAnimationFrame = () => {};

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

const { CompositionRenderer } = await import('../features/video-projects/composition-renderer.js');

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

try {
  await testPreloadUsesSmallImageWindowInsteadOfEveryRow();
  await testPreloadDoesNotFetchLargeAudioBeforePlay();
  console.log('PASS composition-renderer-preload-window.check');
} catch (error) {
  console.error('FAIL composition-renderer-preload-window.check');
  console.error(error);
  process.exitCode = 1;
}
