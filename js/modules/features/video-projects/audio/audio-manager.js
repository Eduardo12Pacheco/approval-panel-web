// audio-manager.js — Encapsulated streaming audio pipeline for CompositionRenderer
// Extracted from composition-renderer.js to isolate audio concerns.
//
// Manages: AudioContext clock lifecycle, HTMLMediaElement playback,
// lightweight fade scheduling, and cleanup.

export class AudioManager {
  /** @type {AudioContext|null} */
  #audioCtx;
  /** @type {GainNode|null} */
  #voiceGain;
  /** @type {GainNode|null} */
  #musicGain;
  /** @type {{ start?: Function, stop?: Function, disconnect?: Function }|null} */
  #voiceSource;
  /** @type {{ start?: Function, stop?: Function, disconnect?: Function }|null} */
  #musicSource;
  /** @type {HTMLAudioElement|null} */
  #voiceElement;
  /** @type {HTMLAudioElement|null} */
  #musicElement;
  /** @type {number} */
  #voiceVolume;
  /** @type {boolean} */
  #voiceMuted;
  /** @type {number} */
  #musicVolume;
  /** @type {boolean} */
  #musicMuted;
  /** @type {boolean} */
  #audioReady;
  /** @type {number} */
  #musicFadeInSeconds;
  /** @type {number} */
  #musicFadeOutSeconds;
  /** @type {number} */
  #audioStartCtxTime;
  /** @type {number} */
  #audioTimeOffset;
  /** @type {number|null} */
  #fadeOutScheduled;
  /** @type {number|null} */
  #musicFadeFrame;

  /** @type {string} */
  #voiceUrl;
  /** @type {string} */
  #musicUrl;

  constructor() {
    this.#audioCtx = null;
    this.#voiceGain = null;
    this.#musicGain = null;
    this.#voiceSource = null;
    this.#musicSource = null;
    this.#voiceElement = null;
    this.#musicElement = null;
    this.#voiceVolume = 1.0;
    this.#voiceMuted = false;
    this.#musicVolume = 0.5;
    this.#musicMuted = false;
    this.#audioReady = false;
    this.#musicFadeInSeconds = 0;
    this.#musicFadeOutSeconds = 0;
    this.#audioStartCtxTime = 0;
    this.#audioTimeOffset = 0;
    this.#fadeOutScheduled = null;
    this.#musicFadeFrame = null;
    this.#voiceUrl = '';
    this.#musicUrl = '';
  }

  // ── Getters ─────────────────────────────────────────────

  /** @returns {number} audioContext.currentTime */
  get currentTime() {
    return this.#audioCtx?.currentTime ?? 0;
  }

  /** @returns {boolean} */
  get isReady() {
    return this.#audioReady;
  }

  /** @returns {AudioContext|null} */
  get ctx() {
    return this.#audioCtx;
  }

  /** @returns {boolean} */
  get isPlaying() {
    return Boolean(
      (this.#voiceElement && !this.#voiceElement.paused)
      || (this.#musicElement && !this.#musicElement.paused)
      || this.#audioCtx?.state === 'running',
    );
  }

  /** @returns {number|null} */
  get fadeOutScheduled() {
    return this.#fadeOutScheduled;
  }

  // ── Public API ──────────────────────────────────────────

  /**
   * Configure audio volumes and fade durations.
   * Called from preload() before the streaming media elements are created.
   * @param {{ voiceVolume?: number, voiceMuted?: boolean, musicVolume?: number, musicMuted?: boolean,
   *           musicFadeInSeconds?: number, musicFadeOutSeconds?: number }} config
   */
  configure({ voiceVolume, voiceMuted, musicVolume, musicMuted, musicFadeInSeconds, musicFadeOutSeconds } = {}) {
    if (voiceVolume !== undefined) this.#voiceVolume = voiceVolume;
    if (voiceMuted !== undefined) this.#voiceMuted = voiceMuted;
    if (musicVolume !== undefined) this.#musicVolume = musicVolume;
    if (musicMuted !== undefined) this.#musicMuted = musicMuted;
    if (musicFadeInSeconds !== undefined) this.#musicFadeInSeconds = musicFadeInSeconds;
    if (musicFadeOutSeconds !== undefined) this.#musicFadeOutSeconds = musicFadeOutSeconds;
  }

  /**
   * Store audio URLs without fetching. Playback streams from these URLs after play().
   * @param {string} [voiceUrl]
   * @param {string} [musicUrl]
   */
  setSourceUrls(voiceUrl, musicUrl) {
    this.#disposeMediaElements();
    this.#voiceSource = null;
    this.#musicSource = null;
    this.#voiceUrl = voiceUrl || '';
    this.#musicUrl = musicUrl || '';
    this.#audioReady = false;
  }

  /**
   * Lazy audio initialization — satisfies browser autoplay policy.
   * Called on first play(). Uses streaming HTMLAudioElement playback instead
   * of fetching/decoding full WAV files on the main thread.
   *
   * @returns {Promise<boolean>} true if audio pipeline is ready
   */
  async init() {
    if (this.#audioCtx && this.#audioReady) return true;

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return false;

      if (!this.#audioCtx || this.#audioCtx.state === 'closed') {
        this.#audioCtx = new AudioCtx();
      }

      // Keep a Web Audio context only as a stable playback clock.
      // Actual preview audio streams via <audio>, avoiding arrayBuffer/decodeAudioData
      // freezes with large WAV assets.
      if (!this.#voiceGain) {
        this.#voiceGain = this.#audioCtx.createGain();
        this.#voiceGain.connect(this.#audioCtx.destination);
      }
      this.#voiceGain.gain.value = this.#voiceMuted ? 0 : this.#voiceVolume;

      if (!this.#musicGain) {
        this.#musicGain = this.#audioCtx.createGain();
        this.#musicGain.connect(this.#audioCtx.destination);
      }
      this.#musicGain.gain.value = this.#musicMuted ? 0 : this.#musicVolume;

      this.#ensureMediaElements();

      this.#audioReady = true;
      return true;
    } catch {
      // Audio init failed — composition continues without audio
      this.#audioCtx = null;
      this.#voiceGain = null;
      this.#musicGain = null;
      this.#audioReady = false;
      return false;
    }
  }

  /**
   * Create fresh source facades for voice and music.
   * The facades preserve the old AudioBufferSourceNode-shaped API while
   * internally controlling streaming HTMLAudioElement instances.
   *
   * @returns {{ voiceSource: { start?: Function, stop?: Function, disconnect?: Function }|null, musicSource: { start?: Function, stop?: Function, disconnect?: Function }|null }}
   */
  createSources() {
    if (!this.#audioCtx || this.#audioCtx.state === 'closed') {
      return { voiceSource: null, musicSource: null };
    }

    let voiceSource = null;
    let musicSource = null;

    if (this.#voiceElement) {
      voiceSource = this.#createMediaSourceFacade(this.#voiceElement);
    }

    if (this.#musicElement) {
      musicSource = this.#createMediaSourceFacade(this.#musicElement, { loop: true });
    }

    return { voiceSource, musicSource };
  }

  /**
   * Stop and disconnect current audio sources.
   * Called before creating new sources (on play, pause, seek).
   */
  stopSources() {
    if (this.#voiceSource) {
      try { this.#voiceSource.stop(); } catch { /* already stopped */ }
      try { this.#voiceSource.disconnect(); } catch { /* ok */ }
      this.#voiceSource = null;
    }
    if (this.#musicSource) {
      try { this.#musicSource.stop(); } catch { /* already stopped */ }
      try { this.#musicSource.disconnect(); } catch { /* ok */ }
      this.#musicSource = null;
    }
    this.#stopMusicFadeLoop();
    this.#pauseMediaElement(this.#voiceElement);
    this.#pauseMediaElement(this.#musicElement);
  }

  /**
   * Store references to active source nodes (for later stop/cleanup).
   * @param {{ voiceSource: { start?: Function, stop?: Function, disconnect?: Function }|null, musicSource: { start?: Function, stop?: Function, disconnect?: Function }|null }} sources
   */
  setSources({ voiceSource, musicSource }) {
    this.#voiceSource = voiceSource;
    this.#musicSource = musicSource;
  }

  /**
   * Record audio start position for drift correction.
   * @param {number} compositionTime — current composition time (seek offset)
   */
  recordStartPosition(compositionTime) {
    if (!this.#audioCtx) return;
    this.#audioStartCtxTime = this.#audioCtx.currentTime;
    this.#audioTimeOffset = compositionTime;
  }

  /**
   * Schedule music fade-in and fade-out via GainNode automation.
   * Must be called after creating audio sources and recording start position.
   *
   * @param {number} currentCompositionTime — current playback position in seconds
   * @param {number} totalDuration — total composition duration in seconds
   */
  scheduleFade(currentCompositionTime, totalDuration) {
    if (this.#musicElement) {
      this.#startMusicFadeLoop(currentCompositionTime, totalDuration);
      return;
    }

    if (!this.#audioCtx || !this.#musicGain) return;

    const now = this.#audioCtx.currentTime;
    const remaining = totalDuration - currentCompositionTime;
    const fadeOutDuration = this.#musicFadeOutSeconds;
    const fadeInDuration = this.#musicFadeInSeconds;

    // Cancel any previous automation
    this.#musicGain.gain.cancelScheduledValues(now);

    // Set current value
    this.#musicGain.gain.setValueAtTime(this.#musicVolume, now);

    // Fade-in: ramp from 0 to musicVolume over fadeInDuration
    if (fadeInDuration > 0 && currentCompositionTime < fadeInDuration) {
      this.#musicGain.gain.setValueAtTime(0, now);
      this.#musicGain.gain.linearRampToValueAtTime(
        this.#musicVolume,
        now + fadeInDuration - currentCompositionTime,
      );
    }

    // Fade-out: ramp from musicVolume to 0 before composition end
    if (fadeOutDuration > 0) {
      const fadeOutStart = Math.max(0, remaining - fadeOutDuration);
      if (fadeOutStart > 0) {
        this.#musicGain.gain.linearRampToValueAtTime(
          this.#musicVolume,
          now + fadeOutStart,
        );
        this.#musicGain.gain.linearRampToValueAtTime(0, now + fadeOutStart + fadeOutDuration);
        this.#fadeOutScheduled = now + fadeOutStart;
      }
    }
  }

  /**
   * Calculate the audioContext.currentTime timestamp at which music fade-out
   * should begin, based on the composition's remaining time.
   *
   * @param {number} currentCompositionTime — current playback position in seconds
   * @param {number} totalDuration — total composition duration in seconds
   * @param {number} [fadeOutDuration] — fade-out window in seconds (defaults to stored config)
   * @returns {number} wall-clock time (audioContext.currentTime seconds) when fade starts
   */
  getFadeOutDuration(currentCompositionTime, totalDuration, fadeOutDuration) {
    const duration = fadeOutDuration ?? this.#musicFadeOutSeconds;
    const remaining = totalDuration - currentCompositionTime;
    return Math.max(0, remaining - duration);
  }

  /**
   * Update voice gain node volume.
   * @param {number} volume — 0..1
   * @param {boolean} muted
   */
  setVoiceVolume(volume, muted) {
    this.#voiceVolume = volume;
    this.#voiceMuted = muted;
    if (this.#voiceElement) {
      this.#voiceElement.volume = this.#clampVolume(volume);
      this.#voiceElement.muted = muted;
    }
    if (this.#voiceGain) {
      this.#voiceGain.gain.value = muted ? 0 : volume;
    }
  }

  /**
   * Update music gain node volume.
   * @param {number} volume — 0..1
   * @param {boolean} muted
   */
  setMusicVolume(volume, muted) {
    this.#musicVolume = volume;
    this.#musicMuted = muted;
    if (this.#musicElement) {
      this.#musicElement.volume = muted ? 0 : this.#clampVolume(volume);
      this.#musicElement.muted = muted;
    }
    if (this.#musicGain) {
      this.#musicGain.gain.value = muted ? 0 : volume;
    }
  }

  /**
   * Suspend the audio context (on pause).
   * @returns {Promise<void>}
   */
  async suspend() {
    this.#pauseMediaElement(this.#voiceElement);
    this.#pauseMediaElement(this.#musicElement);
    if (this.#audioCtx && this.#audioCtx.state === 'running') {
      await this.#audioCtx.suspend().catch(() => {});
    }
  }

  /**
   * Resume the audio context (on play).
   * @returns {Promise<void>}
   */
  async resume() {
    if (this.#audioCtx && this.#audioCtx.state === 'suspended') {
      await this.#audioCtx.resume();
    }
  }

  /**
   * Compute composition time from audio context drift.
   * @returns {number} current composition time based on audio context
   */
  computeCompositionTime() {
    if (!this.#audioCtx) return this.#audioTimeOffset;
    const elapsed = this.#audioCtx.currentTime - this.#audioStartCtxTime;
    return this.#audioTimeOffset + elapsed;
  }

  /**
   * Get the music buffer duration (for looping offset calculation).
   * @returns {number}
   */
  getMusicBufferDuration() {
    return this.#musicElement?.duration || 1;
  }

  /**
   * Clean up all audio resources.
   */
  destroy() {
    this.stopSources();
    this.#disposeMediaElements();

    if (this.#audioCtx && this.#audioCtx.state !== 'closed') {
      this.#audioCtx.close().catch(() => {});
    }

    this.#audioCtx = null;
    this.#voiceGain = null;
    this.#musicGain = null;
    this.#voiceSource = null;
    this.#musicSource = null;
    this.#voiceElement = null;
    this.#musicElement = null;
    this.#audioReady = false;
    this.#fadeOutScheduled = null;
    this.#musicFadeFrame = null;
  }

  #ensureMediaElements() {
    if (this.#voiceUrl && !this.#voiceElement) {
      this.#voiceElement = this.#createAudioElement(this.#voiceUrl, { loop: false });
      this.setVoiceVolume(this.#voiceVolume, this.#voiceMuted);
    }

    if (this.#musicUrl && !this.#musicElement) {
      this.#musicElement = this.#createAudioElement(this.#musicUrl, { loop: true });
      this.setMusicVolume(this.#musicVolume, this.#musicMuted);
    }
  }

  #createAudioElement(url, { loop = false } = {}) {
    const audio = document.createElement('audio');
    audio.src = url;
    audio.preload = 'none';
    audio.loop = loop;
    audio.playsInline = true;
    return audio;
  }

  #createMediaSourceFacade(element, { loop = false } = {}) {
    return {
      start: (_when = 0, offset = 0) => {
        element.loop = loop;
        this.#startMediaElement(element, offset);
      },
      stop: () => this.#pauseMediaElement(element),
      disconnect: () => {},
    };
  }

  #startMediaElement(element, offset = 0) {
    if (!element) return;

    const safeOffset = Math.max(0, Number(offset) || 0);
    const applyOffset = () => {
      const duration = Number(element.duration);
      const target = element.loop && Number.isFinite(duration) && duration > 0
        ? safeOffset % duration
        : safeOffset;
      try { element.currentTime = target; } catch { /* metadata may not be ready yet */ }
    };

    if (element.readyState >= 1) {
      applyOffset();
    } else {
      element.addEventListener?.('loadedmetadata', applyOffset, { once: true });
      applyOffset();
    }

    const playPromise = element.play?.();
    if (playPromise?.catch) playPromise.catch(() => {});
  }

  #pauseMediaElement(element) {
    if (!element) return;
    try { element.pause(); } catch { /* ok */ }
  }

  #disposeMediaElements() {
    this.#stopMusicFadeLoop();
    [this.#voiceElement, this.#musicElement].forEach((element) => {
      if (!element) return;
      try { element.pause(); } catch { /* ok */ }
      try { element.removeAttribute('src'); } catch { element.src = ''; }
      try { element.load(); } catch { /* ok */ }
    });
    this.#voiceElement = null;
    this.#musicElement = null;
  }

  #startMusicFadeLoop(currentCompositionTime, totalDuration) {
    this.#stopMusicFadeLoop();
    this.#applyMusicVolumeForTime(currentCompositionTime, totalDuration);

    const tick = () => {
      const time = this.computeCompositionTime();
      this.#applyMusicVolumeForTime(time, totalDuration);
      if (this.#musicElement && !this.#musicElement.paused) {
        this.#musicFadeFrame = requestAnimationFrame(tick);
      }
    };

    this.#musicFadeFrame = requestAnimationFrame(tick);
  }

  #stopMusicFadeLoop() {
    if (this.#musicFadeFrame !== null) {
      cancelAnimationFrame(this.#musicFadeFrame);
      this.#musicFadeFrame = null;
    }
  }

  #applyMusicVolumeForTime(currentCompositionTime, totalDuration) {
    if (!this.#musicElement) return;
    if (this.#musicMuted) {
      this.#musicElement.volume = 0;
      return;
    }

    const time = Math.max(0, Number(currentCompositionTime) || 0);
    const duration = Math.max(0, Number(totalDuration) || 0);
    let multiplier = 1;

    if (this.#musicFadeInSeconds > 0 && time < this.#musicFadeInSeconds) {
      multiplier = Math.min(multiplier, time / this.#musicFadeInSeconds);
    }

    if (this.#musicFadeOutSeconds > 0 && duration > 0) {
      const remaining = Math.max(0, duration - time);
      if (remaining < this.#musicFadeOutSeconds) {
        multiplier = Math.min(multiplier, remaining / this.#musicFadeOutSeconds);
      }
    }

    this.#musicElement.volume = this.#clampVolume(this.#musicVolume * multiplier);
  }

  #clampVolume(value) {
    const next = Number(value);
    if (!Number.isFinite(next)) return 0;
    return Math.max(0, Math.min(1, next));
  }
}
