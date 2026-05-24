import {
  createEmptySubtitleRow,
  createSubtitlesWorkflowMachine,
} from '../../../subtitles-workflow.mjs?v=20260524-subtitles-controls';

export function createRemoteSubtitleSeedRows() {
  return [createEmptySubtitleRow({ id: 'row-1', start: '00:00.00', end: '00:02.00', phrase: '' })];
}

export function createEmptySubtitleAnalyzeMetadata() {
  return {
    sourceLanguageRequested: null,
    sourceLanguageEffective: null,
    detectedLanguage: null,
    asrModel: null,
    mtModel: null,
  };
}

export function createRemoteSubtitlesState() {
  return {
    machine: createSubtitlesWorkflowMachine(),
    rows: createRemoteSubtitleSeedRows(),
    selectedFileName: '',
    sessionId: null,
    sessionHistory: [],
    serviceHealth: { status: 'pending', message: 'Estado remoto pendiente.' },
    previewVideoUrl: '',
    previewVideoObjectUrl: '',
    previewCurrentMs: 0,
    previewPlaying: false,
    analyzeStatus: null,
    analyzeProgressPct: null,
    renderJobId: null,
    renderStatus: null,
    renderProgressPct: null,
    renderArtifactReady: false,
    renderFailureReason: null,
    snapshotVersion: 0,
    dirty: false,
    changeVersion: 0,
    savedVersion: 0,
    pollingTimer: null,
    pollingInFlight: false,
    sourceLanguage: 'auto',
    analyzeMetadata: createEmptySubtitleAnalyzeMetadata(),
    audioDurationMs: null,
  };
}
