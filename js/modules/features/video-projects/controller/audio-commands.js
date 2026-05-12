import { computeCompositionHash } from '../composition/composition-payload.js';
import { normalizeEditorState, normalizeGlobalAudioState } from '../domain/editor-state.js';

const AUDIO_CONTROL_KINDS = new Set(['voice', 'music', 'background']);

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
  debounceMs,
}) {
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

    if (isApprovalServiceMode(project)) {
      const current = normalizeGlobalAudioState(project._globalAudio || project.editor_state?.global_audio || project.editor_state?.approval_contract_snapshot?.audio);
      const settings = resolveAudioPatch(current[normalizedKind], patch);
      const next = normalizeGlobalAudioState({ ...current, [normalizedKind]: settings });
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

    const current = normalizeGlobalAudioState(project._globalAudio);
    const next = {
      ...current,
      [normalizedKind]: resolveAudioPatch(current[normalizedKind], patch),
    };
    project._globalAudio = normalizeGlobalAudioState(next);
    const compositionHash = computeCompositionHash(project);
    const lastRenderedHash = project.editor_state?.last_rendered_hash || project.editor_state?.last_preview_hash || project.editor_state?.composition_hash || '';
    const isDirty = compositionHash !== lastRenderedHash;
    project.editor_state = normalizeEditorState({ ...project.editor_state, dirty: isDirty, phase: isDirty ? 'editing_dirty' : (project.editor_state?.phase || 'preview_ready'), global_audio: project._globalAudio });
    renderSelectedVideoProject();

    clearTimeout(getSaveTimer());
    setSaveTimer(setTimeout(() => {
      void persistEditorState(project, { dirty: isDirty, phase: isDirty ? 'editing_dirty' : (project.editor_state?.phase || 'preview_ready'), global_audio: project._globalAudio });
    }, debounceMs));
  }

  return { updateGlobalAudio };
}
