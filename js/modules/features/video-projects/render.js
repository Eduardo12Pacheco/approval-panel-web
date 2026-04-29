import { escapeHtmlCore } from '../../core/ui/escape-html.js';
import { resolveVideoProjectKey, resolveVideoProjectTitle } from './index.js';

function formatCount(value, singular, plural = `${singular}s`) {
  const count = Number(value || 0);
  return `${count} ${count === 1 ? singular : plural}`;
}

function formatDateLabel(value) {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin fecha';
  return date.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getStatusLabel(status = '') {
  const normalized = status.toString().trim().toLowerCase();
  if (normalized === 'ready') return 'Listo';
  if (normalized === 'image_search_error') return 'Error Serper';
  if (normalized === 'no_candidates') return 'Sin imágenes';
  if (normalized === 'pending') return 'Procesando';
  return status || 'Sin estado';
}

function buildProjectCard(project = {}, { selected = false } = {}) {
  const id = resolveVideoProjectKey(project);
  const encodedId = encodeURIComponent(id);
  const title = escapeHtmlCore(resolveVideoProjectTitle(project));
  const player = escapeHtmlCore((project.jugador || 'Sin jugador').toString());
  const country = escapeHtmlCore((project.seleccion || 'Sin selección').toString());
  const imageUrl = (project.first_image_url || '').toString();
  const selectedClass = selected ? ' is-selected' : '';
  const status = escapeHtmlCore(getStatusLabel(project.status));
  const statusName = escapeHtmlCore((project.status || 'unknown').toString());

  return `
    <article class="video-project-card${selectedClass}" data-project-id="${encodedId}" role="button" tabindex="0" aria-pressed="${selected ? 'true' : 'false'}">
      <div class="video-project-card__thumb">
        ${imageUrl
          ? `<img src="${escapeHtmlCore(imageUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer" />`
          : '<span aria-hidden="true">VP</span>'}
      </div>
      <div class="video-project-card__body">
        <div class="video-project-card__eyebrow">${country} · ${player}</div>
        <h3>${title}</h3>
        <p>${formatCount(project.image_count, 'imagen', 'imágenes')} · ${formatCount(project.segment_count, 'segmento')}</p>
      </div>
      <span class="video-project-status" data-status="${statusName}">${status}</span>
    </article>
  `;
}

function buildCandidateCard(candidate = {}) {
  const title = escapeHtmlCore((candidate.title || candidate.source || candidate.domain || 'Imagen Serper').toString());
  const domain = escapeHtmlCore((candidate.domain || candidate.source || 'Google Images').toString());
  const imageUrl = (candidate.thumbnail_url || candidate.image_url || '').toString();
  const fullImageUrl = (candidate.image_url || candidate.thumbnail_url || '').toString();
  const sourceLink = (candidate.link || candidate.google_url || fullImageUrl || '').toString();
  const order = Number(candidate.order || candidate.position || 0);

  return `
    <article class="video-image-card">
      <a class="video-image-card__media" href="${escapeHtmlCore(sourceLink || fullImageUrl)}" target="_blank" rel="noopener noreferrer">
        ${imageUrl
          ? `<img src="${escapeHtmlCore(imageUrl)}" alt="${title}" loading="lazy" referrerpolicy="no-referrer" />`
          : '<span>Sin preview</span>'}
      </a>
      <div class="video-image-card__copy">
        <span class="video-image-card__order">#${order || '—'}</span>
        <h4>${title}</h4>
        <p>${domain}</p>
      </div>
    </article>
  `;
}

export function renderVideoProjectsListView({ state, el, openVideoProject }) {
  if (!el.videoProjectsList) return;

  const projects = Array.isArray(state.videoProjects) ? state.videoProjects : [];
  const selectedKey = resolveVideoProjectKey(state.selectedVideoProject || {});
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
    el.videoProjectsList.innerHTML = '<p class="video-projects-empty">Todavía no hay proyectos. Procesá un guion y acá va a aparecer automáticamente.</p>';
    return;
  }

  el.videoProjectsList.innerHTML = projects
    .map((project) => buildProjectCard(project, { selected: selectedKey && selectedKey === resolveVideoProjectKey(project) }))
    .join('');

  el.videoProjectsList.querySelectorAll('.video-project-card[data-project-id]').forEach((card) => {
    const open = async () => {
      await openVideoProject(decodeURIComponent(card.dataset.projectId || ''));
    };
    card.addEventListener('click', open);
    card.addEventListener('keydown', async (ev) => {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      ev.preventDefault();
      await open();
    });
  });
}

export function renderSelectedVideoProjectView({ state, el }) {
  if (!el.videoProjectDetail) return;

  const project = state.selectedVideoProject;
  if (!project) {
    el.videoProjectDetail.innerHTML = `
      <div class="video-project-detail__empty">
        <span>Fase 1</span>
        <h2>Elegí un proyecto</h2>
        <p>Cuando proceses un guion, n8n ya habrá buscado imágenes en Serper. Entrás al proyecto y las ves acá, sin esperar otra búsqueda.</p>
      </div>
    `;
    return;
  }

  const title = escapeHtmlCore(resolveVideoProjectTitle(project));
  const player = escapeHtmlCore((project.jugador || 'Sin jugador').toString());
  const country = escapeHtmlCore((project.seleccion || 'Sin selección').toString());
  const status = escapeHtmlCore(getStatusLabel(project.status));
  const query = escapeHtmlCore((project.search_query || project.image_search_meta?.query || 'Sin query registrada').toString());
  const fetchedAt = project.image_fetched_at || project.image_search_meta?.fetched_at || project.updated_at;
  const candidates = Array.isArray(project.image_candidates) ? project.image_candidates : [];
  const segments = Array.isArray(project.segments) ? project.segments : [];
  const loading = Boolean(state.videoProjectDetailLoading);

  el.videoProjectDetail.innerHTML = `
    <header class="video-project-detail__header">
      <div>
        <p class="video-projects-eyebrow">Proyecto · ${country} · ${player}</p>
        <h2>${title}</h2>
        <p class="video-project-detail__summary">Las imágenes de la fase 1 vienen persistidas desde el procesamiento del guion.</p>
      </div>
      <span class="video-project-status video-project-status--large" data-status="${escapeHtmlCore((project.status || '').toString())}">${status}</span>
    </header>

    <ol class="video-phase-rail" aria-label="Fases del proyecto">
      <li class="is-active"><span>01</span>Imágenes</li>
      <li><span>02</span>Selección</li>
      <li><span>03</span>Edición</li>
      <li><span>04</span>Render</li>
    </ol>

    <section class="video-project-detail__meta-grid">
      <div><span>Query Serper</span><strong>${query}</strong></div>
      <div><span>Ventana</span><strong>Últimas 24 horas</strong></div>
      <div><span>Imágenes</span><strong>${candidates.length || Number(project.image_count || 0)}</strong></div>
      <div><span>Actualizado</span><strong>${escapeHtmlCore(formatDateLabel(fetchedAt))}</strong></div>
    </section>

    ${loading ? '<p class="video-projects-empty">Cargando fase 1…</p>' : ''}

    <section class="video-project-detail__workspace">
      <div class="video-project-detail__main">
        <div class="video-project-section-heading">
          <div>
            <span class="video-projects-eyebrow">Fase 1</span>
            <h3>Imágenes encontradas en Google</h3>
          </div>
          <p>${formatCount(candidates.length || project.image_count, 'candidato')}</p>
        </div>
        ${candidates.length
          ? `<div class="video-image-grid">${candidates.map(buildCandidateCard).join('')}</div>`
          : '<p class="video-projects-empty">Todavía no hay candidatos guardados para este proyecto. Si el estado dice Error Serper, revisá la ejecución del workflow.</p>'}
      </div>

      <aside class="video-project-detail__side">
        <div class="video-project-section-heading video-project-section-heading--compact">
          <div>
            <span class="video-projects-eyebrow">Guion pipeado</span>
            <h3>Segmentos</h3>
          </div>
        </div>
        <ol class="video-segments-list">
          ${segments.slice(0, 8).map((segment) => `
            <li>
              <span>${escapeHtmlCore((segment.order || '').toString().padStart(2, '0'))}</span>
              <p>${escapeHtmlCore((segment.text || '').toString())}</p>
            </li>
          `).join('') || '<li><p>Sin segmentos todavía.</p></li>'}
        </ol>
      </aside>
    </section>
  `;
}
