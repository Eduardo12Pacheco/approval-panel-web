import { createSubtitlesRuntimeServices } from './services.js';

export function createSubtitlesRuntimeControllers({ hooks }) {
  return createSubtitlesRuntimeServices({ hooks });
}
