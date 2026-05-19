import { hydrateSelectedProjectState } from './editor-state-persistence.js';

export function createProjectLoadingCommands({
  api,
  store,
  ui,
  normalizeRows,
  resolveProjectKey,
  renderVideoProjects,
  renderSelectedVideoProject,
  getCachedProjectDetail = () => null,
  preloadProjectCandidateImages = async () => {},
  fetchAndCacheProjectDetail = async () => null,
}) {
  async function refreshVideoProjects({ silent = false } = {}) {
    const state = store.getState();
    try {
      state.videoProjectsLoading = true;
      renderVideoProjects();
      const data = await api.listVideoProjects({ limit: 50 });
      state.videoProjects = normalizeRows(data);

      if (state.selectedVideoProject) {
        const selectedKey = resolveProjectKey(state.selectedVideoProject);
        const refreshed = state.videoProjects.find((item) => resolveProjectKey(item) === selectedKey);
        if (refreshed) {
          const priorEditorState = state.selectedVideoProject.editor_state;
          state.selectedVideoProject = { ...state.selectedVideoProject, ...refreshed };
          if (refreshed.editor_state && typeof refreshed.editor_state === 'object') {
            hydrateSelectedProjectState(state.selectedVideoProject);
          } else if (priorEditorState) {
            state.selectedVideoProject.editor_state = priorEditorState;
          }
        }
      }

      renderVideoProjects();
      renderSelectedVideoProject();
    } catch (err) {
      console.error(err);
      if (!silent) ui.toast('Error cargando proyectos de edición');
    } finally {
      state.videoProjectsLoading = false;
      renderVideoProjects();
    }
  }

  async function openVideoProject(projectId) {
    const state = store.getState();
    const id = (projectId || '').toString();
    if (!id) return;

    const listRow = state.videoProjects.find((item) => resolveProjectKey(item) === id);
    const cachedDetail = getCachedProjectDetail(id);
    if (cachedDetail) {
      state.selectedVideoProject = cachedDetail;
      hydrateSelectedProjectState(state.selectedVideoProject);
      state.videoProjectDetailLoading = false;
      state.videoProjectDetailImagesPreparing = false;
      renderVideoProjects();
      renderSelectedVideoProject();
      return;
    }

    state.selectedVideoProject = listRow || { draft_id: id, project_id: id };
    state.videoProjectDetailLoading = true;
    state.videoProjectDetailImagesPreparing = true;
    renderVideoProjects();
    renderSelectedVideoProject();

    try {
      const detail = await fetchAndCacheProjectDetail(id, { preloadImages: false });
      if (!detail) {
        ui.toast('Ese proyecto todavía no existe o fue deshabilitado');
        state.selectedVideoProject = listRow || null;
        return;
      }
      state.selectedVideoProject = detail;
      hydrateSelectedProjectState(state.selectedVideoProject);
      renderVideoProjects();
      renderSelectedVideoProject();
      await preloadProjectCandidateImages(state.selectedVideoProject);
      state.videoProjectDetailImagesPreparing = false;
      renderVideoProjects();
      renderSelectedVideoProject();
    } catch (err) {
      console.error(err);
      ui.toast('Error abriendo proyecto de edición');
    } finally {
      state.videoProjectDetailLoading = false;
      state.videoProjectDetailImagesPreparing = false;
      renderSelectedVideoProject();
    }
  }

  async function disableVideoProject(projectId) {
    const state = store.getState();
    const id = (projectId || '').toString().trim();
    if (!id) return;

    const previousProjects = Array.isArray(state.videoProjects) ? [...state.videoProjects] : [];
    const previousSelected = state.selectedVideoProject || null;
    const selectedKey = previousSelected ? resolveProjectKey(previousSelected) : '';

    state.videoProjects = previousProjects.filter((item) => resolveProjectKey(item) !== id);
    if (selectedKey === id) {
      state.selectedVideoProject = null;
      state.videoProjectDetailLoading = false;
      state.videoProjectDetailImagesPreparing = false;
    }
    renderVideoProjects();
    renderSelectedVideoProject();

    try {
      await api.disableVideoProject({ draftId: id });
      ui.toast('Proyecto eliminado');
      await refreshVideoProjects({ silent: true });
    } catch (err) {
      console.error(err);
      state.videoProjects = previousProjects;
      state.selectedVideoProject = previousSelected;
      renderVideoProjects();
      renderSelectedVideoProject();
      ui.toast('Error eliminando proyecto de edición');
    }
  }

  return { refreshVideoProjects, openVideoProject, disableVideoProject };
}
