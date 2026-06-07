export const WHIP_TRANSITION_DURATION_SECONDS = 0.43;
export const WHIP_BROWSER_SFX_URL = './assets/sfx/sound-whosh.wav';
export const WHIP_PREVIEW_SFX_VOLUME = 0.85;
export const WHIP_SMEAR_SAMPLE_COUNT = 7;
const GLITCH_TRANSITIONS = new Set(['glitch-1', 'glitch-2', 'glitch-3']);

function toFiniteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toSafeDuration(value) {
  const duration = Number(value);
  if (!Number.isFinite(duration) || duration <= 0) return WHIP_TRANSITION_DURATION_SECONDS;
  return Math.min(duration, WHIP_TRANSITION_DURATION_SECONDS);
}

function easeInOutCubic(value) {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped < 0.5 ? 4 * clamped * clamped * clamped : 1 - Math.pow(-2 * clamped + 2, 3) / 2;
}

function resolveRowId(row = {}) {
  return (row?.rowId || row?.id || '').toString();
}

function isActiveWhipBoundary(row = {}, nextRow = null) {
  if (!row || !nextRow) return false;
  if (row.paragraphBoundaryAfter !== true) return false;
  if (String(row.transition || '').trim().toLowerCase() !== 'whip') return false;
  const expectedNextRowId = (row.nextRowId || '').toString();
  if (expectedNextRowId && expectedNextRowId !== resolveRowId(nextRow)) return false;
  return true;
}

function isActiveOverlayVideoBoundary(row = {}, nextRow = null) {
  if (!row || !nextRow) return false;
  if (row.paragraphBoundaryAfter !== true) return false;
  if (!GLITCH_TRANSITIONS.has(String(row.transition || '').trim().toLowerCase())) return false;
  if (row.transitionConfig?.type !== 'overlay-video') return false;
  const expectedNextRowId = (row.nextRowId || '').toString();
  if (expectedNextRowId && expectedNextRowId !== resolveRowId(nextRow)) return false;
  return true;
}

function resolveBoundaryCutTime(row = {}, nextRow = {}) {
  const nextStart = Number(nextRow?.startTime);
  if (Number.isFinite(nextStart)) return nextStart;
  return toFiniteNumber(row?.endTime, toFiniteNumber(row?.effectiveEndTime, 0));
}

export function buildWhipPreviewEvents(rows = [], { sfxUrl = WHIP_BROWSER_SFX_URL } = {}) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  const events = [];
  for (let index = 0; index < sourceRows.length - 1; index += 1) {
    const row = sourceRows[index] || {};
    const nextRow = sourceRows[index + 1] || null;
    if (!isActiveWhipBoundary(row, nextRow)) continue;
    const previousImage = (row.image || row.previewUrl || row.selectedAssetId || '').toString();
    const nextImage = (nextRow?.image || nextRow?.previewUrl || nextRow?.selectedAssetId || '').toString();
    if (!previousImage || !nextImage) continue;
    const durationSeconds = toSafeDuration(row.transitionConfig?.durationSeconds);
    const cutTime = resolveBoundaryCutTime(row, nextRow);
    const startTime = Math.max(0, Number((cutTime - durationSeconds / 2).toFixed(6)));
    const endTime = Number((startTime + durationSeconds).toFixed(6));
    const rowId = resolveRowId(row);
    const nextRowId = resolveRowId(nextRow);
    events.push({
      id: `${rowId || index}->${nextRowId || index + 1}:whip:${cutTime}`,
      rowId,
      nextRowId,
      cutTime,
      startTime,
      endTime,
      durationSeconds,
      previousImage,
      nextImage,
      sfx: row.sfx === 'whip' || row.sfx?.type === 'whip' ? 'whip' : null,
      sfxUrl,
      direction: row.transitionConfig?.direction || 'left-to-right',
    });
  }
  return events;
}

export function buildBoundaryVideoPreviewEvents(rows = []) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  const events = [];
  for (let index = 0; index < sourceRows.length - 1; index += 1) {
    const row = sourceRows[index] || {};
    const nextRow = sourceRows[index + 1] || null;
    if (!isActiveOverlayVideoBoundary(row, nextRow)) continue;
    const transitionConfig = row.transitionConfig || {};
    const durationSeconds = toFiniteNumber(transitionConfig.durationSeconds, 0);
    if (durationSeconds <= 0) continue;
    const src = (transitionConfig.previewUrl || transitionConfig.src || '').toString();
    if (!src) continue;
    const cutTime = resolveBoundaryCutTime(row, nextRow);
    const startTime = Math.max(0, Number((cutTime - durationSeconds / 2).toFixed(6)));
    const endTime = Number((startTime + durationSeconds).toFixed(6));
    const rowId = resolveRowId(row);
    const nextRowId = resolveRowId(nextRow);
    events.push({
      id: `${rowId || index}->${nextRowId || index + 1}:${row.transition}:${cutTime}`,
      type: 'overlay-video',
      transition: row.transition,
      rowId,
      nextRowId,
      cutTime,
      startTime,
      endTime,
      durationSeconds,
      src,
      audio: transitionConfig.audio === true,
      audioUrl: src,
      blendMode: transitionConfig.blendMode || 'screen',
    });
  }
  return events;
}

function buildSmearSamples({ src, smear, opacity, blur, scale, contrast }) {
  const center = (WHIP_SMEAR_SAMPLE_COUNT - 1) / 2;
  return Array.from({ length: WHIP_SMEAR_SAMPLE_COUNT }, (_, index) => {
    const ratio = (index - center) / center;
    const offset = Number((ratio * smear).toFixed(3));
    const sampleOpacity = Number((opacity * (0.18 + (1 - Math.abs(ratio)) * 0.22)).toFixed(3));
    return {
      src,
      transform: `translate3d(${offset}%, 0, 0) scale(${scale})`,
      filter: `blur(${blur}px) contrast(${contrast}) saturate(0.96)`,
      opacity: String(sampleOpacity),
    };
  });
}

function resolveLayerStyles(progress, event) {
  const clamped = Math.max(0, Math.min(1, progress));
  const eased = easeInOutCubic(clamped);
  const intensity = Math.sin(clamped * Math.PI);
  const previousTranslate = Number((eased * 120).toFixed(3));
  const nextTranslate = Number((-35 + eased * 35).toFixed(3));
  const smear = Number((intensity * 16).toFixed(3));
  const blur = Number((intensity * 10).toFixed(3));
  const previousOpacity = Number((1 - clamped * 0.22).toFixed(3));
  const nextOpacity = Number((0.58 + clamped * 0.42).toFixed(3));
  const previousScale = Number((1.035 + intensity * 0.018).toFixed(4));
  const nextScale = Number((1.015 + intensity * 0.012).toFixed(4));
  return {
    previous: {
      transform: `translate3d(${previousTranslate}%, 0, 0) scale(${previousScale})`,
      filter: `blur(${blur}px) contrast(1.08) saturate(0.95)`,
      opacity: String(previousOpacity),
      samples: buildSmearSamples({
        src: event.previousImage,
        smear,
        opacity: intensity,
        blur,
        scale: previousScale,
        contrast: 1.08,
      }),
    },
    next: {
      transform: `translate3d(${nextTranslate}%, 0, 0) scale(${nextScale})`,
      filter: `blur(${Number((blur * 0.86).toFixed(3))}px) contrast(1.05) saturate(0.96)`,
      opacity: String(nextOpacity),
      samples: buildSmearSamples({
        src: event.nextImage,
        smear: Number((smear * 0.82).toFixed(3)),
        opacity: intensity,
        blur: Number((blur * 0.86).toFixed(3)),
        scale: nextScale,
        contrast: 1.05,
      }),
    },
  };
}

export function resolveWhipPreviewFrame(time, events = []) {
  const currentTime = Number(time);
  if (!Number.isFinite(currentTime)) return null;
  const event = (Array.isArray(events) ? events : []).find((item) => currentTime >= item.startTime && currentTime <= item.endTime);
  if (!event) return null;
  const progress = Math.max(0, Math.min(1, Number(((currentTime - event.startTime) / event.durationSeconds).toFixed(6))));
  const styles = resolveLayerStyles(progress, event);
  return {
    event,
    progress,
    previous: { src: event.previousImage, ...styles.previous },
    next: { src: event.nextImage, ...styles.next },
  };
}

export function resolveBoundaryVideoPreviewFrame(time, events = []) {
  const currentTime = Number(time);
  if (!Number.isFinite(currentTime)) return null;
  const event = (Array.isArray(events) ? events : []).find((item) => currentTime >= item.startTime && currentTime <= item.endTime);
  if (!event) return null;
  return {
    event,
    src: event.src,
    localTime: Math.max(0, Number((currentTime - event.startTime).toFixed(6))),
    blendMode: event.blendMode || 'screen',
  };
}

function applyLayerState(layer, state) {
  if (!layer) return;
  layer.draggable = false;
  if (!state) {
    layer.style.visibility = 'hidden';
    if (layer.children?.length) {
      Array.from(layer.children).forEach((sample) => {
        sample.style.visibility = 'hidden';
      });
    }
    return;
  }
  if (layer.src !== state.src) layer.src = state.src;
  layer.style.visibility = 'visible';
  layer.style.transform = state.transform;
  layer.style.filter = state.filter;
  layer.style.opacity = state.opacity;
  if (!layer.children?.length || !Array.isArray(state.samples)) return;
  Array.from(layer.children).forEach((sample, index) => {
    const sampleState = state.samples[index];
    if (!sampleState) {
      sample.style.visibility = 'hidden';
      return;
    }
    if (sample.src !== sampleState.src) sample.src = sampleState.src;
    sample.draggable = false;
    sample.style.visibility = 'visible';
    sample.style.transform = sampleState.transform;
    sample.style.filter = sampleState.filter;
    sample.style.opacity = sampleState.opacity;
  });
}

export function applyWhipOverlayLayers(layers = {}, frame = null) {
  applyLayerState(layers.whipPrevious, frame?.previous || null);
  applyLayerState(layers.whipNext, frame?.next || null);
}

export function applyBoundaryVideoOverlayLayer(layers = {}, frame = null, { playing = false } = {}) {
  const video = layers.boundaryTransitionVideo;
  if (!video) return;
  if (!frame?.src) {
    video.style.visibility = 'hidden';
    try { video.pause?.(); } catch {}
    return;
  }
  if (video.getAttribute('src') !== frame.src) {
    video.src = frame.src;
    video.load?.();
  }
  video.style.visibility = 'visible';
  video.style.mixBlendMode = frame.blendMode || 'screen';
  const localTime = Number(frame.localTime || 0);
  if (Number.isFinite(localTime) && Math.abs((video.currentTime || 0) - localTime) > 0.08) {
    try { video.currentTime = localTime; } catch {}
  }
  if (playing && video.paused) void video.play?.().catch?.(() => {});
  if (!playing && !video.paused) video.pause?.();
}

export function createWhipSfxScheduler({ audioFactory } = {}) {
  const played = new Set();
  let lastTime = null;
  const createAudio = typeof audioFactory === 'function'
    ? audioFactory
    : (src) => (typeof Audio === 'function' ? new Audio(src) : null);
  return {
    schedule({ event = null, currentTime = 0, playing = false } = {}) {
      const time = Number(currentTime);
      if (!Number.isFinite(time)) return false;
      if (lastTime !== null && time < lastTime) played.clear();
      lastTime = time;
      if (!playing || !event || event.sfx !== 'whip' || !event.sfxUrl) return false;
      const sfxStartTime = Number.isFinite(Number(event.sfxStartTime)) ? Number(event.sfxStartTime) : event.startTime;
      if (time < sfxStartTime || time > event.endTime) return false;
      const key = `${event.id}:sfx`;
      if (played.has(key)) return false;
      played.add(key);
      try {
        const audio = createAudio(event.sfxUrl);
        if (!audio) return false;
        audio.currentTime = 0;
        audio.volume = WHIP_PREVIEW_SFX_VOLUME;
        void audio.play?.().catch?.(() => {});
        return true;
      } catch {
        return false;
      }
    },
    reset() {
      played.clear();
      lastTime = null;
    },
  };
}

export function createBoundaryVideoAudioScheduler({ audioFactory } = {}) {
  const played = new Set();
  let lastTime = null;
  const createAudio = typeof audioFactory === 'function'
    ? audioFactory
    : (src) => (typeof Audio === 'function' ? new Audio(src) : null);
  return {
    schedule({ event = null, currentTime = 0, playing = false } = {}) {
      const time = Number(currentTime);
      if (!Number.isFinite(time)) return false;
      if (lastTime !== null && time < lastTime) played.clear();
      lastTime = time;
      if (!playing || !event?.audio || !event.audioUrl) return false;
      if (time < event.startTime || time > event.endTime) return false;
      const key = `${event.id}:audio`;
      if (played.has(key)) return false;
      played.add(key);
      try {
        const audio = createAudio(event.audioUrl);
        if (!audio) return false;
        audio.currentTime = 0;
        audio.volume = 0.9;
        void audio.play?.().catch?.(() => {});
        return true;
      } catch {
        return false;
      }
    },
    reset() {
      played.clear();
      lastTime = null;
    },
  };
}
