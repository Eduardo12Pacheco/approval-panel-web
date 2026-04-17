import {
  buildSubtitleProcessingMessageRuntime,
  createSubtitlesRuntimeServices,
  describeSubtitleTranslationEngineRuntime,
  extractSubtitleAnalyzeMetadataRuntime,
  extractSubtitleProgressPercentRuntime,
  formatSubtitleDisplayTimeRuntime,
  normalizeSubtitleMetaValueForStateRuntime,
  parseSubtitleTimeToMsRuntime,
  resolveSubtitleProgressPercentRuntime,
} from './services.js';

export {
  buildSubtitleProcessingMessageRuntime,
  describeSubtitleTranslationEngineRuntime,
  extractSubtitleAnalyzeMetadataRuntime,
  extractSubtitleProgressPercentRuntime,
  formatSubtitleDisplayTimeRuntime,
  normalizeSubtitleMetaValueForStateRuntime,
  parseSubtitleTimeToMsRuntime,
  resolveSubtitleProgressPercentRuntime,
};

export function createSubtitlesRuntimeControllers({ hooks }) {
  return createSubtitlesRuntimeServices({ hooks });
}
