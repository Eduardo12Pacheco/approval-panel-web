import { normalizeEditorState, normalizeBrandChannel } from '../domain/editor-state.js';

export function createBrandCommands({
  store,
  persistEditorState,
  isApprovalServiceMode,
  commitApprovalSnapshotOperations,
  updateSelectedVideoProjectCompositionPreview,
  renderSelectedVideoProject,
  getSaveTimer,
  setSaveTimer,
  debounceMs,
}) {
  async function updateBrandChannel(value) {
    const state = store.getState();
    const project = state.selectedVideoProject;
    if (!project) return;
    const brandChannel = normalizeBrandChannel(value);

    if (isApprovalServiceMode(project)) {
      try {
        await commitApprovalSnapshotOperations(project, [{ type: 'setBrandChannel', brandChannel }], { phase: 'editing_dirty' });
      } catch (err) {
        console.error(err);
        project.editor_state = normalizeEditorState({ ...project.editor_state, phase: 'editing_dirty', brandChannel, brand_channel: brandChannel });
      } finally {
        renderSelectedVideoProject();
      }
      return;
    }

    const snapshot = project.editor_state?.approval_contract_snapshot && typeof project.editor_state.approval_contract_snapshot === 'object'
      ? { ...project.editor_state.approval_contract_snapshot, brandChannel }
      : project.editor_state?.approval_contract_snapshot;

    project.editor_state = normalizeEditorState({ ...project.editor_state, approval_contract_snapshot: snapshot, brandChannel, brand_channel: brandChannel, dirty: true, phase: 'editing_dirty' });
    updateSelectedVideoProjectCompositionPreview({ project });
    renderSelectedVideoProject();

    clearTimeout(getSaveTimer());
    setSaveTimer(setTimeout(() => {
      void persistEditorState(project, { approval_contract_snapshot: snapshot, brandChannel, brand_channel: brandChannel, dirty: true, phase: 'editing_dirty' });
    }, debounceMs));
  }

  return { updateBrandChannel };
}
