import { bootApp } from './app-shell.js?v=20260519-project-actions';

export const EVENT_BINDING_ROUTE_MAP = {
  approval: ['searchInput', 'countryFilter', 'sourcesFilter', 'cards', 'queueDialog'],
  scripts: ['scriptCards', 'scriptEditorDialog', 'voiceAiBtn', 'publishDraftBtn'],
  audio: ['audioRunBtn', 'audioQueueList', 'audioTextArea', 'audioClearBtn'],
  subtitles: ['subtitle2UploadInput', 'subtitle2SaveBtn', 'subtitle2ReadyBtn', 'subtitle2DownloadBtn', 'subtitle2RowsBody'],
};

export function bindEventRoutingFromCompositionRoot() {
  return EVENT_BINDING_ROUTE_MAP;
}

export function bootCompositionRoot() {
  bindEventRoutingFromCompositionRoot();
  bootApp();
}
