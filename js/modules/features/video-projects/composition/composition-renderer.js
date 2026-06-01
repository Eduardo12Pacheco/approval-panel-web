import { AudioManager } from '../audio/audio-manager.js';
import { DEFAULT_MUSIC_VOLUME } from '../domain/editor-state.js';
import {
  DEFAULT_FPS,
  DUST_VIDEO_OPACITY,
  OUTRO_DURATION_SECONDS,
  PRELOAD_IMAGE_WINDOW_SIZE,
  applyBoundaryVideoOverlayLayer,
  buildCompositionDOM,
  buildBoundaryVideoPreviewEvents,
  applyWhipOverlayLayers,
  buildVideoSegmentPreviewLayerPlan,
  buildWhipPreviewEvents,
  clearManagedVideoElement,
  createBoundaryVideoAudioScheduler,
  createWhipSfxScheduler,
  drawChromaKeyVideoFrame,
  finitePositive,
  interpolateLinear,
  isVideoSource,
  resolveActiveImageDimensions,
  resolveActiveSegment,
  resolveBoundaryVideoPreviewFrame,
  resolveCoverPanImageStyle,
  resolveCoverPanLayer,
  resolveMediaMode,
  resolveNewspaperImageStyles,
  resolveWhipPreviewFrame,
  resolveZoomRange,
  shouldChromaKeyLogo,
  syncManagedVideoElement,
} from './renderer/index.js';

export { applyBoundaryVideoOverlayLayer, applyWhipOverlayLayers, buildBoundaryVideoPreviewEvents, buildCompositionDOM, buildVideoSegmentPreviewLayerPlan, buildWhipPreviewEvents, clearManagedVideoElement, createBoundaryVideoAudioScheduler, createWhipSfxScheduler, frameToSeconds, interpolateLinear, isVideoSource, resolveActiveImageDimensions, resolveActiveSegment, resolveBoundaryVideoPreviewFrame, resolveCoverPanImageStyle, resolveCoverPanLayer, resolveMediaMode, resolveNewspaperImageStyles, resolveWhipPreviewFrame, secondsToFrame, syncManagedVideoElement } from './renderer/index.js';

// composition-renderer.js — Browser-local real-time composition preview facade.
// Pure helper modules live under composition/renderer/; this file keeps the
// public CompositionRenderer lifecycle and playback/audio sequencing stable.

const IMAGE_CACHE_MAX_SIZE = Math.max(PRELOAD_IMAGE_WINDOW_SIZE * 3, 24);

export class CompositionRenderer {
  #container; #fps; #currentTime; #isPlaying; #assetsReady; #rows;
  #dom; #imageCache; #imageCacheOrder; #videoPreloadCache; #activeSegmentKey; #audio; #whipSfx; #boundaryVideoAudio; #rafId; #audioStartToken;
  #viewportWidth; #viewportHeight; #frameCount;

  constructor({ container, fps = DEFAULT_FPS }) {
    this.#container = container;
    this.#fps = fps;
    this.#currentTime = 0;
    this.#isPlaying = false;
    this.#assetsReady = false;
    this.#rows = [];
    this.#imageCache = new Map();
    this.#imageCacheOrder = [];
    this.#videoPreloadCache = new Map();
    this.#activeSegmentKey = null;
    this.#audio = new AudioManager();
    this.#whipSfx = createWhipSfxScheduler();
    this.#boundaryVideoAudio = createBoundaryVideoAudioScheduler();
    this.#rafId = null;
    this.#audioStartToken = 0;
    this.#frameCount = 0;
    this.#dom = buildCompositionDOM(container);
    // Defer initial viewport read until the next animation frame to avoid
    // forced synchronous layout: buildCompositionDOM writes DOM, and reading
    // clientWidth/clientHeight immediately would force a sync reflow.
    this.#viewportWidth = 1920;
    this.#viewportHeight = 1080;
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => this.#updateViewportDimensions());
    } else {
      // Fallback for non-browser environments (tests, Node checks).
      setTimeout(() => this.#updateViewportDimensions(), 0);
    }
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

      // Guard against race: destroy() may null audio/dom while preload is in-flight.
      if (this.#audio) {
        this.#audio.configure({
          voiceVolume,
          voiceMuted,
          musicVolume,
          musicMuted,
          musicFadeInSeconds,
          musicFadeOutSeconds,
        });
      }

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
        this.#preloadVideoSegments(rows);
      }

      if ((voiceUrl || musicUrl) && this.#audio) {
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
          // LRU: track insertion order, evict oldest when over limit.
          this.#imageCacheOrder.push(url);
          while (this.#imageCacheOrder.length > IMAGE_CACHE_MAX_SIZE) {
            const oldest = this.#imageCacheOrder.shift();
            if (oldest) this.#imageCache.delete(oldest);
          }
        } catch {
          // Ignore failed preloads — will fallback on render.
        }
      });
    await Promise.all(tasks);
  }

  #preloadVideoSegments(rows = []) {
    const sources = rows
      .map((row) => row?.media?.kind === 'video-segment' ? (row.media.sourceVideoSrc || row.media.src || '') : '')
      .filter(Boolean);
    sources.forEach((src) => {
      if (this.#videoPreloadCache.has(src)) return;
      try {
        const video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.preload = 'auto';
        video.src = src;
        video.load?.();
        this.#videoPreloadCache.set(src, video);
      } catch {}
    });
  }

  update({ rows } = {}) {
    this.#rows = Array.isArray(rows) ? rows : [];
    this.#whipSfx?.reset?.();
    this.#boundaryVideoAudio?.reset?.();
    this.#renderFrame();
  }

  updateAudioSettings({ voiceVolume, voiceMuted, musicVolume, musicMuted, musicFadeInSeconds, musicFadeOutSeconds } = {}) {
    if (!this.#audio) return;
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
    this.#startAudioForToken(token);
  }

  #startAudioForToken(token) {
    const audioOk = this.#audio.init();
    if (!audioOk || token !== this.#audioStartToken || !this.#isPlaying) return;

    if (audioOk && this.#audio.ctx) {
      void this.#audio.resume().catch(() => {});

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
    this.#whipSfx?.reset?.();
    this.#boundaryVideoAudio?.reset?.();
    this.#whipSfx = null;
    this.#boundaryVideoAudio = null;

    if (this.#dom?.stage?.parentNode) {
      this.#dom.stage.parentNode.removeChild(this.#dom.stage);
    }
    this.#dom = null;
    this.#rows = [];
    this.#currentTime = 0;
    this.#assetsReady = false;
    this.#imageCache.clear();
    this.#imageCacheOrder.length = 0;
    this.#videoPreloadCache.clear();
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

    this.#frameCount += 1;

    if (this.#audio.ctx && this.#audio.ctx.state === 'running') {
      this.#syncTimeFromAudio();
    } else {
      this.#currentTime = Math.min(this.#currentTime + 1 / 60, this.duration);
    }

    // Refresh viewport cache lazily — layout reads are forced-sync expensive.
    if (this.#frameCount % 60 === 0) {
      this.#updateViewportDimensions();
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

  #updateViewportDimensions() {
    this.#viewportWidth = this.#dom?.stage?.clientWidth || this.#container?.clientWidth || 1920;
    this.#viewportHeight = this.#dom?.stage?.clientHeight || this.#container?.clientHeight || 1080;
  }

  #renderFrame() {
    if (!this.#dom) return;

    const { layers } = this.#dom;
    const resolved = resolveActiveSegment(this.#currentTime, this.#rows, finitePositive(this._outroDurationSeconds, OUTRO_DURATION_SECONDS));

    if (resolved.type === 'empty') {
      this.#hideVideoSegmentLayers({ clear: true });
      layers.image.style.visibility = 'hidden';
      layers.newspaperBackground.style.visibility = 'hidden';
      layers.newspaperForeground.style.visibility = 'hidden';
      layers.newspaperLabel.style.visibility = 'hidden';
      layers.dust.style.visibility = 'hidden';
      layers.dustFallback.style.visibility = 'hidden';
      layers.logo.style.visibility = 'hidden';
      layers.logoVideo.style.visibility = 'hidden';
      layers.logoCanvas.style.visibility = 'hidden';
      layers.outro.style.visibility = 'hidden';
      layers.outroVideo.style.visibility = 'hidden';
      applyWhipOverlayLayers(layers, null);
      applyBoundaryVideoOverlayLayer(layers, null);
      this.#activeSegmentKey = null;
      return;
    }

    if (resolved.type === 'outro') {
      this.#hideVideoSegmentLayers({ clear: true });
      layers.image.style.visibility = 'hidden';
      layers.newspaperBackground.style.visibility = 'hidden';
      layers.newspaperForeground.style.visibility = 'hidden';
      layers.newspaperLabel.style.visibility = 'hidden';
      layers.dust.style.visibility = 'hidden';
      layers.dustFallback.style.visibility = 'hidden';
      layers.logo.style.visibility = 'hidden';
      layers.logoVideo.style.visibility = 'hidden';
      layers.logoCanvas.style.visibility = 'hidden';
      layers.outro.style.visibility = 'visible';
      applyWhipOverlayLayers(layers, null);
      applyBoundaryVideoOverlayLayer(layers, null);
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
    const whipEvents = buildWhipPreviewEvents(this.#rows);
    const whipFrame = resolveWhipPreviewFrame(this.#currentTime, whipEvents);
    const boundaryVideoEvents = buildBoundaryVideoPreviewEvents(this.#rows);
    const boundaryVideoFrame = resolveBoundaryVideoPreviewFrame(this.#currentTime, boundaryVideoEvents);
    applyWhipOverlayLayers(layers, whipFrame);
    applyBoundaryVideoOverlayLayer(layers, boundaryVideoFrame, { playing: this.#isPlaying });
    this.#whipSfx?.schedule?.({ event: whipFrame?.event, currentTime: this.#currentTime, playing: this.#isPlaying });
    this.#boundaryVideoAudio?.schedule?.({ event: boundaryVideoFrame?.event, currentTime: this.#currentTime, playing: this.#isPlaying });
    const segmentKey = segment.image || '';

    layers.outro.style.visibility = 'hidden';
    layers.outroVideo.style.visibility = 'hidden';
    layers.outroText.style.visibility = 'hidden';
    const isVideoSegment = segment.media?.kind === 'video-segment';
    const isNewspaperMode = !isVideoSegment && resolveMediaMode(segment.mediaMode) === 'newspaper';
    const segmentRenderKey = `${isNewspaperMode ? 'newspaper' : isVideoSegment ? 'video' : 'image'}:${segmentKey}`;
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
      layers.newspaperBackground.style.visibility = 'hidden';
      layers.newspaperForeground.style.visibility = 'hidden';
      layers.newspaperLabel.style.visibility = 'hidden';
    } else if (isNewspaperMode) {
      this.#hideVideoSegmentLayers({ clear: false });
      layers.image.style.visibility = 'hidden';
      layers.image.src = '';
      layers.newspaperBackground.style.visibility = 'visible';
      layers.newspaperForeground.style.visibility = 'visible';
      layers.newspaperLabel.style.visibility = 'visible';
    } else {
      this.#hideVideoSegmentLayers({ clear: false });
      layers.newspaperBackground.style.visibility = 'hidden';
      layers.newspaperForeground.style.visibility = 'hidden';
      layers.newspaperLabel.style.visibility = 'hidden';
      layers.image.style.visibility = 'visible';
    }

    if (isNewspaperMode && segmentKey && segmentRenderKey !== this.#activeSegmentKey) {
      this.#activeSegmentKey = segmentRenderKey;
      this.#swapSegmentImage(layers.newspaperBackground, segmentKey, segmentRenderKey);
      this.#swapSegmentImage(layers.newspaperForeground, segmentKey, segmentRenderKey);
    } else if (!isVideoSegment && segmentKey && segmentRenderKey !== this.#activeSegmentKey) {
      this.#activeSegmentKey = segmentRenderKey;
      this.#swapSegmentImage(layers.image, segmentKey, segmentRenderKey);
    }

    if (isVideoSegment) {
      layers.dust.style.visibility = 'hidden';
      layers.dustFallback.style.visibility = 'hidden';
      layers.logo.style.visibility = 'hidden';
      layers.logoVideo.style.visibility = 'hidden';
      layers.logoCanvas.style.visibility = 'hidden';
      return;
    }

    if (isNewspaperMode) {
      const newspaperStyles = resolveNewspaperImageStyles({ progress: localProgress, motion: segment.motion, newspaper: segment.newspaper });
      layers.newspaperBackground.style.objectFit = newspaperStyles.background.objectFit;
      layers.newspaperBackground.style.objectPosition = newspaperStyles.background.objectPosition;
      layers.newspaperBackground.style.filter = newspaperStyles.background.filter;
      layers.newspaperBackground.style.transform = newspaperStyles.background.transform;
      layers.newspaperForeground.style.width = newspaperStyles.foreground.width;
      layers.newspaperForeground.style.height = newspaperStyles.foreground.height;
      layers.newspaperForeground.style.objectFit = newspaperStyles.foreground.objectFit;
      layers.newspaperForeground.style.objectPosition = newspaperStyles.foreground.objectPosition;
      layers.newspaperForeground.style.transform = newspaperStyles.foreground.transform;
      layers.newspaperForeground.style.transformOrigin = newspaperStyles.foreground.transformOrigin;
      layers.newspaperLabel.style.fontFamily = newspaperStyles.label.fontFamily;
      layers.newspaperLabel.style.fontSize = newspaperStyles.label.fontSize;
      layers.newspaperLabel.style.left = newspaperStyles.label.left;
      layers.newspaperLabel.style.right = newspaperStyles.label.right;
      layers.newspaperLabel.style.top = newspaperStyles.label.top;
      layers.newspaperLabel.style.bottom = newspaperStyles.label.bottom;
      layers.newspaperLabel.style.width = newspaperStyles.label.width;
      layers.newspaperLabel.style.height = newspaperStyles.label.height;
      layers.newspaperLabel.style.transform = newspaperStyles.label.transform;
      layers.newspaperLabel.style.textAlign = newspaperStyles.label.textAlign;
      layers.newspaperLabel.style.background = newspaperStyles.label.background;
      layers.newspaperLabel.style.padding = newspaperStyles.label.padding;
      layers.newspaperLabel.style.borderRadius = newspaperStyles.label.borderRadius;
      layers.newspaperLabel.style.visibility = newspaperStyles.label.visible ? 'visible' : 'hidden';
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
    const viewportWidth = this.#viewportWidth;
    const viewportHeight = this.#viewportHeight;
    const layer = resolveCoverPanLayer({ viewportWidth, viewportHeight, imageWidth, imageHeight, scale, x, y });
    const imageStyle = resolveCoverPanImageStyle(layer);
    if (!isNewspaperMode) {
      layers.image.style.width = imageStyle.width;
      layers.image.style.height = imageStyle.height;
      layers.image.style.left = imageStyle.left;
      layers.image.style.top = imageStyle.top;
      layers.image.style.objectFit = imageStyle.objectFit;
      layers.image.style.transform = imageStyle.transform;
      layers.image.style.transformOrigin = imageStyle.transformOrigin;
      layers.image.style.willChange = imageStyle.willChange;
    }

    const filterEnabled = segment.filter?.enabled !== false;
    layers.image.style.filter = filterEnabled ? 'contrast(1.06) saturate(0.92)' : 'none';

    const dustEnabled = !isNewspaperMode && segment.dust?.enabled !== false;
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

  async #swapSegmentImage(imgEl, url, expectedActiveKey = url) {
    if (this.#imageCache.has(url)) {
      // LRU: bump this URL to the most-recently-used end.
      const idx = this.#imageCacheOrder.indexOf(url);
      if (idx !== -1) {
        this.#imageCacheOrder.splice(idx, 1);
        this.#imageCacheOrder.push(url);
      }
      imgEl.src = url;
      return;
    }

    try {
      const preloader = new Image();
      preloader.src = url;
      await preloader.decode();
      this.#imageCache.set(url, preloader);
      if (this.#activeSegmentKey === expectedActiveKey) {
        imgEl.src = url;
      }
    } catch {
      imgEl.src = url;
    }
  }
}
