export function normalizeVideoProjectRows(payload = {}) {
  const candidates = [payload?.projects, payload?.items, payload?.rows, payload?.data];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

export function resolveVideoProjectKey(row = {}) {
  return (row.project_id || row.draft_id || row.id_noticia || row.cluster_id || '').toString();
}

export function resolveVideoProjectTitle(row = {}, fallback = 'Proyecto sin título') {
  return [row.title, row.tema_principal, row.jugador, row.draft_id]
    .map((part) => (part || '').toString().trim())
    .find(Boolean) || fallback;
}

export function createVideoProjectsFeature({ api, store, ui, callbacks }) {
  const {
    renderVideoProjects = () => {},
    renderSelectedVideoProject = () => {},
  } = callbacks || {};

  async function refreshVideoProjects({ silent = false } = {}) {
    const state = store.getState();
    try {
      state.videoProjectsLoading = true;
      renderVideoProjects();
      const data = await api.listVideoProjects({ limit: 50 });
      state.videoProjects = normalizeVideoProjectRows(data);

      if (state.selectedVideoProject) {
        const selectedKey = resolveVideoProjectKey(state.selectedVideoProject);
        const refreshed = state.videoProjects.find((item) => resolveVideoProjectKey(item) === selectedKey);
        state.selectedVideoProject = refreshed
          ? { ...state.selectedVideoProject, ...refreshed }
          : null;
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

    const listRow = state.videoProjects.find((item) => resolveVideoProjectKey(item) === id);
    state.selectedVideoProject = listRow || { draft_id: id, project_id: id };
    state.videoProjectDetailLoading = true;
    renderVideoProjects();
    renderSelectedVideoProject();

    try {
      const data = await api.getVideoProject(id);
      const [detail] = normalizeVideoProjectRows(data);
      if (!detail) {
        ui.toast('Ese proyecto todavía no existe o fue deshabilitado');
        state.selectedVideoProject = listRow || null;
        return;
      }
      state.selectedVideoProject = detail;
      renderVideoProjects();
      renderSelectedVideoProject();
    } catch (err) {
      console.error(err);
      ui.toast('Error abriendo proyecto de edición');
    } finally {
      state.videoProjectDetailLoading = false;
      renderSelectedVideoProject();
    }
  }

  return {
    refreshVideoProjects,
    openVideoProject,
  };
}
