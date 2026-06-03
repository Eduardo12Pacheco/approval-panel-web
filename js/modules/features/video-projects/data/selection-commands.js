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
  function resetViewportToProjectTop() {
    if (typeof window === 'undefined') return;
    const reset = () => {
      window.scrollTo?.({ top: 0, left: 0, behavior: 'auto' });
      if (typeof document !== 'undefined' && document?.documentElement) document.documentElement.scrollTop = 0;
      if (typeof document !== 'undefined' && document?.body) document.body.scrollTop = 0;
    };
    if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(reset);
    else setTimeout(reset, 0);
  }

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
    resetViewportToProjectTop();
  }

  function goToImagesStep() {
    const project = store.getState().selectedVideoProject;
    if (!project) return;
    setVideoProjectStep(project, 'images');
    renderSelectedVideoProject();
    resetViewportToProjectTop();
  }

  return {
    toggleImageSelection,
    goToAudioStep,
    goToImagesStep,
  };
}
