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

export function resolveSubtitlesModeRuntime(rawMode) {
  const normalized = (rawMode || 'remote-core').toString().trim().toLowerCase();
  return normalized === 'legacy' ? 'remote-core' : normalized;
}

export function buildSubtitleHealthRuntime(rawHealth, mode) {
  const status = (rawHealth?.status || 'pending').toString().trim().toLowerCase() || 'pending';
  const message = (rawHealth?.message || 'Estado remoto pendiente.').toString().trim();
  const tone = ['online', 'healthy', 'ok', 'available', 'succeeded'].includes(status) ? 'online' : 'offline';
  return {
    status,
    tone,
    message,
    banner: tone === 'online' ? 'Servidor conectado' : 'Servidor desconectado',
  };
}

export function resolveHydratedSubtitleRenderStateRuntime(detail = {}) {
  const explicitStatus = (detail?.render?.status || detail?.render_status || '').toString().trim();
  const sessionStatus = (detail?.status || '').toString().trim().toLowerCase();
  const downloadReady = Boolean(detail?.download?.ready);
  const finalStatuses = ['succeeded', 'completed', 'complete', 'done', 'finished'];
  const failedStatuses = ['failed', 'cancelled', 'canceled'];

  if (explicitStatus) {
    const normalizedExplicitStatus = explicitStatus.toLowerCase();
    return {
      status: explicitStatus,
      artifactReady: Boolean(downloadReady || finalStatuses.includes(normalizedExplicitStatus)),
    };
  }

  if (downloadReady || finalStatuses.includes(sessionStatus)) {
    return { status: 'succeeded', artifactReady: true };
  }

  if (failedStatuses.includes(sessionStatus)) {
    return { status: 'failed', artifactReady: false };
  }

  return { status: '', artifactReady: false };
}

export function buildSubtitlePreviewUrlRuntime(rawPath, baseUrl) {
  const path = (rawPath || '').toString().trim();
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  const root = (baseUrl || '').toString().trim();
  return root ? `${root}${path}` : path;
}

export function buildSubtitlePreviewPresentationRuntime({
  activeCue = null,
  currentMs = 0,
  durationMs = 0,
  stageWidth = 0,
  stageHeight = 0,
  renderWidth = 1920,
  renderHeight = 1080,
  defaultMaxWidthPx = 1080,
} = {}) {
  const safeDurationMs = Math.max(0, Number(durationMs) || 0);
  const safeCurrentMs = Math.max(0, Math.min(Number(currentMs) || 0, safeDurationMs || 0));
  const widthScale = stageWidth > 0 ? Number(stageWidth) / renderWidth : 1;
  const heightScale = stageHeight > 0 ? Number(stageHeight) / renderHeight : 1;
  const scale = Math.min(widthScale || 1, heightScale || 1, 1);
  const rawAlign = (activeCue?.align || 'left').toString().trim().toLowerCase();
  const justifyContent = rawAlign === 'right' ? 'flex-end' : rawAlign === 'center' ? 'center' : 'flex-start';
  const alignItems = rawAlign === 'center' ? 'flex-end' : 'center';
  const fontSizeBase = Number(activeCue?.size || activeCue?.font_size || 110);
  const cueWidthBase = Number(activeCue?.maxWidthPx || activeCue?.max_width_px || defaultMaxWidthPx);
  const fontFamily = (activeCue?.fontFamily || activeCue?.font_family || 'Khand').toString();
  return {
    hasCue: Boolean(activeCue),
    text: activeCue ? (activeCue?.phrase || activeCue?.translated_es || '').toString().toUpperCase() : '',
    color: (activeCue?.color || '#FFFFFF').toString(),
    fontFamily,
    fontWeight: (activeCue?.fontWeight || activeCue?.font_weight || resolveSubtitleFontWeightRuntime(fontFamily)).toString(),
    fontSizePx: Math.max(12, Math.round((Number.isFinite(fontSizeBase) ? fontSizeBase : 110) * scale)),
    cueWidthPx: Math.max(1, Math.round((Number.isFinite(cueWidthBase) && cueWidthBase > 0 ? cueWidthBase : defaultMaxWidthPx) * scale)),
    justifyContent,
    alignItems,
    playheadPercent: safeDurationMs > 0 ? Math.round((safeCurrentMs / safeDurationMs) * 10000) / 100 : 0,
    scale,
  };
}

export function resolveSubtitleTimelineSeekMsRuntime({ clientX = 0, rectLeft = 0, rectWidth = 0, durationMs = 0 } = {}) {
  const safeWidth = Number(rectWidth) || 0;
  const safeDurationMs = Math.max(0, Number(durationMs) || 0);
  if (safeWidth <= 0 || safeDurationMs <= 0) return 0;
  const ratio = Math.min(Math.max(((Number(clientX) || 0) - (Number(rectLeft) || 0)) / safeWidth, 0), 1);
  return Math.round(ratio * safeDurationMs);
}

export function mapRemoteSubtitleSegmentsToRowsRuntime({ segments = [], createRow, formatTime, sizePresets, fontPresets, colorPresets }) {
  return (Array.isArray(segments) ? segments : []).map((segment, index) => createRow({
    id: (segment?.id || `row-${index + 1}`).toString(),
    start: formatTime(segment?.start_ms || 0),
    end: formatTime(segment?.end_ms || 0),
    sourceText: (segment?.source_text || '').toString(),
    phrase: (segment?.translated_text || '').toString(),
    size: String(segment?.style?.font_size || sizePresets?.[0] || '110'),
    maxWidthPx: Number(segment?.style?.max_width_px || 1080),
    fontFamily: (segment?.style?.font_family || fontPresets?.[0] || 'Khand').toString(),
    fontWeight: (segment?.style?.font_weight || resolveSubtitleFontWeightRuntime(segment?.style?.font_family || fontPresets?.[0] || 'Khand')).toString(),
    color: (segment?.style?.color || colorPresets?.[0] || '#FFFFFF').toString(),
    align: (segment?.style?.align || 'left').toString(),
  }));
}

export function pickActiveSubtitleCueRuntime(rows = [], currentMs = 0) {
  return (Array.isArray(rows) ? rows : []).find((row) => {
    const startMs = parseSubtitleTimeToMsRuntime(row?.start);
    const endMs = parseSubtitleTimeToMsRuntime(row?.end);
    return currentMs >= startMs && currentMs <= endMs;
  }) || null;
}

export function validateSubtitleTimingPatchRuntime({ rows = [], rowId, field, valueMs, gapMs = 67 }) {
  const index = (Array.isArray(rows) ? rows : []).findIndex((row) => row?.id === rowId);
  if (index < 0) return { accepted: false, reason: 'Fila inválida.', rows };
  const current = rows[index];
  const currentStart = parseSubtitleTimeToMsRuntime(current?.start);
  const currentEnd = parseSubtitleTimeToMsRuntime(current?.end);
  const previous = rows[index - 1] || null;
  const next = rows[index + 1] || null;

  if (field === 'start') {
    if (index === 0 && valueMs !== 0) {
      return { accepted: false, reason: 'El START de la primera frase es fijo en 00:00.00.', rows };
    }
    if (previous) {
      const expectedStart = parseSubtitleTimeToMsRuntime(previous?.end) + gapMs;
      if (valueMs !== expectedStart) {
        return { accepted: false, reason: 'START inválido: debe ser END anterior + gap.', rows };
      }
    }
    if (valueMs >= currentEnd) {
      return { accepted: false, reason: 'START inválido: debe ser menor que END.', rows };
    }
    return { accepted: true, rows };
  }

  if (valueMs <= currentStart) {
    return { accepted: false, reason: 'END inválido: debe ser mayor que START.', rows };
  }
  if (next) {
    const nextEnd = parseSubtitleTimeToMsRuntime(next?.end);
    if (valueMs >= nextEnd) {
      return { accepted: false, reason: 'END inválido: debe ser menor al END de la siguiente frase.', rows };
    }
  }
  return { accepted: true, rows };
}

export function buildSubtitleInsertRowRuntime({ rows = [], insertAfterRowId, createRow, formatTime, nowMs = null, gapMs = 67 }) {
  const list = Array.isArray(rows) ? rows : [];
  const index = list.findIndex((row) => row?.id === insertAfterRowId);
  if (index < 0) return { accepted: false, reason: 'Fila inválida.', row: null };
  const current = list[index];
  const next = list[index + 1] || null;
  const currentEnd = parseSubtitleTimeToMsRuntime(current?.end);
  const nextStart = next ? parseSubtitleTimeToMsRuntime(next?.start) : currentEnd + 2000 + gapMs;
  const draftStart = currentEnd + gapMs;
  const draftEnd = Math.max(draftStart + gapMs, next ? nextStart - gapMs : draftStart + 1500);
  if (draftEnd <= draftStart) return { accepted: false, reason: 'No hay hueco válido para insertar.', row: null };
  const row = createRow({
    id: `row-${nowMs || Date.now()}`,
    start: formatTime(draftStart),
    end: formatTime(draftEnd),
    phrase: '',
    size: '110',
    maxWidthPx: 1080,
    fontFamily: 'Khand',
    fontWeight: 'Bold',
    color: '#FFFFFF',
    align: 'left',
  });
  return { accepted: true, row };
}

function resolveSubtitleFontWeightRuntime(fontFamily, fallback = 'normal') {
  const family = (fontFamily || '').toString().trim();
  if (family === 'Khand') return 'Bold';
  if (family === 'Oswald') return '700';
  return fallback;
}

export function buildSubtitleCueMarkersRuntime(rows = [], durationMs = 0) {
  if (!durationMs || durationMs <= 0) return [];
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const startMs = parseSubtitleTimeToMsRuntime(row?.start);
    return Math.min(Math.max(startMs / durationMs, 0), 1);
  });
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
    resolveSubtitlesModeRuntime,
    buildSubtitleHealthRuntime,
    mapRemoteSubtitleSegmentsToRowsRuntime,
    buildSubtitlePreviewUrlRuntime,
    buildSubtitlePreviewPresentationRuntime,
    pickActiveSubtitleCueRuntime,
    resolveSubtitleTimelineSeekMsRuntime,
    validateSubtitleTimingPatchRuntime,
    buildSubtitleInsertRowRuntime,
    buildSubtitleCueMarkersRuntime,
  };
}
