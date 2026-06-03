export const LOGO_LEFT = 52;
export const LOGO_TOP = 38;
export const LOGO_WIDTH = 220;
export const LOGO_HEIGHT = 124;
export const LOGO_OPACITY = 0.94;
export const LOGO_DROP_SHADOW = 'drop-shadow(0 10px 24px rgba(0,0,0,0.55))';
export const MUNDIAL_LOGO_LEFT = -28;
export const MUNDIAL_LOGO_TOP = -6;
export const MUNDIAL_LOGO_WIDTH = 275;
export const MUNDIAL_LOGO_HEIGHT = 155;
export const CHROMA_KEY_LOGO_PATTERN = /(?:logo-green\.mp4|logo-colombia\.webm)(?:$|[?#])/i;
export const GREEN_SCREEN_LOGO_PATTERN = CHROMA_KEY_LOGO_PATTERN;
export const MUNDIAL_LOGO_PATTERN = /logo-mundial\.png(?:$|[?#])/i;
export const CHROMA_GREEN_MIN = 80;
export const CHROMA_GREEN_DOMINANCE = 1.22;
export const CHROMA_EDGE_ALPHA = 0.42;

export function shouldChromaKeyLogo(src = '') {
  return CHROMA_KEY_LOGO_PATTERN.test(src || '');
}

export function resolveLogoImageLayout(src = '') {
  if (MUNDIAL_LOGO_PATTERN.test(src || '')) {
    return {
      left: MUNDIAL_LOGO_LEFT,
      top: MUNDIAL_LOGO_TOP,
      width: MUNDIAL_LOGO_WIDTH,
      height: MUNDIAL_LOGO_HEIGHT,
    };
  }
  return {
    left: LOGO_LEFT,
    top: LOGO_TOP,
    width: LOGO_WIDTH,
    height: LOGO_HEIGHT,
  };
}

export function drawChromaKeyVideoFrame(video, canvas) {
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
