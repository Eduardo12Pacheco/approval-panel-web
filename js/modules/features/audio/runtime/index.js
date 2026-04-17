import { createAudioRuntimeControllers } from './controllers.js';

export {
  getAudioStatusClassRuntime,
  getAudioStatusLabelRuntime,
  isTerminalAudioStatus,
  normalizeAudioProgressPercent,
} from './controllers.js';

export function createAudioRuntime({ hooks }) {
  return createAudioRuntimeControllers({ hooks });
}
