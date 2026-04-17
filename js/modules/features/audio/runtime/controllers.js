import { createAudioRuntimeServices } from './services.js';

export function createAudioRuntimeControllers({ hooks }) {
  return createAudioRuntimeServices({ hooks });
}
