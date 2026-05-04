import { escapeHtmlCore } from '../../core/ui/escape-html.js';
import { resolveVideoProjectKey, resolveVideoProjectTitle } from './index.js';

const BLOCKED_IMAGE_DOMAIN_PARTS = ['tiktok.com', 'tiktokcdn.com', 'tiktokv.com'];
const VIDEO_CANDIDATES_TEMP_BUCKET = 'video-candidates-temp';
const VIDEO_CANDIDATES_TEMP_PUBLIC_BASE = 'https://ulzcthcdakjfretjdakd.supabase.co/storage/v1/object/public/video-candidates-temp';

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

function isBlockedImageCandidate(candidate = {}) {
  const haystack = [
    candidate.domain,
    candidate.source,
    candidate.link,
    candidate.google_url,
    candidate.image_url,
    candidate.thumbnail_url,
  ]
    .map((part) => (part || '').toString().toLowerCase())
    .join(' ');

  return BLOCKED_IMAGE_DOMAIN_PARTS.some((blocked) => haystack.includes(blocked));
}

function toPositiveNumber(value) {
  const next = Number(value);
  return Number.isFinite(next) && next > 0 ? next : 0;
}

function parseGoogleImageDimensions(candidate = {}) {
  const googleUrl = (candidate.google_url || candidate.googleUrl || '').toString();
  if (!googleUrl) return null;

  try {
    const url = new URL(googleUrl);
    const width = toPositiveNumber(url.searchParams.get('w'));
    const height = toPositiveNumber(url.searchParams.get('h'));
    if (width && height) return { width, height, source: 'google_url' };
  } catch {}

  return null;
}

function resolveCandidateDimensionInfo(candidate = {}) {
  const imageWidth = toPositiveNumber(candidate.image_width || candidate.imageWidth || candidate.width);
  const imageHeight = toPositiveNumber(candidate.image_height || candidate.imageHeight || candidate.height);
  if (imageWidth && imageHeight) return { width: imageWidth, height: imageHeight, source: 'image' };

  const googleDimensions = parseGoogleImageDimensions(candidate);
  if (googleDimensions) return googleDimensions;

  const thumbnailWidth = toPositiveNumber(candidate.thumbnail_width || candidate.thumbnailWidth);
  const thumbnailHeight = toPositiveNumber(candidate.thumbnail_height || candidate.thumbnailHeight);
  if (thumbnailWidth && thumbnailHeight) return { width: thumbnailWidth, height: thumbnailHeight, source: 'thumbnail' };

  return null;
}

function resolveCandidateDimensions(candidate = {}) {
  const dimensions = resolveCandidateDimensionInfo(candidate);
  if (!dimensions) return '';
  return `${Math.round(dimensions.width)} × ${Math.round(dimensions.height)} px`;
}

function resolveStoragePublicUrl(candidate = {}) {
  const directUrl = (
    candidate.storage_public_url
    || candidate.public_url
    || candidate.storage_url
    || candidate.cached_url
    || ''
  ).toString().trim();
  if (directUrl) return directUrl;

  const bucket = (candidate.storage_bucket || candidate.bucket || VIDEO_CANDIDATES_TEMP_BUCKET).toString().trim();
  const path = (candidate.storage_path || candidate.path || '').toString().trim().replace(/^\/+/, '');
  if (bucket === VIDEO_CANDIDATES_TEMP_BUCKET && path) {
    return `${VIDEO_CANDIDATES_TEMP_PUBLIC_BASE}/${path.split('/').map(encodeURIComponent).join('/')}`;
  }

  return '';
}

function resolveLegacyCandidateUrl(candidate = {}) {
  return (
    candidate.image_url
    || candidate.imageUrl
    || candidate.thumbnail_url
    || candidate.thumbnailUrl
    || ''
  ).toString().trim();
}

function resolveCandidateImageUrl(candidate = {}) {
  return resolveStoragePublicUrl(candidate) || resolveLegacyCandidateUrl(candidate);
}

function resolveProjectThumbnailUrl(project = {}) {
  const firstImageUrl = (project.first_image_url || '').toString().trim();
  if (firstImageUrl) return firstImageUrl;

  const firstImage = project.first_image || project.first_image_candidate || project.firstImage || null;
  if (firstImage) return resolveCandidateImageUrl(firstImage);

  const candidates = Array.isArray(project.image_candidates) ? project.image_candidates : [];
  const cachedCandidate = candidates.find((candidate) => resolveStoragePublicUrl(candidate));
  return cachedCandidate ? resolveStoragePublicUrl(cachedCandidate) : resolveCandidateImageUrl(candidates[0] || {});
}

function getCandidateQualityScore(candidate = {}) {
  const dimensions = resolveCandidateDimensionInfo(candidate);
  if (!dimensions) return 0;

  const area = dimensions.width * dimensions.height;
  const longestSide = Math.max(dimensions.width, dimensions.height);
  const sourceWeight = dimensions.source === 'thumbnail' ? 0.12 : 1;
  return (area + longestSide) * sourceWeight;
}

function getImageNaturalQualityScore(img) {
  const width = toPositiveNumber(img?.naturalWidth);
  const height = toPositiveNumber(img?.naturalHeight);
  if (!width || !height) return 0;

  return width * height + Math.max(width, height);
}

function scheduleImageGridQualitySort(grid) {
  if (!grid || grid.dataset.qualitySortScheduled === 'true') return;

  grid.dataset.qualitySortScheduled = 'true';

  const sort = () => {
    grid.dataset.qualitySortScheduled = 'false';

    [...grid.querySelectorAll('.video-image-card')]
      .sort((a, b) => {
        const scoreDiff = Number(b.dataset.qualityScore || 0) - Number(a.dataset.qualityScore || 0);
        if (scoreDiff !== 0) return scoreDiff;

        return Number(a.dataset.originalIndex || 0) - Number(b.dataset.originalIndex || 0);
      })
      .forEach((card) => grid.appendChild(card));
  };

  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(sort);
    return;
  }

  setTimeout(sort, 0);
}

function orderCandidatesByQuality(candidates = []) {
  return [...candidates]
    .map((candidate, index) => ({
      candidate,
      index,
      score: getCandidateQualityScore(candidate),
      position: Number(candidate.position || candidate.order || index + 1),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.position !== b.position) return a.position - b.position;
      return a.index - b.index;
    })
    .map(({ candidate }) => candidate);
}

function buildProjectCard(project = {}) {
  const id = resolveVideoProjectKey(project);
  const encodedId = encodeURIComponent(id);
  const title = escapeHtmlCore(resolveVideoProjectTitle(project));
  const player = escapeHtmlCore((project.jugador || 'Sin jugador').toString());
  const country = escapeHtmlCore((project.seleccion || 'Sin selección').toString());
  const imageUrl = resolveProjectThumbnailUrl(project);
  const status = escapeHtmlCore(getStatusLabel(project.status));
  const statusName = escapeHtmlCore((project.status || 'unknown').toString());
  const createdAt = project.published_at || project.created_at || project.updated_at;

  return `
    <article class="video-project-card" data-project-id="${encodedId}">
      <header class="video-project-card__header">
        <div>
          <h3>${title}</h3>
        </div>
        <span class="video-project-status" data-status="${statusName}">${status}</span>
      </header>

      <div class="video-project-card__body">
        <div class="video-project-card__thumb">
          ${imageUrl
            ? `<img src="${escapeHtmlCore(imageUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer" />`
            : '<span aria-hidden="true">VP</span>'}
        </div>
        <div class="video-project-card__copy">
          <div class="video-project-card__meta">
            <span>Jugador: <strong>${player}</strong></span>
            <span>País: <strong>${country}</strong></span>
            <span>${formatCount(project.image_count, 'imagen', 'imágenes')}</span>
            <span>${formatDateLabel(createdAt)}</span>
          </div>
        </div>
      </div>

      <button class="video-project-card__open" type="button" data-action="open-video-project" data-project-id="${encodedId}">
        Abrir proyecto
      </button>
    </article>
  `;
}

function buildFutureProjectCard() {
  return `
    <article class="video-project-card video-project-card--placeholder" aria-label="Próximo proyecto">
      <h3>Nuevo proyecto aparecerá acá</h3>
      <p>Cuando proceses otro guion, se crea automáticamente un proyecto con ese mismo título.</p>
      <span class="video-project-card__plus" aria-hidden="true">＋</span>
    </article>
  `;
}

function buildCandidateCard(candidate = {}, index = 0, selectedImageUrls = []) {
  const imageUrl = resolveCandidateImageUrl(candidate);
  const fullImageUrl = imageUrl;
  const directImageLink = (imageUrl || candidate.original_url || candidate.link || '').toString();
  const order = Number(candidate.order || candidate.position || 0);
  const title = escapeHtmlCore((candidate.title || `Imagen ${order || ''}`).toString());
  const safeHref = escapeHtmlCore(directImageLink || fullImageUrl || '#');
  const sizeLabel = escapeHtmlCore(resolveCandidateDimensions(candidate) || 'Calculando…');
  const qualityScore = getCandidateQualityScore(candidate);
  const candidateId = escapeHtmlCore(imageUrl || '');
  const isSelected = candidateId && Array.isArray(selectedImageUrls) && selectedImageUrls.includes(imageUrl);

  return `
    <article class="video-image-card" data-quality-score="${qualityScore}" data-original-index="${index}" data-candidate-id="${candidateId}" data-selected="${isSelected}">
      <button class="video-image-card__checkbox" type="button" aria-label="${isSelected ? 'Deseleccionar' : 'Seleccionar'} ${title}" data-action="toggle-image-selection">&nbsp;</button>
      <a class="video-image-card__media" href="${safeHref}" target="_blank" rel="noopener noreferrer" aria-label="Abrir imagen directa ${order || ''}: ${title}">
        ${imageUrl
          ? `<img src="${escapeHtmlCore(imageUrl)}" alt="${title}" loading="lazy" decoding="async" referrerpolicy="no-referrer" />`
          : '<span>Sin preview</span>'}
        <span class="video-image-card__size" data-image-size>${sizeLabel}</span>
      </a>
    </article>
  `;
}

function buildSelectedImagesSummary(selectedCount = 0) {
  return `
    <div class="video-project-next-panel">
      <div>
        <span class="video-projects-eyebrow">Selección</span>
        <strong>${formatCount(selectedCount, 'imagen', 'imágenes')} seleccionada${selectedCount === 1 ? '' : 's'}</strong>
        <p>Cuando estés conforme, avanzá para cargar voz y música de fondo.</p>
      </div>
      <button class="video-project-primary-action" type="button" data-action="video-project-next-audio" ${selectedCount ? '' : 'disabled'}>
        Siguiente: audios →
      </button>
    </div>
  `;
}

function buildAudioAssetCard({ kind, label, help, audio = {}, uploading = false }) {
  const hasAudio = Boolean(audio?.public_url || audio?.path);
  const fileName = escapeHtmlCore((audio?.name || 'Sin archivo seleccionado').toString());
  const publicUrl = escapeHtmlCore((audio?.public_url || '').toString());
  const sizeMb = Number(audio?.size || 0) > 0 ? `${(Number(audio.size) / 1024 / 1024).toFixed(1)} MB` : '';

  return `
    <article class="video-audio-card" data-audio-kind="${escapeHtmlCore(kind)}">
      <div class="video-audio-card__copy">
        <span class="video-projects-eyebrow">${escapeHtmlCore(label)}</span>
        <strong>${fileName}</strong>
        <p>${escapeHtmlCore(help)}</p>
        ${hasAudio ? `<small>Subido${sizeMb ? ` · ${escapeHtmlCore(sizeMb)}` : ''}</small>` : '<small>Pendiente</small>'}
      </div>
      ${hasAudio && publicUrl ? `<audio controls src="${publicUrl}"></audio>` : ''}
      <label class="video-audio-card__upload">
        <input type="file" accept="audio/*" data-action="upload-project-audio" data-audio-kind="${escapeHtmlCore(kind)}" ${uploading ? 'disabled' : ''} />
        <span>${uploading ? 'Subiendo…' : hasAudio ? 'Reemplazar archivo' : 'Subir archivo'}</span>
      </label>
    </article>
  `;
}

function hydrateImageSizeBadges(root) {
  root?.querySelectorAll?.('.video-image-card__media img')?.forEach((img) => {
    const card = img.closest('.video-image-card');
    const grid = img.closest('.video-image-grid');
    const badge = card?.querySelector('[data-image-size]');
    if (!badge) return;

    const setSize = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        badge.textContent = `${img.naturalWidth} × ${img.naturalHeight} px`;
        const score = getImageNaturalQualityScore(img);
        if (score > 0 && card) {
          card.dataset.qualityScore = score.toString();
          scheduleImageGridQualitySort(grid);
        }
        return;
      }
      badge.textContent = 'Sin tamaño';
    };

    img.addEventListener('load', setSize);
    img.addEventListener('error', () => {
      const fallback = img.dataset.fallbackSrc || '';
      if (fallback && img.dataset.fallbackUsed !== 'true') {
        img.dataset.fallbackUsed = 'true';
        img.src = fallback;
        return;
      }
      if (card) {
        card.dataset.qualityScore = '0';
        scheduleImageGridQualitySort(grid);
      }
      badge.textContent = 'Sin preview';
    });

    if (img.complete) setSize();
  });
}

export function renderVideoProjectsListView({ state, el, openVideoProject }) {
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
    el.videoProjectsList.innerHTML = '<p class="video-projects-empty">Todavía no hay proyectos. Procesá un guion y acá va a aparecer automáticamente.</p>';
    return;
  }

  el.videoProjectsList.innerHTML = [
    ...projects.map((project) => buildProjectCard(project)),
    buildFutureProjectCard(),
  ].join('');

  el.videoProjectsList.querySelectorAll('.video-project-card[data-project-id]').forEach((card) => {
    const open = async () => {
      await openVideoProject(decodeURIComponent(card.dataset.projectId || ''));
    };
    card.addEventListener('click', async (ev) => {
      if (ev.target.closest('a')) return;
      await open();
    });
    card.querySelector('[data-action="open-video-project"]')?.addEventListener('keydown', async (ev) => {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      ev.preventDefault();
      await open();
    });
  });
}

export function renderSelectedVideoProjectView({
  state,
  el,
  closeVideoProject,
  toggleImageSelection,
  goToAudioStep,
  goToImagesStep,
  uploadProjectAudio,
}) {
  if (!el.videoProjectDetail) return;

  const videoProjectsHero = el.viewScripts?.querySelector('.video-projects-hero');
  const project = state.selectedVideoProject;
  if (!project) {
    videoProjectsHero?.classList.remove('hidden');
    el.videoProjectsCatalog?.classList.remove('hidden');
    el.videoProjectDetail.classList.add('hidden');
    el.videoProjectDetail.innerHTML = '';
    return;
  }

  videoProjectsHero?.classList.add('hidden');
  el.videoProjectsCatalog?.classList.add('hidden');
  el.videoProjectDetail.classList.remove('hidden');

  const title = escapeHtmlCore(resolveVideoProjectTitle(project));
  const player = escapeHtmlCore((project.jugador || 'Sin jugador').toString());
  const country = escapeHtmlCore((project.seleccion || 'Sin selección').toString());
  const status = escapeHtmlCore(getStatusLabel(project.status));
  const query = escapeHtmlCore((project.search_query || project.image_search_meta?.query || 'Sin query registrada').toString());
  const fetchedAt = project.image_fetched_at || project.image_search_meta?.fetched_at || project.updated_at;
  const allCandidates = Array.isArray(project.image_candidates) ? project.image_candidates : [];
  const candidates = orderCandidatesByQuality(allCandidates.filter((candidate) => !isBlockedImageCandidate(candidate)));
  const selectedImageUrls = Array.isArray(project.selected_images) ? project.selected_images : [];
  const segments = Array.isArray(project.segments) ? project.segments : [];
  const loading = Boolean(state.videoProjectDetailLoading);
  const currentStep = project._videoProjectStep === 'audio' ? 'audio' : 'images';
  const voiceAudio = project.voice_audio && typeof project.voice_audio === 'object' ? project.voice_audio : {};
  const backgroundAudio = project.background_audio && typeof project.background_audio === 'object' ? project.background_audio : {};
  const voiceUploading = Boolean(project._voiceAudioUploading);
  const backgroundUploading = Boolean(project._backgroundAudioUploading);
  const canPreparePreview = Boolean(selectedImageUrls.length && voiceAudio.public_url && backgroundAudio.public_url);

  el.videoProjectDetail.innerHTML = `
    <header class="video-project-detail__header">
      <div>
        <button class="video-project-detail__back" type="button" data-action="back-to-video-projects">← Proyectos</button>
        <p class="video-projects-eyebrow">Proyecto · ${country} · ${player}</p>
        <h2>${title}</h2>
      </div>
      <span class="video-project-status video-project-status--large" data-status="${escapeHtmlCore((project.status || '').toString())}">${status}</span>
    </header>

    <ol class="video-phase-rail" aria-label="Fases del proyecto">
      <li class="${currentStep === 'images' ? 'is-active' : ''}"><span>01</span>Imágenes</li>
      <li class="${currentStep === 'audio' ? 'is-active' : ''}"><span>02</span>Audios</li>
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
        ${currentStep === 'images' ? `
        <div class="video-project-section-heading">
          <div>
            <span class="video-projects-eyebrow">Fase 1</span>
            <h3>Imágenes encontradas en Google</h3>
          </div>
          <p>${formatCount(candidates.length || project.image_count, 'candidato')}</p>
        </div>
        ${candidates.length
          ? `<div class="video-image-grid">${candidates.map((candidate, index) => buildCandidateCard(candidate, index, selectedImageUrls)).join('')}</div>`
          : '<p class="video-projects-empty">Todavía no hay candidatos guardados para este proyecto. Si el estado dice Error Serper, revisá la ejecución del workflow.</p>'}
        ${buildSelectedImagesSummary(selectedImageUrls.length)}
        ` : `
        <div class="video-project-section-heading">
          <div>
            <span class="video-projects-eyebrow">Fase 2</span>
            <h3>Audio de voz y música de fondo</h3>
          </div>
          <button class="video-project-secondary-action" type="button" data-action="video-project-back-images">← Volver a imágenes</button>
        </div>
        <div class="video-audio-grid">
          ${buildAudioAssetCard({
            kind: 'voice',
            label: 'Audio de voz',
            help: 'Subí la voz final que se va a sincronizar con los segmentos del guion.',
            audio: voiceAudio,
            uploading: voiceUploading,
          })}
          ${buildAudioAssetCard({
            kind: 'background',
            label: 'Música de fondo',
            help: 'Subí la pista de fondo. Después vamos a controlar volumen y mezcla en la preview.',
            audio: backgroundAudio,
            uploading: backgroundUploading,
          })}
        </div>
        ${project._audioUploadError ? `<p class="video-projects-empty video-projects-empty--error">${escapeHtmlCore(project._audioUploadError)}</p>` : ''}
        <div class="video-project-next-panel">
          <div>
            <span class="video-projects-eyebrow">Siguiente paso</span>
            <strong>${canPreparePreview ? 'Listo para preparar preview' : 'Faltan archivos para continuar'}</strong>
            <p>Necesitamos imágenes seleccionadas, voz y música antes de pasar a edición/preview.</p>
          </div>
          <button class="video-project-primary-action" type="button" data-action="video-project-prepare-preview" ${canPreparePreview ? '' : 'disabled'}>
            Preparar preview →
          </button>
        </div>
        `}
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

  el.videoProjectDetail
    .querySelector('[data-action="back-to-video-projects"]')
    ?.addEventListener('click', closeVideoProject);
  hydrateImageSizeBadges(el.videoProjectDetail);

  el.videoProjectDetail
    .querySelector('[data-action="video-project-next-audio"]')
    ?.addEventListener('click', () => goToAudioStep?.());

  el.videoProjectDetail
    .querySelector('[data-action="video-project-back-images"]')
    ?.addEventListener('click', () => goToImagesStep?.());

  el.videoProjectDetail
    .querySelector('[data-action="video-project-prepare-preview"]')
    ?.addEventListener('click', () => {
      // Placeholder for the RemotionEditor bridge. Keeping it explicit prevents a fake integration.
      window.alert('Preview todavía no está conectado. Próximo paso: puente con RemotionEditor.');
    });

  if (typeof uploadProjectAudio === 'function') {
    el.videoProjectDetail.querySelectorAll('[data-action="upload-project-audio"]').forEach((input) => {
      input.addEventListener('change', async () => {
        const [file] = input.files || [];
        const kind = input.dataset.audioKind;
        if (!file || !kind) return;
        await uploadProjectAudio(kind, file);
      });
    });
  }

  if (typeof toggleImageSelection === 'function') {
    el.videoProjectDetail.querySelectorAll('.video-image-card__checkbox').forEach((checkbox) => {
      checkbox.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const card = checkbox.closest('.video-image-card');
        const candidateId = card?.dataset.candidateId;
        if (candidateId) toggleImageSelection(candidateId);
      });
    });
  }
}
