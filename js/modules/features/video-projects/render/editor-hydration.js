import { findMotionPreset } from '../domain/motion-presets.js';
import { shouldHandleEditorUndoKey } from '../controller/undo-manager.js';
import { resolveEditorEffectTab } from './editor-effect-tabs.js';
import { buildEditorDetailRail } from './editor-markup.js';
import { hydrateMotionScrubberInput } from './motion-scrub.js';
import { destroyCompositionRenderer, hydrateCompositionPreview, hydratePreviewTransport, getCompositionRendererForPreview } from './preview-lifecycle.js';
import { hydrateVideoSelectorControls } from './video-selector-hydration.js';

const EDITOR_UNDO_CLEANUP_KEY = '__videoProjectsEditorUndoCleanup';

export function hydrateEditorUndoShortcut({ root, editorPhase, undoEditorChange } = {}) {
  const doc = root?.ownerDocument || (typeof document !== 'undefined' ? document : null);
  const editorActive = ['preview_ready', 'editing_dirty', 'final_ready', 'error'].includes(editorPhase);
  if (typeof root?.[EDITOR_UNDO_CLEANUP_KEY] === 'function') {
    root[EDITOR_UNDO_CLEANUP_KEY]();
    root[EDITOR_UNDO_CLEANUP_KEY] = null;
  }
  if (!doc || !editorActive || typeof undoEditorChange !== 'function') return null;

  const handleKeydown = async (event) => {
    const isRootConnected = root?.isConnected !== false;
    if (!isRootConnected) return;
    if (!shouldHandleEditorUndoKey(event, { editorActive: true })) return;
    event.preventDefault?.();
    await undoEditorChange();
  };

  doc.addEventListener?.('keydown', handleKeydown);
  const cleanup = () => doc.removeEventListener?.('keydown', handleKeydown);
  root[EDITOR_UNDO_CLEANUP_KEY] = cleanup;
  return cleanup;
}

export function hydrateEditorPhaseInteractions({
  root,
  project,
  editorPhase,
  editorRows = [],
  assignExistingImageToRow,
  uploadAndAssignImage,
  uploadVideoToLibrary,
  assignVideoSegmentToRow,
  updateGlobalAudio,
  updateBrandChannel,
  updateRow,
  swapRowImages,
  renderSelectedVideoProject,
  updateSelectedVideoProjectCompositionPreview,
  showToast,
  exportFinal,
  preparePreview,
  goToAudioStep,
  undoEditorChange,
}) {
  if (!['preview_ready', 'editing_dirty', 'final_ready', 'error'].includes(editorPhase)) return;
  hydrateEditorUndoShortcut({ root, editorPhase, undoEditorChange });
  if (editorRows.length) hydrateCompositionPreview({ root, project, editorRows });
  else destroyCompositionRenderer();
  let previewControls = null;
  const renderEditorSelectionOnly = (rowId) => {
    const selectedIndex = editorRows.findIndex((row) => row.id === rowId || row.rowId === rowId);
    const selectedRow = selectedIndex >= 0 ? editorRows[selectedIndex] : null;
    root.querySelectorAll('.video-preview-timeline__marker[data-row-id]').forEach((marker) => {
      marker.classList.toggle('is-selected', marker.dataset.rowId === rowId);
    });
    root.querySelectorAll('.video-editor-row[data-row-id]').forEach((rowEl) => {
      const isSelected = rowEl.dataset.rowId === rowId;
      rowEl.classList.toggle('is-selected', isSelected);
      rowEl.setAttribute('aria-selected', isSelected ? 'true' : 'false');
    });
    const detailHost = root.querySelector('.video-editor-shell__right');
    if (!detailHost) return;
    detailHost.innerHTML = buildEditorDetailRail({ row: selectedRow, globalAudio: project._globalAudio || {}, project, rowIndex: Math.max(0, selectedIndex) });
    hydrateEditorTabs({ root: detailHost, project, renderSelectedVideoProject, updateRow });
    hydrateAssetCommands({ root: detailHost, assignExistingImageToRow, uploadAndAssignImage, uploadVideoToLibrary, project });
    hydrateVideoSelectorControls({ root: detailHost, project, editorRows, renderSelectedVideoProject, assignVideoSegmentToRow, updateSelectedVideoProjectCompositionPreview, showToast });
    hydrateMotionControls({ root: detailHost, project, updateRow, updatePreviewTimeline: previewControls?.updatePreviewTimeline });
    hydrateEffectAndAudioControls({ root: detailHost, updateRow, updateGlobalAudio, updateBrandChannel });
  };
  const selectEditorRow = (rowId, startTime, options = {}) => {
    if (!rowId) return;
    project._selectedEditorRowId = rowId;
    const nextTime = Number(startTime);
    if (options.syncPreview !== false && Number.isFinite(nextTime)) {
      project._previewSeekTime = nextTime;
      getCompositionRendererForPreview()?.seek(nextTime);
    }
    if (options.render === false) renderEditorSelectionOnly(rowId);
    else renderSelectedVideoProject?.();
  };
  previewControls = hydratePreviewTransport({ root, project, editorRows, selectEditorRow });
  hydrateEditorTabs({ root, project, renderSelectedVideoProject, updateRow });
  hydrateRowImageSwapControls({ root, editorRows, updateRow, swapRowImages });
  hydrateBoundaryTransitionControls({ root, updateRow, renderSelectedVideoProject });
  hydrateAssetCommands({ root, assignExistingImageToRow, uploadAndAssignImage, uploadVideoToLibrary, project });
  hydrateVideoSelectorControls({ root, project, editorRows, renderSelectedVideoProject, assignVideoSegmentToRow, updateSelectedVideoProjectCompositionPreview, showToast });
  hydrateMotionControls({ root, project, updateRow, updatePreviewTimeline: previewControls?.updatePreviewTimeline });
  hydrateEffectAndAudioControls({ root, updateRow, updateGlobalAudio, updateBrandChannel });
  root.querySelector('[data-action="retry-prepare-preview"]')?.addEventListener('click', () => preparePreview?.());
  root.querySelector('[data-action="return-to-audio-step"]')?.addEventListener('click', () => {
    if (project?.editor_state?.phase === 'error') {
      project.editor_state = {
        ...project.editor_state,
        phase: 'idle',
        last_prepare_error: project.editor_state.error || project.editor_state.last_prepare_error || '',
      };
    }
    goToAudioStep?.();
  });
  root.querySelector('[data-action="export-final"]')?.addEventListener('click', () => exportFinal?.());
}

export function hydrateBoundaryTransitionControls({ root, updateRow, renderSelectedVideoProject } = {}) {
  const buttons = [...(root?.querySelectorAll?.('[data-action="set-boundary-transition"]') || [])];
  buttons.forEach((button) => {
    button.addEventListener('click', async () => {
      const rowId = button.dataset.rowId || '';
      const nextRowId = button.dataset.nextRowId || '';
      const transition = ['whip', 'glitch-1', 'glitch-2'].includes(button.dataset.transition) ? button.dataset.transition : 'none';
      if (!rowId || !nextRowId) return;
      await updateRow?.(rowId, { boundaryTransition: transition, nextRowId });
      renderSelectedVideoProject?.();
    });
  });
  return buttons.length;
}

export function hydrateRowImageSwapControls({ root, editorRows = [], updateRow, swapRowImages } = {}) {
  const imageRowsById = new Map(
    editorRows
      .filter((row) => row?.id && row?.media?.kind !== 'video-segment')
      .map((row) => [row.id, row]),
  );
  const thumbs = [...(root?.querySelectorAll?.('[data-action="swap-row-image"]') || [])];

  thumbs.forEach((thumb) => {
    thumb.addEventListener('dragstart', (event) => {
      const rowId = thumb.dataset.rowId || '';
      const assetId = thumb.dataset.assetId || imageRowsById.get(rowId)?.selectedAssetId || '';
      if (!rowId || !assetId || !imageRowsById.has(rowId)) {
        event.preventDefault?.();
        return;
      }
      event.dataTransfer?.setData('application/x-video-row-image', JSON.stringify({ rowId, assetId }));
      event.dataTransfer?.setData('text/plain', rowId);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    });

    thumb.addEventListener('dragover', (event) => {
      if (!imageRowsById.has(thumb.dataset.rowId || '')) return;
      event.preventDefault?.();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
      thumb.classList?.add('is-drop-target');
    });

    thumb.addEventListener('dragleave', () => {
      thumb.classList?.remove('is-drop-target');
    });

    thumb.addEventListener('drop', async (event) => {
      event.preventDefault?.();
      thumb.classList?.remove('is-drop-target');
      const targetRowId = thumb.dataset.rowId || '';
      const targetAssetId = thumb.dataset.assetId || imageRowsById.get(targetRowId)?.selectedAssetId || '';
      let source = null;
      try {
        source = JSON.parse(event.dataTransfer?.getData('application/x-video-row-image') || 'null');
      } catch {
        source = null;
      }
      const sourceRowId = source?.rowId || '';
      const sourceAssetId = source?.assetId || '';
      if (!sourceRowId || !targetRowId || sourceRowId === targetRowId) return;
      if (!sourceAssetId || !targetAssetId) return;
      if (!imageRowsById.has(sourceRowId) || !imageRowsById.has(targetRowId)) return;

      if (typeof swapRowImages === 'function') {
        await swapRowImages(sourceRowId, targetRowId);
        return;
      }
      await updateRow?.(sourceRowId, { selectedAssetId: targetAssetId });
      await updateRow?.(targetRowId, { selectedAssetId: sourceAssetId });
    });
  });

  return thumbs.length;
}

function hydrateEditorTabs({ root, project, renderSelectedVideoProject, updateRow }) {
  root.querySelectorAll('[data-action="switch-effect-tab"]').forEach((button) => {
    button.addEventListener('click', () => {
      const activeTab = resolveEditorEffectTab(button.dataset.effectTab);
      project._editorEffectTab = activeTab;
      const section = button.closest('.video-editor-detail__section');
      section?.querySelectorAll('[data-action="switch-effect-tab"]').forEach((tabButton) => {
        const isActive = tabButton.dataset.effectTab === activeTab;
        tabButton.classList.toggle('is-active', isActive);
        tabButton.setAttribute('aria-selected', isActive ? 'true' : 'false');
        tabButton.setAttribute('tabindex', isActive ? '0' : '-1');
      });
      section?.querySelectorAll('.video-editor-effect-panel').forEach((panel) => {
        panel.hidden = panel.id !== `video-editor-effect-panel-${activeTab}`;
      });
    });
  });
  root.querySelectorAll('[data-action="open-assets-tab"]').forEach((button) => {
    button.addEventListener('click', () => {
      const rowId = button.dataset.rowId;
      if (rowId) project._selectedEditorRowId = rowId;
      project._editorEffectTab = 'assets';
      renderSelectedVideoProject?.();
    });
  });
  root.querySelectorAll('[data-action="open-videos-tab"]').forEach((button) => {
    button.addEventListener('click', () => {
      const rowId = button.dataset.rowId;
      if (rowId) project._selectedEditorRowId = rowId;
      project._editorEffectTab = 'videos';
      renderSelectedVideoProject?.();
    });
  });
  root.querySelectorAll('[data-action="open-newspaper-tab"]').forEach((button) => {
    button.addEventListener('click', async () => {
      const rowId = button.dataset.rowId;
      const startTime = Number(button.dataset.startTime);
      if (rowId) project._selectedEditorRowId = rowId;
      if (Number.isFinite(startTime)) project._previewSeekTime = startTime;
      project._editorEffectTab = 'newspaper';
      await updateRow?.(rowId, { mediaMode: 'newspaper', media: { kind: 'image' } });
      renderSelectedVideoProject?.();
    });
  });
  root.querySelectorAll('[data-action="switch-motion-editor-tab"]').forEach((button) => {
    button.addEventListener('click', () => {
      const activeTab = button.dataset.motionEditorTab === 'manual' ? 'manual' : 'presets';
      project._motionEditorTab = activeTab;
      const section = button.closest('.video-editor-effect-panel');
      section?.querySelectorAll('[data-action="switch-motion-editor-tab"]').forEach((tabButton) => {
        const isActive = tabButton.dataset.motionEditorTab === activeTab;
        tabButton.classList.toggle('is-active', isActive);
        tabButton.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });
      section?.querySelectorAll('[data-motion-editor-panel]').forEach((panel) => {
        panel.hidden = panel.dataset.motionEditorPanel !== activeTab;
      });
    });
  });
}

function hydrateAssetCommands({ root, assignExistingImageToRow, uploadAndAssignImage, uploadVideoToLibrary, project }) {
  root.querySelectorAll('[data-action="assign-row-asset"]').forEach((button) => {
    button.addEventListener('click', async () => {
      const rowId = button.dataset.rowId;
      const assetUrl = button.dataset.assetUrl;
      if (rowId && assetUrl) await assignExistingImageToRow?.(rowId, assetUrl);
    });
  });
  root.querySelectorAll('[data-action="upload-row-image"], [data-action="upload-assets-image"]').forEach((input) => {
    input.addEventListener('change', async () => {
      const [file] = input.files || [];
      const rowId = input.dataset.rowId;
      if (!file || !rowId) return;
      if (input.dataset.action === 'upload-assets-image') project._editorEffectTab = 'assets';
      await uploadAndAssignImage?.(rowId, file);
      input.value = '';
    });
  });
  root.querySelectorAll('[data-action="upload-row-video"]').forEach((input) => {
    input.addEventListener('change', async () => {
      const [file] = input.files || [];
      const rowId = input.dataset.rowId;
      if (!file || !rowId) return;
      project._editorEffectTab = 'videos';
      await uploadVideoToLibrary?.(rowId, file);
      input.value = '';
    });
  });
}

function hydrateMotionControls({ root, project, updateRow, updatePreviewTimeline }) {
  root.querySelectorAll('[data-action="update-row-motion"]').forEach((control) => {
    const eventName = control.tagName === 'SELECT' ? 'change' : 'click';
    control.addEventListener(eventName, () => {
      const rowId = control.dataset.rowId;
      if (!rowId) return;
      const preset = findMotionPreset(control.value);
      root.querySelectorAll('[data-action="update-row-motion"]').forEach((button) => {
        if (button.dataset.rowId !== rowId) return;
        const isSelected = button.value === control.value;
        button.classList.toggle('is-selected', isSelected);
        button.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
      });
      updateManualMotionPanelValues(root, rowId, preset, preset?.name || control.value);
      updateRow?.(rowId, { motionPresetId: preset?.name || control.value, motion: preset ? { ...preset } : control.value });
    });
  });
  root.querySelectorAll('[data-action="seek-motion-keyframe"]').forEach((button) => {
    button.addEventListener('click', () => {
      const rowId = button.dataset.rowId;
      const seekTime = Number(button.dataset.seekTime || 0);
      if (rowId) project._selectedEditorRowId = rowId;
      if (!Number.isFinite(seekTime)) return;
      project._previewSeekTime = seekTime;
      const renderer = getCompositionRendererForPreview();
      if (renderer) { renderer.seek(seekTime); updatePreviewTimeline?.(seekTime, renderer.duration); }
      else {
        const previewVideo = root.querySelector('[data-preview-video]');
        if (previewVideo) { previewVideo.currentTime = seekTime; updatePreviewTimeline?.(seekTime, previewVideo.duration); }
      }
    });
  });
  root.querySelectorAll('[data-action="update-row-motion-keyframe"]').forEach((input) => {
    const updateManualMotionKeyframe = () => {
      const panel = input.closest('[data-motion-manual]');
      const rowId = panel?.dataset.rowId || '';
      if (!rowId) return;
      const readField = (field, fallback = 0) => {
        const value = Number(panel.querySelector(`[data-motion-field="${field}"]`)?.value);
        return Number.isFinite(value) ? value : fallback;
      };
      const motionPresetId = panel.dataset.motionPreset || 'custom';
      updateRow?.(rowId, {
        motionPresetId,
        motion: { name: motionPresetId, presetName: motionPresetId, fromX: readField('fromX'), fromY: readField('fromY'), toX: readField('toX'), toY: readField('toY'), fromScale: Math.max(0.1, readField('fromScalePercent', 100) / 100), toScale: Math.max(0.1, readField('toScalePercent', 100) / 100), easing: 'linear' },
        manualMotionDraft: true,
      });
    };
    input.addEventListener('input', updateManualMotionKeyframe);
    input.addEventListener('change', updateManualMotionKeyframe);
    hydrateMotionScrubberInput(input);
  });
}

function updateManualMotionPanelValues(root, rowId, preset, presetName = '') {
  if (!root || !rowId || !preset || typeof preset !== 'object') return;
  const panels = [...(root.querySelectorAll?.('[data-motion-manual]') || [])];
  const panel = panels.find((item) => item?.dataset?.rowId === rowId);
  if (!panel) return;
  panel.dataset.motionPreset = presetName || preset.name || 'custom';
  const setFieldValue = (field, value) => {
    const input = panel.querySelector?.(`[data-motion-field="${field}"]`);
    if (input) input.value = Number.isFinite(Number(value)) ? String(value) : '0';
  };
  setFieldValue('fromX', preset.fromX ?? 0);
  setFieldValue('fromY', preset.fromY ?? 0);
  setFieldValue('toX', preset.toX ?? 0);
  setFieldValue('toY', preset.toY ?? 0);
  setFieldValue('fromScalePercent', Math.round(Number(preset.fromScale ?? 1) * 100));
  setFieldValue('toScalePercent', Math.round(Number(preset.toScale ?? 1) * 100));
}

function hydrateEffectAndAudioControls({ root, updateRow, updateGlobalAudio, updateBrandChannel }) {
  root.querySelectorAll('[data-action="update-row-dust"]').forEach((select) => {
    select.addEventListener('change', () => {
      const rowId = select.dataset.rowId;
      if (rowId) updateRow?.(rowId, { dust: { enabled: select.value !== 'none', type: select.value === 'none' ? 'dust-1' : select.value } });
    });
  });
  root.querySelectorAll('[data-action="update-row-logo"]').forEach((select) => {
    select.addEventListener('change', () => { if (select.dataset.rowId) updateRow?.(select.dataset.rowId, { logo: { enabled: select.value === 'true' } }); });
  });
  root.querySelectorAll('[data-action="update-row-newspaper-label"]').forEach((input) => {
    input.addEventListener('change', () => {
      const rowId = input.dataset.rowId || input.closest('[data-newspaper-controls]')?.dataset?.rowId || '';
      if (rowId) updateRow?.(rowId, { newspaper: { labelEnabled: input.checked } });
    });
  });
  root.querySelectorAll('[data-action="update-row-newspaper"]').forEach((input) => {
    const updateNewspaper = () => {
      const panel = input.closest('[data-newspaper-controls]');
      const rowId = panel?.dataset.rowId || '';
      if (!rowId) return;
      const readField = (field, fallback = 0) => {
        const value = Number(panel.querySelector(`[data-newspaper-field="${field}"]`)?.value);
        return Number.isFinite(value) ? value : fallback;
      };
      updateRow?.(rowId, {
        newspaper: {
          foregroundMotion: {
            fromX: readField('fromX'),
            fromY: readField('fromY'),
            toX: readField('toX'),
            toY: readField('toY'),
            fromScale: Math.max(0.1, readField('fromScalePercent', 100) / 100),
            toScale: Math.max(0.1, readField('toScalePercent', 125) / 100),
            easing: 'linear',
          },
        },
      });
    };
    input.addEventListener('input', updateNewspaper);
    input.addEventListener('change', updateNewspaper);
    hydrateMotionScrubberInput(input);
  });
  root.querySelectorAll('[data-action="update-brand-channel"]').forEach((select) => select.addEventListener('change', () => updateBrandChannel?.(select.value)));
  root.querySelectorAll('[data-action="update-global-audio"]').forEach((input) => {
    const updateRangePreview = () => {
      const percent = Math.round(Number(input.value) * 100);
      input.style.setProperty('--range-progress', `${percent}%`);
      const label = input.closest('.video-editor-control')?.querySelector(`[data-audio-volume-label="${input.dataset.audioKind}"]`);
      if (label) label.textContent = `${percent}%`;
    };
    if (input.dataset.field === 'volume') input.addEventListener('input', updateRangePreview);
    input.addEventListener('change', () => {
      const kind = input.dataset.audioKind;
      const field = input.dataset.field;
      if (!kind || !field) return;
      const patch = {};
      if (field === 'volume') { patch.volume = Number(input.value); updateRangePreview(); }
      if (field === 'muted') patch.muted = input.checked;
      updateGlobalAudio?.(kind, patch);
    });
  });
}
