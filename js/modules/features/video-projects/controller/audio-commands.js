import { computeCompositionHash } from '../composition/composition-payload.js';
import { normalizeEditorState, normalizeGlobalAudioState } from '../domain/editor-state.js';

const AUDIO_CONTROL_KINDS = new Set(['voice', 'music', 'background']);

function stableJson(value) {
  return JSON.stringify(value ?? null);
}

export function createGlobalAudioCommands({
  store,
  persistEditorState,
  isApprovalServiceMode,
  commitApprovalSnapshotOperations,
  createSnapshotDraft,
  scheduleApprovalMotionPersistence,
  updateSelectedVideoProjectCompositionPreview,
  renderSelectedVideoProject,
  getSaveTimer,
  setSaveTimer,
  cancelPendingEditorSave,
  beforeMutate,
  debounceMs,
}) {
  function clearPendingEditorSave() {
    if (typeof cancelPendingEditorSave === 'function') {
      cancelPendingEditorSave();
      return;
    }
    clearTimeout(getSaveTimer());
  }

  function notifyBeforeMutate(label, project, details = {}) {
    if (typeof beforeMutate === 'function') beforeMutate({ label, project, ...details });
  }

  function resolveAudioPatch(currentSettings = {}, patch = {}) {
    return {
      volume: Number.isFinite(patch.volume) ? Math.max(0, Math.min(1, patch.volume)) : currentSettings?.volume,
      muted: patch.muted !== undefined ? Boolean(patch.muted) : currentSettings?.muted,
    };
  }

  function applyLocalAudioSnapshot(snapshot = {}, kind, settings = {}) {
    return {
      ...snapshot,
      audio: {
        ...(snapshot.audio || {}),
        [kind]: {
          ...(snapshot.audio?.[kind] || {}),
          ...settings,
        },
      },
    };
  }

  async function updateGlobalAudio(kind, patch) {
    const state = store.getState();
    const project = state.selectedVideoProject;
    if (!project || !AUDIO_CONTROL_KINDS.has(kind)) return;
    const normalizedKind = kind === 'voice' ? 'voice' : 'music';
    const currentForCapture = normalizeGlobalAudioState(project._globalAudio || project.editor_state?.global_audio || project.editor_state?.approval_contract_snapshot?.audio);
    const nextForCapture = normalizeGlobalAudioState({ ...currentForCapture, [normalizedKind]: resolveAudioPatch(currentForCapture[normalizedKind], patch) });
    if (stableJson(nextForCapture) === stableJson(currentForCapture)) return;
    notifyBeforeMutate('update-global-audio', project, { kind: normalizedKind, patch });

    if (isApprovalServiceMode(project)) {
      const current = currentForCapture;
      const settings = resolveAudioPatch(current[normalizedKind], patch);
      const next = nextForCapture;
      const snapshot = applyLocalAudioSnapshot(project.editor_state?.approval_contract_snapshot || {}, normalizedKind, next[normalizedKind]);
      project._globalAudio = next;
      project.editor_state = normalizeEditorState({
        ...project.editor_state,
        approval_contract_snapshot: snapshot,
        global_audio: project._globalAudio,
        dirty: true,
        phase: 'editing_dirty',
      });
      createSnapshotDraft?.(`audio:${normalizedKind}`, { type: 'setAudio', kind: normalizedKind, settings: next[normalizedKind] }, (canonicalSnapshot) => applyLocalAudioSnapshot(canonicalSnapshot, normalizedKind, next[normalizedKind]));
      updateSelectedVideoProjectCompositionPreview?.({ project });
      scheduleApprovalMotionPersistence?.(project);
      return;
    }

    project._globalAudio = normalizeGlobalAudioState(nextForCapture);
    const compositionHash = computeCompositionHash(project);
    const lastRenderedHash = project.editor_state?.last_rendered_hash || project.editor_state?.last_preview_hash || project.editor_state?.composition_hash || '';
    const isDirty = compositionHash !== lastRenderedHash;
    project.editor_state = normalizeEditorState({ ...project.editor_state, dirty: isDirty, phase: isDirty ? 'editing_dirty' : (project.editor_state?.phase || 'preview_ready'), global_audio: project._globalAudio });
    renderSelectedVideoProject();

    clearPendingEditorSave();
    setSaveTimer(setTimeout(() => {
      void persistEditorState(project, { dirty: isDirty, phase: isDirty ? 'editing_dirty' : (project.editor_state?.phase || 'preview_ready'), global_audio: project._globalAudio });
    }, debounceMs));
  }

  return { updateGlobalAudio };
}
