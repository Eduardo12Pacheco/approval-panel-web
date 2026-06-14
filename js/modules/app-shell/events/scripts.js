import { resolveScriptTitle } from '../../features/scripts/index.js';
import {
  VIDEO_PROJECT_PLAYERS_BY_COUNTRY,
  listVideoProjectCountries,
  listVideoProjectPlayers,
} from '../../features/video-projects/domain/player-catalog.js';

const boundScriptEventKeys = new WeakMap();

function bindOnce(element, key, eventName, handler) {
  if (!element) return;
  const keys = boundScriptEventKeys.get(element) || new Set();
  if (keys.has(key)) return;
  element.addEventListener(eventName, handler);
  keys.add(key);
  boundScriptEventKeys.set(element, keys);
}

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

  function populateManualCountryOptions() {
    if (!el.manualVideoProjectCountryInput) return;
    const current = el.manualVideoProjectCountryInput.value;
    const countries = listVideoProjectCountries();
    el.manualVideoProjectCountryInput.innerHTML = [
      '<option value="">Elegí una selección</option>',
      ...countries.map((country) => `<option value="${country}">${country}</option>`),
    ].join('');
    if (countries.includes(current)) el.manualVideoProjectCountryInput.value = current;
  }

  function populateManualPlayerOptions(country) {
    if (!el.manualVideoProjectPlayerInput) return;
    const players = listVideoProjectPlayers(country);
    el.manualVideoProjectPlayerInput.disabled = !players.length;
    if (!players.length) {
      el.manualVideoProjectPlayerInput.innerHTML = '<option value="">Primero elegí una selección</option>';
      return;
    }
    // All interpolated strings come from the frozen player-catalog (no user input),
    // so the innerHTML below is XSS-safe by construction.
    const entry = VIDEO_PROJECT_PLAYERS_BY_COUNTRY[country];
    const playerOptions = (entry?.players || []).map((player) => `<option value="${player}">${player}</option>`);
    const nicknameOptions = (entry?.nicknames || []).map((nickname) => `<option value="${nickname}">${nickname}</option>`);
    const groups = [];
    if (playerOptions.length) {
      groups.push(`<optgroup label="Jugadores">${playerOptions.join('')}</optgroup>`);
    }
    if (nicknameOptions.length) {
      groups.push(`<optgroup label="Selección">${nicknameOptions.join('')}</optgroup>`);
    }
    el.manualVideoProjectPlayerInput.innerHTML = [
      '<option value="">Elegí un jugador</option>',
      ...groups,
    ].join('');
  }

  function resetManualVideoProjectForm() {
    if (el.manualVideoProjectTitleInput) el.manualVideoProjectTitleInput.value = '';
    populateManualCountryOptions();
    if (el.manualVideoProjectCountryInput) el.manualVideoProjectCountryInput.value = '';
    populateManualPlayerOptions('');
    if (el.manualVideoProjectPlayerInput) el.manualVideoProjectPlayerInput.value = '';
    if (el.manualVideoProjectScriptInput) el.manualVideoProjectScriptInput.value = '';
    updateManualValidation();
  }

  bindOnce(el.closeScriptEditor, 'close-script-editor', 'click', () => {
    state.selectedScript = null;
    state.scriptEditorDirty = false;
    renderScriptCards();
    renderSelectedScriptEditor();
  });

  bindOnce(el.scriptEditedArea, 'script-edited-input', 'input', () => {
    if (state.selectedScript) {
      const baseline = (state.selectedScript.guion_editado || state.selectedScript.guion_draft || '').toString();
      state.scriptEditorDirty = el.scriptEditedArea.value !== baseline;
    }
    updateWordCounter(el.scriptEditedArea.value, el.scriptEditedWordCount);
  });

  bindOnce(el.viewOriginalBtn, 'view-original', 'click', () => {
    if (!state.selectedScript) return;
    el.scriptOriginalTitle.textContent = `${state.selectedScript.jugador || 'Sin jugador'} · ${resolveScriptTitle(state.selectedScript)} (original)`;
    el.scriptOriginalMeta.textContent = '';
    el.scriptOriginalArea.value = (state.selectedScript.guion_draft || '').toString();
    updateWordCounter(el.scriptOriginalArea.value, el.scriptOriginalWordCount);
    el.scriptOriginalDialog.showModal();
  });

  bindOnce(el.closeOriginalDialog, 'close-original-dialog', 'click', () => el.scriptOriginalDialog.close());

  bindOnce(el.cancelPublishBtn, 'cancel-publish', 'click', () => el.publishConfirmDialog.close());
  bindOnce(el.confirmPublishBtn, 'confirm-publish', 'click', publishSelectedScript);
  bindOnce(el.voiceAiBtn, 'voice-ai', 'click', () => {
    openVoiceAiPresetDialog();
  });
  bindOnce(el.cancelVoicePresetBtn, 'cancel-voice-preset', 'click', () => el.voicePresetDialog.close());
  bindOnce(el.confirmVoicePresetBtn, 'confirm-voice-preset', 'click', () => {
    void confirmVoiceAiPresetSelection();
  });
  bindOnce(el.downloadDraftBtn, 'download-draft', 'click', downloadSelectedScriptDocx);
  bindOnce(el.publishDraftBtn, 'publish-draft', 'click', () => {
    if (!state.selectedScript) return;
    el.publishConfirmDialog.showModal();
  });

  bindOnce(el.videoProjectsRefreshBtn, 'video-projects-refresh', 'click', () => {
    void refreshVideoProjects();
  });

  bindOnce(el.videoProjectsNewBtn, 'manual-video-project-open', 'click', () => {
    resetManualVideoProjectForm();
    el.manualVideoProjectDialog?.showModal();
  });

  bindOnce(el.manualVideoProjectCancelBtn, 'manual-video-project-cancel', 'click', () => {
    el.manualVideoProjectDialog?.close();
  });

  bindOnce(el.manualVideoProjectScriptInput, 'manual-video-project-script-input', 'input', updateManualValidation);
  bindOnce(el.manualVideoProjectCountryInput, 'manual-video-project-country-change', 'change', () => {
    populateManualPlayerOptions(el.manualVideoProjectCountryInput.value);
  });

  bindOnce(el.manualVideoProjectSubmitBtn, 'manual-video-project-submit', 'click', async () => {
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
