// audio-manager.js — Encapsulated Web Audio pipeline for CompositionRenderer
// Extracted from composition-renderer.js to isolate audio concerns.
//
// Manages: AudioContext lifecycle, GainNodes, buffer decoding,
// AudioBufferSourceNode creation, fade scheduling, and cleanup.

export class AudioManager {
  /** @type {AudioContext|null} */
  #audioCtx;
  /** @type {GainNode|null} */
  #voiceGain;
  /** @type {GainNode|null} */
  #musicGain;
  /** @type {AudioBuffer|null} */
  #voiceBuffer;
  /** @type {AudioBuffer|null} */
  #musicBuffer;
  /** @type {AudioBufferSourceNode|null} */
  #voiceSource;
  /** @type {AudioBufferSourceNode|null} */
  #musicSource;
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

  // Raw (undecoded) audio data — stored between fetch and init
  /** @type {ArrayBuffer|null} */
  #voiceRawBuffer;
  /** @type {ArrayBuffer|null} */
  #musicRawBuffer;
  /** @type {Promise<void>|null} */
  #pendingFetch;

  constructor() {
    this.#audioCtx = null;
    this.#voiceGain = null;
    this.#musicGain = null;
    this.#voiceBuffer = null;
    this.#musicBuffer = null;
    this.#voiceSource = null;
    this.#musicSource = null;
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
    this.#voiceRawBuffer = null;
    this.#musicRawBuffer = null;
    this.#pendingFetch = null;
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

  /** @returns {number|null} */
  get fadeOutScheduled() {
    return this.#fadeOutScheduled;
  }

  // ── Public API ──────────────────────────────────────────

  /**
   * Configure audio volumes and fade durations.
   * Called from preload() before fetchBuffers.
   * @param {{ voiceVolume?: number, voiceMuted?: boolean, musicVolume?: number,
   *           musicFadeInSeconds?: number, musicFadeOutSeconds?: number }} config
   */
  configure({ voiceVolume, voiceMuted, musicVolume, musicFadeInSeconds, musicFadeOutSeconds } = {}) {
    if (voiceVolume !== undefined) this.#voiceVolume = voiceVolume;
    if (voiceMuted !== undefined) this.#voiceMuted = voiceMuted;
    if (musicVolume !== undefined) this.#musicVolume = musicVolume;
    if (musicFadeInSeconds !== undefined) this.#musicFadeInSeconds = musicFadeInSeconds;
    if (musicFadeOutSeconds !== undefined) this.#musicFadeOutSeconds = musicFadeOutSeconds;
  }

  /**
   * Fetch raw audio data from public URLs. Stores ArrayBuffers for later
   * decoding (decode requires AudioContext, which is lazy).
   *
   * @param {string} [voiceUrl]
   * @param {string} [musicUrl]
   * @returns {Promise<void>}
   */
  async fetchBuffers(voiceUrl, musicUrl) {
    try {
      const fetches = [];
      if (voiceUrl) fetches.push(fetch(voiceUrl).then((r) => r.arrayBuffer()));
      else fetches.push(Promise.resolve(null));
      if (musicUrl) fetches.push(fetch(musicUrl).then((r) => r.arrayBuffer()));
      else fetches.push(Promise.resolve(null));

      const [voiceData, musicData] = await Promise.all(fetches);
      this.#voiceRawBuffer = voiceData;
      this.#musicRawBuffer = musicData;
    } catch {
      // Audio fetch failed — composition continues without audio
      this.#voiceRawBuffer = null;
      this.#musicRawBuffer = null;
    }
  }

  /**
   * Store a pending fetch promise for later awaiting in init().
   * @param {Promise<void>} promise
   */
  setPendingFetch(promise) {
    this.#pendingFetch = promise;
  }

  /**
   * Lazy AudioContext initialization — satisfies browser autoplay policy.
   * Called on first play(). Decodes raw audio buffers into AudioBuffers,
   * creates GainNodes for volume control.
   *
   * @returns {Promise<boolean>} true if audio pipeline is ready
   */
  async init() {
    if (this.#audioCtx) return true;

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return false;

      this.#audioCtx = new AudioCtx();

      // Create GainNodes for volume control
      this.#voiceGain = this.#audioCtx.createGain();
      this.#voiceGain.gain.value = this.#voiceMuted ? 0 : this.#voiceVolume;
      this.#voiceGain.connect(this.#audioCtx.destination);

      this.#musicGain = this.#audioCtx.createGain();
      this.#musicGain.gain.value = this.#musicMuted ? 0 : this.#musicVolume;
      this.#musicGain.connect(this.#audioCtx.destination);

      // Wait for pending audio fetch to complete
      if (this.#pendingFetch) {
        await this.#pendingFetch;
        this.#pendingFetch = null;
      }

      // Decode audio data
      const decodes = [];
      if (this.#voiceRawBuffer) {
        decodes.push(
          this.#audioCtx.decodeAudioData(this.#voiceRawBuffer.slice(0)).then(
            (buf) => { this.#voiceBuffer = buf; },
          ),
        );
      }
      if (this.#musicRawBuffer) {
        decodes.push(
          this.#audioCtx.decodeAudioData(this.#musicRawBuffer.slice(0)).then(
            (buf) => { this.#musicBuffer = buf; },
          ),
        );
      }
      await Promise.all(decodes);

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
   * Create fresh AudioBufferSourceNodes for voice and music.
   * AudioBufferSourceNode is single-use — must be recreated on each play().
   * Connects sources through GainNodes to AudioContext.destination.
   *
   * @returns {{ voiceSource: AudioBufferSourceNode|null, musicSource: AudioBufferSourceNode|null }}
   */
  createSources() {
    if (!this.#audioCtx || this.#audioCtx.state === 'closed') {
      return { voiceSource: null, musicSource: null };
    }

    let voiceSource = null;
    let musicSource = null;

    if (this.#voiceBuffer && this.#voiceGain) {
      voiceSource = this.#audioCtx.createBufferSource();
      voiceSource.buffer = this.#voiceBuffer;
      voiceSource.connect(this.#voiceGain);
    }

    if (this.#musicBuffer && this.#musicGain) {
      musicSource = this.#audioCtx.createBufferSource();
      musicSource.buffer = this.#musicBuffer;
      musicSource.loop = true;
      musicSource.connect(this.#musicGain);
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
  }

  /**
   * Store references to active source nodes (for later stop/cleanup).
   * @param {{ voiceSource: AudioBufferSourceNode|null, musicSource: AudioBufferSourceNode|null }} sources
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
    if (this.#musicGain) {
      this.#musicGain.gain.value = muted ? 0 : volume;
    }
  }

  /**
   * Suspend the audio context (on pause).
   * @returns {Promise<void>}
   */
  async suspend() {
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
    return this.#musicBuffer?.duration || 1;
  }

  /**
   * Clean up all audio resources.
   */
  destroy() {
    this.stopSources();

    if (this.#audioCtx && this.#audioCtx.state !== 'closed') {
      this.#audioCtx.close().catch(() => {});
    }

    this.#audioCtx = null;
    this.#voiceGain = null;
    this.#musicGain = null;
    this.#voiceBuffer = null;
    this.#musicBuffer = null;
    this.#voiceSource = null;
    this.#musicSource = null;
    this.#audioReady = false;
    this.#voiceRawBuffer = null;
    this.#musicRawBuffer = null;
    this.#pendingFetch = null;
    this.#fadeOutScheduled = null;
  }
}
