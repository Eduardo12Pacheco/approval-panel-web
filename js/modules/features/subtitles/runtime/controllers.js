import {
  buildSubtitleCueMarkersRuntime,
  buildSubtitleHealthRuntime,
  buildSubtitleInsertRowRuntime,
  buildSubtitlePreviewUrlRuntime,
  buildSubtitlePreviewPresentationRuntime,
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
  resolveSubtitleTimelineSeekMsRuntime,
  resolveSubtitlesModeRuntime,
  resolveSubtitleProgressPercentRuntime,
  validateSubtitleTimingPatchRuntime,
} from './services.js';

export {
  buildSubtitleCueMarkersRuntime,
  buildSubtitleHealthRuntime,
  buildSubtitleInsertRowRuntime,
  buildSubtitlePreviewUrlRuntime,
  buildSubtitlePreviewPresentationRuntime,
  buildSubtitleProcessingMessageRuntime,
  describeSubtitleTranslationEngineRuntime,
  extractSubtitleAnalyzeMetadataRuntime,
  extractSubtitleProgressPercentRuntime,
  formatSubtitleDisplayTimeRuntime,
  mapRemoteSubtitleSegmentsToRowsRuntime,
  normalizeSubtitleMetaValueForStateRuntime,
  parseSubtitleTimeToMsRuntime,
  pickActiveSubtitleCueRuntime,
  resolveSubtitleTimelineSeekMsRuntime,
  resolveSubtitlesModeRuntime,
  resolveSubtitleProgressPercentRuntime,
  validateSubtitleTimingPatchRuntime,
};

export function createSubtitlesRuntimeControllers({ hooks }) {
  return createSubtitlesRuntimeServices({ hooks });
}
