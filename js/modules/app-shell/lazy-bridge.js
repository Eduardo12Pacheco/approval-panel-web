// lazy-bridge.js — Async getters + sync proxy for lazy-loaded features.
// Replaces the old synchronous feature injection in runtime.js.
// Each getter triggers the dynamic import only on first access.
// The proxy allows synchronous call sites to work while the module
// loads in background (calls execute on the real feature once ready).

let _vp = null;
let _af = null;
let _sc = null;
let _rc = null;
let _vpPromise = null;
let _afPromise = null;
let _scPromise = null;
let _rcPromise = null;

function lazyProxy(loadFn, getCached) {
  return new Proxy({}, {
    get(_target, prop) {
      const cached = getCached();
      if (cached && prop in cached) return typeof cached[prop] === 'function'
        ? cached[prop].bind(cached)
        : cached[prop];
      // Trigger load in background, return no-op for synchronous callers.
      loadFn();
      if (typeof prop === 'string' && prop !== 'then') return (...args) => {};
      return undefined;
    },
  });
}

/** @param {object} lazy — lazy getters from composition.js */
export function createLazyBridge(lazy) {
  async function loadVp() { if (!_vpPromise) _vpPromise = lazy.videoProjects().then(f => { _vp = f; return f; }); return _vpPromise; }
  async function loadAf() { if (!_afPromise) _afPromise = lazy.audio().then(f => { _af = f; return f; }); return _afPromise; }
  async function loadSc() { if (!_scPromise) _scPromise = lazy.subtitles().then(f => { _sc = f; return f; }); return _scPromise; }
  async function loadRc() { if (!_rcPromise) _rcPromise = lazy.radar().then(f => { _rc = f; return f; }); return _rcPromise; }

  return {
    /** Async getters — use in event handlers and setView */
    async videoProjectsFeature() { return loadVp(); },
    async audioFeature() { return loadAf(); },
    async subtitlesController() { return loadSc(); },
    async radarController() { return loadRc(); },

    /** Sync proxy — for synchronous render callbacks. Returns no-ops
     *  until the feature loads, then delegates to the real methods. */
    vp: lazyProxy(loadVp, () => _vp),
    af: lazyProxy(loadAf, () => _af),
    sc: lazyProxy(loadSc, () => _sc),
    rc: lazyProxy(loadRc, () => _rc),

    /** TTS API — loaded eagerly since it's lightweight and used by scripts */
    async ttsApi() {
      if (!_afPromise) _afPromise = lazy.audio();
      await _afPromise;
      // The TTS client is created internally by audio/subtitles lazy init.
      // We just need to ensure audio is loaded first.
      return null;
    },

    /** Preload a specific feature in background (for navigation) */
    preload(feature) {
      if (feature === 'video-projects') loadVp();
      else if (feature === 'audio') loadAf();
      else if (feature === 'subtitles') loadSc();
      else if (feature === 'radar') loadRc();
    },
  };
}
