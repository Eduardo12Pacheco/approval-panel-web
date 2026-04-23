import { createSubtitlesRuntimeControllers } from './controllers.js';

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
} from './controllers.js';

export function createSubtitlesRuntime({ hooks }) {
  return createSubtitlesRuntimeControllers({ hooks });
}
