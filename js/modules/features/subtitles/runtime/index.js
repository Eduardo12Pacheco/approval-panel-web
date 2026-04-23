import { createSubtitlesRuntimeControllers } from './controllers.js';

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
} from './controllers.js';

export function createSubtitlesRuntime({ hooks }) {
  return createSubtitlesRuntimeControllers({ hooks });
}
