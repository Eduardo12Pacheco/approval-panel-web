import {
  defaultSettingsFactory,
  hydrateSettingsFormValues,
  mergeSettingsForSave,
  saveSettingsToStorage,
} from '../core/state/app-store.js';

export function createSettingsController({
  state,
  el,
  storage,
  storageKey,
  defaultsFactory = defaultSettingsFactory,
}) {
  function hydrateSettingsForm() {
    hydrateSettingsFormValues({ el, settings: state.settings });
  }

  function saveSettings(next) {
    state.settings = saveSettingsToStorage({
      storage,
      storageKey,
      nextSettings: mergeSettingsForSave(state.settings, next),
    });
    return state.settings;
  }

  function loadLastNewsSearchAt() {
    return null;
  }

  function saveLastNewsSearchAt() {
    // Deprecated no-op: shared-looking panel update metadata is derived from
    // read-model items, not per-browser localStorage.
  }

  return {
    defaultSettings: defaultsFactory,
    hydrateSettingsForm,
    saveSettings,
    loadLastNewsSearchAt,
    saveLastNewsSearchAt,
  };
}
