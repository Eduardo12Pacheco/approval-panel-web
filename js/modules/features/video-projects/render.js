import { escapeHtmlCore } from '../../core/ui/escape-html.js';
import { resolveVideoProjectKey, resolveVideoProjectTitle } from './index.js';

const BLOCKED_IMAGE_DOMAIN_PARTS = ['tiktok.com', 'tiktokcdn.com', 'tiktokv.com', 'facebook.com', 'fbcdn.net', 'instagram.com', 'cdninstagram.com'];
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

function formatSeconds(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return '0.00s';
  return `${n.toFixed(2)}s`;
}

function getStatusLabel(status = '') {
  const normalized = status.toString().trim().toLowerCase();
  if (normalized === 'ready') return 'Listo';
  if (normalized === 'image_search_error') return 'Error Serper';
  if (normalized === 'no_candidates') return 'Sin imágenes';
  if (normalized === 'pending') return 'Procesando';
  return status || 'Sin estado';
}

function getPhaseLabel(phase = '') {
  const map = {
    idle: 'Pendiente',
    preparing: 'Preparando…',
    preview_rendering: 'Renderizando preview…',
    preview_ready: 'Preview lista',
    editing_dirty: 'Edición (cambios sin preview)',
    final_rendering: 'Exportando…',
    final_ready: 'Exportación lista',
    error: 'Error',
  };
  return map[phase] || phase;
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

function resolveCandidateFallbackUrl(candidate = {}, primaryUrl = '') {
  const legacyUrl = resolveLegacyCandidateUrl(candidate);
  if (!legacyUrl || legacyUrl === primaryUrl) return '';
  return legacyUrl;
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
  const fallbackUrl = resolveCandidateFallbackUrl(candidate, imageUrl);
  const order = Number(candidate.order || candidate.position || 0);
  const title = escapeHtmlCore((candidate.title || `Imagen ${order || ''}`).toString());
  const sizeLabel = escapeHtmlCore(resolveCandidateDimensions(candidate) || 'Calculando…');
  const qualityScore = getCandidateQualityScore(candidate);
  const candidateId = escapeHtmlCore(imageUrl || '');
  const isSelected = candidateId && Array.isArray(selectedImageUrls) && selectedImageUrls.includes(imageUrl);
  const provider = escapeHtmlCore((candidate.provider || candidate.source || 'unknown').toString());

  return `
    <article class="video-image-card" data-quality-score="${qualityScore}" data-original-index="${index}" data-candidate-id="${candidateId}" data-candidate-provider="${provider}" data-selected="${isSelected}" role="button" tabindex="0" aria-pressed="${isSelected}" aria-label="${isSelected ? 'Deseleccionar' : 'Seleccionar'} imagen ${order || ''}: ${title}">
      <span class="video-image-card__checkbox" aria-hidden="true"></span>
      <div class="video-image-card__media" aria-hidden="true">
        ${imageUrl
          ? `<img src="${escapeHtmlCore(imageUrl)}" ${fallbackUrl ? `data-fallback-src="${escapeHtmlCore(fallbackUrl)}"` : ''} alt="${title}" loading="lazy" decoding="async" referrerpolicy="no-referrer" />`
          : '<span>Sin preview</span>'}
        <span class="video-image-card__size" data-image-size>${sizeLabel}</span>
      </div>
    </article>
  `;
}

function buildSelectedImagesSummary(selectedCount = 0, segmentCount = 0) {
  const requiredCount = Math.max(Number(segmentCount || 0), 1);
  const missingCount = Math.max(requiredCount - Number(selectedCount || 0), 0);
  const canContinue = missingCount === 0;

  return `
    <div class="video-project-next-panel">
      <div>
        <span class="video-projects-eyebrow">Selección</span>
        <strong>${formatCount(selectedCount, 'imagen', 'imágenes')} seleccionada${selectedCount === 1 ? '' : 's'} · ${requiredCount} requerida${requiredCount === 1 ? '' : 's'}</strong>
        <p>${canContinue
          ? 'Ya tenés imágenes suficientes para cubrir todos los segmentos pipeados.'
          : `Falta${missingCount === 1 ? '' : 'n'} ${formatCount(missingCount, 'imagen', 'imágenes')} para avanzar sin huecos.`}</p>
      </div>
      <button class="video-project-primary-action" type="button" data-action="video-project-next-audio" ${canContinue ? '' : 'disabled'}>
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

function hydrateImageSizeBadges(root, { onBrokenCandidate } = {}) {
  root?.querySelectorAll?.('.video-image-card__media img')?.forEach((img) => {
    const card = img.closest('.video-image-card');
    const grid = img.closest('.video-image-grid');
    const badge = card?.querySelector('[data-image-size]');
    if (!badge) return;

    const removeBrokenCard = () => {
      const candidateId = card?.dataset.candidateId || '';
      const wasSelected = card?.dataset.selected === 'true';

      if (card) {
        card.dataset.qualityScore = '0';
        card.dataset.broken = 'true';
        card.remove();
      }

      if (grid) scheduleImageGridQualitySort(grid);

      const provider = (card?.dataset?.candidateProvider || '').toLowerCase();
      const isCustom = provider === 'user-upload';
      if (!isCustom && wasSelected && candidateId && typeof onBrokenCandidate === 'function') {
        setTimeout(() => onBrokenCandidate(candidateId), 0);
      }
    };

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

    const handleImageError = () => {
      const fallback = img.dataset.fallbackSrc || '';
      if (fallback && img.dataset.fallbackUsed !== 'true') {
        img.dataset.fallbackUsed = 'true';
        img.src = fallback;
        return;
      }

      removeBrokenCard();
    };

    img.addEventListener('load', setSize);
    img.addEventListener('error', handleImageError);

    if (img.complete) {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        setSize();
      } else {
        handleImageError();
      }
    }
  });
}

/* ---- Editor phase helpers ---- */

function buildPhaseBadge(phase, dirty) {
  const label = getPhaseLabel(phase);
  const dirtyBadge = dirty ? '<span class="video-project-dirty-badge" title="Cambios sin preview">●</span>' : '';
  return `<span class="video-project-phase-badge" data-phase="${escapeHtmlCore(phase)}">${escapeHtmlCore(label)}${dirtyBadge}</span>`;
}

function buildPreviewMonitor({ previewUrl, remotionProjectId }) {
  if (!previewUrl) {
    return `
      <div class="video-preview-monitor video-preview-monitor--empty">
        <p>Todavía no hay preview. Prepará o actualizá la preview para ver el video.</p>
      </div>
    `;
  }
  return `
    <div class="video-preview-monitor">
      <video controls preload="metadata" src="${escapeHtmlCore(previewUrl)}"></video>
    </div>
  `;
}

function buildEditorRowsTable(rows = [], { selectedRowId, onRowSelect, onImageReplace, onUploadAssign, rowImageUploading } = {}) {
  if (!rows.length) {
    return '<p class="video-projects-empty">Sin filas cronometradas todavía.</p>';
  }

  return `
    <table class="video-editor-table">
      <thead>
        <tr>
          <th>Tiempo</th>
          <th>Frase</th>
          <th>Imagen</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((row, index) => {
          const isSelected = selectedRowId === row.id;
          const selectedClass = isSelected ? 'is-selected' : '';
          const uploadingThisRow = rowImageUploading === row.id;
          return `
            <tr class="video-editor-row ${selectedClass}" data-row-id="${escapeHtmlCore(row.id)}" data-index="${index}">
              <td class="video-editor-row__time">${escapeHtmlCore(`${formatSeconds(row.startTime)} - ${formatSeconds(row.endTime)}`)}</td>
              <td class="video-editor-row__phrase">${escapeHtmlCore((row.phrase || '').toString())}</td>
              <td class="video-editor-row__image">
                ${row.selectedAssetId
                  ? `<span class="video-editor-row__image-tag">${escapeHtmlCore((row.selectedAssetId || '').toString().slice(0, 24))}</span>`
                  : '<span class="video-editor-row__image-tag video-editor-row__image-tag--missing">Sin imagen</span>'}
              </td>
              <td class="video-editor-row__actions">
                <button class="secondary" type="button" data-action="select-row" data-row-id="${escapeHtmlCore(row.id)}">${isSelected ? 'Seleccionada' : 'Editar'}</button>
                <label class="video-editor-row__upload-label">
                  <input type="file" accept="image/jpeg,image/png,image/webp" data-action="upload-row-image" data-row-id="${escapeHtmlCore(row.id)}" ${uploadingThisRow ? 'disabled' : ''} />
                  <span>${uploadingThisRow ? 'Subiendo…' : 'Subir imagen'}</span>
                </label>
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

function buildEditorDetailRail({ row, globalAudio, onRowUpdate, onGlobalAudioUpdate }) {
  const voice = globalAudio?.voice || { volume: 1, muted: false };
  const music = globalAudio?.music || { volume: 0.15, muted: false };

  const rowControls = row
    ? `
      <div class="video-editor-detail__section">
        <span class="video-projects-eyebrow">Fila seleccionada</span>
        <strong>${escapeHtmlCore((row.phrase || 'Fila').toString().slice(0, 40))}</strong>
        <div class="video-editor-control">
          <label>Movimiento</label>
          <select data-action="update-row-motion" data-row-id="${escapeHtmlCore(row.id)}">
            <option value="slow-zoom-in" ${row.motion === 'slow-zoom-in' ? 'selected' : ''}>Slow zoom in</option>
            <option value="slow-zoom-out" ${row.motion === 'slow-zoom-out' ? 'selected' : ''}>Slow zoom out</option>
            <option value="pan-left" ${row.motion === 'pan-left' ? 'selected' : ''}>Pan left</option>
            <option value="pan-right" ${row.motion === 'pan-right' ? 'selected' : ''}>Pan right</option>
            <option value="none" ${row.motion === 'none' ? 'selected' : ''}>Ninguno</option>
          </select>
        </div>
        <div class="video-editor-control">
          <label>Polvo</label>
          <select data-action="update-row-dust" data-row-id="${escapeHtmlCore(row.id)}">
            <option value="true" ${row.dust?.enabled ? 'selected' : ''}>Activado</option>
            <option value="false" ${!row.dust?.enabled ? 'selected' : ''}>Desactivado</option>
          </select>
        </div>
        <div class="video-editor-control">
          <label>Transición</label>
          <select data-action="update-row-transition" data-row-id="${escapeHtmlCore(row.id)}">
            <option value="none" ${row.transition === 'none' ? 'selected' : ''}>Ninguna</option>
            <option value="fade" ${row.transition === 'fade' ? 'selected' : ''}>Fade</option>
            <option value="slide-left" ${row.transition === 'slide-left' ? 'selected' : ''}>Slide left</option>
            <option value="slide-right" ${row.transition === 'slide-right' ? 'selected' : ''}>Slide right</option>
          </select>
        </div>
      </div>
    `
    : `
      <div class="video-editor-detail__section">
        <span class="video-projects-eyebrow">Fila seleccionada</span>
        <p class="video-projects-empty">Seleccioná una fila para editar movimiento, polvo y transición.</p>
      </div>
    `;

  return `
    <div class="video-editor-detail">
      ${rowControls}
      <div class="video-editor-detail__section">
        <span class="video-projects-eyebrow">Audio global</span>
        <div class="video-editor-control">
          <label>Volumen voz · ${Math.round((voice.volume || 1) * 100)}%</label>
          <input type="range" min="0" max="1" step="0.05" data-action="update-global-audio" data-audio-kind="voice" data-field="volume" value="${voice.volume || 1}" />
          <label class="video-editor-check">
            <input type="checkbox" data-action="update-global-audio" data-audio-kind="voice" data-field="muted" ${voice.muted ? 'checked' : ''} />
            Mute voz
          </label>
        </div>
        <div class="video-editor-control">
          <label>Volumen música · ${Math.round((music.volume || 0.15) * 100)}%</label>
          <input type="range" min="0" max="1" step="0.05" data-action="update-global-audio" data-audio-kind="music" data-field="volume" value="${music.volume || 0.15}" />
          <label class="video-editor-check">
            <input type="checkbox" data-action="update-global-audio" data-audio-kind="music" data-field="muted" ${music.muted ? 'checked' : ''} />
            Mute música
          </label>
        </div>
      </div>
    </div>
  `;
}

function buildEditorStatusPanel({ editorState, onRefreshPreview, onExportFinal }) {
  const phase = editorState.phase || 'idle';
  const dirty = Boolean(editorState.dirty);
  const exportStatus = editorState.export_status || 'idle';
  const isRendering = phase === 'preview_rendering' || phase === 'final_rendering';
  const canRefresh = !isRendering && (phase === 'preview_ready' || phase === 'editing_dirty' || phase === 'error');
  const canExport = !isRendering && (phase === 'preview_ready' || phase === 'editing_dirty' || phase === 'final_ready' || phase === 'error');
  const exportDisabled = canExport && dirty;

  return `
    <div class="video-editor-status-panel">
      <div class="video-editor-status-panel__header">
        <span class="video-projects-eyebrow">Acciones</span>
        ${dirty ? '<span class="video-project-dirty-badge" title="Cambios sin preview">● Desactualizado</span>' : ''}
      </div>
      <div class="video-editor-actions">
        <button class="video-project-primary-action" type="button" data-action="refresh-preview" ${canRefresh ? '' : 'disabled'}>
          ${phase === 'preview_rendering' ? 'Renderizando preview…' : 'Actualizar preview'}
        </button>
        <button class="video-project-primary-action video-project-primary-action--export" type="button" data-action="export-final" ${canExport ? '' : 'disabled'} title="${exportDisabled ? 'Actualizá la preview antes de exportar' : 'Exportar video final 1080p'}">
          ${phase === 'final_rendering' ? 'Exportando…' : 'Exportar final'}
        </button>
      </div>
      ${editorState.error ? `<p class="video-projects-empty video-projects-empty--error">${escapeHtmlCore(editorState.error)}</p>` : ''}
      ${editorState.final_url && phase === 'final_ready' ? `<div class="video-editor-download"><a href="${escapeHtmlCore(editorState.final_url)}" target="_blank" rel="noopener noreferrer" download>Descargar video final</a></div>` : ''}
    </div>
  `;
}

function buildEditorShell(project, options = {}) {
  const {
    editorRows = [],
    selectedRowId = null,
    globalAudio = {},
    editorState = {},
    onRowSelect,
    onImageReplace,
    onUploadAssign,
    onRefreshPreview,
    onExportFinal,
    rowImageUploading,
  } = options;

  const selectedRow = editorRows.find((r) => r.id === selectedRowId) || null;

  return `
    <div class="video-project-section-heading">
      <div>
        <span class="video-projects-eyebrow">Fase 4</span>
        <h3>Edición · ${buildPhaseBadge(editorState.phase, editorState.dirty)}</h3>
      </div>
    </div>

    ${buildPreviewMonitor({ previewUrl: editorState.preview_url, remotionProjectId: editorState.remotion_project_id })}

    <section class="video-editor-workspace">
      <div class="video-editor-main">
        <div class="video-project-section-heading video-project-section-heading--compact">
          <div>
            <span class="video-projects-eyebrow">Filas cronometradas</span>
            <h4>${formatCount(editorRows.length, 'fila')}</h4>
          </div>
        </div>
        ${buildEditorRowsTable(editorRows, { selectedRowId, onRowSelect, onImageReplace, onUploadAssign, rowImageUploading })}
      </div>
      <aside class="video-editor-side">
        ${buildEditorDetailRail({ row: selectedRow, globalAudio })}
        ${buildEditorStatusPanel({ editorState, onRefreshPreview, onExportFinal })}
      </aside>
    </section>
  `;
}

function buildPreviewPreparingPanel(editorState) {
  const phase = editorState.phase || 'idle';
  const isRendering = phase === 'preparing' || phase === 'preview_rendering';
  const hasError = phase === 'error';

  return `
    <div class="video-project-section-heading">
      <div>
        <span class="video-projects-eyebrow">Fase 3</span>
        <h3>Preview ${buildPhaseBadge(phase, false)}</h3>
      </div>
    </div>
    <div class="video-preview-preparing">
      ${isRendering
        ? `<p>Preparando preview… Esto puede tardar unos minutos.</p><div class="video-preview-spinner" aria-hidden="true">⏳</div>`
        : hasError
          ? `<p class="video-projects-empty video-projects-empty--error">${escapeHtmlCore(editorState.error || 'Error preparando preview')}</p>`
          : `<p>Preview lista. Abrí la edición para ajustar filas y exportar.</p>`}
    </div>
  `;
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
  uploadCustomImages,
  preparePreview,
  refreshPreview,
  exportFinal,
  updateRow,
  uploadAndAssignImage,
  updateGlobalAudio,
  renderSelectedVideoProject,
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
  const googleCandidates = candidates.filter((candidate) => (candidate.provider || candidate.source || '').toString() !== 'user-upload');
  const customCandidates = candidates.filter((candidate) => (candidate.provider || candidate.source || '').toString() === 'user-upload');
  const selectedImageUrls = Array.isArray(project.selected_images) ? project.selected_images : [];
  const segments = Array.isArray(project.segments) ? project.segments : [];
  const requiredImageCount = Math.max(segments.length, 1);
  const hasEnoughSelectedImages = selectedImageUrls.length >= requiredImageCount;
  const loading = Boolean(state.videoProjectDetailLoading);
  const currentStep = project._videoProjectStep === 'audio' ? 'audio' : 'images';
  const voiceAudio = project.voice_audio && typeof project.voice_audio === 'object' ? project.voice_audio : {};
  const backgroundAudio = project.background_audio && typeof project.background_audio === 'object' ? project.background_audio : {};
  const voiceUploading = Boolean(project._voiceAudioUploading);
  const backgroundUploading = Boolean(project._backgroundAudioUploading);
  const canPreparePreview = Boolean(hasEnoughSelectedImages && voiceAudio.public_url && backgroundAudio.public_url);
  const editorState = project.editor_state && typeof project.editor_state === 'object' ? project.editor_state : {};
  const editorPhase = (editorState.phase || 'idle').toString();
  const timedRows = Array.isArray(editorState.timed_rows) ? editorState.timed_rows : [];
  const editorRows = Array.isArray(project._editorRows) ? project._editorRows : timedRows;
  const globalAudio = project._globalAudio || { voice: { volume: 1, muted: false }, music: { volume: 0.15, muted: false } };
  const inEditorPhase = ['preparing', 'preview_rendering', 'preview_ready', 'editing_dirty', 'final_rendering', 'final_ready', 'error'].includes(editorPhase);

  let mainContent = '';
  let sideContent = '';

  if (!inEditorPhase) {
    // Phases 01/02: images and audio setup
    mainContent = currentStep === 'images'
      ? `
        <div class="video-project-section-heading">
          <div>
            <span class="video-projects-eyebrow">Fase 1</span>
            <h3>Imágenes encontradas en Google</h3>
          </div>
          <p>${formatCount(googleCandidates.length || project.image_count, 'candidato')}</p>
        </div>
        ${googleCandidates.length
          ? `<div class="video-image-grid">${googleCandidates.map((candidate, index) => buildCandidateCard(candidate, index, selectedImageUrls)).join('')}</div>`
          : '<p class="video-projects-empty">Todavía no hay candidatos guardados para este proyecto. Si el estado dice Error Serper, revisá la ejecución del workflow.</p>'}

        <section class="video-project-custom-images" aria-label="Mis imágenes">
          <div class="video-project-custom-images__separator" aria-hidden="true"></div>
          <div class="video-project-section-heading video-project-section-heading--compact">
            <div>
              <span class="video-projects-eyebrow">Custom</span>
              <h3>Mis imágenes</h3>
            </div>
            <p>${formatCount(customCandidates.length, 'imagen', 'imágenes')}</p>
          </div>
          <p class="video-project-custom-images__help">Subí JPG/PNG/WebP (hasta 15MB c/u). Se guardan solo en este proyecto y se auto-seleccionan.</p>
          <label class="video-project-custom-images__upload">
            <input type="file" accept="image/jpeg,image/png,image/webp" data-action="upload-custom-images" multiple ${project._customImagesUploading ? 'disabled' : ''} />
            <span>${project._customImagesUploading ? 'Subiendo imágenes…' : 'Subir mis imágenes'}</span>
          </label>
          ${project._customImageUploadError ? `<p class="video-projects-empty video-projects-empty--error">${escapeHtmlCore(project._customImageUploadError)}</p>` : ''}
          ${customCandidates.length
            ? `<div class="video-image-grid video-image-grid--custom">${customCandidates.map((candidate, index) => buildCandidateCard(candidate, index, selectedImageUrls)).join('')}</div>`
            : '<p class="video-projects-empty">Todavía no subiste imágenes custom para este proyecto.</p>'}
        </section>

        ${buildSelectedImagesSummary(selectedImageUrls.length, segments.length)}
      `
      : `
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
            <p>Necesitamos cubrir ${requiredImageCount} segmento${requiredImageCount === 1 ? '' : 's'} con imágenes, voz y música antes de pasar a edición/preview.</p>
          </div>
          <button class="video-project-primary-action" type="button" data-action="video-project-prepare-preview" ${canPreparePreview ? '' : 'disabled'}>
            ${editorPhase === 'preparing' || editorPhase === 'preview_rendering' ? 'Preparando…' : 'Preparar preview →'}
          </button>
        </div>
        ${editorState.error ? `<p class="video-projects-empty video-projects-empty--error">${escapeHtmlCore(editorState.error)}</p>` : ''}
        ${timedRows.length ? `<section class="video-project-custom-images" aria-label="Filas con timing"><div class="video-project-section-heading video-project-section-heading--compact"><div><span class="video-projects-eyebrow">Contrato cronometrado</span><h3>Filas (${timedRows.length})</h3></div></div><ol class="video-segments-list">${timedRows.map((row) => `<li><span>${escapeHtmlCore(`${Number(row.startTime || 0).toFixed(2)}s - ${Number(row.endTime || 0).toFixed(2)}s`)}</span><p>${escapeHtmlCore((row.phrase || '').toString())}</p></li>`).join('')}</ol></section>` : ''}
      `;

    sideContent = `
      <div class="video-project-section-heading video-project-section-heading--compact">
        <div>
          <span class="video-projects-eyebrow">Guion pipeado</span>
          <h3>Segmentos${segments.length ? ` (${segments.length})` : ''}</h3>
        </div>
      </div>
      <ol class="video-segments-list">
        ${segments.map((segment) => `
          <li>
            <span>${escapeHtmlCore((segment.order || '').toString().padStart(2, '0'))}</span>
            <p>${escapeHtmlCore((segment.text || '').toString())}</p>
          </li>
        `).join('') || '<li><p>Sin segmentos todavía.</p></li>'}
      </ol>
    `;
  } else {
    // Editor phases 03/04/05
    if (editorPhase === 'preparing' || editorPhase === 'preview_rendering' || editorPhase === 'error') {
      mainContent = buildPreviewPreparingPanel(editorState);
    } else {
      mainContent = buildEditorShell(project, {
        editorRows,
        selectedRowId: project._selectedEditorRowId || null,
        globalAudio,
        editorState,
        rowImageUploading: project._rowImageUploading || null,
      });
    }

    sideContent = `
      <div class="video-project-section-heading video-project-section-heading--compact">
        <div>
          <span class="video-projects-eyebrow">Estado</span>
          <h3>${buildPhaseBadge(editorPhase, editorState.dirty)}</h3>
        </div>
      </div>
      <div class="video-editor-meta">
        <div><span>Proyecto Remotion</span><strong>${escapeHtmlCore((editorState.remotion_project_id || '—').toString())}</strong></div>
        <div><span>Filas</span><strong>${editorRows.length}</strong></div>
        <div><span>Preview</span><strong>${editorState.preview_url ? 'Lista' : 'Pendiente'}</strong></div>
        <div><span>Exportación</span><strong>${editorState.export_status === 'ready' ? 'Lista' : 'Pendiente'}</strong></div>
      </div>
      ${editorState.error ? `<p class="video-projects-empty video-projects-empty--error">${escapeHtmlCore(editorState.error)}</p>` : ''}
    `;
  }

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
      <li class="${!inEditorPhase && currentStep === 'images' ? 'is-active' : ''}"><span>01</span>Imágenes</li>
      <li class="${!inEditorPhase && currentStep === 'audio' ? 'is-active' : ''}"><span>02</span>Audios</li>
      <li class="${inEditorPhase ? 'is-active' : ''}"><span>03</span>Preview</li>
      <li class="${['preview_ready', 'editing_dirty', 'final_rendering', 'final_ready'].includes(editorPhase) ? 'is-active' : ''}"><span>04</span>Edición</li>
      <li class="${['final_rendering', 'final_ready'].includes(editorPhase) ? 'is-active' : ''}"><span>05</span>Exportación</li>
    </ol>

    <section class="video-project-detail__meta-grid">
      <div><span>Query Serper</span><strong>${query}</strong></div>
      <div><span>Ventana</span><strong>Última semana</strong></div>
      <div><span>Imágenes</span><strong>${candidates.length || Number(project.image_count || 0)}</strong></div>
      <div><span>Actualizado</span><strong>${escapeHtmlCore(formatDateLabel(fetchedAt))}</strong></div>
    </section>

    ${loading ? '<p class="video-projects-empty">Cargando fase 1…</p>' : ''}

    <section class="video-project-detail__workspace">
      <div class="video-project-detail__main">
        ${mainContent}
      </div>
      <aside class="video-project-detail__side">
        ${sideContent}
      </aside>
    </section>
  `;

  // Event hydration
  el.videoProjectDetail
    .querySelector('[data-action="back-to-video-projects"]')
    ?.addEventListener('click', closeVideoProject);

  if (!inEditorPhase) {
    hydrateImageSizeBadges(el.videoProjectDetail, {
      onBrokenCandidate: (candidateId) => toggleImageSelection?.(candidateId),
    });

    el.videoProjectDetail
      .querySelector('[data-action="video-project-next-audio"]')
      ?.addEventListener('click', () => goToAudioStep?.());

    el.videoProjectDetail
      .querySelector('[data-action="video-project-back-images"]')
      ?.addEventListener('click', () => goToImagesStep?.());

    el.videoProjectDetail
      .querySelector('[data-action="video-project-prepare-preview"]')
      ?.addEventListener('click', () => preparePreview?.());

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

    if (typeof uploadCustomImages === 'function') {
      el.videoProjectDetail.querySelector('[data-action="upload-custom-images"]')?.addEventListener('change', async (ev) => {
        const input = ev.currentTarget;
        const files = input?.files ? Array.from(input.files) : [];
        if (!files.length) return;
        await uploadCustomImages(files);
        input.value = '';
      });
    }

    if (typeof toggleImageSelection === 'function') {
      const toggleCard = (card) => {
        const candidateId = card?.dataset.candidateId;
        if (candidateId) toggleImageSelection(candidateId);
      };

      el.videoProjectDetail.querySelectorAll('.video-image-card[data-candidate-id]').forEach((card) => {
        card.addEventListener('click', (ev) => {
          ev.preventDefault();
          toggleCard(card);
        });

        card.addEventListener('keydown', (ev) => {
          if (ev.key !== 'Enter' && ev.key !== ' ') return;
          ev.preventDefault();
          toggleCard(card);
        });
      });
    }
  } else {
    // Editor phase event hydration
    if (editorPhase === 'preview_ready' || editorPhase === 'editing_dirty' || editorPhase === 'final_ready' || editorPhase === 'error') {
      // Row selection
      el.videoProjectDetail.querySelectorAll('[data-action="select-row"]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const rowId = btn.dataset.rowId;
          if (!rowId) return;
          project._selectedEditorRowId = rowId;
          renderSelectedVideoProject?.();
        });
      });

      // Row image upload
      el.videoProjectDetail.querySelectorAll('[data-action="upload-row-image"]').forEach((input) => {
        input.addEventListener('change', async () => {
          const [file] = input.files || [];
          const rowId = input.dataset.rowId;
          if (!file || !rowId) return;
          await uploadAndAssignImage?.(rowId, file);
          input.value = '';
        });
      });

      // Row motion update
      el.videoProjectDetail.querySelectorAll('[data-action="update-row-motion"]').forEach((select) => {
        select.addEventListener('change', () => {
          const rowId = select.dataset.rowId;
          if (!rowId) return;
          updateRow?.(rowId, { motion: select.value });
        });
      });

      // Row dust update
      el.videoProjectDetail.querySelectorAll('[data-action="update-row-dust"]').forEach((select) => {
        select.addEventListener('change', () => {
          const rowId = select.dataset.rowId;
          if (!rowId) return;
          updateRow?.(rowId, { dust: { enabled: select.value === 'true' } });
        });
      });

      // Row transition update
      el.videoProjectDetail.querySelectorAll('[data-action="update-row-transition"]').forEach((select) => {
        select.addEventListener('change', () => {
          const rowId = select.dataset.rowId;
          if (!rowId) return;
          updateRow?.(rowId, { transition: select.value });
        });
      });

      // Global audio updates
      el.videoProjectDetail.querySelectorAll('[data-action="update-global-audio"]').forEach((input) => {
        input.addEventListener('change', () => {
          const kind = input.dataset.audioKind;
          const field = input.dataset.field;
          if (!kind || !field) return;
          const patch = {};
          if (field === 'volume') patch.volume = Number(input.value);
          if (field === 'muted') patch.muted = input.checked;
          updateGlobalAudio?.(kind, patch);
        });
      });

      // Refresh preview
      el.videoProjectDetail.querySelector('[data-action="refresh-preview"]')?.addEventListener('click', () => {
        refreshPreview?.();
      });

      // Export final
      el.videoProjectDetail.querySelector('[data-action="export-final"]')?.addEventListener('click', () => {
        exportFinal?.();
      });
    }
  }
}
