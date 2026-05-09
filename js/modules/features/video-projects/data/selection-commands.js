export function createSelectionCommands({
  api,
  store,
  resolveProjectKey,
  renderSelectedVideoProject,
  getSaveTimer,
  setSaveTimer,
  debounceMs,
  setVideoProjectStep,
}) {
  function toggleImageSelection(candidateImageUrl) {
    const state = store.getState();
    const project = state.selectedVideoProject;
    if (!project) return;

    const id = (candidateImageUrl || '').toString().trim();
    if (!id) return;

    const draftId = resolveProjectKey(project);
    const selected = Array.isArray(project.selected_images) ? [...project.selected_images] : [];

    const idx = selected.indexOf(id);
    if (idx >= 0) {
      selected.splice(idx, 1);
    } else {
      selected.push(id);
    }

    project.selected_images = selected;
    project.selected_count = selected.length;

    renderSelectedVideoProject();

    clearTimeout(getSaveTimer());
    setSaveTimer(setTimeout(() => {
      void (async () => {
        try {
          await api.saveVideoProjectSelections({ draftId, selectedImageIds: selected });
        } catch (err) {
          console.error(err);
        }
      })();
    }, debounceMs));
  }

  function goToAudioStep() {
    const project = store.getState().selectedVideoProject;
    if (!project) return;
    setVideoProjectStep(project, 'audio');
    renderSelectedVideoProject();
  }

  function goToImagesStep() {
    const project = store.getState().selectedVideoProject;
    if (!project) return;
    setVideoProjectStep(project, 'images');
    renderSelectedVideoProject();
  }

  return {
    toggleImageSelection,
    goToAudioStep,
    goToImagesStep,
  };
}
