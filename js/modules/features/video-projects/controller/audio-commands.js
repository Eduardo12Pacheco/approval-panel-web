import { computeCompositionHash } from '../composition/composition-payload.js';
import { normalizeEditorState, normalizeGlobalAudioState } from '../domain/editor-state.js';

const AUDIO_CONTROL_KINDS = new Set(['voice', 'music', 'background']);

export function createGlobalAudioCommands({
  store,
  persistEditorState,
  isApprovalServiceMode,
  commitApprovalSnapshotOperations,
  renderSelectedVideoProject,
  getSaveTimer,
  setSaveTimer,
  debounceMs,
}) {
  async function updateGlobalAudio(kind, patch) {
    const state = store.getState();
    const project = state.selectedVideoProject;
    if (!project || !AUDIO_CONTROL_KINDS.has(kind)) return;
    const normalizedKind = kind === 'voice' ? 'voice' : 'music';

    if (isApprovalServiceMode(project)) {
      try {
        await commitApprovalSnapshotOperations(project, [{ type: 'setAudio', kind: normalizedKind, settings: patch }], { phase: 'editing_dirty' });
      } catch (err) {
        console.error(err);
        project.editor_state = normalizeEditorState({ ...project.editor_state, phase: 'editing_dirty' });
      } finally {
        renderSelectedVideoProject();
      }
      return;
    }

    const current = normalizeGlobalAudioState(project._globalAudio);
    const next = {
      ...current,
      [normalizedKind]: {
        volume: Number.isFinite(patch.volume) ? Math.max(0, Math.min(1, patch.volume)) : current[normalizedKind]?.volume,
        muted: patch.muted !== undefined ? Boolean(patch.muted) : current[normalizedKind]?.muted,
      },
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
