import { AudioManager } from '../audio/audio-manager.js';
import { resolveVideoSegmentEffectUrl } from './overlay-assets.js';

// composition-renderer.js — Browser-local real-time composition preview
// Replaces slow Remotion-rendered MP4 previews with DOM/CSS layers + streaming audio.
// Replicates Remotion's 5-layer architecture: bg → image + zoom → dust → logo → outro
//
// ── Cross-Browser Verification Notes (Phase 6.3) ─────────────────────────
// • Preview audio streams through HTMLMediaElement; AudioContext is used only as
//   a lightweight clock to avoid full WAV fetch/decode freezes in the editor.
// • CSS transform + will-change: Supported in all modern browsers.
// • mix-blend-mode: screen: Supported in Chrome 41+, Firefox 32+, Edge 79+, Safari 8+.
// • Green-screen logo preview uses Canvas 2D chroma key for the local MP4 overlay.
// • Image.decode(): Chrome 61+, Firefox 93+, Edge 79+, Safari 11.1+.
//   Fallback: direct src assignment if decode() throws.
// • requestAnimationFrame: Universal support.
// • <video> loop + playsInline: Supported everywhere. playsInline needed for iOS.
// • CSS object-fit: cover: Supported in all modern browsers (IE11 partial via polyfill).
// • pointerEvents/capture: Universal support for pointer events API.
//
// KNOWN LIMITATIONS:
// • Dust overlay uses a lightweight WebM (480×270, 5s loop) for browser preview.
//   Full-resolution dust (1920×1080) is only used in Remotion final render.
//   Asset path: 01-Control-Panel/assets/dust-preview.webm
// • iOS Safari: audio must be started from a user gesture (handled by lazy init
//   in play() which is always triggered by a click handler).
// ──────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// Constants — matched exactly from 02-Video-Engine/src/Composition.tsx
// SOURCE: Composition.tsx line 63
// ─────────────────────────────────────────────────────────────

const DEFAULT_FPS = 30;

// SOURCE: Composition.tsx line 192 — scaleTo ternary
const ZOOM_SLOW = { from: 1.0, to: 1.04 };
const ZOOM_SLOW_IN = { from: 1.0, to: 1.1 };

// SOURCE: Composition.tsx lines 128-134 — LogoOverlay style
const LOGO_LEFT = 52;
const LOGO_TOP = 38;
const LOGO_WIDTH = 220;
const LOGO_HEIGHT = 124;
const LOGO_OPACITY = 0.94;
const LOGO_DROP_SHADOW = 'drop-shadow(0 10px 24px rgba(0,0,0,0.55))';
const GREEN_SCREEN_LOGO_PATTERN = /logo-green\.mp4(?:$|[?#])/i;
const CHROMA_GREEN_MIN = 80;
const CHROMA_GREEN_DOMINANCE = 1.22;
const CHROMA_EDGE_ALPHA = 0.42;

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
const PRELOAD_IMAGE_WINDOW_SIZE = 2;
const VIDEO_SEGMENT_OVERLAY_COLOR = '#3835AF';
const VIDEO_SEGMENT_OVERLAY_OPACITY = 0.3;
const VIDEO_SEGMENT_EFFECT_01_URL = resolveVideoSegmentEffectUrl('effect-layer-01');
const VIDEO_SEGMENT_EFFECT_02_URL = resolveVideoSegmentEffectUrl('effect-layer-02');

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

function finitePositive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function buildVideoSegmentPreviewLayerPlan({ media = {}, localTime = 0 } = {}) {
  if (media?.kind !== 'video-segment') return { layers: [] };
  const sourceInSeconds = finiteNumber(media.sourceInSeconds, 0);
  const durationSeconds = Math.max(0, finiteNumber(media.durationSeconds, 0));
  const clampedLocalTime = clamp(finiteNumber(localTime, 0), 0, durationSeconds);
  const currentTimeSeconds = sourceInSeconds + clampedLocalTime;
  const sourceVideoSrc = media.sourceVideoSrc || media.src || '';

  return {
    sourceInSeconds,
    durationSeconds,
    sourceOutSeconds: sourceInSeconds + durationSeconds,
    currentTimeSeconds,
    layers: [
      { name: 'background-video', src: sourceVideoSrc, currentTimeSeconds, objectFit: 'cover' },
      { name: 'color-overlay', backgroundColor: media.overlayColor || VIDEO_SEGMENT_OVERLAY_COLOR, opacity: Number(media.overlayOpacity ?? VIDEO_SEGMENT_OVERLAY_OPACITY) },
      { name: 'effect-layer-01', src: media.effect1Src || VIDEO_SEGMENT_EFFECT_01_URL, currentTimeSeconds: clampedLocalTime, mixBlendMode: media.effect1BlendMode || 'screen' },
      { name: 'effect-layer-02', src: media.effect2Src || VIDEO_SEGMENT_EFFECT_02_URL, currentTimeSeconds: clampedLocalTime, mixBlendMode: media.effect2BlendMode || 'multiply' },
      { name: 'foreground-video', src: sourceVideoSrc, currentTimeSeconds, objectFit: 'contain' },
    ],
  };
}

function seekVideoElement(video, timeSeconds) {
  if (!video) return;
  const next = finiteNumber(timeSeconds, 0);
  if (Math.abs(Number(video.currentTime || 0) - next) > 0.04) {
    try { video.currentTime = next; } catch {}
  }
}

export function syncManagedVideoElement({ video, currentTimeSeconds = 0, playing = false } = {}) {
  if (!video) return false;
  try { video.muted = true; } catch {}
  try { video.playsInline = true; } catch {}
  seekVideoElement(video, currentTimeSeconds);
  if (playing) {
    if (video.paused !== false) {
      try { void video.play?.().catch(() => {}); } catch {}
    }
  } else {
    try { video.pause?.(); } catch {}
  }
  return true;
}

export function resolveCoverPanLayer({ viewportWidth, viewportHeight, imageWidth, imageHeight, scale = 1, x = 0, y = 0 }) {
  const safeViewportWidth = finitePositive(viewportWidth, 1);
  const safeViewportHeight = finitePositive(viewportHeight, 1);
  const safeImageWidth = finitePositive(imageWidth, safeViewportWidth);
  const safeImageHeight = finitePositive(imageHeight, safeViewportHeight);
  const safeScale = finitePositive(scale, 1);
  const requestedX = finiteNumber(x, 0);
  const requestedY = finiteNumber(y, 0);

  const coverScale = Math.max(safeViewportWidth / safeImageWidth, safeViewportHeight / safeImageHeight);
  const baseWidth = safeImageWidth * coverScale;
  const baseHeight = safeImageHeight * coverScale;
  const baseLeft = (safeViewportWidth - baseWidth) / 2;
  const baseTop = (safeViewportHeight - baseHeight) / 2;
  const layerWidth = baseWidth * safeScale;
  const layerHeight = baseHeight * safeScale;
  const maxX = Math.max(0, (layerWidth - safeViewportWidth) / 2);
  const maxY = Math.max(0, (layerHeight - safeViewportHeight) / 2);

  return {
    coverScale,
    baseWidth,
    baseHeight,
    baseLeft,
    baseTop,
    layerWidth,
    layerHeight,
    maxX,
    maxY,
    appliedX: requestedX,
    appliedY: requestedY,
    left: (safeViewportWidth - layerWidth) / 2 + requestedX,
    top: (safeViewportHeight - layerHeight) / 2 + requestedY,
    transformX: requestedX,
    transformY: requestedY,
    transformScale: safeScale,
  };
}

export function resolveCoverPanImageStyle(layer) {
  const baseWidth = finitePositive(layer?.baseWidth, 1);
  const baseHeight = finitePositive(layer?.baseHeight, 1);
  const baseLeft = finiteNumber(layer?.baseLeft, 0);
  const baseTop = finiteNumber(layer?.baseTop, 0);
  const transformX = finiteNumber(layer?.transformX ?? layer?.appliedX, 0);
  const transformY = finiteNumber(layer?.transformY ?? layer?.appliedY, 0);
  const transformScale = finitePositive(layer?.transformScale, 1);

  return {
    width: `${baseWidth}px`,
    height: `${baseHeight}px`,
    left: `${baseLeft}px`,
    top: `${baseTop}px`,
    objectFit: 'fill',
    transform: `translate3d(${transformX}px, ${transformY}px, 0) scale(${transformScale})`,
    transformOrigin: 'center center',
    willChange: 'transform',
    visualLeft: baseLeft + transformX - (baseWidth * (transformScale - 1)) / 2,
    visualTop: baseTop + transformY - (baseHeight * (transformScale - 1)) / 2,
  };
}

/**
 * Resolve zoom range constants for a given motion string.
 * Contract-aligned motion semantics:
 * - still/none => 1.0 → 1.0
 * - slow-zoom => 1.0 → 1.04
 * - slow-zoom-in/Zoom 110 => 1.0 → 1.10
 * - slow-zoom-out => 1.08 → 1.0
 * - pan-left/pan-right => visible Ken Burns pan with slight zoom
 *
 * @param {string} motion — 'slow-zoom', 'slow-zoom-in', 'still', 'none', etc.
 * @returns {{ from: number, to: number }}
 */
function resolveZoomRange(motion) {
  if (motion && typeof motion === 'object') {
    return {
      from: Number(motion.fromScale ?? 1),
      to: Number(motion.toScale ?? 1),
      fromX: Number(motion.fromX ?? 0),
      fromY: Number(motion.fromY ?? 0),
      toX: Number(motion.toX ?? 0),
      toY: Number(motion.toY ?? 0),
    };
  }
  const normalized = (motion || '').toString().trim().toLowerCase();
  if (normalized === 'still' || normalized === 'none') return { from: 1.0, to: 1.0, fromX: 0, fromY: 0, toX: 0, toY: 0 };
  if (normalized === 'slow-zoom') return { ...ZOOM_SLOW_IN, fromX: 0, fromY: 0, toX: 0, toY: 0 };
  if (normalized === 'slow-zoom-out') return { from: 1.08, to: 1.0, fromX: 0, fromY: 0, toX: 0, toY: 0 };
  if (normalized === 'slow-zoom-in' || normalized === 'zoom 110' || normalized === 'zoom-110') return { ...ZOOM_SLOW_IN, fromX: 0, fromY: 0, toX: 0, toY: 0 };
  if (normalized === 'pan-left') return { from: 1.1, to: 1.1, fromX: 72, fromY: 0, toX: -72, toY: 0 };
  if (normalized === 'pan-right') return { from: 1.1, to: 1.1, fromX: -72, fromY: 0, toX: 72, toY: 0 };
  return { ...ZOOM_SLOW_IN, fromX: 0, fromY: 0, toX: 0, toY: 0 };
}

function shouldChromaKeyLogo(src = '') {
  return GREEN_SCREEN_LOGO_PATTERN.test(src || '');
}

function resolveComparableUrl(url) {
  if (!url) return '';
  try {
    return new URL(url, globalThis.document?.baseURI || globalThis.location?.href || 'http://localhost/').href;
  } catch {
    return String(url);
  }
}

export function resolveActiveImageDimensions({ activeUrl, segment, cacheImage, imageElement } = {}) {
  const cachedWidth = cacheImage?.naturalWidth;
  const cachedHeight = cacheImage?.naturalHeight;
  if (cachedWidth && cachedHeight) {
    return { imageWidth: cachedWidth, imageHeight: cachedHeight };
  }

  if (segment?.imageWidth && segment?.imageHeight) {
    return { imageWidth: segment.imageWidth, imageHeight: segment.imageHeight };
  }

  const activeComparable = resolveComparableUrl(activeUrl);
  const currentComparable = resolveComparableUrl(imageElement?.currentSrc || imageElement?.src);
  if (activeComparable && currentComparable === activeComparable && imageElement?.naturalWidth && imageElement?.naturalHeight) {
    return { imageWidth: imageElement.naturalWidth, imageHeight: imageElement.naturalHeight };
  }

  return { imageWidth: undefined, imageHeight: undefined };
}

function drawChromaKeyVideoFrame(video, canvas) {
  if (!video || !canvas || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;
  const width = canvas.clientWidth || canvas.parentElement?.clientWidth || 0;
  const height = canvas.clientHeight || canvas.parentElement?.clientHeight || 0;
  if (!width || !height) return;
  const pixelRatio = window.devicePixelRatio || 1;
  const targetWidth = Math.max(1, Math.round(width * pixelRatio));
  const targetHeight = Math.max(1, Math.round(height * pixelRatio));
  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
  }

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;
  ctx.clearRect(0, 0, targetWidth, targetHeight);
  ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
  const frame = ctx.getImageData(0, 0, targetWidth, targetHeight);
  const data = frame.data;
  for (let i = 0; i < data.length; i += 4) {
    const red = data[i];
    const green = data[i + 1];
    const blue = data[i + 2];
    const dominantGreen = green > CHROMA_GREEN_MIN && green > red * CHROMA_GREEN_DOMINANCE && green > blue * CHROMA_GREEN_DOMINANCE;
    if (!dominantGreen) continue;
    const spill = green - Math.max(red, blue);
    data[i + 3] = spill > 80 ? 0 : Math.round(data[i + 3] * CHROMA_EDGE_ALPHA);
  }
  ctx.putImageData(frame, 0, 0);
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
 *     logoCanvas: HTMLCanvasElement,
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

  // Layer 1: Black background / empty state
  const bg = document.createElement('div');
  bg.className = 'composition-layer composition-layer--bg';
  bg.style.cssText = 'position:absolute;inset:0;background:#000;';
  stage.appendChild(bg);

  // Layer 2: Segment image (with zoom transform)
  const videoBackground = document.createElement('video');
  videoBackground.className = 'composition-layer composition-layer--video-background';
  videoBackground.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:blur(16px) saturate(0.9);transform:scale(1.08);pointer-events:none;visibility:hidden;';
  videoBackground.muted = true;
  videoBackground.playsInline = true;
  stage.appendChild(videoBackground);

  const videoColorOverlay = document.createElement('div');
  videoColorOverlay.className = 'composition-layer composition-layer--video-color-overlay';
  videoColorOverlay.style.cssText = `position:absolute;inset:0;background:${VIDEO_SEGMENT_OVERLAY_COLOR};opacity:${VIDEO_SEGMENT_OVERLAY_OPACITY};pointer-events:none;visibility:hidden;`;
  stage.appendChild(videoColorOverlay);

  const videoEffect1 = document.createElement('video');
  videoEffect1.className = 'composition-layer composition-layer--video-effect-01';
  videoEffect1.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;mix-blend-mode:screen;pointer-events:none;visibility:hidden;';
  videoEffect1.muted = true;
  videoEffect1.loop = true;
  videoEffect1.playsInline = true;
  stage.appendChild(videoEffect1);

  const videoEffect2 = document.createElement('video');
  videoEffect2.className = 'composition-layer composition-layer--video-effect-02';
  videoEffect2.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;mix-blend-mode:multiply;pointer-events:none;visibility:hidden;';
  videoEffect2.muted = true;
  videoEffect2.loop = true;
  videoEffect2.playsInline = true;
  stage.appendChild(videoEffect2);

  const videoForeground = document.createElement('video');
  videoForeground.className = 'composition-layer composition-layer--video-foreground';
  videoForeground.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none;visibility:hidden;';
  videoForeground.muted = true;
  videoForeground.playsInline = true;
  stage.appendChild(videoForeground);

  const image = document.createElement('img');
  image.className = 'composition-layer composition-layer--image';
  image.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;object-fit:fill;object-position:center center;transform-origin:center center;will-change:transform;';
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
  logoVideo.style.cssText = `position:absolute;inset:0;width:100%;height:100%;opacity:${LOGO_OPACITY};object-fit:cover;pointer-events:none;visibility:hidden;`;
  logoVideo.muted = true;
  logoVideo.loop = true;
  logoVideo.playsInline = true;
  stage.appendChild(logoVideo);

  const logoCanvas = document.createElement('canvas');
  logoCanvas.className = 'composition-layer composition-layer--logo-canvas';
  logoCanvas.style.cssText = `position:absolute;inset:0;width:100%;height:100%;opacity:${LOGO_OPACITY};pointer-events:none;visibility:hidden;`;
  stage.appendChild(logoCanvas);

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
    layers: { bg, videoBackground, videoColorOverlay, videoEffect1, videoEffect2, videoForeground, image, dust, dustFallback, logo, logoVideo, logoCanvas, outro, outroText },
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
   *           voiceVolume?: number, voiceMuted?: boolean, musicVolume?: number, musicMuted?: boolean,
   *           musicFadeInSeconds?: number, musicFadeOutSeconds?: number,
   *           rows?: Array }} assets
   * @returns {Promise<void>}
   */
  async preload({ dustWebmUrl, logoUrl, voiceUrl, musicUrl, voiceVolume, voiceMuted, musicVolume, musicMuted, musicFadeInSeconds, musicFadeOutSeconds, rows } = {}) {
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
        musicMuted,
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
          await this.preloadImages(imageUrls, { limit: PRELOAD_IMAGE_WINDOW_SIZE });
        }
      }

      // Register audio URLs for lazy fetch/decode on first play.
      // AudioContext is lazy — created on first play (browser autoplay policy).
      if (voiceUrl || musicUrl) {
        this.#audio.setSourceUrls(voiceUrl, musicUrl);
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
   * Preload a small segment-image window into the decode cache.
   * Keeps editor open/reload responsive instead of decoding every row upfront.
   * @param {string[]} urls — array of image URLs to preload
   * @param {{ limit?: number }} options — max images to decode in this pass
   * @returns {Promise<void>}
   */
  async preloadImages(urls, { limit = PRELOAD_IMAGE_WINDOW_SIZE } = {}) {
    if (!Array.isArray(urls) || urls.length === 0) return;
    const max = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Number(limit) : PRELOAD_IMAGE_WINDOW_SIZE;
    const tasks = urls
      .filter((url) => url && !this.#imageCache.has(url))
      .slice(0, max)
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
   * Sync #currentTime from the audio clock.
   * Drift correction: visual time = audioTimeOffset + (audioClock - audioStartClock).
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
      layers.videoBackground.style.visibility = 'hidden';
      layers.videoColorOverlay.style.visibility = 'hidden';
      layers.videoEffect1.style.visibility = 'hidden';
      layers.videoEffect2.style.visibility = 'hidden';
      layers.videoForeground.style.visibility = 'hidden';
      layers.image.style.visibility = 'hidden';
      layers.dust.style.visibility = 'hidden';
      layers.dustFallback.style.visibility = 'hidden';
      layers.logo.style.visibility = 'hidden';
      layers.logoVideo.style.visibility = 'hidden';
      layers.logoCanvas.style.visibility = 'hidden';
      layers.outro.style.visibility = 'hidden';
      this.#activeSegmentKey = null;
      return;
    }

    if (resolved.type === 'outro') {
      // Show outro, hide segment layers
      layers.videoBackground.style.visibility = 'hidden';
      layers.videoColorOverlay.style.visibility = 'hidden';
      layers.videoEffect1.style.visibility = 'hidden';
      layers.videoEffect2.style.visibility = 'hidden';
      layers.videoForeground.style.visibility = 'hidden';
      layers.image.style.visibility = 'hidden';
      layers.dust.style.visibility = 'hidden';
      layers.dustFallback.style.visibility = 'hidden';
      layers.logo.style.visibility = 'hidden';
      layers.logoVideo.style.visibility = 'hidden';
      layers.logoCanvas.style.visibility = 'hidden';
      layers.outro.style.visibility = 'visible';
      this.#activeSegmentKey = null;
      return;
    }

    // Segment active
    const { segment, localProgress, localTime } = resolved;
    const segmentKey = segment.image || '';

    // Hide outro, show segment layers
    layers.outro.style.visibility = 'hidden';
    const isVideoSegment = segment.media?.kind === 'video-segment';
    if (isVideoSegment) {
      const plan = buildVideoSegmentPreviewLayerPlan({ media: segment.media, localTime });
      const [background, color, effect1, effect2, foreground] = plan.layers;
      for (const [layer, element] of [[background, layers.videoBackground], [effect1, layers.videoEffect1], [effect2, layers.videoEffect2], [foreground, layers.videoForeground]]) {
        if (layer?.src && element.getAttribute('src') !== layer.src) {
          element.src = layer.src;
          element.load?.();
        }
        element.style.visibility = layer?.src ? 'visible' : 'hidden';
        element.style.objectFit = layer?.objectFit || element.style.objectFit;
        syncManagedVideoElement({ video: element, currentTimeSeconds: layer?.currentTimeSeconds, playing: Boolean(this.#isPlaying && layer?.src) });
      }
      layers.videoColorOverlay.style.visibility = 'visible';
      layers.videoColorOverlay.style.background = color.backgroundColor;
      layers.videoColorOverlay.style.opacity = String(color.opacity);
      layers.videoEffect1.style.mixBlendMode = effect1.mixBlendMode;
      layers.videoEffect2.style.mixBlendMode = effect2.mixBlendMode;
      layers.image.style.visibility = 'hidden';
    } else {
      layers.videoBackground.style.visibility = 'hidden';
      layers.videoColorOverlay.style.visibility = 'hidden';
      layers.videoEffect1.style.visibility = 'hidden';
      layers.videoEffect2.style.visibility = 'hidden';
      layers.videoForeground.style.visibility = 'hidden';
      layers.image.style.visibility = 'visible';
    }
    

    // ── Task 2.1: Segment image display with gapless transitions ──
    // Swap image on segment boundary (gapless: no flash, instant switch)
    if (!isVideoSegment && segmentKey && segmentKey !== this.#activeSegmentKey) {
      this.#activeSegmentKey = segmentKey;
      this.#swapSegmentImage(layers.image, segmentKey);
    }

    if (isVideoSegment) {
      layers.dust.style.visibility = 'hidden';
      layers.dustFallback.style.visibility = 'hidden';
      layers.logo.style.visibility = 'hidden';
      layers.logoVideo.style.visibility = 'hidden';
      layers.logoCanvas.style.visibility = 'hidden';
      return;
    }

    // ── Task 2.2: Zoom motion — CSS transform: scale() with linear interpolation ──
    // SOURCE: Composition.tsx line 192-196 — interpolate with scaleTo
    const zoom = resolveZoomRange(segment.motion);
    const scale = interpolateLinear(zoom.from, zoom.to, localProgress);
    const x = interpolateLinear(zoom.fromX, zoom.toX, localProgress);
    const y = interpolateLinear(zoom.fromY, zoom.toY, localProgress);
    const { imageWidth, imageHeight } = resolveActiveImageDimensions({
      activeUrl: segmentKey,
      segment,
      cacheImage: this.#imageCache.get(segmentKey),
      imageElement: layers.image,
    });
    const viewportWidth = this.#dom.stage.clientWidth || this.#container.clientWidth || 1920;
    const viewportHeight = this.#dom.stage.clientHeight || this.#container.clientHeight || 1080;
    const layer = resolveCoverPanLayer({
      viewportWidth,
      viewportHeight,
      imageWidth,
      imageHeight,
      scale,
      x,
      y,
    });
    const imageStyle = resolveCoverPanImageStyle(layer);
    layers.image.style.width = imageStyle.width;
    layers.image.style.height = imageStyle.height;
    layers.image.style.left = imageStyle.left;
    layers.image.style.top = imageStyle.top;
    layers.image.style.objectFit = imageStyle.objectFit;
    layers.image.style.transform = imageStyle.transform;
    layers.image.style.transformOrigin = imageStyle.transformOrigin;
    layers.image.style.willChange = imageStyle.willChange;

    // Apply filter (contrast + saturation)
    // SOURCE: Composition.tsx line 206 — filter property
    const filterEnabled = segment.filter?.enabled !== false;
    layers.image.style.filter = filterEnabled ? 'contrast(1.06) saturate(0.92)' : 'none';

    // ── Task 2.3/2.4: Dust overlay — video or CSS pseudo-dust fallback ──
    // SOURCE: Composition.tsx line 210 — segment.dust?.enabled !== false
    const dustEnabled = segment.dust?.enabled !== false;
    if (dustEnabled) {
      const dustSrc = segment.dust?.src || this._dustWebmUrl;
      if (dustSrc) {
        if (layers.dust.getAttribute('src') !== dustSrc) {
          layers.dust.src = dustSrc;
          layers.dust.load();
        }
        layers.dust.style.visibility = 'visible';
        layers.dust.style.opacity = String(segment.dust?.opacity ?? DUST_VIDEO_OPACITY);
        layers.dust.style.mixBlendMode = segment.dust?.blendMode || 'screen';
        layers.dustFallback.style.visibility = 'hidden';
        if (this.#isPlaying) {
          void layers.dust.play().catch(() => {});
        } else {
          layers.dust.pause();
        }
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
        const chromaKey = shouldChromaKeyLogo(this._logoUrl);
        layers.logo.style.visibility = 'hidden';
        layers.logoVideo.style.visibility = chromaKey ? 'hidden' : 'visible';
        layers.logoCanvas.style.visibility = chromaKey ? 'visible' : 'hidden';
        if (layers.logoVideo.getAttribute('src') !== this._logoUrl) {
          layers.logoVideo.src = this._logoUrl;
        }
        if (this.#isPlaying) {
          void layers.logoVideo.play().catch(() => {});
        } else {
          layers.logoVideo.pause();
        }
        if (chromaKey) drawChromaKeyVideoFrame(layers.logoVideo, layers.logoCanvas);
      } else {
        // Static image logo — use <img> element
        layers.logoVideo.style.visibility = 'hidden';
        layers.logoCanvas.style.visibility = 'hidden';
        layers.logo.style.visibility = 'visible';
        if (layers.logo.getAttribute('src') !== this._logoUrl) {
          layers.logo.src = this._logoUrl;
        }
      }
    } else {
      layers.logo.style.visibility = 'hidden';
      layers.logoVideo.style.visibility = 'hidden';
      layers.logoCanvas.style.visibility = 'hidden';
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
