import { AudioManager } from './audio-manager.js';

// composition-renderer.js — Browser-local real-time composition preview
// Replaces slow Remotion-rendered MP4 previews with DOM/CSS layers + Web Audio API.
// Replicates Remotion's 5-layer architecture: bg → image + zoom → dust → logo → outro
//
// ── Cross-Browser Verification Notes (Phase 6.3) ─────────────────────────
// • Web Audio API: Supported in Chrome 35+, Firefox 25+, Edge 12+, Safari 14.1+.
//   Uses window.AudioContext || window.webkitAudioContext for Safari compat.
// • CSS transform + will-change: Supported in all modern browsers.
// • mix-blend-mode: screen: Supported in Chrome 41+, Firefox 32+, Edge 79+, Safari 8+.
// • Image.decode(): Chrome 61+, Firefox 93+, Edge 79+, Safari 11.1+.
//   Fallback: direct src assignment if decode() throws.
// • requestAnimationFrame: Universal support.
// • <video> loop + playsInline: Supported everywhere. playsInline needed for iOS.
// • CSS object-fit: cover: Supported in all modern browsers (IE11 partial via polyfill).
// • pointerEvents/capture: Universal support for pointer events API.
//
// KNOWN LIMITATIONS:
// • "pan-left"/"pan-right" motion effects are Remotion-only (use OffthreadVideo
//   + Remotion's interpolate on video element position). Browser preview falls
//   back to slow-zoom-in for these motion values — acceptable for preview purposes.
// • Dust overlay uses a lightweight WebM (480×270, 5s loop) for browser preview.
//   Full-resolution dust (1920×1080) is only used in Remotion final render.
//   Asset path: approval-panel-web/assets/dust-preview.webm
// • iOS Safari: AudioContext must be resumed from a user gesture (handled by
//   lazy init in play() which is always triggered by a click handler).
// ──────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// Constants — matched exactly from RemotionEditor/src/Composition.tsx
// SOURCE: Composition.tsx line 63
// ─────────────────────────────────────────────────────────────

const DEFAULT_FPS = 30;

// SOURCE: Composition.tsx line 192 — scaleTo ternary
const ZOOM_SLOW = { from: 1.0, to: 1.04 };
const ZOOM_SLOW_IN = { from: 1.0, to: 1.08 };

// SOURCE: Composition.tsx lines 128-134 — LogoOverlay style
const LOGO_LEFT = 52;
const LOGO_TOP = 38;
const LOGO_WIDTH = 220;
const LOGO_HEIGHT = 124;
const LOGO_OPACITY = 0.94;
const LOGO_DROP_SHADOW = 'drop-shadow(0 10px 24px rgba(0,0,0,0.55))';

// SOURCE: Composition.tsx line 100 — CSS pseudo-dust fallback
const DUST_FALLBACK_OPACITY = 0.28;
// SOURCE: Composition.tsx line 110 — video dust opacity
const DUST_VIDEO_OPACITY = 0.36;

// SOURCE: Composition.tsx line 268 — outro bg color
const OUTRO_BG_COLOR = '#11100e';
// SOURCE: Composition.tsx line 269 — outro text style
const OUTRO_TEXT_COLOR = '#f5d09a';
const OUTRO_FONT_SIZE = 72;
const OUTRO_DURATION_SECONDS = 2;

// ─────────────────────────────────────────────────────────────
// Utility Functions — frame math matching Remotion's Math.round
// ─────────────────────────────────────────────────────────────

/**
 * Convert seconds to frame number using Remotion's rounding convention.
 * SOURCE: Composition.tsx uses Math.round(seconds * fps) everywhere.
 * @param {number} seconds
 * @param {number} [fps=30]
 * @returns {number}
 */
export function secondsToFrame(seconds, fps = DEFAULT_FPS) {
  return Math.round(seconds * fps);
}

/**
 * Convert frame number back to seconds.
 * @param {number} frame
 * @param {number} [fps=30]
 * @returns {number}
 */
export function frameToSeconds(frame, fps = DEFAULT_FPS) {
  return frame / fps;
}

/**
 * Linear interpolation between start and end at given progress (0..1).
 * @param {number} start
 * @param {number} end
 * @param {number} progress — 0..1
 * @returns {number}
 */
export function interpolateLinear(start, end, progress) {
  const clamped = Math.max(0, Math.min(1, progress));
  return start + (end - start) * clamped;
}

/**
 * Resolve zoom range constants for a given motion string.
 * SOURCE: Composition.tsx line 192 — ternary on segment.motion
 *   "still" → 1.0, "slow-zoom" → 1.04, anything else → 1.08
 *
 * NOTE: The editor dropdown also offers "slow-zoom-out", "pan-left",
 * "pan-right", "none". Remotion treats all of these as the default
 * (1.08) except "none" which we map to "still" for browser preview.
 * Pan effects are Remotion-only (OffthreadVideo + interpolate) and
 * cannot be replicated with CSS static-image zoom. This is an
 * accepted visual parity trade-off documented in Phase 6.
 *
 * @param {string} motion — 'slow-zoom', 'slow-zoom-in', 'still', 'none', etc.
 * @returns {{ from: number, to: number }}
 */
function resolveZoomRange(motion) {
  if (motion === 'slow-zoom') return ZOOM_SLOW;
  if (motion === 'still' || motion === 'none') return { from: 1.0, to: 1.0 };
  // Default: slow-zoom-in (matches Remotion's else branch)
  return ZOOM_SLOW_IN;
}

// ─────────────────────────────────────────────────────────────
// DOM Builder — composition container with 5 absolute layers
// ─────────────────────────────────────────────────────────────

/**
 * Check if a URL points to a video file.
 * SOURCE: Composition.tsx line 89 — isVideoSource regex
 * @param {string|null|undefined} src
 * @returns {boolean}
 */
export function isVideoSource(src) {
  return /\.(mp4|webm|mov|m4v)$/i.test(src || '');
}

/**
 * Build the 5-layer composition DOM structure and append to container.
 * Layer order (bottom → top): bg, image, dust, logo, outro
 *
 * @param {HTMLElement} container — parent element to append into
 * @returns {{
 *   stage: HTMLDivElement,
 *   layers: {
 *     bg: HTMLDivElement,
 *     image: HTMLImageElement,
 *     dust: HTMLVideoElement,
 *     dustFallback: HTMLDivElement,
 *     logo: HTMLImageElement,
 *     logoVideo: HTMLVideoElement,
 *     outro: HTMLDivElement,
 *     outroText: HTMLDivElement
 *   }
 * }}
 */
export function buildCompositionDOM(container) {
  // Main stage — relative positioning context
  const stage = document.createElement('div');
  stage.className = 'composition-stage';
  stage.style.cssText = 'position:relative;width:100%;height:100%;overflow:hidden;background:#000;';

  // Layer 1: Dark background
  // SOURCE: Composition.tsx line 220 — backgroundColor: "#101828" for empty state
  const bg = document.createElement('div');
  bg.className = 'composition-layer composition-layer--bg';
  bg.style.cssText = 'position:absolute;inset:0;background:#101828;';
  stage.appendChild(bg);

  // Layer 2: Segment image (with zoom transform)
  const image = document.createElement('img');
  image.className = 'composition-layer composition-layer--image';
  image.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;will-change:transform;';
  image.draggable = false;
  stage.appendChild(image);

  // Layer 3a: Dust video overlay
  // SOURCE: Composition.tsx line 110 — mixBlendMode: "screen", opacity 0.36
  const dust = document.createElement('video');
  dust.className = 'composition-layer composition-layer--dust';
  dust.style.cssText = `position:absolute;inset:0;width:100%;height:100%;object-fit:cover;mix-blend-mode:screen;opacity:${DUST_VIDEO_OPACITY};pointer-events:none;visibility:hidden;`;
  dust.muted = true;
  dust.loop = true;
  dust.playsInline = true;
  stage.appendChild(dust);

  // Layer 3b: CSS pseudo-dust fallback
  // SOURCE: Composition.tsx lines 94-103 — radial-gradient fallback
  const dustFallback = document.createElement('div');
  dustFallback.className = 'composition-layer composition-layer--dust-fallback';
  dustFallback.style.cssText = `position:absolute;inset:0;mix-blend-mode:screen;opacity:${DUST_FALLBACK_OPACITY};pointer-events:none;visibility:hidden;background-image:radial-gradient(circle at 20% 30%, rgba(255,255,255,0.20) 0 1px, transparent 2px), radial-gradient(circle at 70% 60%, rgba(255,255,255,0.12) 0 1px, transparent 2px);background-size:140px 140px, 220px 220px;`;
  stage.appendChild(dustFallback);

  // Layer 4: Logo overlay
  // SOURCE: Composition.tsx lines 128-134 — LogoOverlay style
  // SOURCE: Composition.tsx line 89 — isVideoSource regex, line 138 — video vs img branch
  const logo = document.createElement('img');
  logo.className = 'composition-layer composition-layer--logo';
  logo.style.cssText = `position:absolute;left:${LOGO_LEFT}px;top:${LOGO_TOP}px;width:${LOGO_WIDTH}px;height:${LOGO_HEIGHT}px;opacity:${LOGO_OPACITY};filter:${LOGO_DROP_SHADOW};object-fit:contain;pointer-events:none;visibility:hidden;`;
  logo.draggable = false;
  stage.appendChild(logo);

  // Logo video variant — used when logo URL is a video file (.webm, .mp4, etc.)
  const logoVideo = document.createElement('video');
  logoVideo.className = 'composition-layer composition-layer--logo-video';
  logoVideo.style.cssText = `position:absolute;left:${LOGO_LEFT}px;top:${LOGO_TOP}px;width:${LOGO_WIDTH}px;height:${LOGO_HEIGHT}px;opacity:${LOGO_OPACITY};filter:${LOGO_DROP_SHADOW};object-fit:contain;pointer-events:none;visibility:hidden;`;
  logoVideo.muted = true;
  logoVideo.loop = true;
  logoVideo.playsInline = true;
  stage.appendChild(logoVideo);

  // Layer 5: Outro overlay
  // SOURCE: Composition.tsx lines 268-272 — outro styling
  const outro = document.createElement('div');
  outro.className = 'composition-layer composition-layer--outro';
  outro.style.cssText = `position:absolute;inset:0;background:${OUTRO_BG_COLOR};display:grid;place-items:center;visibility:hidden;pointer-events:none;`;
  const outroText = document.createElement('div');
  outroText.style.cssText = `color:${OUTRO_TEXT_COLOR};font-family:Inter,sans-serif;font-size:${OUTRO_FONT_SIZE}px;font-weight:900;`;
  outroText.textContent = 'Gracias por mirar';
  outro.appendChild(outroText);
  stage.appendChild(outro);

  container.appendChild(stage);

  return {
    stage,
    layers: { bg, image, dust, dustFallback, logo, logoVideo, outro, outroText },
  };
}

// ─────────────────────────────────────────────────────────────
// Segment Resolver — find active segment by current time
// ─────────────────────────────────────────────────────────────

/**
 * Given current playback time and editor rows (segments), return the active
 * segment or the outro state.
 *
 * Segment data model (matches Remotion's TimelineSegment):
 *   { startTime: number, endTime: number, image: string, motion?: string,
 *     dust?: { enabled?: boolean }, logo?: { enabled?: boolean } }
 *
 * @param {number} time — current playback time in seconds
 * @param {Array} rows — editor rows (segments) sorted by startTime
 * @param {number} [outroDuration=2] — outro duration in seconds
 * @returns {{ type: 'segment', segment: object, localProgress: number, localTime: number }
 *         | { type: 'outro', localProgress: number, localTime: number }
 *         | { type: 'empty' }}
 */
export function resolveActiveSegment(time, rows, outroDuration = OUTRO_DURATION_SECONDS) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { type: 'empty' };
  }

  // Find the segment whose time window contains `time`
  for (let i = 0; i < rows.length; i++) {
    const segment = rows[i];
    const start = Number(segment.startTime) || 0;
    const end = Number(segment.endTime) || 0;

    if (time >= start && time < end) {
      const duration = end - start;
      const localTime = time - start;
      const localProgress = duration > 0 ? localTime / duration : 0;
      return { type: 'segment', segment, localProgress, localTime };
    }
  }

  // Check if we're in the outro window
  // SOURCE: Composition.tsx line 225 — latestEnd from segments
  const latestEnd = rows.reduce((max, seg) => Math.max(max, Number(seg.endTime) || 0), 0);
  const outroStart = latestEnd;
  const outroEnd = latestEnd + outroDuration;

  if (time >= outroStart && time < outroEnd) {
    const localTime = time - outroStart;
    const localProgress = outroDuration > 0 ? localTime / outroDuration : 0;
    return { type: 'outro', localProgress, localTime };
  }

  // Past the end — show outro at final frame
  if (time >= outroEnd) {
    return { type: 'outro', localProgress: 1, localTime: outroDuration };
  }

  // Before first segment — show bg only (treat as first segment's pre-start)
  return { type: 'empty' };
}

// ─────────────────────────────────────────────────────────────
// CompositionRenderer Class
// ─────────────────────────────────────────────────────────────

/**
 * Browser-local real-time composition preview renderer.
 * Replaces Remotion-rendered MP4 previews with DOM/CSS layers.
 *
 * Usage:
 *   const renderer = new CompositionRenderer({ container: document.getElementById('preview') });
 *   await renderer.preload({ dustWebmUrl, logoUrl });
 *   renderer.update({ rows: editorRows });
 *   await renderer.play();
 *   renderer.seek(3.5);
 *   renderer.pause();
 *   renderer.destroy();
 */
export class CompositionRenderer {
  /** @type {HTMLDivElement} */
  #container;
  /** @type {number} */
  #fps;
  /** @type {number} */
  #currentTime;
  /** @type {boolean} */
  #isPlaying;
  /** @type {boolean} */
  #assetsReady;
  /** @type {Array} */
  #rows;
  /** @type {object|null} */
  #dom;
  /** @type {Map<string, HTMLImageElement>} */
  #imageCache;
  /** @type {string|null} */
  #activeSegmentKey;

  // ── Audio pipeline — delegated to AudioManager ───────────
  /** @type {AudioManager} */
  #audio;

  // ── Phase 4: Playback control fields ─────────────────────
  /** @type {number|null} — rAF handle for cancellation */
  #rafId;
  /** @type {number} — invalidates stale async audio-start attempts */
  #audioStartToken;

  /**
   * @param {{ container: HTMLDivElement, fps?: number }} options
   */
  constructor({ container, fps = DEFAULT_FPS }) {
    this.#container = container;
    this.#fps = fps;
    this.#currentTime = 0;
    this.#isPlaying = false;
    this.#assetsReady = false;
    this.#rows = [];
    this.#imageCache = new Map();
    this.#activeSegmentKey = null;

    // Audio pipeline — delegated to AudioManager
    this.#audio = new AudioManager();

    // Phase 4: Playback control
    this.#rafId = null;
    this.#audioStartToken = 0;

    // Build DOM immediately
    this.#dom = buildCompositionDOM(container);
  }

  // ── Public API ──────────────────────────────────────────

  /**
   * Preload assets (dust WebM, logo, voice, music).
   * Call once on editor open.
   * @param {{ dustWebmUrl?: string, logoUrl?: string, voiceUrl?: string, musicUrl?: string,
   *           voiceVolume?: number, voiceMuted?: boolean, musicVolume?: number,
   *           musicFadeInSeconds?: number, musicFadeOutSeconds?: number,
   *           rows?: Array }} assets
   * @returns {Promise<void>}
   */
  async preload({ dustWebmUrl, logoUrl, voiceUrl, musicUrl, voiceVolume, voiceMuted, musicVolume, musicFadeInSeconds, musicFadeOutSeconds, rows } = {}) {
    // Guard: if preload is already in progress, return the existing promise
    if (this._preloadInProgress) {
      return this._preloadInProgress;
    }

    this._preloadInProgress = (async () => {
      // Store URLs for later use
      this._dustWebmUrl = dustWebmUrl || null;
      this._logoUrl = logoUrl || null;
      this._voiceUrl = voiceUrl || null;
      this._musicUrl = musicUrl || null;

      // Store audio config
      this.#audio.configure({
        voiceVolume,
        voiceMuted,
        musicVolume,
        musicFadeInSeconds,
        musicFadeOutSeconds,
      });

      // ── Task 3.1: Preload dust WebM and logo ──
      // Set dust video source — browser begins buffering
      if (dustWebmUrl && this.#dom?.layers?.dust) {
        this.#dom.layers.dust.src = dustWebmUrl;
        this.#dom.layers.dust.preload = 'auto';
      }

      // Set logo image source — triggers fetch + decode
      if (logoUrl && this.#dom?.layers?.logo) {
        this.#dom.layers.logo.src = logoUrl;
      }

      // ── Task 3.3: Pre-decode segment images if rows provided ──
      if (Array.isArray(rows) && rows.length > 0) {
        const imageUrls = rows
          .map((r) => r.image)
          .filter(Boolean);
        if (imageUrls.length > 0) {
          await this.preloadImages(imageUrls);
        }
      }

      // Fetch and decode audio buffers
      // AudioContext is lazy — created on first play (browser autoplay policy).
      // Here we just fetch the raw data; decode happens in init().
      if (voiceUrl || musicUrl) {
        const fetchPromise = this.#audio.fetchBuffers(voiceUrl, musicUrl);
        this.#audio.setPendingFetch(fetchPromise);
      }

      this.#assetsReady = true;
    })();

    try {
      await this._preloadInProgress;
    } finally {
      this._preloadInProgress = null;
    }
  }

  /**
   * Preload segment images into the decode cache.
   * Call after update({ rows }) to eagerly decode all segment images.
   * @param {string[]} urls — array of image URLs to preload
   * @returns {Promise<void>}
   */
  async preloadImages(urls) {
    if (!Array.isArray(urls) || urls.length === 0) return;
    const tasks = urls
      .filter((url) => url && !this.#imageCache.has(url))
      .map(async (url) => {
        try {
          const img = new Image();
          img.src = url;
          await img.decode();
          this.#imageCache.set(url, img);
        } catch {
          // Ignore failed preloads — will fallback on render
        }
      });
    await Promise.all(tasks);
  }

  /**
   * Update the composition with new editor rows.
   * Re-resolves the active segment and updates visuals.
   * @param {{ rows: Array }} options
   */
  update({ rows } = {}) {
    this.#rows = Array.isArray(rows) ? rows : [];
    this.#renderFrame();
  }

  /**
   * Start playback from current position.
   * Task 4.1: resume AudioContext, create audio sources, start rAF loop.
   * Handles lazy AudioContext init (browser autoplay policy).
   * @returns {Promise<void>}
   */
  async play() {
    if (this.#isPlaying) return;

    this.#isPlaying = true;

    // Start rAF master loop immediately (do not block on audio fetch/decode)
    this.#startRafLoop();

    // Audio startup continues in background and will attach when ready.
    this.#scheduleAudioStart();
  }

  /**
   * Schedule async audio startup for the current playback intent.
   * Increments token to invalidate previous pending start attempts.
   */
  #scheduleAudioStart() {
    const token = ++this.#audioStartToken;
    void this.#startAudioForToken(token);
  }

  /**
   * Initialize and start audio if the token is still current.
   * Guards against play/pause/seek races while init() is pending.
   * @param {number} token
   */
  async #startAudioForToken(token) {
    // Lazy AudioContext init (browser autoplay policy)
    const audioOk = await this.#audio.init();

    // If playback intent changed while init/decode was pending, abort.
    if (!audioOk || token !== this.#audioStartToken || !this.#isPlaying) return;

    if (audioOk && this.#audio.ctx) {
      // Resume suspended AudioContext
      await this.#audio.resume();

      // Abort if intent changed during resume().
      if (token !== this.#audioStartToken || !this.#isPlaying) return;

      // Create fresh AudioBufferSourceNodes (single-use pattern)
      this.#audio.stopSources();
      const sources = this.#audio.createSources();
      this.#audio.setSources(sources);

      // Record audio start position
      this.#audio.recordStartPosition(this.#currentTime);

      // Start audio sources from current offset
      const offset = this.#currentTime;
      if (sources.voiceSource) {
        sources.voiceSource.start(0, offset);
      }
      if (sources.musicSource) {
        sources.musicSource.start(0, offset % this.#audio.getMusicBufferDuration());
      }

      // Schedule music fade-in and fade-out
      this.#audio.scheduleFade(this.#currentTime, this.duration);
    }
  }

  /**
   * Pause playback, preserving current time.
   * Task 4.2: suspend AudioContext, stop audio sources, stop rAF loop.
   */
  pause() {
    if (!this.#isPlaying) return;

    // Invalidate pending async audio-start attempts.
    this.#audioStartToken += 1;

    // Sync currentTime from audio context before stopping
    if (this.#audio.ctx && this.#audio.ctx.state === 'running') {
      this.#syncTimeFromAudio();
    }

    // Stop audio sources and suspend AudioContext
    this.#audio.stopSources();
    this.#audio.suspend();

    // Stop rAF loop
    this.#stopRafLoop();

    this.#isPlaying = false;

    // Render final frame at paused position
    this.#renderFrame();
  }

  /**
   * Seek to a specific time in seconds.
   * Task 4.3: update currentTime, update visual frame, update audio position if playing.
   * Works both when playing and paused.
   * @param {number} seconds
   */
  seek(seconds) {
    const maxTime = this.duration;
    const wasPlaying = this.#isPlaying;
    this.#currentTime = Math.max(0, Math.min(seconds, maxTime));

    if (wasPlaying) {
      // Invalidate pending async starts from old position.
      this.#audioStartToken += 1;

      // Update audio position — restart sources at new offset
      // AudioBufferSourceNode cannot seek; must stop and recreate.
      this.#audio.stopSources();

      if (this.#audio.ctx && this.#audio.ctx.state === 'running') {
        this.#audio.recordStartPosition(this.#currentTime);

        const sources = this.#audio.createSources();
        this.#audio.setSources(sources);

        const offset = this.#currentTime;
        if (sources.voiceSource) {
          sources.voiceSource.start(0, offset);
        }
        if (sources.musicSource) {
          sources.musicSource.start(0, offset % this.#audio.getMusicBufferDuration());
        }

        // Reschedule music fade for new position
        this.#audio.scheduleFade(this.#currentTime, this.duration);
      } else {
        // Audio may still be initializing/decoding — re-arm startup at new time.
        this.#scheduleAudioStart();
      }
    }

    // Task 4.3: Update visual composition to target frame
    this.#renderFrame();
  }

  /**
   * Clean up all DOM and resources.
   */
  destroy() {
    // Invalidate pending async audio-start attempts.
    this.#audioStartToken += 1;

    this.pause();

    // Audio cleanup
    this.#audio.destroy();
    this.#audio = null;

    if (this.#dom?.stage?.parentNode) {
      this.#dom.stage.parentNode.removeChild(this.#dom.stage);
    }
    this.#dom = null;
    this.#rows = [];
    this.#currentTime = 0;
    this.#assetsReady = false;
    this.#imageCache.clear();
    this.#activeSegmentKey = null;
  }

  // ── Read-only Getters ───────────────────────────────────

  /** @returns {number} Current playback time in seconds */
  get currentTime() {
    return this.#currentTime;
  }

  /** @returns {number} Total composition duration in seconds */
  get duration() {
    if (this.#rows.length === 0) return 0;
    const latestEnd = this.#rows.reduce(
      (max, seg) => Math.max(max, Number(seg.endTime) || 0),
      0,
    );
    // SOURCE: Composition.tsx line 228 — outro duration
    return latestEnd + OUTRO_DURATION_SECONDS;
  }

  /** @returns {boolean} Whether playback is active */
  get isPlaying() {
    return this.#isPlaying;
  }

  /** @returns {boolean} Whether assets have been preloaded */
  get assetsReady() {
    return this.#assetsReady;
  }

  /**
   * Returns the active segment at the current playback time.
   * Task 4.5: state getter for current segment.
   * @returns {{ type: 'segment', segment: object, localProgress: number, localTime: number }
   *         | { type: 'outro', localProgress: number, localTime: number }
   *         | { type: 'empty' }}
   */
  get currentSegment() {
    return resolveActiveSegment(this.#currentTime, this.#rows);
  }

  // ── Private Methods ─────────────────────────────────────

  /**
   * Start the rAF master loop.
   * Task 4.4: drives visual frame updates at display refresh rate.
   */
  #startRafLoop() {
    this.#stopRafLoop();
    const tick = () => {
      this.#rafTick();
      this.#rafId = requestAnimationFrame(tick);
    };
    this.#rafId = requestAnimationFrame(tick);
  }

  /**
   * Stop the rAF master loop.
   */
  #stopRafLoop() {
    if (this.#rafId !== null) {
      cancelAnimationFrame(this.#rafId);
      this.#rafId = null;
    }
  }

  /**
   * rAF master loop tick — called each animation frame.
   * Task 4.4: drives visual frame updates, syncs with audioContext.currentTime.
   * When audio is playing, visual frames slave to audioContext.currentTime.
   * When audio is not playing (paused/seeking), rAF drives visual independently.
   */
  #rafTick() {
    if (!this.#isPlaying) return;

    // Task 4.4: Sync currentTime from audioContext when audio is active
    if (this.#audio.ctx && this.#audio.ctx.state === 'running') {
      this.#syncTimeFromAudio();
    } else {
      // No audio — advance time using rAF deltaTime (fallback)
      // This case shouldn't normally happen during play, but handle gracefully
      this.#currentTime = Math.min(this.#currentTime + 1 / 60, this.duration);
    }

    // Task 4.4: Check if composition ended
    if (this.#currentTime >= this.duration) {
      this.#currentTime = this.duration;
      this.#renderFrame();
      this.pause();
      return;
    }

    // Task 4.4: Render visual frame
    this.#renderFrame();
  }

  /**
   * Sync #currentTime from audioContext.currentTime.
   * Drift correction: visual time = audioTimeOffset + (audioCtx.currentTime - audioStartCtxTime).
   * @private
   */
  #syncTimeFromAudio() {
    if (!this.#audio.ctx) return;
    this.#currentTime = this.#audio.computeCompositionTime();
    // Clamp to duration
    if (this.#currentTime > this.duration) {
      this.#currentTime = this.duration;
    }
  }

  /**
   * Render a single frame at the current time.
   * Resolves the active segment and applies visuals to DOM layers.
   */
  #renderFrame() {
    if (!this.#dom) return;

    const { layers } = this.#dom;
    const resolved = resolveActiveSegment(this.#currentTime, this.#rows);

    if (resolved.type === 'empty') {
      // Only bg visible
      layers.image.style.visibility = 'hidden';
      layers.dust.style.visibility = 'hidden';
      layers.dustFallback.style.visibility = 'hidden';
      layers.logo.style.visibility = 'hidden';
      layers.logoVideo.style.visibility = 'hidden';
      layers.outro.style.visibility = 'hidden';
      this.#activeSegmentKey = null;
      return;
    }

    if (resolved.type === 'outro') {
      // Show outro, hide segment layers
      layers.image.style.visibility = 'hidden';
      layers.dust.style.visibility = 'hidden';
      layers.dustFallback.style.visibility = 'hidden';
      layers.logo.style.visibility = 'hidden';
      layers.logoVideo.style.visibility = 'hidden';
      layers.outro.style.visibility = 'visible';
      this.#activeSegmentKey = null;
      return;
    }

    // Segment active
    const { segment, localProgress } = resolved;
    const segmentKey = segment.image || '';

    // Hide outro, show segment layers
    layers.outro.style.visibility = 'hidden';
    layers.image.style.visibility = 'visible';

    // ── Task 2.1: Segment image display with gapless transitions ──
    // Swap image on segment boundary (gapless: no flash, instant switch)
    if (segmentKey && segmentKey !== this.#activeSegmentKey) {
      this.#activeSegmentKey = segmentKey;
      this.#swapSegmentImage(layers.image, segmentKey);
    }

    // ── Task 2.2: Zoom motion — CSS transform: scale() with linear interpolation ──
    // SOURCE: Composition.tsx line 192-196 — interpolate with scaleTo
    const zoom = resolveZoomRange(segment.motion);
    const scale = interpolateLinear(zoom.from, zoom.to, localProgress);
    layers.image.style.transform = `scale(${scale})`;

    // Apply filter (contrast + saturation)
    // SOURCE: Composition.tsx line 206 — filter property
    const filterEnabled = segment.filter?.enabled !== false;
    layers.image.style.filter = filterEnabled ? 'contrast(1.06) saturate(0.92)' : 'none';

    // ── Task 2.3/2.4: Dust overlay — video or CSS pseudo-dust fallback ──
    // SOURCE: Composition.tsx line 210 — segment.dust?.enabled !== false
    const dustEnabled = segment.dust?.enabled !== false;
    if (dustEnabled) {
      if (this._dustWebmUrl) {
        layers.dust.style.visibility = 'visible';
        layers.dustFallback.style.visibility = 'hidden';
      } else {
        // ── Task 2.4: CSS pseudo-dust fallback ──
        layers.dust.style.visibility = 'hidden';
        layers.dustFallback.style.visibility = 'visible';
      }
    } else {
      layers.dust.style.visibility = 'hidden';
      layers.dustFallback.style.visibility = 'hidden';
    }

    // ── Task 2.5: Logo overlay — positioned at left:52, top:38 ──
    // SOURCE: Composition.tsx line 213 — segment.logo?.enabled !== false
    // SOURCE: Composition.tsx line 138 — isVideoSource branch for video vs img
    const logoEnabled = segment.logo?.enabled !== false;
    if (logoEnabled && this._logoUrl) {
      if (isVideoSource(this._logoUrl)) {
        // Video logo — use <video> element
        layers.logo.style.visibility = 'hidden';
        layers.logoVideo.style.visibility = 'visible';
        if (layers.logoVideo.src !== this._logoUrl) {
          layers.logoVideo.src = this._logoUrl;
        }
      } else {
        // Static image logo — use <img> element
        layers.logoVideo.style.visibility = 'hidden';
        layers.logo.style.visibility = 'visible';
        if (layers.logo.src !== this._logoUrl) {
          layers.logo.src = this._logoUrl;
        }
      }
    } else {
      layers.logo.style.visibility = 'hidden';
      layers.logoVideo.style.visibility = 'hidden';
    }
  }

  /**
   * Swap the segment image with async decode via Image.decode().
   * Uses a URL→HTMLImageElement cache to avoid re-decoding on revisit.
   * Implements gapless transition: image swaps instantly at segment boundary.
   *
   * @param {HTMLImageElement} imgEl — the image layer element
   * @param {string} url — the new image URL
   */
  async #swapSegmentImage(imgEl, url) {
    // Check cache first — hit means image is already decoded
    if (this.#imageCache.has(url)) {
      imgEl.src = url;
      return;
    }

    // Async decode via Image.decode() (ensures pixels are ready before display)
    try {
      const preloader = new Image();
      preloader.src = url;
      await preloader.decode();
      this.#imageCache.set(url, preloader);
      // Only apply if this segment is still active (prevents race condition)
      if (this.#activeSegmentKey === url) {
        imgEl.src = url;
      }
    } catch {
      // Fallback: direct src assignment if decode fails
      imgEl.src = url;
    }
  }
}
