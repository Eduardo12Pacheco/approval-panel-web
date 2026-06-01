import { findProjectVideoAsset } from '../domain/video-assets.js';
import { resolveVideoSelectorOpenAction, resolveVideoSegmentSelectionWindow } from './editor-video-picker.js';
import { getCompositionRendererForPreview, syncVideoSelectorPreviewLayers } from './preview-lifecycle.js';

const VIDEO_SELECTOR_SCROLL_LOCK_CLASS = 'video-editor-video-selector--scroll-locked';
const VIDEO_SELECTOR_PORTAL_ATTRIBUTE = 'data-video-selector-portal';

function getOwnerDocument(root) {
  return root?.ownerDocument || globalThis.document || null;
}

function getDefaultView(doc) {
  return doc?.defaultView || globalThis.window || null;
}

function canUsePortal(doc) {
  return Boolean(doc?.body?.appendChild && doc?.createElement);
}

function getVideoSelectorPortal(doc) {
  if (!canUsePortal(doc)) return null;
  let portal = doc.body.querySelector?.(`[${VIDEO_SELECTOR_PORTAL_ATTRIBUTE}]`);
  if (!portal) {
    portal = doc.createElement('div');
    portal.setAttribute(VIDEO_SELECTOR_PORTAL_ATTRIBUTE, '');
    doc.body.appendChild(portal);
  }
  return portal;
}

export function lockVideoSelectorPageScroll(doc = globalThis.document) {
  if (!doc?.body || !doc?.documentElement) return false;
  const win = getDefaultView(doc);
  if (doc.body.dataset.videoSelectorScrollLocked === 'true') return true;

  const scrollY = Number(win?.scrollY || doc.documentElement.scrollTop || doc.body.scrollTop || 0);
  doc.body.dataset.videoSelectorScrollLocked = 'true';
  doc.body.dataset.videoSelectorScrollY = String(scrollY);
  doc.body.dataset.videoSelectorPreviousPosition = doc.body.style.position || '';
  doc.body.dataset.videoSelectorPreviousTop = doc.body.style.top || '';
  doc.body.dataset.videoSelectorPreviousWidth = doc.body.style.width || '';
  doc.body.dataset.videoSelectorPreviousOverflow = doc.body.style.overflow || '';
  doc.documentElement.dataset.videoSelectorPreviousOverflow = doc.documentElement.style.overflow || '';

  doc.documentElement.classList?.add(VIDEO_SELECTOR_SCROLL_LOCK_CLASS);
  doc.body.classList?.add(VIDEO_SELECTOR_SCROLL_LOCK_CLASS);
  doc.documentElement.style.overflow = 'hidden';
  doc.body.style.overflow = 'hidden';
  doc.body.style.position = 'fixed';
  doc.body.style.top = `-${scrollY}px`;
  doc.body.style.width = '100%';
  return true;
}

export function unlockVideoSelectorPageScroll(doc = globalThis.document) {
  if (!doc?.body || !doc?.documentElement) return false;
  if (doc.body.dataset.videoSelectorScrollLocked !== 'true') return false;

  const win = getDefaultView(doc);
  const scrollY = Number(doc.body.dataset.videoSelectorScrollY || 0);
  doc.documentElement.classList?.remove(VIDEO_SELECTOR_SCROLL_LOCK_CLASS);
  doc.body.classList?.remove(VIDEO_SELECTOR_SCROLL_LOCK_CLASS);
  doc.documentElement.style.overflow = doc.documentElement.dataset.videoSelectorPreviousOverflow || '';
  doc.body.style.overflow = doc.body.dataset.videoSelectorPreviousOverflow || '';
  doc.body.style.position = doc.body.dataset.videoSelectorPreviousPosition || '';
  doc.body.style.top = doc.body.dataset.videoSelectorPreviousTop || '';
  doc.body.style.width = doc.body.dataset.videoSelectorPreviousWidth || '';

  delete doc.documentElement.dataset.videoSelectorPreviousOverflow;
  delete doc.body.dataset.videoSelectorScrollLocked;
  delete doc.body.dataset.videoSelectorScrollY;
  delete doc.body.dataset.videoSelectorPreviousPosition;
  delete doc.body.dataset.videoSelectorPreviousTop;
  delete doc.body.dataset.videoSelectorPreviousWidth;
  delete doc.body.dataset.videoSelectorPreviousOverflow;
  win?.scrollTo?.(0, scrollY);
  return true;
}

export function removeVideoSelectorPortal(doc = globalThis.document) {
  const portal = doc?.body?.querySelector?.(`[${VIDEO_SELECTOR_PORTAL_ATTRIBUTE}]`);
  portal?.remove?.();
}

function closeVideoSelector({ project, renderSelectedVideoProject, doc }) {
  project._videoSelector = null;
  removeVideoSelectorPortal(doc);
  unlockVideoSelectorPageScroll(doc);
  renderSelectedVideoProject?.();
}

export function mountVideoSelectorPortal(root) {
  const doc = getOwnerDocument(root);
  const modal = root?.querySelector?.('[data-video-selector-modal]');
  const backdrop = root?.querySelector?.('[data-video-selector-backdrop]');
  if (!modal || !backdrop) {
    removeVideoSelectorPortal(doc);
    unlockVideoSelectorPageScroll(doc);
    return false;
  }

  const portal = getVideoSelectorPortal(doc);
  if (!portal) return false;
  portal.replaceChildren(backdrop, modal);
  lockVideoSelectorPageScroll(doc);
  return true;
}

function updateVideoSelectorPreviewToggle(button, playing) {
  if (!button) return;
  button.setAttribute('aria-pressed', playing ? 'true' : 'false');
  button.textContent = playing ? '⏸ Preview' : '▶ Preview';
}

function readSelectorSourceIn(modal) {
  return Number(modal?.querySelector?.('[data-video-selector-window]')?.dataset.sourceIn || 0);
}

function hydrateSingleVideoSelectorPreview({ modal, syncPreviewLayers = syncVideoSelectorPreviewLayers }) {
  if (!modal?.querySelector) return false;
  syncPreviewLayers({ modal, sourceInSeconds: readSelectorSourceIn(modal), playing: false });
  const toggle = modal.querySelector('[data-action="toggle-video-selector-preview"]');
  toggle?.addEventListener('click', () => {
    const playing = modal.dataset.previewPlaying !== 'true';
    modal.dataset.previewPlaying = playing ? 'true' : 'false';
    updateVideoSelectorPreviewToggle(toggle, playing);
    syncPreviewLayers({ modal, sourceInSeconds: readSelectorSourceIn(modal), playing });
  });
  return true;
}

export function hydrateVideoSelectorPreviewControls({ root, modal, syncPreviewLayers = syncVideoSelectorPreviewLayers } = {}) {
  if (modal) return hydrateSingleVideoSelectorPreview({ modal, syncPreviewLayers });
  const modals = Array.from(root?.querySelectorAll?.('[data-video-selector-modal]') || []);
  modals.forEach((item) => hydrateSingleVideoSelectorPreview({ modal: item, syncPreviewLayers }));
  return modals.length;
}

export function hydrateVideoSelectorControls({
  root,
  project,
  editorRows = [],
  renderSelectedVideoProject,
  refreshEditorSelectionOnly,
  assignVideoSegmentToRow,
  updateSelectedVideoProjectCompositionPreview,
  showToast,
}) {
  const doc = getOwnerDocument(root);
  root.querySelectorAll('[data-action="open-video-selector"]').forEach((button) => {
    button.addEventListener('click', () => {
      const rowId = button.dataset.rowId;
      const videoId = button.dataset.videoId;
      const row = editorRows.find((item) => item.id === rowId || item.rowId === rowId);
      const action = resolveVideoSelectorOpenAction({
        row,
        video: { id: videoId, src: button.dataset.videoSrc || '', durationSeconds: Number(button.dataset.videoDuration || 0) },
      });
      if (!action.ok) {
        showToast?.(action.toastMessage);
        return;
      }
      project._selectedEditorRowId = rowId;
      const rowStartTime = Number(row?.startTime);
      if (Number.isFinite(rowStartTime)) {
        project._previewSeekTime = rowStartTime;
        const renderer = getCompositionRendererForPreview();
        if (renderer) renderer.seek(rowStartTime);
      }
      project._editorEffectTab = 'content';
      project._videoSelector = action.selector;
      if (typeof refreshEditorSelectionOnly === 'function') refreshEditorSelectionOnly(rowId);
      else renderSelectedVideoProject?.();
    });
  });

  root.querySelectorAll('[data-action="cancel-video-selector"]').forEach((button) => {
    button.addEventListener('click', () => {
      closeVideoSelector({ project, renderSelectedVideoProject, doc });
    });
  });

  hydrateVideoSelectorPreviewControls({ root });

  root.querySelector('[data-video-selector-window]')?.addEventListener('pointerdown', (ev) => {
    const selectorWindow = ev.currentTarget;
    const modal = selectorWindow.closest('[data-video-selector-modal]');
    const timeline = modal?.querySelector('[data-video-selector-timeline]');
    if (!modal || !timeline) return;
    ev.preventDefault();
    selectorWindow.setPointerCapture?.(ev.pointerId);
    const move = (moveEvent) => {
      const rect = timeline.getBoundingClientRect();
      if (!rect.width) return;
      const pct = Math.max(0, Math.min((moveEvent.clientX - rect.left) / rect.width, 1));
      const sourceDurationSeconds = Number(timeline.dataset.sourceDuration || 0);
      const targetDurationSeconds = Number(timeline.dataset.targetDuration || 0);
      const requestedSourceInSeconds = pct * sourceDurationSeconds;
      const nextWindow = resolveVideoSegmentSelectionWindow({ sourceDurationSeconds, targetDurationSeconds, requestedSourceInSeconds });
      const windowLeftPercent = sourceDurationSeconds > 0 ? Math.round((nextWindow.sourceInSeconds / sourceDurationSeconds) * 100000) / 1000 : 0;
      const windowWidthPercent = sourceDurationSeconds > 0 ? Math.round((nextWindow.durationSeconds / sourceDurationSeconds) * 100000) / 1000 : 0;
      project._videoSelector = { videoId: modal.dataset.videoId, ...nextWindow, windowLeftPercent, windowWidthPercent };
      selectorWindow.dataset.sourceIn = nextWindow.sourceInSeconds.toString();
      selectorWindow.dataset.sourceOut = nextWindow.sourceOutSeconds.toString();
      selectorWindow.style.setProperty('--window-left', `${windowLeftPercent}%`);
      selectorWindow.style.setProperty('--window-width', `${windowWidthPercent}%`);
      modal.querySelector('[data-action="commit-video-segment"]')?.setAttribute('data-source-in', nextWindow.sourceInSeconds.toString());
      syncVideoSelectorPreviewLayers({ modal, sourceInSeconds: nextWindow.sourceInSeconds, playing: modal.dataset.previewPlaying === 'true' });
    };
    const up = (upEvent) => {
      selectorWindow.releasePointerCapture?.(upEvent.pointerId);
      selectorWindow.removeEventListener('pointermove', move);
      selectorWindow.removeEventListener('pointerup', up);
      selectorWindow.removeEventListener('pointercancel', up);
      renderSelectedVideoProject?.();
    };
    selectorWindow.addEventListener('pointermove', move);
    selectorWindow.addEventListener('pointerup', up);
    selectorWindow.addEventListener('pointercancel', up);
  });

  root.querySelectorAll('[data-action="commit-video-segment"]').forEach((button) => {
    button.addEventListener('click', async () => {
      const rowId = button.dataset.rowId;
      const videoId = button.dataset.videoId;
      const video = findProjectVideoAsset(project, videoId);
      const currentRows = Array.isArray(project?._editorRows) ? project._editorRows : editorRows;
      const row = currentRows.find((item) => item?.id === rowId || item?.rowId === rowId);
      const rowStartTime = Number(row?.startTime);
      project._selectedEditorRowId = rowId;
      if (Number.isFinite(rowStartTime)) project._previewSeekTime = rowStartTime;
      project._videoSelector = null;
      removeVideoSelectorPortal(doc);
      unlockVideoSelectorPageScroll(doc);
      const assigned = await assignVideoSegmentToRow?.(rowId, video, Number(button.dataset.sourceIn || 0));
      project._selectedEditorRowId = rowId;
      if (Number.isFinite(rowStartTime)) {
        project._previewSeekTime = rowStartTime;
        const renderer = getCompositionRendererForPreview();
        if (renderer) renderer.seek(rowStartTime);
      }
      updateSelectedVideoProjectCompositionPreview?.({ project });
      if (assigned && typeof refreshEditorSelectionOnly === 'function') refreshEditorSelectionOnly(rowId);
      else renderSelectedVideoProject?.();
    });
  });

  mountVideoSelectorPortal(root);
}
