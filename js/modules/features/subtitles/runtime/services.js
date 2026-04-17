export function clampSubtitleProgressPercentRuntime(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function resolveSubtitleProgressPercentRuntime(rawProgress, status) {
  const parsed = Number(rawProgress);
  if (Number.isFinite(parsed)) {
    return clampSubtitleProgressPercentRuntime(parsed);
  }

  const normalizedStatus = (status || '').toString().trim().toLowerCase();
  if (normalizedStatus === 'succeeded') return 100;
  if (normalizedStatus === 'failed' || normalizedStatus === 'cancelled') return 0;
  return 0;
}

export function extractSubtitleProgressPercentRuntime(statusPayload) {
  const directCandidates = [
    statusPayload?.progress_percent,
    statusPayload?.progress_pct,
    statusPayload?.progress,
    statusPayload?.percent,
  ];

  for (const candidate of directCandidates) {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed)) {
      return clampSubtitleProgressPercentRuntime(parsed <= 1 ? parsed * 100 : parsed);
    }
  }

  const nestedCandidates = [
    statusPayload?.progress?.percent,
    statusPayload?.progress?.pct,
    statusPayload?.metrics?.progress_percent,
    statusPayload?.metrics?.progress,
  ];

  for (const candidate of nestedCandidates) {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed)) {
      return clampSubtitleProgressPercentRuntime(parsed <= 1 ? parsed * 100 : parsed);
    }
  }

  return null;
}

export function buildSubtitleProcessingMessageRuntime(status, fallback) {
  const normalized = (status || '').toString().trim();
  if (!normalized) return fallback;
  const prettyStatus = normalized.replace(/[_-]+/g, ' ');
  return `${fallback} Estado: ${prettyStatus}.`;
}

export function describeSubtitleTranslationEngineRuntime(language, marianLangs, fallbackLangs) {
  const normalized = (language || 'auto').toString().trim().toLowerCase();
  if (normalized === 'auto') {
    return 'Detecta automáticamente. Si el idioma detectado tiene Marian, usa Marian; si no, usa fallback Facebook M2M100.';
  }
  if (normalized === 'es') {
    return 'Este idioma no requiere traducción: se usa bypass (audio ya en español).';
  }
  if (marianLangs?.has(normalized)) {
    return 'Este idioma usa Marian (Helsinki OPUS-MT).';
  }
  if (fallbackLangs?.has(normalized)) {
    return 'Este idioma usa fallback Facebook M2M100.';
  }
  return 'Este idioma usa fallback Facebook M2M100.';
}

export function parseSubtitleTimeToMsRuntime(rawValue) {
  const value = (rawValue ?? '').toString().trim();
  if (!value) return 0;

  if (/^\d+(\.\d+)?$/.test(value)) {
    return Math.max(0, Math.round(Number(value)));
  }

  const mmssMatch = value.match(/^(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?$/);
  if (mmssMatch) {
    const minutes = Number(mmssMatch[1]);
    const seconds = Number(mmssMatch[2]);
    const decimals = (mmssMatch[3] || '0').padEnd(3, '0').slice(0, 3);
    const millis = Number(decimals);
    return Math.max(0, minutes * 60000 + seconds * 1000 + millis);
  }

  const hhmmssMatch = value.match(/^(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/);
  if (hhmmssMatch) {
    const hours = Number(hhmmssMatch[1]);
    const minutes = Number(hhmmssMatch[2]);
    const seconds = Number(hhmmssMatch[3]);
    const decimals = (hhmmssMatch[4] || '0').padEnd(3, '0').slice(0, 3);
    const millis = Number(decimals);
    return Math.max(0, hours * 3600000 + minutes * 60000 + seconds * 1000 + millis);
  }

  return 0;
}

export function formatSubtitleDisplayTimeRuntime(rawValue) {
  const totalMs = parseSubtitleTimeToMsRuntime(rawValue);
  const minutes = Math.floor(totalMs / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const centiseconds = Math.floor((totalMs % 1000) / 10);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
}

export function normalizeSubtitleMetaValueForStateRuntime(...candidates) {
  for (const candidate of candidates) {
    if (candidate == null) continue;
    const text = candidate.toString().trim();
    if (!text) continue;
    return text;
  }
  return null;
}

export function extractSubtitleAnalyzeMetadataRuntime(payload) {
  const metadata = payload?.metadata || payload?.analysis_metadata || payload?.analyze_metadata || null;
  return {
    sourceLanguageRequested: normalizeSubtitleMetaValueForStateRuntime(
      payload?.source_language_requested,
      metadata?.source_language_requested,
    ),
    sourceLanguageEffective: normalizeSubtitleMetaValueForStateRuntime(
      payload?.source_language_effective,
      metadata?.source_language_effective,
    ),
    detectedLanguage: normalizeSubtitleMetaValueForStateRuntime(
      payload?.detected_language,
      metadata?.detected_language,
    ),
    asrModel: normalizeSubtitleMetaValueForStateRuntime(
      payload?.asr_model,
      metadata?.asr_model,
    ),
    mtModel: normalizeSubtitleMetaValueForStateRuntime(
      payload?.mt_model,
      metadata?.mt_model,
    ),
  };
}

export function createSubtitlesRuntimeServices({ hooks }) {
  return {
    onUploadSelected: hooks.onUploadSelected,
    onSourceLanguageChanged: hooks.onSourceLanguageChanged,
    onSaveClicked: hooks.onSaveClicked,
    onReadyClicked: hooks.onReadyClicked,
    onDownloadClicked: hooks.onDownloadClicked,
    onTableInput: hooks.onTableInput,
    onTableClick: hooks.onTableClick,
    pollStatus: hooks.pollStatus,
    renderWorkflow: hooks.renderWorkflow,
    buildSubtitleProcessingMessageRuntime,
    describeSubtitleTranslationEngineRuntime,
    resolveSubtitleProgressPercentRuntime,
    extractSubtitleProgressPercentRuntime,
    formatSubtitleDisplayTimeRuntime,
    parseSubtitleTimeToMsRuntime,
    extractSubtitleAnalyzeMetadataRuntime,
    normalizeSubtitleMetaValueForStateRuntime,
  };
}
