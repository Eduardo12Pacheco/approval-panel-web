import { resolveVideoSegmentEffectUrl } from '../overlay-assets.js';
import { clamp, finiteNumber } from './frame-math.js';

export const VIDEO_SEGMENT_OVERLAY_COLOR = '#3835AF';
export const VIDEO_SEGMENT_OVERLAY_OPACITY = 0.3;
export const VIDEO_SEGMENT_EFFECT_02_URL = resolveVideoSegmentEffectUrl('effect-layer-02');
export const VIDEO_SEGMENT_EFFECT_01_URL = resolveVideoSegmentEffectUrl('effect-layer-01');
export const VIDEO_METADATA_READY_STATE = 1;
export const MANAGED_VIDEO_PENDING_SYNC_KEY = Symbol('managedVideoPendingSync');

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
      { name: 'effect-layer-02', src: media.effect2Src || VIDEO_SEGMENT_EFFECT_02_URL, currentTimeSeconds, mixBlendMode: media.effect2BlendMode || 'multiply' },
      { name: 'effect-layer-01', src: media.effect1Src || VIDEO_SEGMENT_EFFECT_01_URL, currentTimeSeconds, mixBlendMode: media.effect1BlendMode || 'screen' },
      { name: 'foreground-video', src: sourceVideoSrc, currentTimeSeconds, objectFit: 'contain' },
    ],
  };
}

export function isVideoSource(src) {
  return /\.(mp4|webm|mov|m4v)$/i.test(src || '');
}

function seekVideoElement(video, timeSeconds) {
  if (!video) return;
  const next = finiteNumber(timeSeconds, 0);
  if (Math.abs(Number(video.currentTime || 0) - next) > 0.04) {
    try { video.currentTime = next; } catch {}
  }
}

function hasInsufficientMetadata(video) {
  return typeof video?.readyState === 'number' && video.readyState < VIDEO_METADATA_READY_STATE;
}

function applyManagedVideoSync({ video, currentTimeSeconds = 0, playing = false } = {}) {
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

function deferManagedVideoSyncUntilReady({ video, currentTimeSeconds = 0, playing = false } = {}) {
  if (!video?.addEventListener) return false;

  const pending = video[MANAGED_VIDEO_PENDING_SYNC_KEY];
  if (pending) {
    pending.currentTimeSeconds = currentTimeSeconds;
    pending.playing = playing;
    return true;
  }

  const next = { currentTimeSeconds, playing, ready: null };
  const cleanup = () => {
    try { video.removeEventListener?.('loadedmetadata', next.ready); } catch {}
    try { video.removeEventListener?.('canplay', next.ready); } catch {}
    if (video[MANAGED_VIDEO_PENDING_SYNC_KEY] === next) {
      delete video[MANAGED_VIDEO_PENDING_SYNC_KEY];
    }
  };
  next.ready = () => {
    if (hasInsufficientMetadata(video)) return;
    cleanup();
    applyManagedVideoSync({ video, currentTimeSeconds: next.currentTimeSeconds, playing: next.playing });
  };

  video[MANAGED_VIDEO_PENDING_SYNC_KEY] = next;
  try { video.addEventListener('loadedmetadata', next.ready, { once: true }); } catch {}
  try { video.addEventListener('canplay', next.ready, { once: true }); } catch {}
  return true;
}

export function syncManagedVideoElement({ video, currentTimeSeconds = 0, playing = false } = {}) {
  if (!video) return false;
  try { video.muted = true; } catch {}
  try { video.playsInline = true; } catch {}
  if (hasInsufficientMetadata(video)) {
    return deferManagedVideoSyncUntilReady({ video, currentTimeSeconds, playing });
  }
  return applyManagedVideoSync({ video, currentTimeSeconds, playing });
}
