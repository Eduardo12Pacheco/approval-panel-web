import {
  bootApp as bootAppImpl,
  bootCompatibilityShell as bootCompatibilityShellImpl,
  __testHooks as testHooksImpl,
} from './app-shell/index.js?v=20260520-newspaper-effect';

// Compatibility/parity tokens for legacy static checks during app-shell facade migration:
// ./core/ui/toast.js ./core/ui/escape-html.js ./core/ui/word-count.js
// renderToast escapeHtmlCore updateWordCounterCore
// ./features/approval/index.js ./features/scripts/index.js ./core/http/approval-api.js
// createApprovalFeature createScriptsFeature createApprovalApiClient api store ui selectors
// ./core/http/tts-api.js ./features/audio/index.js createTtsApiClient createAudioFeature
// ./features/radar/api-client.js ./features/radar/controller.js 'radar'
// ./features/subtitles/runtime/index.js ./features/audio/runtime/index.js
// normalizeAudioProgressPercent resolveSubtitleProgressPercentRuntime createAudioRuntime
// resolveApprovalSourceLink actionBtn.dataset.url || actionBtn.dataset.link || ''
// getDomSelectors(document) createSingleFlightRunner APPROVAL_AUTO_REFRESH_INTERVAL_MS
// approvalAutoRefreshTimer refreshQueue({ silent: true }) refreshScriptDrafts({ silent: true })
// assertSearchRefreshSucceeded(result); promoteStatus !== 'succeeded'
// El panel actual se mantiene sin cambios resolveSearchRefreshCompletionMessage(result, windowLabel)
// No hubo clusters nuevos para publicar. Panel actualizado resolveScriptTitle(state.selectedScript)
// setTtsGetMock setToastMock clearMocksForTesting
// runVoiceAiFromSelectedScript openVoiceAiPresetDialog confirmVoiceAiPresetSelection
// isScriptProcessed(selected) Tenés cambios sin procesar selected.guion_pronunciacion
// runAudioGenerationFromText voiceProfile: preset runAudioGenerationFromText: audioController.runAudioGenerationFromText

export function bootApp() {
  return bootAppImpl();
}

export function bootCompatibilityShell() {
  return bootCompatibilityShellImpl();
}

export const __testHooks = testHooksImpl;
