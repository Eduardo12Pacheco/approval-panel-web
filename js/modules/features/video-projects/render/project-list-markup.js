import { escapeHtmlCore } from '../../../core/ui/escape-html.js';
import { formatCount, formatDateLabel } from '../domain/formatters.js';
import {
  resolveCandidateImageUrl,
  resolveStoragePublicUrl,
} from '../domain/image-candidates.js';
import { resolveVideoProjectKey, resolveVideoProjectTitle } from '../domain/project-identity.js';
import { getProjectPhaseLabel } from '../domain/status-labels.js';

function resolveProjectThumbnailUrl(project = {}) {
  const firstImageUrl = (project.first_image_url || '').toString().trim();
  if (firstImageUrl) return firstImageUrl;

  const firstImage = project.first_image || project.first_image_candidate || project.firstImage || null;
  if (firstImage) return resolveCandidateImageUrl(firstImage);

  const candidates = Array.isArray(project.image_candidates) ? project.image_candidates : [];
  const cachedCandidate = candidates.find((candidate) => resolveStoragePublicUrl(candidate));
  return cachedCandidate ? resolveStoragePublicUrl(cachedCandidate) : resolveCandidateImageUrl(candidates[0] || {});
}

export function buildProjectCard(project = {}) {
  const id = resolveVideoProjectKey(project);
  const encodedId = encodeURIComponent(id);
  const title = escapeHtmlCore(resolveVideoProjectTitle(project));
  const player = escapeHtmlCore((project.jugador || 'Sin jugador').toString());
  const country = escapeHtmlCore((project.seleccion || 'Sin selección').toString());
  const imageUrl = resolveProjectThumbnailUrl(project);
  const phase = escapeHtmlCore(getProjectPhaseLabel(project));
  const statusName = escapeHtmlCore((project.status || 'unknown').toString());
  const createdAt = project.published_at || project.created_at || project.updated_at;

  return `
    <article class="video-project-card" data-project-id="${encodedId}">
      <header class="video-project-card__header">
        <div>
          <h3>${title}</h3>
        </div>
        <div class="video-project-card__actions">
          <button class="video-project-card__delete" type="button" data-action="delete-video-project" data-project-id="${encodedId}" aria-label="Eliminar proyecto ${title}"><span aria-hidden="true">✕</span></button>
        </div>
      </header>

      <div class="video-project-card__body">
        <div class="video-project-card__thumb">
          ${imageUrl
            ? `<img src="${escapeHtmlCore(imageUrl)}" alt="" width="86" height="68" loading="lazy" decoding="async" referrerpolicy="no-referrer" />`
            : '<span aria-hidden="true">VP</span>'}
        </div>
        <div class="video-project-card__copy">
          <div class="video-project-card__meta">
            <span>Jugador: <strong>${player}</strong></span>
            <span>País: <strong>${country}</strong></span>
            <span>${formatCount(project.image_count, 'imagen', 'imágenes')}</span>
            <span>${formatDateLabel(createdAt)}</span>
            <span class="video-project-status video-project-card__phase" data-status="${statusName}">${phase}</span>
          </div>
        </div>
      </div>

      <button class="video-project-card__open" type="button" data-action="open-video-project" data-project-id="${encodedId}">
        Abrir proyecto
      </button>
    </article>
  `;
}

export function buildFutureProjectCard() {
  return `
    <article class="video-project-card video-project-card--placeholder" aria-label="Próximo proyecto">
      <h3>Nuevo proyecto aparecerá acá</h3>
      <p>Cuando proceses otro guion, se crea automáticamente un proyecto con ese mismo título.</p>
      <span class="video-project-card__plus" aria-hidden="true">＋</span>
    </article>
  `;
}
