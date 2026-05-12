import { isScriptProcessed, resolveScriptTitle } from '../../features/scripts/index.js';

export function createScriptToAudioVoiceController({
  state,
  el,
  customDropdowns,
  audioFeature,
  toast,
  updateWordCounter,
  setView,
}) {
  function buildVoiceAiJobTitle(script = {}) {
    return [script.jugador, resolveScriptTitle(script, '')]
      .map((part) => (part || '').toString().trim())
      .filter(Boolean)
      .join(' · ')
      .slice(0, 120)
      || script.draft_id
      || script.id_noticia
      || script.cluster_id
      || 'voz-ia-guion';
  }

  function getVoiceAiReadyState() {
    const selected = state.selectedScript;
    if (!selected) {
      toast('Seleccioná un guion antes de generar voz');
      return null;
    }

    if (!isScriptProcessed(selected)) {
      toast('Primero procesá el guion para usar la versión con pronunciación.');
      return null;
    }

    if (state.scriptEditorDirty) {
      toast('Tenés cambios sin procesar. Procesá de nuevo antes de generar voz.');
      return null;
    }

    const pronunciationText = (selected.guion_pronunciacion || '').toString().trim();
    if (!pronunciationText) {
      toast('Este guion no tiene versión de pronunciación. Procesalo de nuevo para generar voz.');
      return null;
    }

    return { selected, pronunciationText };
  }

  function syncVoicePresetOptions() {
    const currentPreset = (el.audioPresetSelect.value || 'balanced_default').trim();
    el.voicePresetSelect.innerHTML = '';
    Array.from(el.audioPresetSelect.options).forEach((option) => {
      el.voicePresetSelect.appendChild(option.cloneNode(true));
    });
    el.voicePresetSelect.value = currentPreset;
    if (!el.voicePresetSelect.value && el.voicePresetSelect.options.length) {
      el.voicePresetSelect.value = el.voicePresetSelect.options[0].value;
    }
  }

  function openVoiceAiPresetDialog() {
    if (!getVoiceAiReadyState()) return;
    syncVoicePresetOptions();
    customDropdowns.refreshAll();
    el.voicePresetDialog.showModal();
  }

  async function confirmVoiceAiPresetSelection() {
    const voiceProfile = (el.voicePresetSelect.value || el.audioPresetSelect.value || 'balanced_default').trim();
    el.voicePresetDialog.close();
    await runVoiceAiFromSelectedScript({ voiceProfile });
  }

  async function runVoiceAiFromSelectedScript({ voiceProfile = null } = {}) {
    const ready = getVoiceAiReadyState();
    if (!ready) return;

    const { selected, pronunciationText } = ready;
    const preset = (voiceProfile || el.audioPresetSelect.value || 'balanced_default').trim();

    el.audioTextArea.value = pronunciationText;
    el.audioPresetSelect.value = preset;
    el.audioPresetSelect.dispatchEvent(new Event('change', { bubbles: true }));
    updateWordCounter(pronunciationText, el.audioWordCount);
    setView('audio');

    await audioFeature.runAudioGenerationFromText({
      text: pronunciationText,
      voiceProfile: preset,
      title: buildVoiceAiJobTitle(selected),
    });
  }

  return {
    buildVoiceAiJobTitle,
    getVoiceAiReadyState,
    syncVoicePresetOptions,
    openVoiceAiPresetDialog,
    confirmVoiceAiPresetSelection,
    runVoiceAiFromSelectedScript,
  };
}
