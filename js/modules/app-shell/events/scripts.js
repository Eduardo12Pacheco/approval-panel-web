import { resolveScriptTitle } from '../../features/scripts/index.js';

export function bindScriptEvents({
  state,
  el,
  updateWordCounter,
  renderScriptCards,
  renderSelectedScriptEditor,
  publishSelectedScript,
  openVoiceAiPresetDialog,
  confirmVoiceAiPresetSelection,
  downloadSelectedScriptDocx,
  refreshVideoProjects,
  createManualVideoProject,
}) {
  function countManualSegments() {
    const raw = (el.manualVideoProjectScriptInput?.value || '').trim();
    if (!raw) return 0;
    return raw.split('|').map((part) => part.trim()).filter(Boolean).length;
  }

  function updateManualValidation() {
    if (!el.manualVideoProjectValidation) return;
    const count = countManualSegments();
    el.manualVideoProjectValidation.textContent = count ? `${count} segmento${count === 1 ? '' : 's'} detectado${count === 1 ? '' : 's'}` : 'Pegá un guion separado por pipes.';
  }

  function resetManualVideoProjectForm() {
    if (el.manualVideoProjectTitleInput) el.manualVideoProjectTitleInput.value = '';
    if (el.manualVideoProjectPlayerInput) el.manualVideoProjectPlayerInput.value = '';
    if (el.manualVideoProjectCountryInput) el.manualVideoProjectCountryInput.value = '';
    if (el.manualVideoProjectScriptInput) el.manualVideoProjectScriptInput.value = '';
    updateManualValidation();
  }

  el.closeScriptEditor.addEventListener('click', () => {
    state.selectedScript = null;
    state.scriptEditorDirty = false;
    renderScriptCards();
    renderSelectedScriptEditor();
  });

  el.scriptEditedArea.addEventListener('input', () => {
    if (state.selectedScript) {
      const baseline = (state.selectedScript.guion_editado || state.selectedScript.guion_draft || '').toString();
      state.scriptEditorDirty = el.scriptEditedArea.value !== baseline;
    }
    updateWordCounter(el.scriptEditedArea.value, el.scriptEditedWordCount);
  });

  el.viewOriginalBtn.addEventListener('click', () => {
    if (!state.selectedScript) return;
    el.scriptOriginalTitle.textContent = `${state.selectedScript.jugador || 'Sin jugador'} · ${resolveScriptTitle(state.selectedScript)} (original)`;
    el.scriptOriginalMeta.textContent = '';
    el.scriptOriginalArea.value = (state.selectedScript.guion_draft || '').toString();
    updateWordCounter(el.scriptOriginalArea.value, el.scriptOriginalWordCount);
    el.scriptOriginalDialog.showModal();
  });

  el.closeOriginalDialog.addEventListener('click', () => el.scriptOriginalDialog.close());

  el.cancelPublishBtn.addEventListener('click', () => el.publishConfirmDialog.close());
  el.confirmPublishBtn.addEventListener('click', publishSelectedScript);
  el.voiceAiBtn.addEventListener('click', () => {
    openVoiceAiPresetDialog();
  });
  el.cancelVoicePresetBtn.addEventListener('click', () => el.voicePresetDialog.close());
  el.confirmVoicePresetBtn.addEventListener('click', () => {
    void confirmVoiceAiPresetSelection();
  });
  el.downloadDraftBtn.addEventListener('click', downloadSelectedScriptDocx);
  el.publishDraftBtn.addEventListener('click', () => {
    if (!state.selectedScript) return;
    el.publishConfirmDialog.showModal();
  });

  el.videoProjectsRefreshBtn?.addEventListener('click', () => {
    void refreshVideoProjects();
  });

  el.videoProjectsNewBtn?.addEventListener('click', () => {
    resetManualVideoProjectForm();
    el.manualVideoProjectDialog?.showModal();
  });

  el.manualVideoProjectCancelBtn?.addEventListener('click', () => {
    el.manualVideoProjectDialog?.close();
  });

  el.manualVideoProjectScriptInput?.addEventListener('input', updateManualValidation);

  el.manualVideoProjectSubmitBtn?.addEventListener('click', async () => {
    if (typeof createManualVideoProject !== 'function') return;
    const button = el.manualVideoProjectSubmitBtn;
    button.disabled = true;
    try {
      await createManualVideoProject({
        title: el.manualVideoProjectTitleInput?.value || '',
        jugador: el.manualVideoProjectPlayerInput?.value || '',
        seleccion: el.manualVideoProjectCountryInput?.value || '',
        guion_piped: el.manualVideoProjectScriptInput?.value || '',
      });
      el.manualVideoProjectDialog?.close();
    } catch (err) {
      console.error(err);
      if (el.manualVideoProjectValidation) el.manualVideoProjectValidation.textContent = err?.message || 'No se pudo crear el proyecto.';
    } finally {
      button.disabled = false;
    }
  });
}
