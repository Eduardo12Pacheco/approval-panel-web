import {
  defaultSettingsFactory,
  hydrateSettingsFormValues,
  mergeSettingsForSave,
  saveSettingsToStorage,
} from '../core/state/app-store.js?v=20260521-settings-guard';

export function createSettingsController({
  state,
  el,
  storage,
  storageKey,
  lastNewsSearchKey,
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
    try {
      return storage.getItem(lastNewsSearchKey) || null;
    } catch {
      return null;
    }
  }

  function saveLastNewsSearchAt(value) {
    try {
      if (value) {
        storage.setItem(lastNewsSearchKey, value);
      } else {
        storage.removeItem(lastNewsSearchKey);
      }
    } catch {}
  }

  return {
    defaultSettings: defaultsFactory,
    hydrateSettingsForm,
    saveSettings,
    loadLastNewsSearchAt,
    saveLastNewsSearchAt,
  };
}
