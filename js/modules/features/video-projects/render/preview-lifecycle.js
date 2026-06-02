import { CompositionRenderer, syncManagedVideoElement } from '../composition/composition-renderer.js';
import { buildCompositionPreviewAssets } from '../composition/composition-view-model.js';
import { DEFAULT_MUSIC_VOLUME } from '../domain/editor-state.js';
import { formatSeconds } from '../domain/formatters.js';

let compositionRenderer = null;
let compositionRendererContainer = null;
let compositionRendererAssetSignature = '';
let compositionRendererProject = null;

export function destroyCompositionRenderer() {
  if (compositionRenderer) {
    try { compositionRenderer.destroy(); } catch {}
    compositionRenderer = null;
  }
  compositionRendererContainer = null;
  compositionRendererAssetSignature = '';
  compositionRendererProject = null;
}

export function ensureCompositionRenderer(container) {
  if (!compositionRenderer || !compositionRendererContainer || compositionRendererContainer !== container) {
    // Cancel in-flight preload on the old renderer before destroying it.
    if (compositionRenderer && compositionRenderer._preloadInProgress) {
      compositionRenderer._preloadInProgress = null;
    }
    destroyCompositionRenderer();
    compositionRenderer = new CompositionRenderer({ container });
    compositionRendererContainer = container;
  }
  return compositionRenderer;
}

export function getCompositionRendererForPreview() {
  return compositionRenderer;
}

export function captureCompositionPreviewSeekTime(project, renderer = compositionRenderer) {
  if (!project || !renderer) return false;
  if (renderer === compositionRenderer && compositionRendererProject && compositionRendererProject !== project) return false;
  const seekTime = Number(renderer.currentTime);
  if (!Number.isFinite(seekTime) || seekTime < 0) return false;
  project._previewSeekTime = seekTime;
  return true;
}

export async function captureCompositionPreviewImageGeometry(project, renderer = compositionRenderer) {
  if (!project || !renderer || typeof renderer.captureImageGeometryByRowId !== 'function') return {};
  if (renderer === compositionRenderer && compositionRendererProject && compositionRendererProject !== project) return {};
  const editorRows = Array.isArray(project._editorRows) ? project._editorRows : [];
  if (!editorRows.length) return {};
  const { compositionRows } = buildCompositionPreviewAssets({ project, rows: editorRows });
  if (typeof renderer.captureAllImageGeometryByRowId === 'function') {
    return renderer.captureAllImageGeometryByRowId(compositionRows);
  }
  return renderer.captureImageGeometryByRowId(compositionRows);
}

export function resolveCompositionPreviewAudioSettings(project = {}) {
  const globalAudioData = project?._globalAudio || { voice: { volume: 1, muted: false }, music: { volume: DEFAULT_MUSIC_VOLUME, muted: false } };
  return {
    voiceVolume: globalAudioData.voice?.volume ?? 1,
    voiceMuted: globalAudioData.voice?.muted ?? false,
    musicVolume: globalAudioData.music?.volume ?? DEFAULT_MUSIC_VOLUME,
    musicMuted: globalAudioData.music?.muted ?? false,
    musicFadeInSeconds: globalAudioData.music?.fadeInSeconds ?? 0,
    musicFadeOutSeconds: globalAudioData.music?.fadeOutSeconds ?? 0,
  };
}

export function configureCompositionPreviewAudio(renderer, project = {}) {
  if (!renderer?.updateAudioSettings || !project) return false;
  renderer.updateAudioSettings(resolveCompositionPreviewAudioSettings(project));
  return true;
}

export function syncVideoSelectorPreviewLayers({ modal, sourceInSeconds = 0, playing = false } = {}) {
  if (!modal?.querySelectorAll) return false;
  const seekTime = Number(sourceInSeconds);
  const videos = Array.from(modal.querySelectorAll('video[data-layer]'));
  if (!videos.length || !Number.isFinite(seekTime)) return false;
  videos.forEach((video) => {
    const layer = (video?.dataset?.layer || video?.getAttribute?.('data-layer') || '').toString();
    const isDecorativeEffect = layer === 'effect-layer-01' || layer === 'effect-layer-02';
    if (isDecorativeEffect && playing) {
      try { video.muted = true; } catch {}
      try { video.playsInline = true; } catch {}
      if (video.paused !== false) {
        try { void video.play?.().catch(() => {}); } catch {}
      }
      return;
    }
    syncManagedVideoElement({ video, currentTimeSeconds: isDecorativeEffect ? 0 : Math.max(0, seekTime), playing });
  });
  return true;
}

export function updateSelectedVideoProjectCompositionPreview({ project } = {}) {
  if (!compositionRenderer || !compositionRendererContainer || !project) return false;
  const editorRows = Array.isArray(project._editorRows) ? project._editorRows : [];
  if (!editorRows.length) return false;
  const renderer = compositionRenderer;
  const capturedSeekTime = Number(project._previewSeekTime);
  const fallbackSeekTime = Number(renderer.currentTime);
  const { voiceUrl, musicUrl, compositionRows, dustWebmUrl, logoUrl, outroUrl, outroDurationSeconds, assetSignature } = buildCompositionPreviewAssets({ project, rows: editorRows });
  const audioSettings = resolveCompositionPreviewAudioSettings(project);
  const applyRowsAndSeek = () => {
    if (renderer !== compositionRenderer || !compositionRenderer) return;
    configureCompositionPreviewAudio(renderer, project);
    renderer.update({ rows: compositionRows });
    const imageUrls = compositionRows.map((row) => row.image).filter(Boolean);
    if (imageUrls.length) void renderer.preloadImages(imageUrls);
    const seekTime = Number.isFinite(capturedSeekTime) ? capturedSeekTime : fallbackSeekTime;
    if (Number.isFinite(seekTime) && seekTime > 0) renderer.seek(seekTime);
  };

  if (compositionRendererAssetSignature !== assetSignature) {
    renderer.preload({
      dustWebmUrl,
      logoUrl,
      outroUrl,
      outroDurationSeconds,
      voiceUrl,
      musicUrl,
      ...audioSettings,
      rows: compositionRows,
    }).then(() => {
      compositionRendererAssetSignature = assetSignature;
      applyRowsAndSeek();
    }).catch((err) => {
      console.warn('Composition preview preload failed, applying rows without full preload:', err);
      compositionRendererAssetSignature = assetSignature;
      applyRowsAndSeek();
    });
    return true;
  }

  applyRowsAndSeek();
  return true;
}

export function hydrateCompositionPreview({ root, project, editorRows }) {
  const compositionContainer = root?.querySelector?.('[data-composition-container]');
  if (!compositionContainer || !Array.isArray(editorRows) || !editorRows.length) {
    destroyCompositionRenderer();
    return null;
  }
  const renderer = ensureCompositionRenderer(compositionContainer);
  compositionRendererProject = project;
  const { voiceUrl, musicUrl, compositionRows, dustWebmUrl, logoUrl, outroUrl, outroDurationSeconds, assetSignature } = buildCompositionPreviewAssets({ project, rows: editorRows });
  const audioSettings = resolveCompositionPreviewAudioSettings(project);
  const applyRowsAndSeek = () => {
    configureCompositionPreviewAudio(renderer, project);
    renderer?.update({ rows: compositionRows });
    const imageUrls = compositionRows.map((row) => row.image).filter(Boolean);
    if (imageUrls.length) renderer?.preloadImages(imageUrls);
    const seekTime = Number(project._previewSeekTime);
    if (Number.isFinite(seekTime) && seekTime > 0) renderer?.seek(seekTime);
  };
  if (compositionRendererAssetSignature !== assetSignature) {
    renderer.preload({
      dustWebmUrl,
      logoUrl,
      outroUrl,
      outroDurationSeconds,
      voiceUrl,
      musicUrl,
      ...audioSettings,
      rows: compositionRows,
    }).then(() => {
      compositionRendererAssetSignature = assetSignature;
      applyRowsAndSeek();
    }).catch((err) => {
      console.warn('Composition preview preload failed, applying rows without full preload:', err);
      compositionRendererAssetSignature = assetSignature;
      applyRowsAndSeek();
    });
  } else {
    applyRowsAndSeek();
  }
  return renderer;
}

export function resolvePreviewTimelineCurrentRow(rows = [], time = 0) {
  const currentTime = Number(time || 0);
  if (!Number.isFinite(currentTime) || !Array.isArray(rows) || !rows.length) return null;
  return rows.find((row) => {
    const start = Number(row.startTime || 0);
    const effectiveEnd = Number(row.effectiveEndTime);
    const end = Number.isFinite(effectiveEnd) && effectiveEnd > 0
      ? effectiveEnd
      : Number(row.endTime || 0);
    return currentTime >= start && currentTime < end;
  }) || null;
}

function shouldSkipAutoPreviewRowSelection(root) {
  const doc = root?.ownerDocument || (typeof document !== 'undefined' ? document : null);
  const active = doc?.activeElement;
  if (!active || active === doc.body) return false;
  if (active.isContentEditable) return true;
  return Boolean(active.closest?.('input, textarea, select, [contenteditable="true"]'));
}

function shouldFreezePreviewRowSelection(project) {
  return Boolean(project?._videoSelector || project?._previewRowSelectionLockRowId);
}

export function hydratePreviewTransport({ root, project, editorRows, selectEditorRow }) {
  const previewVideo = root.querySelector('[data-preview-video]');
  const scrubber = root.querySelector('[data-preview-scrubber]');
  const playButton = root.querySelector('[data-action="toggle-preview-play"]');
  const playIcon = root.querySelector('[data-preview-play-icon]');
  const renderer = getCompositionRendererForPreview();
  const timelineRows = buildCompositionPreviewAssets({ project, rows: editorRows }).compositionRows;
  const findRowAtTime = (time) => resolvePreviewTimelineCurrentRow(timelineRows, time);
  const progressEl = root.querySelector('[data-preview-progress]');
  const playheadEl = root.querySelector('[data-preview-playhead]');
  const currentTimeEl = root.querySelector('[data-preview-current-time]');
  const timelineMarkers = Array.from(root.querySelectorAll('.video-preview-timeline__marker'));
  const editorRowEls = Array.from(root.querySelectorAll('.video-editor-row[data-row-id]'));
  let lastAutoSelectedRowId = project?._selectedEditorRowId || null;
  const updatePreviewTimeline = (currentTime, durationValue, options = {}) => {
    const configuredDuration = Number(scrubber?.dataset.duration || 0);
    const duration = Math.max(Number(durationValue || previewVideo?.duration || renderer?.duration || configuredDuration || 0), configuredDuration, 1);
    const pct = Math.max(0, Math.min((Number(currentTime || 0) / duration) * 100, 100));
    if (progressEl) progressEl.style.width = `${pct}%`;
    if (playheadEl) playheadEl.style.left = `${pct}%`;
    if (currentTimeEl) currentTimeEl.textContent = formatSeconds(currentTime || 0);
    const currentRow = findRowAtTime(Number(currentTime || 0));
    const currentId = currentRow?.id;
    for (let i = 0; i < timelineMarkers.length; i++) {
      const segment = timelineMarkers[i];
      if (segment) segment.classList.toggle('is-current', Boolean(currentId && segment.dataset.rowId === currentId));
    }
    for (let i = 0; i < editorRowEls.length; i++) {
      const rowEl = editorRowEls[i];
      if (rowEl) rowEl.classList.toggle('is-current', Boolean(currentId && rowEl.dataset.rowId === currentId));
    }
    if (currentId && currentId !== lastAutoSelectedRowId && !shouldFreezePreviewRowSelection(project) && !shouldSkipAutoPreviewRowSelection(root)) {
      lastAutoSelectedRowId = currentId;
      project._selectedEditorRowId = currentId;
      project._previewSeekTime = Number(currentTime || 0);
      selectEditorRow?.(currentId, currentRow?.startTime, {
        syncPreview: false,
        source: 'preview-timeline',
        render: options.render !== false && options.playing !== true,
      });
    }
  };
  let previewTimelineFrame = 0;
  const stopPreviewTimelineLoop = () => {
    if (!previewTimelineFrame) return;
    window.cancelAnimationFrame(previewTimelineFrame);
    previewTimelineFrame = 0;
  };
  const startPreviewTimelineLoop = () => {
    stopPreviewTimelineLoop();
    const tick = () => {
      const activeRenderer = getCompositionRendererForPreview();
      if (activeRenderer) {
        updatePreviewTimeline(activeRenderer.currentTime, activeRenderer.duration, { playing: activeRenderer.isPlaying });
        if (activeRenderer.isPlaying) previewTimelineFrame = window.requestAnimationFrame(tick);
      } else if (previewVideo) {
        updatePreviewTimeline(previewVideo.currentTime, previewVideo.duration, { playing: !previewVideo.paused && !previewVideo.ended });
        if (!previewVideo.paused && !previewVideo.ended) previewTimelineFrame = window.requestAnimationFrame(tick);
      }
    };
    previewTimelineFrame = window.requestAnimationFrame(tick);
  };
  const restorePreviewSeekTime = () => {
    if (getCompositionRendererForPreview()) return;
    const seekTime = Number(project._previewSeekTime);
    if (!previewVideo || !Number.isFinite(seekTime)) return;
    const applySeek = () => { try { previewVideo.currentTime = seekTime; } catch {} };
    if (previewVideo.readyState >= 1) applySeek();
    else previewVideo.addEventListener('loadedmetadata', applySeek, { once: true });
  };
  const seekPreviewFromPointer = (ev) => {
    if (!scrubber) return;
    const rect = scrubber.getBoundingClientRect();
    if (!rect.width) return;
    const pct = Math.max(0, Math.min((ev.clientX - rect.left) / rect.width, 1));
    const configuredDuration = Number(scrubber.dataset.duration || 0);
    const activeRenderer = getCompositionRendererForPreview();
    const duration = Math.max(Number(activeRenderer?.duration || previewVideo?.duration || 0), configuredDuration, 1);
    const nextTime = pct * duration;
    if (activeRenderer) activeRenderer.seek(nextTime);
    else if (previewVideo) previewVideo.currentTime = nextTime;
    project._previewSeekTime = nextTime;
    updatePreviewTimeline(nextTime, duration, {
      playing: Boolean(activeRenderer?.isPlaying || (previewVideo && !previewVideo.paused && !previewVideo.ended)),
      render: false,
    });
  };
  restorePreviewSeekTime();
  updatePreviewTimeline(Number(project._previewSeekTime || 0));
  if (renderer) hydrateCompositionTransport({ root, renderer, playButton, playIcon, startPreviewTimelineLoop, stopPreviewTimelineLoop, updatePreviewTimeline });
  else if (previewVideo) hydrateVideoTransport({ previewVideo, playButton, playIcon, startPreviewTimelineLoop, stopPreviewTimelineLoop, updatePreviewTimeline });
  hydrateScrubber({ scrubber, seekPreviewFromPointer });
  hydrateRowSelection({ root, selectEditorRow });
  return { updatePreviewTimeline };
}

function hydrateCompositionTransport({ root, renderer, playButton, playIcon, startPreviewTimelineLoop, stopPreviewTimelineLoop, updatePreviewTimeline }) {
  const handleCompositionPlay = async () => {
    const activeRenderer = getCompositionRendererForPreview();
    if (!activeRenderer) return;
    if (activeRenderer.isPlaying) {
      activeRenderer.pause();
      updatePlayIcon();
    } else {
      await activeRenderer.play();
      updatePlayIcon();
    }
  };
  playButton?.addEventListener('click', handleCompositionPlay);
  root.querySelector('.composition-stage')?.addEventListener('click', handleCompositionPlay);
  const updatePlayIcon = () => {
    const activeRenderer = getCompositionRendererForPreview();
    if (!activeRenderer) return;
    if (activeRenderer.isPlaying) {
      playButton?.classList.add('is-playing');
      if (playIcon) playIcon.textContent = '❚❚';
      startPreviewTimelineLoop();
    } else {
      playButton?.classList.remove('is-playing');
      if (playIcon) playIcon.textContent = '▶';
      stopPreviewTimelineLoop();
      updatePreviewTimeline(activeRenderer.currentTime, activeRenderer.duration);
    }
  };
  updatePlayIcon();
  if (renderer.isPlaying) startPreviewTimelineLoop();
}

function hydrateVideoTransport({ previewVideo, playButton, playIcon, startPreviewTimelineLoop, stopPreviewTimelineLoop, updatePreviewTimeline }) {
  previewVideo.addEventListener('loadedmetadata', () => updatePreviewTimeline(previewVideo.currentTime, previewVideo.duration));
  previewVideo.addEventListener('timeupdate', () => updatePreviewTimeline(previewVideo.currentTime, previewVideo.duration));
  previewVideo.addEventListener('play', () => { playButton?.classList.add('is-playing'); if (playIcon) playIcon.textContent = '❚❚'; startPreviewTimelineLoop(); });
  const stop = () => { playButton?.classList.remove('is-playing'); if (playIcon) playIcon.textContent = '▶'; stopPreviewTimelineLoop(); updatePreviewTimeline(previewVideo.currentTime, previewVideo.duration); };
  previewVideo.addEventListener('pause', stop);
  previewVideo.addEventListener('ended', stop);
  const toggle = async () => { if (previewVideo.paused) { try { await previewVideo.play(); } catch {} } else previewVideo.pause(); };
  previewVideo.addEventListener('click', toggle);
  playButton?.addEventListener('click', toggle);
}

function hydrateScrubber({ scrubber, seekPreviewFromPointer }) {
  if (!scrubber) return;
  let scrubbing = false;
  scrubber.addEventListener('pointerdown', (ev) => { ev.preventDefault(); scrubbing = true; scrubber.setPointerCapture?.(ev.pointerId); seekPreviewFromPointer(ev); });
  scrubber.addEventListener('pointermove', (ev) => { if (scrubbing) seekPreviewFromPointer(ev); });
  scrubber.addEventListener('pointerup', (ev) => { if (!scrubbing) return; seekPreviewFromPointer(ev); scrubbing = false; scrubber.releasePointerCapture?.(ev.pointerId); });
  scrubber.addEventListener('pointercancel', () => { scrubbing = false; });
}

function hydrateRowSelection({ root, selectEditorRow }) {
  root.querySelectorAll('[data-action="select-row"]').forEach((btn) => {
    btn.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    btn.addEventListener('click', (ev) => { ev.stopPropagation(); selectEditorRow(btn.dataset.rowId, btn.dataset.startTime, { source: 'editor-row-action', render: false }); });
  });
  root.querySelectorAll('.video-editor-row[data-row-id]').forEach((rowEl) => {
    rowEl.addEventListener('click', (ev) => { if (!ev.target.closest('button, input, label, select, a')) selectEditorRow(rowEl.dataset.rowId, rowEl.dataset.startTime, { source: 'editor-row', render: false }); });
    rowEl.addEventListener('keydown', (ev) => { if (ev.key !== 'Enter' && ev.key !== ' ') return; ev.preventDefault(); selectEditorRow(rowEl.dataset.rowId, rowEl.dataset.startTime, { source: 'editor-row', render: false }); });
  });
}
