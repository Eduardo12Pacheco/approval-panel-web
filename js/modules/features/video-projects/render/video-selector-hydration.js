import { findProjectVideoAsset } from '../domain/video-assets.js';
import { resolveVideoSelectorOpenAction, resolveVideoSegmentSelectionWindow } from './editor-video-picker.js';
import { syncVideoSelectorPreviewLayers } from './preview-lifecycle.js';

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
  assignVideoSegmentToRow,
  updateSelectedVideoProjectCompositionPreview,
  showToast,
}) {
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
      project._editorEffectTab = 'content';
      project._videoSelector = action.selector;
      renderSelectedVideoProject?.();
    });
  });

  root.querySelectorAll('[data-action="cancel-video-selector"]').forEach((button) => {
    button.addEventListener('click', () => {
      project._videoSelector = null;
      renderSelectedVideoProject?.();
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
      project._videoSelector = null;
      const assigned = await assignVideoSegmentToRow?.(rowId, video, Number(button.dataset.sourceIn || 0));
      updateSelectedVideoProjectCompositionPreview?.({ project });
      if (!assigned) renderSelectedVideoProject?.();
    });
  });
}
