import { createSubtitlesRuntimeControllers } from './controllers.js';

export {
  buildSubtitleCueMarkersRuntime,
  buildSubtitleHealthRuntime,
  buildSubtitleInsertRowRuntime,
  buildSubtitlePreviewUrlRuntime,
  buildSubtitlePreviewPresentationRuntime,
  buildSubtitlePreviewTimelineMarkupRuntime,
  buildSubtitleProcessingMessageRuntime,
  buildSubtitleSelectOptionsMarkupRuntime,
  buildSubtitleSessionHistoryMarkupRuntime,
  buildSubtitleTableRowMarkupRuntime,
  buildSubtitlesTableRowsMarkupRuntime,
  describeSubtitleTranslationEngineRuntime,
  extractSubtitleAnalyzeMetadataRuntime,
  extractSubtitleProgressPercentRuntime,
  formatSubtitleDisplayTimeRuntime,
  getLastSubtitleNonDraftRowIndexRuntime,
  hasSubtitleDraftRowsRuntime,
  mapRemoteSubtitleSegmentsToRowsRuntime,
  normalizeSubtitleMetaValueRuntime,
  normalizeSubtitleMetaValueForStateRuntime,
  parseSubtitleTimeToMsRuntime,
  pickActiveSubtitleCueRuntime,
  resolveSubtitleHistoryToneRuntime,
  resolveSubtitlePreviewDurationMsRuntime,
  resolveSubtitleTimelineSeekMsRuntime,
  resolveSubtitlesModeRuntime,
  resolveSubtitleProgressPercentRuntime,
  validateSubtitleTimingPatchRuntime,
} from './controllers.js';

export {
  createEmptySubtitleAnalyzeMetadata,
  createRemoteSubtitleSeedRows,
  createRemoteSubtitlesState,
} from './state.js';

export function createSubtitlesRuntime({ hooks }) {
  return createSubtitlesRuntimeControllers({ hooks });
}
