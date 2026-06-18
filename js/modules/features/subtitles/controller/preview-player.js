import {
  buildSubtitlePreviewPresentationRuntime,
  buildSubtitlePreviewTimelineMarkupRuntime,
  formatSubtitleDisplayTimeRuntime,
  parseSubtitleTimeToMsRuntime,
  pickActiveSubtitleCueRuntime,
  resolveSubtitleTimelineSeekMsRuntime,
} from '../runtime/index.js';

export function createSubtitlePreviewPlayer(ctx, collaborators = {}) {
  const { state, el, api, URLImpl, windowRef } = ctx;
  const renderTable = collaborators.renderTable || (() => {});
  const renderPreviewOverlayCallback = collaborators.renderPreviewOverlay || (() => {});
  const ensureRowsCoverDuration = collaborators.ensureRowsCoverDuration || (() => false);
  const resolvePreviewDurationMs = collaborators.resolvePreviewDurationMs || (() => 0);
  let subtitle2PreviewDragCleanup = null;
  let activeTableRowId = '';
  const SUBTITLE_ROW_SCROLL_COOLDOWN_MS = 500;

  function revokePreviewObjectUrl() {
    const objectUrl = state.subtitles2?.previewVideoObjectUrl;
    if (objectUrl) URLImpl.revokeObjectURL(objectUrl);
    if (state.subtitles2) state.subtitles2.previewVideoObjectUrl = '';
  }

  async function loadPreviewVideoBlob(sessionId) {
    if (!sessionId) return;
    try {
      const blob = await api.getSubtitlePreviewVideo(sessionId);
      revokePreviewObjectUrl();
      state.subtitles2.previewVideoObjectUrl = URLImpl.createObjectURL(blob);
      renderPreviewPlayer();
    } catch (error) {
      console.warn('No se pudo cargar preview autenticado', error);
    }
  }

  function renderPreviewPlayer() {
    if (!el.subtitle2PreviewVideo) return;
    const src = (state.subtitles2.previewVideoObjectUrl || state.subtitles2.previewVideoUrl || '').trim();
    const hasPreview = Boolean(src);
    el.subtitle2PreviewStage?.classList.toggle('is-empty', !hasPreview);
    el.subtitle2PreviewEmpty?.classList.toggle('hidden', hasPreview);
    if (el.subtitle2PreviewPlayBtn) {
      el.subtitle2PreviewPlayBtn.disabled = !hasPreview;
    }
    if (!src) {
      el.subtitle2PreviewVideo.removeAttribute('src');
      el.subtitle2PreviewVideo.pause();
      state.subtitles2.previewPlaying = false;
      renderPreviewPlaybackState();
      renderPreviewOverlay();
      return;
    }
    if (el.subtitle2PreviewVideo.getAttribute('src') !== src) {
      el.subtitle2PreviewVideo.src = src;
    }
    renderPreviewPlaybackState();
  }

  function renderPreviewOverlay() {
    const activeCue = pickActiveSubtitleCueRuntime(state.subtitles2.rows, state.subtitles2.previewCurrentMs);
    syncActiveTableRow(activeCue?.id || '');
    if (!el.subtitle2PreviewCue) {
      renderPreviewTimeline();
      renderPreviewOverlayCallback();
      return;
    }
    const stageRect = el.subtitle2PreviewStage?.getBoundingClientRect?.() || { width: 0, height: 0 };
    const presentation = buildSubtitlePreviewPresentationRuntime({
      activeCue,
      currentMs: state.subtitles2.previewCurrentMs,
      durationMs: resolvePreviewDurationMs(),
      stageWidth: stageRect.width,
      stageHeight: stageRect.height,
    });
    if (el.subtitle2PreviewOverlay) {
      el.subtitle2PreviewOverlay.style.justifyContent = presentation.justifyContent;
      el.subtitle2PreviewOverlay.style.alignItems = presentation.alignItems || 'center';
    }
    if (!activeCue) {
      el.subtitle2PreviewCue.classList.add('hidden');
      el.subtitle2PreviewCue.textContent = '';
      el.subtitle2PreviewCue.removeAttribute('style');
    } else {
      el.subtitle2PreviewCue.classList.remove('hidden');
      el.subtitle2PreviewCue.textContent = presentation.text;
      el.subtitle2PreviewCue.style.color = presentation.color;
      el.subtitle2PreviewCue.style.fontFamily = presentation.fontFamily;
      el.subtitle2PreviewCue.style.fontWeight = presentation.fontWeight;
      el.subtitle2PreviewCue.style.fontSize = `${presentation.fontSizePx}px`;
      el.subtitle2PreviewCue.style.width = `${presentation.cueWidthPx}px`;
    }
    renderPreviewTimeline();
  }

  function syncActiveTableRow(rowId) {
    const nextRowId = (rowId || '').toString();
    if (activeTableRowId === nextRowId && state.subtitles2.activeRowId === nextRowId) return;
    const previousRowId = activeTableRowId;
    activeTableRowId = nextRowId;
    state.subtitles2.activeRowId = nextRowId;
    if (!el.subtitle2RowsBody?.querySelector) return;
    for (const id of [previousRowId, nextRowId]) {
      if (!id) continue;
      const row = findTableRowById(id);
      row?.classList.toggle('subtitle-row--active', id === nextRowId);
    }
    scheduleActiveRowAutoScroll(nextRowId);
  }

  function isRowInViewport(rowEl, scrollContainerEl) {
    if (!rowEl || !scrollContainerEl) return true;
    if (typeof rowEl.getBoundingClientRect !== 'function') return true;
    if (typeof scrollContainerEl.getBoundingClientRect !== 'function') return true;
    const rowRect = rowEl.getBoundingClientRect();
    const containerRect = scrollContainerEl.getBoundingClientRect();
    return rowRect.top >= containerRect.top && rowRect.bottom <= containerRect.bottom;
  }

  function getSubtitleTableScrollContainer() {
    return el.subtitle2RowsBody?.closest?.('.subtitle-table-scroll') || null;
  }

  function scheduleActiveRowAutoScroll(rowId) {
    if (!rowId) return;
    const targetRow = findTableRowById(rowId);
    if (!targetRow) return;
    const scrollContainer = getSubtitleTableScrollContainer();
    if (isRowInViewport(targetRow, scrollContainer)) return;
    const userScrolledAt = Number(state.subtitles2.userScrolledAt) || 0;
    if (Date.now() - userScrolledAt < SUBTITLE_ROW_SCROLL_COOLDOWN_MS) return;
    const schedule = (typeof windowRef.requestAnimationFrame === 'function')
      ? windowRef.requestAnimationFrame.bind(windowRef)
      : (callback) => {
        const fallback = windowRef.setTimeout || (() => 0);
        return fallback.call(windowRef, callback, 16);
      };
    schedule(() => {
      targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  function bindUserScrollListeners() {
    const container = getSubtitleTableScrollContainer();
    if (!container || typeof container.addEventListener !== 'function') return;
    const markUserScroll = () => {
      state.subtitles2.userScrolledAt = Date.now();
    };
    container.addEventListener('wheel', markUserScroll, { passive: true });
    container.addEventListener('touchmove', markUserScroll, { passive: true });
  }

  function findTableRowById(rowId) {
    if (!el.subtitle2RowsBody?.querySelectorAll) return null;
    return Array.from(el.subtitle2RowsBody.querySelectorAll('tr[data-row-id]')).find((row) => row.dataset.rowId === rowId) || null;
  }

  function renderPreviewTimeline() {
    const durationMs = resolvePreviewDurationMs();
    if (el.subtitle2PreviewTimelineTrack) {
      el.subtitle2PreviewTimelineTrack.innerHTML = buildSubtitlePreviewTimelineMarkupRuntime({
        rows: state.subtitles2.rows,
        durationMs,
        currentMs: state.subtitles2.previewCurrentMs,
      });
    }
    if (el.subtitle2PreviewTimecode) {
      el.subtitle2PreviewTimecode.textContent = formatSubtitleDisplayTimeRuntime(state.subtitles2.previewCurrentMs);
    }
  }

  function applyVideoDuration(durationSeconds) {
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return false;
    const durationMs = Math.round(durationSeconds * 1000);
    if (!durationMs || durationMs === state.subtitles2.audioDurationMs) return false;
    state.subtitles2.audioDurationMs = durationMs;
    return ensureRowsCoverDuration(durationMs);
  }

  function onLoadedMetadata(ev) {
    const video = ev?.target || el.subtitle2PreviewVideo;
    const adjusted = applyVideoDuration(video?.duration);
    if (adjusted) renderTable();
    renderPreviewOverlay();
  }

  function onTimeUpdate(ev) {
    const video = ev?.target || el.subtitle2PreviewVideo;
    state.subtitles2.previewCurrentMs = Math.round((video?.currentTime || 0) * 1000);
    const adjusted = applyVideoDuration(video?.duration);
    if (adjusted) renderTable();
    renderPreviewOverlay();
  }

  function onTimelineClick(ev) {
    seekPreviewFromClientX(ev.clientX);
  }

  function renderPreviewPlaybackState() {
    if (!el.subtitle2PreviewPlayBtn) return;
    const isPlaying = Boolean(state.subtitles2.previewPlaying);
    el.subtitle2PreviewPlayBtn.textContent = isPlaying ? '❚❚' : '▶';
    el.subtitle2PreviewPlayBtn.setAttribute('aria-label', isPlaying ? 'Pausar preview' : 'Reproducir preview');
    el.subtitle2PreviewPlayBtn.setAttribute('title', isPlaying ? 'Pausar' : 'Reproducir');
  }

  function onToggleClicked() {
    if (!el.subtitle2PreviewVideo || !((state.subtitles2.previewVideoObjectUrl || state.subtitles2.previewVideoUrl || '').trim())) return;
    if (el.subtitle2PreviewVideo.paused) {
      void el.subtitle2PreviewVideo.play().catch(() => undefined);
      return;
    }
    el.subtitle2PreviewVideo.pause();
  }

  function seekPreviewToMs(nextMs) {
    const durationMs = resolvePreviewDurationMs();
    const bounded = Math.max(0, Math.min(Number(nextMs) || 0, durationMs || 0));
    state.subtitles2.previewCurrentMs = bounded;
    if (el.subtitle2PreviewVideo) el.subtitle2PreviewVideo.currentTime = bounded / 1000;
    renderPreviewOverlay();
  }

  function seekPreviewToRow(rowId) {
    const hasPreview = Boolean((state.subtitles2.previewVideoObjectUrl || state.subtitles2.previewVideoUrl || '').toString().trim());
    if (!hasPreview) return;
    const targetId = (rowId || '').toString();
    if (!targetId) return;
    const row = (state.subtitles2.rows || []).find((item) => item?.id === targetId);
    if (!row) return;
    const startMs = parseSubtitleTimeToMsRuntime(row.start);
    seekPreviewToMs(startMs);
    el.subtitle2PreviewVideo?.pause();
  }

  function seekPreviewFromClientX(clientX) {
    const timeline = el.subtitle2PreviewTimelineTrack;
    if (!timeline) return;
    const rect = timeline.getBoundingClientRect();
    const durationMs = resolvePreviewDurationMs();
    const nextMs = resolveSubtitleTimelineSeekMsRuntime({
      clientX,
      rectLeft: rect.left,
      rectWidth: rect.width,
      durationMs,
    });
    seekPreviewToMs(nextMs);
  }

  function cleanupPreviewDrag() {
    subtitle2PreviewDragCleanup?.();
    subtitle2PreviewDragCleanup = null;
  }

  function onTimelineDragStart(ev) {
    if (ev.button !== 0) return;
    ev.preventDefault();
    cleanupPreviewDrag();
    seekPreviewFromClientX(ev.clientX);
    const onMouseMove = (moveEv) => {
      seekPreviewFromClientX(moveEv.clientX);
    };
    const onMouseUp = () => {
      cleanupPreviewDrag();
    };
    windowRef.addEventListener('mousemove', onMouseMove);
    windowRef.addEventListener('mouseup', onMouseUp);
    subtitle2PreviewDragCleanup = () => {
      windowRef.removeEventListener('mousemove', onMouseMove);
      windowRef.removeEventListener('mouseup', onMouseUp);
    };
  }

  bindUserScrollListeners();

  return {
    revokePreviewObjectUrl,
    loadPreviewVideoBlob,
    renderPreviewPlayer,
    renderPreviewOverlay,
    renderPreviewTimeline,
    syncActiveTableRow,
    renderPreviewPlaybackState,
    applyVideoDuration,
    onLoadedMetadata,
    onTimeUpdate,
    onToggleClicked,
    onTimelineClick,
    onTimelineDragStart,
    seekPreviewToMs,
    seekPreviewToRow,
    seekPreviewFromClientX,
    cleanupPreviewDrag,
  };
}
