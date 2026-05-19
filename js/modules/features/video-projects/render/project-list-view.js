import { buildFutureProjectCard, buildProjectCard } from './project-list-markup.js?v=20260519-project-card-polish';
import { hydrateProjectListCards } from '../events/project-list-events.js?v=20260519-project-card-polish';

export function renderVideoProjectsListView({ state, el, openVideoProject, prefetchProjectDetail, disableVideoProject, confirmDelete }) {
  if (!el.videoProjectsList) return;

  const projects = Array.isArray(state.videoProjects) ? state.videoProjects : [];
  const loading = Boolean(state.videoProjectsLoading);

  if (el.videoProjectsMeta) {
    el.videoProjectsMeta.textContent = loading
      ? 'Actualizando proyectos…'
      : `${projects.length} proyecto${projects.length === 1 ? '' : 's'}`;
  }
  if (loading && !projects.length) {
    el.videoProjectsList.innerHTML = '<p class="video-projects-empty">Buscando proyectos de edición…</p>';
    return;
  }
  if (!projects.length) {
    el.videoProjectsList.innerHTML = `
      <div class="video-projects-empty video-projects-empty--catalog-card">
        <p>Todavía no hay proyectos. Procesá un guion y acá va a aparecer automáticamente.</p>
        <span class="video-projects-empty__plus" aria-hidden="true">+</span>
      </div>
    `;
    return;
  }

  el.videoProjectsList.innerHTML = [...projects.map((project) => buildProjectCard(project)), buildFutureProjectCard()].join('');
  hydrateProjectListCards({ root: el.videoProjectsList, openVideoProject, prefetchProjectDetail, disableVideoProject, confirmDelete });
}
