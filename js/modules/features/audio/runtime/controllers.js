import {
  createAudioRuntimeServices,
  getAudioStatusClassRuntime,
  getAudioStatusLabelRuntime,
  isTerminalAudioStatus,
  normalizeAudioProgressPercent,
} from './services.js';

export {
  getAudioStatusClassRuntime,
  getAudioStatusLabelRuntime,
  isTerminalAudioStatus,
  normalizeAudioProgressPercent,
};

export function createAudioRuntimeControllers({ hooks }) {
  return createAudioRuntimeServices({ hooks });
}
