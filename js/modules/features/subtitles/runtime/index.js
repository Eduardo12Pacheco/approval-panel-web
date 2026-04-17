import { createSubtitlesRuntimeControllers } from './controllers.js';

export function createSubtitlesRuntime({ hooks }) {
  return createSubtitlesRuntimeControllers({ hooks });
}
