import { findMotionPreset } from '../domain/motion-presets.js';
import { resolveEditorEffectTab } from './editor-effect-tabs.js';
import { hydrateMotionScrubberInput } from './motion-scrub.js';
import { destroyCompositionRenderer, hydrateCompositionPreview, hydratePreviewTransport, getCompositionRendererForPreview } from './preview-lifecycle.js';
import { hydrateVideoSelectorControls } from './video-selector-hydration.js';

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
  renderSelectedVideoProject,
  updateSelectedVideoProjectCompositionPreview,
  showToast,
  exportFinal,
  preparePreview,
  goToAudioStep,
}) {
  if (!['preview_ready', 'editing_dirty', 'final_ready', 'error'].includes(editorPhase)) return;
  if (editorRows.length) hydrateCompositionPreview({ root, project, editorRows });
  else destroyCompositionRenderer();
  const selectEditorRow = (rowId, startTime) => {
    if (!rowId) return;
    project._selectedEditorRowId = rowId;
    const nextTime = Number(startTime);
    if (Number.isFinite(nextTime)) {
      project._previewSeekTime = nextTime;
      getCompositionRendererForPreview()?.seek(nextTime);
    }
    renderSelectedVideoProject?.();
  };
  const previewControls = hydratePreviewTransport({ root, project, editorRows, selectEditorRow });
  hydrateEditorTabs({ root, project, renderSelectedVideoProject });
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

function hydrateEditorTabs({ root, project, renderSelectedVideoProject }) {
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
