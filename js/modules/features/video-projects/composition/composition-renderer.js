import { AudioManager } from '../audio/audio-manager.js';
import { DEFAULT_MUSIC_VOLUME } from '../domain/editor-state.js';
import {
  DEFAULT_FPS,
  DUST_VIDEO_OPACITY,
  OUTRO_DURATION_SECONDS,
  PRELOAD_IMAGE_WINDOW_SIZE,
  buildCompositionDOM,
  buildVideoSegmentPreviewLayerPlan,
  clearManagedVideoElement,
  drawChromaKeyVideoFrame,
  finitePositive,
  interpolateLinear,
  isVideoSource,
  resolveActiveImageDimensions,
  resolveActiveSegment,
  resolveCoverPanImageStyle,
  resolveCoverPanLayer,
  resolveZoomRange,
  shouldChromaKeyLogo,
  syncManagedVideoElement,
} from './renderer/index.js';

export { buildCompositionDOM, buildVideoSegmentPreviewLayerPlan, clearManagedVideoElement, frameToSeconds, interpolateLinear, isVideoSource, resolveActiveImageDimensions, resolveActiveSegment, resolveCoverPanImageStyle, resolveCoverPanLayer, secondsToFrame, syncManagedVideoElement } from './renderer/index.js';

// composition-renderer.js — Browser-local real-time composition preview facade.
// Pure helper modules live under composition/renderer/; this file keeps the
// public CompositionRenderer lifecycle and playback/audio sequencing stable.

export class CompositionRenderer {
  #container; #fps; #currentTime; #isPlaying; #assetsReady; #rows;
  #dom; #imageCache; #activeSegmentKey; #audio; #rafId; #audioStartToken;

  constructor({ container, fps = DEFAULT_FPS }) {
    this.#container = container;
    this.#fps = fps;
    this.#currentTime = 0;
    this.#isPlaying = false;
    this.#assetsReady = false;
    this.#rows = [];
    this.#imageCache = new Map();
    this.#activeSegmentKey = null;
    this.#audio = new AudioManager();
    this.#rafId = null;
    this.#audioStartToken = 0;
    this.#dom = buildCompositionDOM(container);
  }

  async preload({ dustWebmUrl, logoUrl, outroUrl, outroDurationSeconds, voiceUrl, musicUrl, voiceVolume, voiceMuted, musicVolume, musicMuted, musicFadeInSeconds, musicFadeOutSeconds, rows } = {}) {
    if (this._preloadInProgress) {
      return this._preloadInProgress;
    }

    this._preloadInProgress = (async () => {
      this._dustWebmUrl = dustWebmUrl || null;
      this._logoUrl = logoUrl || null;
      this._outroUrl = outroUrl || null;
      this._outroDurationSeconds = finitePositive(outroDurationSeconds, OUTRO_DURATION_SECONDS);
      this._voiceUrl = voiceUrl || null;
      this._musicUrl = musicUrl || null;

      this.#audio.configure({
        voiceVolume,
        voiceMuted,
        musicVolume,
        musicMuted,
        musicFadeInSeconds,
        musicFadeOutSeconds,
      });

      if (dustWebmUrl && this.#dom?.layers?.dust) {
        this.#dom.layers.dust.src = dustWebmUrl;
        this.#dom.layers.dust.preload = 'auto';
      }

      if (logoUrl && this.#dom?.layers?.logo) {
        this.#dom.layers.logo.src = logoUrl;
      }

      if (outroUrl && this.#dom?.layers?.outroVideo) {
        this.#dom.layers.outroVideo.src = outroUrl;
      }

      if (Array.isArray(rows) && rows.length > 0) {
        const imageUrls = rows
          .map((r) => r.image)
          .filter(Boolean);
        if (imageUrls.length > 0) {
          await this.preloadImages(imageUrls, { limit: PRELOAD_IMAGE_WINDOW_SIZE });
        }
      }

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
          // Ignore failed preloads — will fallback on render.
        }
      });
    await Promise.all(tasks);
  }

  update({ rows } = {}) {
    this.#rows = Array.isArray(rows) ? rows : [];
    this.#renderFrame();
  }

  updateAudioSettings({ voiceVolume, voiceMuted, musicVolume, musicMuted, musicFadeInSeconds, musicFadeOutSeconds } = {}) {
    this.#audio.configure({ voiceVolume, voiceMuted, musicVolume, musicMuted, musicFadeInSeconds, musicFadeOutSeconds });
    this.#audio.setVoiceVolume(voiceVolume ?? 1, voiceMuted ?? false);
    this.#audio.setMusicVolume(musicVolume ?? DEFAULT_MUSIC_VOLUME, musicMuted ?? false);
  }

  async play() {
    if (this.#isPlaying) return;
    this.#isPlaying = true;
    this.#startRafLoop();
    this.#scheduleAudioStart();
  }

  #scheduleAudioStart() {
    const token = ++this.#audioStartToken;
    void this.#startAudioForToken(token);
  }

  async #startAudioForToken(token) {
    const audioOk = await this.#audio.init();
    if (!audioOk || token !== this.#audioStartToken || !this.#isPlaying) return;

    if (audioOk && this.#audio.ctx) {
      await this.#audio.resume();
      if (token !== this.#audioStartToken || !this.#isPlaying) return;

      this.#audio.stopSources();
      const sources = this.#audio.createSources();
      this.#audio.setSources(sources);
      this.#audio.recordStartPosition(this.#currentTime);

      const offset = this.#currentTime;
      if (sources.voiceSource) {
        sources.voiceSource.start(0, offset);
      }
      if (sources.musicSource) {
        sources.musicSource.start(0, offset % this.#audio.getMusicBufferDuration());
      }

      this.#audio.scheduleFade(this.#currentTime, this.duration);
    }
  }

  pause() {
    if (!this.#isPlaying) return;
    this.#audioStartToken += 1;

    if (this.#audio.ctx && this.#audio.ctx.state === 'running') {
      this.#syncTimeFromAudio();
    }

    this.#audio.stopSources();
    this.#audio.suspend();
    this.#stopRafLoop();
    this.#isPlaying = false;
    this.#renderFrame();
  }

  seek(seconds) {
    const maxTime = this.duration;
    const wasPlaying = this.#isPlaying;
    this.#currentTime = Math.max(0, Math.min(seconds, maxTime));

    if (wasPlaying) {
      this.#audioStartToken += 1;
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

        this.#audio.scheduleFade(this.#currentTime, this.duration);
      } else {
        this.#scheduleAudioStart();
      }
    }

    this.#renderFrame();
  }

  destroy() {
    this.#audioStartToken += 1;
    this.pause();
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

  get currentTime() {
    return this.#currentTime;
  }

  get duration() {
    if (this.#rows.length === 0) return 0;
    const latestEnd = this.#rows.reduce(
      (max, seg) => Math.max(max, Number(seg.endTime) || 0),
      0,
    );
    return latestEnd + finitePositive(this._outroDurationSeconds, OUTRO_DURATION_SECONDS);
  }

  get isPlaying() {
    return this.#isPlaying;
  }

  get assetsReady() {
    return this.#assetsReady;
  }

  get currentSegment() {
    return resolveActiveSegment(this.#currentTime, this.#rows);
  }

  #startRafLoop() {
    this.#stopRafLoop();
    const tick = () => {
      this.#rafTick();
      this.#rafId = requestAnimationFrame(tick);
    };
    this.#rafId = requestAnimationFrame(tick);
  }

  #stopRafLoop() {
    if (this.#rafId !== null) {
      cancelAnimationFrame(this.#rafId);
      this.#rafId = null;
    }
  }

  #rafTick() {
    if (!this.#isPlaying) return;

    if (this.#audio.ctx && this.#audio.ctx.state === 'running') {
      this.#syncTimeFromAudio();
    } else {
      this.#currentTime = Math.min(this.#currentTime + 1 / 60, this.duration);
    }

    if (this.#currentTime >= this.duration) {
      this.#currentTime = this.duration;
      this.#renderFrame();
      this.pause();
      return;
    }

    this.#renderFrame();
  }

  #syncTimeFromAudio() {
    if (!this.#audio.ctx) return;
    this.#currentTime = this.#audio.computeCompositionTime();
    if (this.#currentTime > this.duration) {
      this.#currentTime = this.duration;
    }
  }

  #hideVideoSegmentLayers({ clear = false } = {}) {
    const videoLayers = [
      this.#dom?.layers?.videoBackground,
      this.#dom?.layers?.videoEffect1,
      this.#dom?.layers?.videoEffect2,
      this.#dom?.layers?.videoForeground,
    ];
    videoLayers.forEach((element) => {
      if (!element) return;
      element.style.visibility = 'hidden';
      if (clear && element.getAttribute?.('src')) clearManagedVideoElement(element);
    });
    if (this.#dom?.layers?.videoColorOverlay) this.#dom.layers.videoColorOverlay.style.visibility = 'hidden';
  }

  #renderFrame() {
    if (!this.#dom) return;

    const { layers } = this.#dom;
    const resolved = resolveActiveSegment(this.#currentTime, this.#rows, finitePositive(this._outroDurationSeconds, OUTRO_DURATION_SECONDS));

    if (resolved.type === 'empty') {
      this.#hideVideoSegmentLayers({ clear: true });
      layers.image.style.visibility = 'hidden';
      layers.dust.style.visibility = 'hidden';
      layers.dustFallback.style.visibility = 'hidden';
      layers.logo.style.visibility = 'hidden';
      layers.logoVideo.style.visibility = 'hidden';
      layers.logoCanvas.style.visibility = 'hidden';
      layers.outro.style.visibility = 'hidden';
      layers.outroVideo.style.visibility = 'hidden';
      this.#activeSegmentKey = null;
      return;
    }

    if (resolved.type === 'outro') {
      this.#hideVideoSegmentLayers({ clear: true });
      layers.image.style.visibility = 'hidden';
      layers.dust.style.visibility = 'hidden';
      layers.dustFallback.style.visibility = 'hidden';
      layers.logo.style.visibility = 'hidden';
      layers.logoVideo.style.visibility = 'hidden';
      layers.logoCanvas.style.visibility = 'hidden';
      layers.outro.style.visibility = 'visible';
      if (this._outroUrl) {
        layers.outroVideo.style.visibility = 'visible';
        layers.outroText.style.visibility = 'hidden';
        if (layers.outroVideo.getAttribute('src') !== this._outroUrl) {
          layers.outroVideo.src = this._outroUrl;
        }
        syncManagedVideoElement({ video: layers.outroVideo, currentTimeSeconds: resolved.localTime, playing: this.#isPlaying, muted: false });
      } else {
        layers.outroVideo.style.visibility = 'hidden';
        layers.outroText.style.visibility = 'visible';
      }
      this.#activeSegmentKey = null;
      return;
    }

    const { segment, localProgress, localTime } = resolved;
    const segmentKey = segment.image || '';

    layers.outro.style.visibility = 'hidden';
    const isVideoSegment = segment.media?.kind === 'video-segment';
    if (isVideoSegment) {
      const plan = buildVideoSegmentPreviewLayerPlan({ media: segment.media, localTime });
      const [background, color, effect2, effect1, foreground] = plan.layers;
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
      this.#hideVideoSegmentLayers({ clear: true });
      layers.image.style.visibility = 'visible';
    }

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
    const layer = resolveCoverPanLayer({ viewportWidth, viewportHeight, imageWidth, imageHeight, scale, x, y });
    const imageStyle = resolveCoverPanImageStyle(layer);
    layers.image.style.width = imageStyle.width;
    layers.image.style.height = imageStyle.height;
    layers.image.style.left = imageStyle.left;
    layers.image.style.top = imageStyle.top;
    layers.image.style.objectFit = imageStyle.objectFit;
    layers.image.style.transform = imageStyle.transform;
    layers.image.style.transformOrigin = imageStyle.transformOrigin;
    layers.image.style.willChange = imageStyle.willChange;

    const filterEnabled = segment.filter?.enabled !== false;
    layers.image.style.filter = filterEnabled ? 'contrast(1.06) saturate(0.92)' : 'none';

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
        layers.dust.style.visibility = 'hidden';
        layers.dustFallback.style.visibility = 'visible';
      }
    } else {
      layers.dust.style.visibility = 'hidden';
      layers.dustFallback.style.visibility = 'hidden';
    }

    const logoEnabled = segment.logo?.enabled !== false;
    if (logoEnabled && this._logoUrl) {
      if (isVideoSource(this._logoUrl)) {
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

  async #swapSegmentImage(imgEl, url) {
    if (this.#imageCache.has(url)) {
      imgEl.src = url;
      return;
    }

    try {
      const preloader = new Image();
      preloader.src = url;
      await preloader.decode();
      this.#imageCache.set(url, preloader);
      if (this.#activeSegmentKey === url) {
        imgEl.src = url;
      }
    } catch {
      imgEl.src = url;
    }
  }
}
