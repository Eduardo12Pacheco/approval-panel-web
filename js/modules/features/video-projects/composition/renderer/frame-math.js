const ZOOM_SLOW_IN = { from: 1.0, to: 1.1 };
const NEWSPAPER_FOREGROUND_ZOOM = { from: 1.0, to: 1.25 };

export const DEFAULT_FPS = 30;
export const OUTRO_DURATION_SECONDS = 30;
export const PRELOAD_IMAGE_WINDOW_SIZE = 2;

export function secondsToFrame(seconds, fps = DEFAULT_FPS) {
  return Math.round(seconds * fps);
}

export function frameToSeconds(frame, fps = DEFAULT_FPS) {
  return frame / fps;
}

export function interpolateLinear(start, end, progress) {
  const clamped = Math.max(0, Math.min(1, progress));
  return start + (end - start) * clamped;
}

export function finitePositive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

export function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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

export function resolveZoomRange(motion) {
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

function resolveComparableUrl(url) {
  if (!url) return '';
  try {
    return new URL(url, globalThis.document?.baseURI || globalThis.location?.href || 'http://localhost/').href;
  } catch {
    return String(url);
  }
}

export function resolveMediaMode(value) {
  return String(value || '').trim().toLowerCase() === 'newspaper' ? 'newspaper' : 'image';
}

export function resolveNewspaperMotion() {
  return { from: NEWSPAPER_FOREGROUND_ZOOM.from, to: NEWSPAPER_FOREGROUND_ZOOM.to, fromX: 0, fromY: 0, toX: 0, toY: 0 };
}

export function resolveNewspaperImageStyles({ progress = 0 } = {}) {
  const scale = interpolateLinear(NEWSPAPER_FOREGROUND_ZOOM.from, NEWSPAPER_FOREGROUND_ZOOM.to, progress);
  return {
    background: {
      objectFit: 'cover',
      objectPosition: 'center top',
      filter: 'blur(20px)',
      transform: 'scale(1.08)',
    },
    foreground: {
      width: '100%',
      height: '100%',
      objectFit: 'contain',
      objectPosition: 'center top',
      transform: `scale(${Number(scale.toFixed(4))})`,
      transformOrigin: 'center top',
    },
    label: {
      lines: ['RECREACIÓN', 'ARTÍSTICA'],
      fontFamily: 'VERSA, Inter, Arial, sans-serif',
    },
  };
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

export function resolveActiveSegment(time, rows, outroDuration = OUTRO_DURATION_SECONDS, { compositionDurationSeconds } = {}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { type: 'empty' };
  }

  const latestEnd = rows.reduce((max, seg) => Math.max(max, Number(seg.endTime) || 0), 0);
  const officialCompositionEnd = finitePositive(compositionDurationSeconds, latestEnd);

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

  if (time < officialCompositionEnd && latestEnd < officialCompositionEnd) {
    const lastSegment = rows[rows.length - 1];
    const start = Number(lastSegment?.startTime) || 0;
    const duration = Math.max(0, officialCompositionEnd - start);
    const localTime = Math.max(0, time - start);
    const localProgress = duration > 0 ? Math.min(1, localTime / duration) : 1;
    return { type: 'segment', segment: lastSegment, localProgress, localTime };
  }

  const outroStart = officialCompositionEnd;
  const outroEnd = outroStart + outroDuration;

  if (time >= outroStart && time < outroEnd) {
    const localTime = time - outroStart;
    const localProgress = outroDuration > 0 ? localTime / outroDuration : 0;
    return { type: 'outro', localProgress, localTime };
  }

  if (time >= outroEnd) {
    return { type: 'outro', localProgress: 1, localTime: outroDuration };
  }

  return { type: 'empty' };
}
