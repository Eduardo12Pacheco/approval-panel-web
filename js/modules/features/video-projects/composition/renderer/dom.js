import {
  LOGO_DROP_SHADOW,
  LOGO_HEIGHT,
  LOGO_LEFT,
  LOGO_OPACITY,
  LOGO_TOP,
  LOGO_WIDTH,
} from './logo-chroma.js';
import {
  VIDEO_SEGMENT_EFFECT_01_URL,
  VIDEO_SEGMENT_EFFECT_02_URL,
  VIDEO_SEGMENT_OVERLAY_COLOR,
  VIDEO_SEGMENT_OVERLAY_OPACITY,
} from './video-layers.js';

export const DUST_FALLBACK_OPACITY = 0.28;
export const DUST_VIDEO_OPACITY = 0.36;
export const OUTRO_BG_COLOR = '#11100e';
export const OUTRO_TEXT_COLOR = '#f5d09a';
export const OUTRO_FONT_SIZE = 72;

export function buildCompositionDOM(container) {
  const stage = document.createElement('div');
  stage.className = 'composition-stage';
  stage.style.cssText = 'position:relative;width:100%;height:100%;overflow:hidden;background:#000;isolation:isolate;';

  const bg = document.createElement('div');
  bg.className = 'composition-layer composition-layer--bg';
  bg.style.cssText = 'position:absolute;inset:0;background:#000;';
  stage.appendChild(bg);

  const videoBackground = document.createElement('video');
  videoBackground.className = 'composition-layer composition-layer--video-background';
  videoBackground.style.cssText = 'position:absolute;inset:0;z-index:0;width:100%;height:100%;object-fit:cover;transform:scale(1.08);pointer-events:none;visibility:hidden;';
  videoBackground.muted = true;
  videoBackground.playsInline = true;
  videoBackground.preload = 'auto';
  stage.appendChild(videoBackground);

  const videoColorOverlay = document.createElement('div');
  videoColorOverlay.className = 'composition-layer composition-layer--video-color-overlay';
  videoColorOverlay.style.cssText = `position:absolute;inset:0;z-index:1;background:${VIDEO_SEGMENT_OVERLAY_COLOR};opacity:${VIDEO_SEGMENT_OVERLAY_OPACITY};pointer-events:none;visibility:hidden;`;
  stage.appendChild(videoColorOverlay);

  const videoEffect2 = document.createElement('video');
  videoEffect2.className = 'composition-layer composition-layer--video-effect-02';
  videoEffect2.style.cssText = 'position:absolute;inset:0;z-index:2;width:100%;height:100%;object-fit:cover;mix-blend-mode:multiply;pointer-events:none;visibility:hidden;';
  videoEffect2.muted = true;
  videoEffect2.loop = true;
  videoEffect2.playsInline = true;
  videoEffect2.preload = 'auto';
  videoEffect2.src = VIDEO_SEGMENT_EFFECT_02_URL;
  stage.appendChild(videoEffect2);

  const videoEffect1 = document.createElement('video');
  videoEffect1.className = 'composition-layer composition-layer--video-effect-01';
  videoEffect1.style.cssText = 'position:absolute;inset:0;z-index:3;width:100%;height:100%;object-fit:cover;mix-blend-mode:screen;pointer-events:none;visibility:hidden;';
  videoEffect1.muted = true;
  videoEffect1.loop = true;
  videoEffect1.playsInline = true;
  videoEffect1.preload = 'auto';
  videoEffect1.src = VIDEO_SEGMENT_EFFECT_01_URL;
  stage.appendChild(videoEffect1);

  const videoForeground = document.createElement('video');
  videoForeground.className = 'composition-layer composition-layer--video-foreground';
  videoForeground.style.cssText = 'position:absolute;inset:0;z-index:4;width:100%;height:100%;object-fit:contain;pointer-events:none;visibility:hidden;';
  videoForeground.muted = true;
  videoForeground.playsInline = true;
  videoForeground.preload = 'auto';
  stage.appendChild(videoForeground);

  const newspaperBackground = document.createElement('img');
  newspaperBackground.className = 'composition-layer composition-layer--newspaper-bg';
  newspaperBackground.style.cssText = 'position:absolute;inset:0;z-index:4;width:100%;height:100%;object-fit:cover;object-position:center top;filter:blur(15px);transform:scale(1.08);pointer-events:none;visibility:hidden;';
  newspaperBackground.draggable = false;
  stage.appendChild(newspaperBackground);

  const newspaperForeground = document.createElement('img');
  newspaperForeground.className = 'composition-layer composition-layer--newspaper-foreground';
  newspaperForeground.style.cssText = 'position:absolute;inset:0;z-index:5;width:100%;height:100%;object-fit:contain;object-position:center center;transform-origin:center center;will-change:transform;pointer-events:none;visibility:hidden;';
  newspaperForeground.draggable = false;
  stage.appendChild(newspaperForeground);

  const newspaperLabel = document.createElement('div');
  newspaperLabel.className = 'composition-layer composition-layer--newspaper-label';
  newspaperLabel.style.cssText = 'position:absolute;left:auto;right:40px;top:40px;bottom:auto;width:max-content;height:auto;z-index:8;color:#000;background:transparent;padding:0;border-radius:0;font-family:"Versa Versa", Versa, VERSA, Inter, Arial, sans-serif;font-size:18px;font-weight:900;line-height:1.12;text-align:center;letter-spacing:0.02em;transform:none;pointer-events:none;visibility:hidden;';
  newspaperLabel.innerHTML = '<span>RECREACIÓN</span><br><span>ARTÍSTICA</span>';
  stage.appendChild(newspaperLabel);

  const image = document.createElement('img');
  image.className = 'composition-layer composition-layer--image';
  image.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;object-fit:fill;object-position:center center;transform-origin:center center;will-change:transform;visibility:hidden;';
  image.draggable = false;
  stage.appendChild(image);

  const dust = document.createElement('video');
  dust.className = 'composition-layer composition-layer--dust';
  dust.style.cssText = `position:absolute;inset:0;width:100%;height:100%;object-fit:cover;mix-blend-mode:screen;opacity:${DUST_VIDEO_OPACITY};pointer-events:none;visibility:hidden;`;
  dust.muted = true;
  dust.loop = true;
  dust.playsInline = true;
  stage.appendChild(dust);

  const dustFallback = document.createElement('div');
  dustFallback.className = 'composition-layer composition-layer--dust-fallback';
  dustFallback.style.cssText = `position:absolute;inset:0;mix-blend-mode:screen;opacity:${DUST_FALLBACK_OPACITY};pointer-events:none;visibility:hidden;background-image:radial-gradient(circle at 20% 30%, rgba(255,255,255,0.20) 0 1px, transparent 2px), radial-gradient(circle at 70% 60%, rgba(255,255,255,0.12) 0 1px, transparent 2px);background-size:140px 140px, 220px 220px;`;
  stage.appendChild(dustFallback);

  const logo = document.createElement('img');
  logo.className = 'composition-layer composition-layer--logo';
  logo.style.cssText = `position:absolute;left:${LOGO_LEFT}px;top:${LOGO_TOP}px;z-index:7;width:${LOGO_WIDTH}px;height:${LOGO_HEIGHT}px;opacity:${LOGO_OPACITY};filter:${LOGO_DROP_SHADOW};object-fit:contain;pointer-events:none;visibility:hidden;`;
  logo.draggable = false;
  stage.appendChild(logo);

  const logoVideo = document.createElement('video');
  logoVideo.className = 'composition-layer composition-layer--logo-video';
  logoVideo.style.cssText = `position:absolute;inset:0;z-index:7;width:100%;height:100%;opacity:${LOGO_OPACITY};object-fit:cover;pointer-events:none;visibility:hidden;`;
  logoVideo.muted = true;
  logoVideo.loop = true;
  logoVideo.playsInline = true;
  stage.appendChild(logoVideo);

  const logoCanvas = document.createElement('canvas');
  logoCanvas.className = 'composition-layer composition-layer--logo-canvas';
  logoCanvas.style.cssText = `position:absolute;inset:0;z-index:7;width:100%;height:100%;opacity:${LOGO_OPACITY};pointer-events:none;visibility:hidden;`;
  stage.appendChild(logoCanvas);

  const outro = document.createElement('div');
  outro.className = 'composition-layer composition-layer--outro';
  outro.style.cssText = `position:absolute;inset:0;background:${OUTRO_BG_COLOR};display:grid;place-items:center;visibility:hidden;pointer-events:none;`;
  const outroVideo = document.createElement('video');
  outroVideo.className = 'composition-layer composition-layer--outro-video';
  outroVideo.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;visibility:hidden;pointer-events:none;';
  outroVideo.muted = false;
  outroVideo.playsInline = true;
  outroVideo.preload = 'auto';
  outro.appendChild(outroVideo);
  const outroText = document.createElement('div');
  outroText.style.cssText = `color:${OUTRO_TEXT_COLOR};font-family:Inter,sans-serif;font-size:${OUTRO_FONT_SIZE}px;font-weight:900;`;
  outroText.textContent = 'Gracias por mirar';
  outro.appendChild(outroText);
  stage.appendChild(outro);

  container.appendChild(stage);

  return {
    stage,
    layers: { bg, videoBackground, videoColorOverlay, videoEffect1, videoEffect2, videoForeground, newspaperBackground, newspaperForeground, newspaperLabel, image, dust, dustFallback, logo, logoVideo, logoCanvas, outro, outroVideo, outroText },
  };
}
