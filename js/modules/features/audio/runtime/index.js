import { createAudioRuntimeControllers } from './controllers.js';

export function createAudioRuntime({ hooks }) {
  return createAudioRuntimeControllers({ hooks });
}
