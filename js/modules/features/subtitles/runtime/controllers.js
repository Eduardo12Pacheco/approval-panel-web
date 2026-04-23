import {
  buildSubtitleCueMarkersRuntime,
  buildSubtitleHealthRuntime,
  buildSubtitleInsertRowRuntime,
  buildSubtitlePreviewUrlRuntime,
  buildSubtitleProcessingMessageRuntime,
  createSubtitlesRuntimeServices,
  describeSubtitleTranslationEngineRuntime,
  extractSubtitleAnalyzeMetadataRuntime,
  extractSubtitleProgressPercentRuntime,
  formatSubtitleDisplayTimeRuntime,
  mapRemoteSubtitleSegmentsToRowsRuntime,
  normalizeSubtitleMetaValueForStateRuntime,
  parseSubtitleTimeToMsRuntime,
  pickActiveSubtitleCueRuntime,
  resolveSubtitlesModeRuntime,
  resolveSubtitleProgressPercentRuntime,
  validateSubtitleTimingPatchRuntime,
} from './services.js';

export {
  buildSubtitleCueMarkersRuntime,
  buildSubtitleHealthRuntime,
  buildSubtitleInsertRowRuntime,
  buildSubtitlePreviewUrlRuntime,
  buildSubtitleProcessingMessageRuntime,
  describeSubtitleTranslationEngineRuntime,
  extractSubtitleAnalyzeMetadataRuntime,
  extractSubtitleProgressPercentRuntime,
  formatSubtitleDisplayTimeRuntime,
  mapRemoteSubtitleSegmentsToRowsRuntime,
  normalizeSubtitleMetaValueForStateRuntime,
  parseSubtitleTimeToMsRuntime,
  pickActiveSubtitleCueRuntime,
  resolveSubtitlesModeRuntime,
  resolveSubtitleProgressPercentRuntime,
  validateSubtitleTimingPatchRuntime,
};

export function createSubtitlesRuntimeControllers({ hooks }) {
  return createSubtitlesRuntimeServices({ hooks });
}
