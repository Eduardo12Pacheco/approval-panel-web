import { bootApp } from './app-shell.js';

export const EVENT_BINDING_ROUTE_MAP = {
  approval: ['searchInput', 'countryFilter', 'sourcesFilter', 'cards', 'queueDialog'],
  scripts: ['scriptCards', 'scriptEditorDialog', 'voiceAiBtn', 'publishDraftBtn'],
  audio: ['audioRunBtn', 'audioQueueList', 'audioTextArea', 'audioClearBtn'],
  subtitles: ['subtitleUploadInput', 'subtitleSaveBtn', 'subtitleReadyBtn', 'subtitleDownloadBtn', 'subtitleRowsBody'],
};

export function bindEventRoutingFromCompositionRoot() {
  return EVENT_BINDING_ROUTE_MAP;
}

export function bootCompositionRoot() {
  bindEventRoutingFromCompositionRoot();
  bootApp();
}
