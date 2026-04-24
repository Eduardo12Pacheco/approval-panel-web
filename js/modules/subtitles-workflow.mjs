export const SUBTITLES_PHASES = Object.freeze([
  'Carga',
  'Procesando audio',
  'Edicion',
  'Procesando video',
  'Terminado',
]);

export const SUBTITLES_POLL_INTERVAL_MS = 2000;
export const SUBTITLES_AUTOSAVE_INTERVAL_MS = 5000;
export const SUBTITLES_RENDER_WATCHDOG_MS = 300000;

export const SUBTITLE_SIZE_PRESETS = Object.freeze(['90', '95', '100', '105', '110', '115', '120', '125', '130', '135', '140']);
export const SUBTITLE_COLOR_PRESETS = Object.freeze(['#FFFFFF', '#FFF000', '#00FF5A', '#0CC3F2']);
export const SUBTITLE_FONT_PRESETS = Object.freeze(['Khand', 'Anton', 'Impact', 'League Gothic', 'Oswald']);
export const SUBTITLE_FONT_WEIGHT_BY_FAMILY = Object.freeze({
  Khand: 'Bold',
  Oswald: '700',
});

const ALLOWED_TRANSITIONS = Object.freeze({
  Carga: ['Procesando audio'],
  'Procesando audio': ['Edicion'],
  Edicion: ['Procesando video'],
  'Procesando video': ['Terminado'],
  Terminado: [],
});

const ALIGNMENTS = Object.freeze(['left', 'center', 'right']);
const PROCESSING_PHASES = Object.freeze(['Procesando audio', 'Procesando video']);
const TERMINAL_JOB_STATUSES = new Set(['succeeded', 'failed', 'cancelled']);

export function createSubtitlesWorkflowMachine(initialPhase = 'Carga') {
  let phase = SUBTITLES_PHASES.includes(initialPhase) ? initialPhase : 'Carga';

  return {
    getPhase() {
      return phase;
    },
    transition(nextPhase) {
      if (!SUBTITLES_PHASES.includes(nextPhase)) return false;
      const allowed = ALLOWED_TRANSITIONS[phase] || [];
      if (!allowed.includes(nextPhase)) return false;
      phase = nextPhase;
      return true;
    },
    reset() {
      phase = 'Carga';
      return phase;
    },
  };
}

export function createEmptySubtitleRow(seed = {}) {
  const rawMaxWidthPx = Number(seed.maxWidthPx ?? 1080);
  const safeMaxWidthPx = Number.isFinite(rawMaxWidthPx) && rawMaxWidthPx > 0 ? Math.round(rawMaxWidthPx) : 1080;
  const fontFamily = normalizeFontFamily(seed.fontFamily || seed.font_family, SUBTITLE_FONT_PRESETS[0]);
  const isDraft = Boolean(seed.isDraft || seed.draft || seed.untimed);
  return {
    id: (seed.id || '').toString(),
    start: (isDraft ? (seed.start ?? '') : (seed.start || '00:00:00.000')).toString(),
    end: (isDraft ? (seed.end ?? '') : (seed.end || '00:00:02.000')).toString(),
    sourceText: (seed.sourceText || '').toString(),
    phrase: (seed.phrase || '').toString(),
    maxWidthPx: safeMaxWidthPx,
    size: sanitizePreset((seed.size || SUBTITLE_SIZE_PRESETS[0]).toString(), SUBTITLE_SIZE_PRESETS, SUBTITLE_SIZE_PRESETS[0]),
    color: sanitizePreset((seed.color || SUBTITLE_COLOR_PRESETS[0]).toString(), SUBTITLE_COLOR_PRESETS, SUBTITLE_COLOR_PRESETS[0]),
    fontFamily,
    fontWeight: (seed.fontWeight || seed.font_weight || resolveSubtitleFontWeight(fontFamily)).toString(),
    align: normalizeAlignment(seed.align),
    isDraft,
  };
}

export function applySubtitleRowPatch(row, patch = {}) {
  const safeRow = createEmptySubtitleRow(row || {});
  return {
    ...safeRow,
    start: patch.start != null ? patch.start.toString() : safeRow.start,
    end: patch.end != null ? patch.end.toString() : safeRow.end,
    phrase: patch.phrase != null ? patch.phrase.toString() : safeRow.phrase,
    maxWidthPx: patch.maxWidthPx != null
      ? (() => {
          const parsed = Number(patch.maxWidthPx);
          return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : safeRow.maxWidthPx;
        })()
      : safeRow.maxWidthPx,
    size: patch.size != null
      ? sanitizePreset(patch.size.toString(), SUBTITLE_SIZE_PRESETS, safeRow.size)
      : safeRow.size,
    color: patch.color != null
      ? sanitizePreset(patch.color.toString(), SUBTITLE_COLOR_PRESETS, safeRow.color)
      : safeRow.color,
    fontFamily: patch.fontFamily != null
      ? normalizeFontFamily(patch.fontFamily, safeRow.fontFamily)
      : safeRow.fontFamily,
    fontWeight: patch.fontWeight != null
      ? patch.fontWeight.toString()
      : resolveSubtitleFontWeight(
        patch.fontFamily != null ? normalizeFontFamily(patch.fontFamily, safeRow.fontFamily) : safeRow.fontFamily,
        safeRow.fontWeight,
      ),
    align: patch.align != null ? normalizeAlignment(patch.align, safeRow.align) : safeRow.align,
    isDraft: patch.isDraft != null ? Boolean(patch.isDraft) : safeRow.isDraft,
  };
}

export function resolveSubtitleFontWeight(fontFamily, fallback = 'normal') {
  const family = normalizeFontFamily(fontFamily, '');
  return SUBTITLE_FONT_WEIGHT_BY_FAMILY[family] || fallback;
}

export function getAlignmentButtonState(activeAlignment) {
  const selected = normalizeAlignment(activeAlignment);
  return ALIGNMENTS.reduce((acc, align) => {
    const isSelected = align === selected;
    acc[align] = {
      selected: isSelected,
      className: isSelected ? 'selected-green' : 'muted',
    };
    return acc;
  }, {});
}

export function shouldRunStatusPolling({ phase, jobStatus }) {
  if (!PROCESSING_PHASES.includes(phase)) return false;
  const normalized = (jobStatus || '').toString().trim().toLowerCase();
  if (!normalized) return true;
  return !TERMINAL_JOB_STATUSES.has(normalized);
}

export function shouldRunAutosave({ phase, dirty }) {
  return phase === 'Edicion' && Boolean(dirty);
}

export function shouldFailRenderByWatchdog({
  phase,
  jobStatus,
  processingStartedAtMs,
  nowMs = Date.now(),
  watchdogMs = SUBTITLES_RENDER_WATCHDOG_MS,
}) {
  if (!shouldRunStatusPolling({ phase, jobStatus })) return false;
  const started = Number(processingStartedAtMs);
  if (!Number.isFinite(started) || started <= 0) return false;
  const elapsed = Number(nowMs) - started;
  return elapsed >= Number(watchdogMs);
}

export function createSnapshotSaveQueue({ initialAckVersion = 0, persist }) {
  let ackVersion = Number.isFinite(Number(initialAckVersion)) ? Number(initialAckVersion) : 0;
  let inFlight = false;
  let pending = null;

  async function flush() {
    if (inFlight || !pending) return;
    inFlight = true;
    const current = pending;
    pending = null;

    try {
      const response = await persist({
        analysis_job_id: current.analysisJobId,
        snapshot_json: current.snapshotJson,
        base_snapshot_version: ackVersion,
        save_mode: current.saveMode,
      });
      const nextAck = Number(response?.snapshot_version || ackVersion);
      ackVersion = Math.max(ackVersion, nextAck);
      current.resolve({
        ok: true,
        ackVersion,
        snapshotVersion: nextAck,
      });
    } catch (error) {
      current.reject(error);
    } finally {
      inFlight = false;
      if (pending) {
        await flush();
      }
    }
  }

  return {
    enqueue({ analysisJobId = null, snapshotJson, saveMode = 'manual' }) {
      return new Promise((resolve, reject) => {
        pending = {
          analysisJobId,
          snapshotJson,
          saveMode: saveMode === 'auto' ? 'auto' : 'manual',
          resolve,
          reject,
        };
        void flush();
      });
    },
    getState() {
      return {
        ackVersion,
        inFlight,
        hasPending: Boolean(pending),
      };
    },
    setAckVersion(nextVersion) {
      const parsed = Number(nextVersion);
      if (Number.isFinite(parsed)) {
        ackVersion = Math.max(ackVersion, parsed);
      }
      return ackVersion;
    },
  };
}

export function getSubtitlesActionPolicy(phase) {
  return {
    canSave: phase === 'Edicion',
    canReady: phase === 'Edicion',
    canDownload: phase === 'Terminado',
  };
}

export function getSubtitlesPhaseSectionVisibility(phase) {
  return {
    showUpload: phase === 'Carga',
    showProcessing: phase === 'Procesando audio' || phase === 'Procesando video',
    showEdition: phase === 'Edicion',
    showDone: phase === 'Terminado',
  };
}

export function createSaveActionPlan({ phase, analysisJobId, snapshotVersion }) {
  if (phase !== 'Edicion') {
    return { allowed: false, reason: 'save_requires_edicion_phase' };
  }
  return {
    allowed: true,
    save_mode: 'manual',
    analysis_job_id: analysisJobId,
    base_snapshot_version: snapshotVersion,
    triggers_render: false,
  };
}

export function createReadyActionPlan({ phase, analysisJobId, snapshotVersion }) {
  if (phase !== 'Edicion') {
    return { allowed: false, reason: 'ready_requires_edicion_phase' };
  }

  return {
    allowed: true,
    approve: {
      analysis_job_id: analysisJobId,
      snapshot_version: snapshotVersion,
    },
    render: {
      analysis_job_id: analysisJobId,
      snapshot_version: snapshotVersion,
    },
    next_phase: 'Procesando video',
    auto_download: false,
  };
}

export function createDownloadActionPlan({ phase, renderJobId }) {
  if (phase !== 'Terminado') {
    return { allowed: false, reason: 'download_requires_terminado_phase' };
  }
  if (!renderJobId) {
    return { allowed: false, reason: 'download_requires_render_job_id' };
  }
  return {
    allowed: true,
    path: `/api/subtitles/render/${renderJobId}/download/file`,
  };
}

function normalizeAlignment(value, fallback = 'left') {
  const lower = (value || '').toString().trim().toLowerCase();
  if (ALIGNMENTS.includes(lower)) return lower;
  return fallback;
}

function normalizeFontFamily(value, fallback = SUBTITLE_FONT_PRESETS[0]) {
  const raw = (value || '').toString().trim();
  const family = raw === 'Khand Bold' ? 'Khand' : raw;
  return sanitizePreset(family, SUBTITLE_FONT_PRESETS, fallback);
}

function sanitizePreset(value, allowed, fallback) {
  if (allowed.includes(value)) return value;
  return fallback;
}
