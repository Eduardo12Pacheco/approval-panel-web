import { createSubtitlesRuntimeControllers } from './controllers.js';

export {
  buildSubtitleProcessingMessageRuntime,
  describeSubtitleTranslationEngineRuntime,
  extractSubtitleAnalyzeMetadataRuntime,
  extractSubtitleProgressPercentRuntime,
  formatSubtitleDisplayTimeRuntime,
  normalizeSubtitleMetaValueForStateRuntime,
  parseSubtitleTimeToMsRuntime,
  resolveSubtitleProgressPercentRuntime,
} from './controllers.js';

export function createSubtitlesRuntime({ hooks }) {
  return createSubtitlesRuntimeControllers({ hooks });
}
