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
}) {
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
}
