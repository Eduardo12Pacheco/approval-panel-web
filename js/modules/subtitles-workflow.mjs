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

export const SUBTITLE_SIZE_PRESETS = Object.freeze(['36', '42', '48']);
export const SUBTITLE_COLOR_PRESETS = Object.freeze(['#FFFFFF', '#FFF000', '#00FF5A', '#0CC3F2']);
export const SUBTITLE_FONT_PRESETS = Object.freeze(['Khand Bold', 'Oswald', 'League Gothic', 'Impact', 'Anton']);

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
  return {
    id: (seed.id || '').toString(),
    start: (seed.start || '00:00:00.000').toString(),
    end: (seed.end || '00:00:02.000').toString(),
    sourceText: (seed.sourceText || '').toString(),
    phrase: (seed.phrase || '').toString(),
    size: sanitizePreset((seed.size || SUBTITLE_SIZE_PRESETS[0]).toString(), SUBTITLE_SIZE_PRESETS, SUBTITLE_SIZE_PRESETS[0]),
    color: sanitizePreset((seed.color || SUBTITLE_COLOR_PRESETS[0]).toString(), SUBTITLE_COLOR_PRESETS, SUBTITLE_COLOR_PRESETS[0]),
    fontFamily: sanitizePreset((seed.fontFamily || SUBTITLE_FONT_PRESETS[0]).toString(), SUBTITLE_FONT_PRESETS, SUBTITLE_FONT_PRESETS[0]),
    align: normalizeAlignment(seed.align),
  };
}

export function applySubtitleRowPatch(row, patch = {}) {
  const safeRow = createEmptySubtitleRow(row || {});
  return {
    ...safeRow,
    phrase: patch.phrase != null ? patch.phrase.toString() : safeRow.phrase,
    size: patch.size != null
      ? sanitizePreset(patch.size.toString(), SUBTITLE_SIZE_PRESETS, safeRow.size)
      : safeRow.size,
    color: patch.color != null
      ? sanitizePreset(patch.color.toString(), SUBTITLE_COLOR_PRESETS, safeRow.color)
      : safeRow.color,
    fontFamily: patch.fontFamily != null
      ? sanitizePreset(patch.fontFamily.toString(), SUBTITLE_FONT_PRESETS, safeRow.fontFamily)
      : safeRow.fontFamily,
    align: patch.align != null ? normalizeAlignment(patch.align, safeRow.align) : safeRow.align,
  };
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

function sanitizePreset(value, allowed, fallback) {
  if (allowed.includes(value)) return value;
  return fallback;
}
