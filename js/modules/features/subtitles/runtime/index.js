import { createSubtitlesRuntimeControllers } from './controllers.js?v=20260524-subtitles-controls';

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
  resolveHydratedSubtitleRenderStateRuntime,
  resolveSubtitleHistoryToneRuntime,
  resolveSubtitlePreviewDurationMsRuntime,
  resolveSubtitleTimelineSeekMsRuntime,
  resolveSubtitlesModeRuntime,
  resolveSubtitleProgressPercentRuntime,
  validateSubtitleTimingPatchRuntime,
} from './controllers.js?v=20260524-subtitles-controls';

export {
  createEmptySubtitleAnalyzeMetadata,
  createRemoteSubtitleSeedRows,
  createRemoteSubtitlesState,
} from './state.js?v=20260524-subtitles-controls';

export function createSubtitlesRuntime({ hooks }) {
  return createSubtitlesRuntimeControllers({ hooks });
}
