import { escapeHtmlCore } from '../../../core/ui/escape-html.js';
import { DEFAULT_BACKGROUND_MUSIC_TRACKS } from '../audio/default-background-music.js';
import { CompositionRenderer, syncManagedVideoElement } from '../composition/composition-renderer.js';
import { formatCount, formatDateLabel, formatSeconds } from '../domain/formatters.js';
import { getPhaseLabel } from '../domain/status-labels.js';
import { findMotionPreset } from '../domain/motion-presets.js';
import { findProjectVideoAsset } from '../domain/video-assets.js';
import {
  getCandidateQualityScore,
  getImageNaturalQualityScore,
  resolveCandidateDimensions,
  resolveCandidateFallbackUrl,
  resolveCandidateImageUrl,
} from '../domain/image-candidates.js';
import {
  buildCompositionPreviewAssets,
  resolveVideoProjectCompositionContractForCheck,
  resolveVideoProjectPreviewMediaForCheck,
} from '../composition/composition-view-model.js';
import { resolveVideoSelectorOpenAction, resolveVideoSegmentSelectionWindow } from './editor-video-picker.js';
import { buildSelectedVideoProjectViewModel } from './view-model.js';
import { buildEditorShellViewModel } from './editor-view-model.js';
import {
  buildEditorDetailRail,
  buildEditorRowsTable,
  buildPreviewTimeline,
} from './editor-markup.js';
import { resolveEditorEffectTab } from './editor-effect-tabs.js';
import {
  buildFutureProjectCard,
  buildProjectCard,
} from './project-list-markup.js';
import { hydrateProjectListCards } from '../events/project-list-events.js';
import { hydrateSetupEvents } from '../events/setup-events.js';

export {
  resolveVideoProjectCompositionContractForCheck,
  resolveVideoProjectPreviewMediaForCheck,
};

const MOTION_SCRUB_DRAG_THRESHOLD_PX = 4;

export function resolveMotionScrubValue({ startValue = 0, deltaX = 0, kind = 'position', shiftKey = false, altKey = false } = {}) {
  const numericStart = Number(startValue);
  const safeStart = Number.isFinite(numericStart) ? numericStart : 0;
  const numericDelta = Number(deltaX);
  const safeDelta = Number.isFinite(numericDelta) ? numericDelta : 0;
  const baseSensitivity = kind === 'scalePercent' ? 0.25 : 1;
  const modifier = shiftKey ? 2 : altKey ? 0.25 : 1;
  return Math.round(safeStart + (safeDelta * baseSensitivity * modifier));
}

function resolveMotionScrubKind(input) {
  return (input?.dataset?.motionField || '').includes('ScalePercent') ? 'scalePercent' : 'position';
}

export function createMotionScrubHandlers({ input, documentRef = globalThis.document } = {}) {
  let scrubState = null;
  let previousBodyUserSelect = null;
  let documentListenersAttached = false;

  const getBody = () => documentRef?.body || null;

  const addDocumentListeners = () => {
    if (documentListenersAttached || !documentRef?.addEventListener) return;
    documentRef.addEventListener('pointermove', pointermove);
    documentRef.addEventListener('pointerup', pointerup);
    documentRef.addEventListener('pointercancel', pointercancel);
    documentListenersAttached = true;
  };

  const removeDocumentListeners = () => {
    if (!documentListenersAttached || !documentRef?.removeEventListener) return;
    documentRef.removeEventListener('pointermove', pointermove);
    documentRef.removeEventListener('pointerup', pointerup);
    documentRef.removeEventListener('pointercancel', pointercancel);
    documentListenersAttached = false;
  };

  const setActiveScrubUi = () => {
    input?.classList?.add('is-motion-scrubbing');
    const body = getBody();
    body?.classList?.add('is-motion-scrubbing');
    if (body?.style && previousBodyUserSelect === null) {
      previousBodyUserSelect = body.style.userSelect || '';
      body.style.userSelect = 'none';
    }
  };

  const clearActiveScrubUi = () => {
    input?.classList?.remove('is-motion-scrubbing');
    const body = getBody();
    body?.classList?.remove('is-motion-scrubbing');
    if (body?.style && previousBodyUserSelect !== null) {
      body.style.userSelect = previousBodyUserSelect;
      previousBodyUserSelect = null;
    }
  };

  const stopScrub = (pointerId) => {
    if (!scrubState) return;
    if (scrubState.active) {
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    clearActiveScrubUi();
    input.releasePointerCapture?.(pointerId);
    removeDocumentListeners();
    scrubState = null;
  };

  const pointerdown = (ev) => {
    if (!input) return;
    if (ev.button !== undefined && ev.button !== 0) return;
    scrubState = {
      pointerId: ev.pointerId,
      startClientX: ev.clientX,
      startValue: Number(input.value || 0),
      active: false,
    };
    input.setPointerCapture?.(ev.pointerId);
    addDocumentListeners();
  };

  const pointermove = (ev) => {
    if (!input) return;
    if (!scrubState || ev.pointerId !== scrubState.pointerId) return;
    const deltaX = ev.clientX - scrubState.startClientX;
    if (!scrubState.active && Math.abs(deltaX) < MOTION_SCRUB_DRAG_THRESHOLD_PX) return;

    scrubState.active = true;
    ev.preventDefault();
    setActiveScrubUi();
    input.value = resolveMotionScrubValue({
      startValue: scrubState.startValue,
      deltaX,
      kind: resolveMotionScrubKind(input),
      shiftKey: ev.shiftKey,
      altKey: ev.altKey,
    }).toString();
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };

  const pointerup = (ev) => {
    if (!scrubState || ev.pointerId !== scrubState.pointerId) return;
    stopScrub(ev.pointerId);
  };

  const pointercancel = (ev) => {
    if (!scrubState || ev.pointerId !== scrubState.pointerId) return;
    stopScrub(ev.pointerId);
  };

  return { pointerdown, pointermove, pointerup, pointercancel };
}

function hydrateMotionScrubberInput(input) {
  if (!input) return;
  const handlers = createMotionScrubHandlers({ input });
  input.addEventListener('pointerdown', handlers.pointerdown);
}

export function syncVideoSelectorPreviewLayers({ modal, sourceInSeconds = 0, playing = false } = {}) {
  if (!modal?.querySelectorAll) return false;
  const seekTime = Number(sourceInSeconds);
  const videos = Array.from(modal.querySelectorAll('video[data-layer]'));
  if (!videos.length || !Number.isFinite(seekTime)) return false;
  videos.forEach((video) => {
    syncManagedVideoElement({ video, currentTimeSeconds: Math.max(0, seekTime), playing });
  });
  return true;
}

function updateVideoSelectorPreviewToggle(button, playing) {
  if (!button) return;
  button.setAttribute('aria-pressed', playing ? 'true' : 'false');
  button.textContent = playing ? '⏸ Preview' : '▶ Preview';
}

// Module-scoped composition renderer — persists across re-renders
let _compositionRenderer = null;
let _compositionRendererContainer = null;
let _compositionRendererAssetSignature = '';

function destroyCompositionRenderer() {
  if (_compositionRenderer) {
    try { _compositionRenderer.destroy(); } catch {}
    _compositionRenderer = null;
  }
  _compositionRendererContainer = null;
  _compositionRendererAssetSignature = '';
}

function ensureCompositionRenderer(container) {
  if (!_compositionRenderer || !_compositionRendererContainer || _compositionRendererContainer !== container) {
    destroyCompositionRenderer();
    _compositionRenderer = new CompositionRenderer({ container });
    _compositionRendererContainer = container;
  }
  return _compositionRenderer;
}

export function updateSelectedVideoProjectCompositionPreview({ project } = {}) {
  if (!_compositionRenderer || !_compositionRendererContainer || !project) return false;
  const editorRows = Array.isArray(project._editorRows) ? project._editorRows : [];
  if (!editorRows.length) return false;

  const { compositionRows } = buildCompositionPreviewAssets({ project, rows: editorRows });
  _compositionRenderer.update({ rows: compositionRows });

  const imageUrls = compositionRows.map((row) => row.image).filter(Boolean);
  if (imageUrls.length) {
    void _compositionRenderer.preloadImages(imageUrls);
  }

  const seekTime = Number(project._previewSeekTime);
  if (Number.isFinite(seekTime) && seekTime > 0) {
    _compositionRenderer.seek(seekTime);
  }

  return true;
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

function buildProjectPhaseText({ currentStep, inEditorPhase, editorPhase } = {}) {
  if (!inEditorPhase && currentStep === 'images') return 'Fase 1: Imágenes';
  if (!inEditorPhase && currentStep === 'audio') return 'Fase 2: Audios';
  if (['preview_ready', 'editing_dirty'].includes(editorPhase)) return 'Fase 4: Edición';
  if (['final_rendering', 'final_ready'].includes(editorPhase)) return 'Fase 5: Exportación';
  if (inEditorPhase) return 'Fase 3: Editor';
  return 'Fase 1: Imágenes';
}

function buildAudioAssetCard({ kind, label, help, audio = {}, uploading = false }) {
  const hasAudio = Boolean(audio?.public_url || audio?.path);
  const fileName = escapeHtmlCore((audio?.name || 'Sin archivo seleccionado').toString());
  const publicUrl = escapeHtmlCore((audio?.public_url || '').toString());
  const sizeMb = Number(audio?.size || 0) > 0 ? `${(Number(audio.size) / 1024 / 1024).toFixed(1)} MB` : '';
  const selectedDefaultTrackId = (audio?.default_track_id || '').toString();
  const uploadTitle = kind === 'background' ? 'Agregar música' : 'Agregar voz';
  const uploadHelp = kind === 'background'
    ? 'Opcional: subí una pista propia o elegí una música del sistema.'
    : 'Subí o reemplazá el audio de voz para sincronizarlo con los segmentos.';
  const defaultMusicSelector = kind === 'background'
    ? `
      <label class="video-audio-card__default-select">
        <span>Música por defecto</span>
        <select data-action="select-default-background-music" ${uploading ? 'disabled' : ''}>
          <option value="">Elegí una música del sistema…</option>
          ${DEFAULT_BACKGROUND_MUSIC_TRACKS.map((track) => `
            <option value="${escapeHtmlCore(track.id)}" ${track.id === selectedDefaultTrackId ? 'selected' : ''}>${escapeHtmlCore(track.label)}</option>
          `).join('')}
        </select>
      </label>
    `
    : '';

  return `
    <article class="video-audio-card" data-audio-kind="${escapeHtmlCore(kind)}">
      <div class="video-audio-card__copy">
        <span class="video-projects-eyebrow">${escapeHtmlCore(label)}</span>
        <strong>${fileName}</strong>
        <p>${escapeHtmlCore(help)}</p>
        ${hasAudio ? `<small>Subido${sizeMb ? ` · ${escapeHtmlCore(sizeMb)}` : ''}</small>` : '<small>Pendiente</small>'}
      </div>
      ${hasAudio && publicUrl ? `<audio controls src="${publicUrl}"></audio>` : ''}
      ${defaultMusicSelector}
      <label class="video-audio-card__upload">
        <input type="file" accept="audio/*" data-action="upload-project-audio" data-audio-kind="${escapeHtmlCore(kind)}" ${uploading ? 'disabled' : ''} />
        <span class="video-audio-card__dropzone">
          <span class="video-audio-card__dropzone-plus">+</span>
          <strong>${uploading ? 'Subiendo…' : hasAudio ? `Reemplazar ${escapeHtmlCore(label.toLowerCase())}` : escapeHtmlCore(uploadTitle)}</strong>
          <small>${escapeHtmlCore(uploadHelp)}</small>
        </span>
      </label>
    </article>
  `;
}

function hydrateImageSizeBadges(root, { onBrokenCandidate } = {}) {
  root?.querySelectorAll?.('.video-image-card__media img')?.forEach((img) => {
    const card = img.closest('.video-image-card');
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
  const dirtyBadge = dirty ? '<span class="video-project-dirty-badge" title="Cambios sin exportar">●</span>' : '';
  return `<span class="video-project-phase-badge" data-phase="${escapeHtmlCore(phase)}">${escapeHtmlCore(label)}${dirtyBadge}</span>`;
}

function buildPreviewMonitor({ previewUrl, rows = [], selectedRowId = null }) {
  const activeSelectedRowId = selectedRowId || rows[0]?.id || null;
  const hasRows = Array.isArray(rows) && rows.length > 0;

  // No rows yet → empty state
  if (!hasRows) {
    return `
      <div class="video-preview-monitor video-preview-monitor--empty">
        <p>Todavía no hay composición local. Prepará el editor para empezar.</p>
        ${previewUrl ? `<a href="${escapeHtmlCore(previewUrl)}" target="_blank" rel="noopener noreferrer">Abrir preview renderizada</a>` : ''}
      </div>
    `;
  }

  return `
    <div class="video-preview-monitor video-preview-monitor--composition">
      <div class="video-preview-stage" data-composition-container></div>
      ${buildPreviewTimeline(rows, activeSelectedRowId)}
      <div class="video-preview-monitor__footer">
        <span>Preview local</span>
      </div>
    </div>
  `;
}

function buildEditorStatusPanel({ editorState, onExportFinal }) {
  const phase = editorState.phase || 'idle';
  const dirty = Boolean(editorState.dirty);
  const exportStatus = editorState.export_status || 'idle';
  const isRendering = phase === 'preparing' || phase === 'preview_rendering' || phase === 'final_rendering';
  const canExport = !isRendering && (phase === 'preview_ready' || phase === 'editing_dirty' || phase === 'final_ready' || phase === 'error');

  return `
    <div class="video-editor-status-panel">
      <div class="video-editor-status-panel__header">
        <span class="video-projects-eyebrow">Acciones</span>
        ${dirty ? '<span class="video-project-dirty-badge" title="Cambios sin exportar">● Sin exportar</span>' : ''}
      </div>
      <div class="video-editor-actions">
        <button class="video-project-primary-action video-project-primary-action--export" type="button" data-action="export-final" ${canExport ? '' : 'disabled'} title="Exportar video final 1080p">
          ${phase === 'final_rendering' ? 'Exportando…' : 'Exportar final'}
        </button>
      </div>
      ${editorState.error ? `<p class="video-projects-empty video-projects-empty--error">${escapeHtmlCore(editorState.error)}</p>` : ''}
      ${editorState.final_url ? `<div class="video-editor-download"><a href="${escapeHtmlCore(editorState.final_url)}" target="_blank" rel="noopener noreferrer" download>Descargar video final</a></div>` : ''}
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
    onExportFinal,
    rowImageUploading,
  } = options;

  const shell = buildEditorShellViewModel(project, { editorRows, selectedRowId });
  const { activeSelectedRowId, selectedRow, selectedRowIndex } = shell;

  return `
    <section class="video-editor-shell" data-editor-phase="${escapeHtmlCore((editorState.phase || 'idle').toString())}">
      <section class="video-editor-shell__workspace">
        <div class="video-editor-shell__left">
          <div class="video-editor-shell__card video-editor-shell__card--preview">
            <div class="video-project-section-heading video-project-section-heading--compact">
              <div>
                <span class="video-projects-eyebrow">Preview Card — Top</span>
                <h4>Vista previa</h4>
              </div>
            </div>
            ${buildPreviewMonitor({ previewUrl: editorState.preview_url, rows: editorRows, selectedRowId: activeSelectedRowId })}
          </div>

          <div class="video-editor-shell__card video-editor-shell__card--table">
            <div class="video-project-section-heading video-project-section-heading--compact">
              <div>
                <span class="video-projects-eyebrow">Table Card — Bottom</span>
                <h4>${formatCount(editorRows.length, 'fila')}</h4>
              </div>
            </div>
            ${buildEditorRowsTable(editorRows, { selectedRowId: activeSelectedRowId, onRowSelect, onImageReplace, onUploadAssign, rowImageUploading, project })}
          </div>
        </div>

        <aside class="video-editor-shell__right">
          ${buildEditorDetailRail({ row: selectedRow, globalAudio, project, rowIndex: selectedRowIndex })}
          ${buildEditorStatusPanel({ editorState, onExportFinal })}
        </aside>
      </section>
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
        <h3>Editor ${buildPhaseBadge(phase, false)}</h3>
      </div>
    </div>
    <div class="video-preview-preparing">
      ${isRendering
        ? `<div class="video-preview-preparing__card" role="status" aria-live="polite"><div class="video-preview-spinner" aria-hidden="true"></div><p>Preparando editor/timings… Esto puede tardar unos minutos.</p></div>`
        : hasError
          ? `<p class="video-projects-empty video-projects-empty--error">${escapeHtmlCore(editorState.error || 'Error preparando editor')}</p>`
          : `<p>Editor listo. Abrí la edición para ajustar filas y exportar.</p>`}
    </div>
  `;
}

export function renderVideoProjectsListView({ state, el, openVideoProject, prefetchProjectDetail }) {
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

  el.videoProjectsList.innerHTML = [
    ...projects.map((project) => buildProjectCard(project)),
    buildFutureProjectCard(),
  ].join('');

  hydrateProjectListCards({
    root: el.videoProjectsList,
    openVideoProject,
    prefetchProjectDetail,
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
  selectDefaultBackgroundMusic,
  uploadCustomImages,
  preparePreview,
  refreshPreview,
  exportFinal,
  updateRow,
  assignExistingImageToRow,
  uploadAndAssignImage,
  uploadVideoToLibrary,
  assignVideoSegmentToRow,
  updateGlobalAudio,
  updateBrandChannel,
  renderSelectedVideoProject,
  updateSelectedVideoProjectCompositionPreview,
  showToast,
}) {
  if (!el.videoProjectDetail) return;

  const videoProjectsHero = el.viewScripts?.querySelector('.video-projects-hero');
  const project = state.selectedVideoProject;
  if (!project) {
    destroyCompositionRenderer();
    videoProjectsHero?.classList.remove('hidden');
    el.videoProjectsCatalog?.classList.remove('hidden');
    el.videoProjectDetail.classList.add('hidden');
    el.videoProjectDetail.innerHTML = '';
    return;
  }

  videoProjectsHero?.classList.add('hidden');
  el.videoProjectsCatalog?.classList.add('hidden');
  el.videoProjectDetail.classList.remove('hidden');

  const viewModel = buildSelectedVideoProjectViewModel(project, state);
  const {
    googleCandidates,
    customCandidates,
    googleCandidateCount,
    imageMetaCount,
    selectedImageCount,
    selectedImageUrls,
    segments,
    segmentCount,
    requiredImageCount,
    hasEnoughSelectedImages,
    detailPending,
    currentStep,
    voiceAudio,
    backgroundAudio,
    voiceUploading,
    backgroundUploading,
    canPreparePreview,
    editorState,
    editorPhase,
    timedRows,
    editorRows,
    globalAudio,
    inEditorPhase,
    editorShellMode,
  } = viewModel;
  const title = escapeHtmlCore(viewModel.title);
  const player = escapeHtmlCore(viewModel.player);
  const country = escapeHtmlCore(viewModel.country);
  const phaseText = escapeHtmlCore(buildProjectPhaseText({ currentStep, inEditorPhase, editorPhase }));
  const phaseInstruction = !inEditorPhase && currentStep === 'images'
    ? 'Elegí las imágenes que van a cubrir cada segmento del guion. A la derecha tenés el guion pipeado: es el texto dividido en partes para saber cuántas imágenes necesitás y qué representa cada una.'
    : '';

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
            <p>${formatCount(googleCandidateCount, 'candidato')}</p>
        </div>
        ${detailPending
          ? `
            <div class="video-image-grid video-image-grid--skeleton" aria-hidden="true">
              ${new Array(12).fill(0).map(() => '<article class="video-image-card video-image-card--skeleton"><div class="video-image-card__media"></div></article>').join('')}
            </div>
          `
          : googleCandidates.length
          ? `<div class="video-image-grid">${googleCandidates.map((candidate, index) => buildCandidateCard(candidate, index, selectedImageUrls)).join('')}</div>`
          : '<p class="video-projects-empty">Todavía no hay candidatos guardados para este proyecto. Si el estado dice Error Serper, revisá la ejecución del workflow.</p>'}

        <section class="video-project-custom-images" aria-label="Mis imágenes">
          <div class="video-project-custom-images__separator" aria-hidden="true"></div>
          <div class="video-project-section-heading video-project-section-heading--compact">
            <div>
              <h3>Mis imágenes</h3>
            </div>
            <p class="video-project-custom-images__count">${formatCount(customCandidates.length, 'imagen', 'imágenes')}</p>
          </div>
          <div class="video-project-custom-images__upload-row">
            <p class="video-project-custom-images__help">Subí JPG/PNG/WebP (hasta 15MB c/u). Se guardan solo en este proyecto y se auto-seleccionan.</p>
            <label class="video-project-custom-images__upload">
              <input type="file" accept="image/jpeg,image/png,image/webp" data-action="upload-custom-images" multiple ${project._customImagesUploading ? 'disabled' : ''} />
              <span>${project._customImagesUploading ? 'Subiendo imágenes…' : 'Subir mis imágenes'}</span>
            </label>
          </div>
          ${project._customImageUploadError ? `<p class="video-projects-empty video-projects-empty--error">${escapeHtmlCore(project._customImageUploadError)}</p>` : ''}
          ${customCandidates.length
            ? `<div class="video-image-grid video-image-grid--custom">${customCandidates.map((candidate, index) => buildCandidateCard(candidate, index, selectedImageUrls)).join('')}</div>`
            : '<p class="video-projects-empty">Todavía no subiste imágenes custom para este proyecto.</p>'}
        </section>

        <div class="video-project-next-panel video-project-next-panel--image-selection">
          <div>
            <span class="video-projects-eyebrow">Selección</span>
            <strong>${selectedImageCount} ${selectedImageCount === 1 ? 'imagen seleccionada' : 'imágenes seleccionadas'} · ${requiredImageCount} requerida${requiredImageCount === 1 ? '' : 's'}</strong>
            <p>${hasEnoughSelectedImages ? 'Ya tenés suficientes imágenes para cubrir los segmentos.' : `Faltan ${Math.max(requiredImageCount - selectedImageCount, 0)} imágenes para avanzar sin huecos.`}</p>
          </div>
          <button class="video-project-primary-action" type="button" data-action="video-project-next-audio">
            Siguiente: audios →
          </button>
        </div>

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
            help: 'Elegí una música del sistema o subí una pista propia si querés elevar el resultado.',
            audio: backgroundAudio,
            uploading: backgroundUploading,
          })}
        </div>
        ${project._audioUploadError ? `<p class="video-projects-empty video-projects-empty--error">${escapeHtmlCore(project._audioUploadError)}</p>` : ''}
        <div class="video-project-next-panel">
          <div>
            <span class="video-projects-eyebrow">Siguiente paso</span>
            <strong>${canPreparePreview ? 'Listo para preparar editor' : 'Faltan archivos para continuar'}</strong>
            <p>Necesitamos cubrir ${requiredImageCount} segmento${requiredImageCount === 1 ? '' : 's'} con imágenes, voz y música antes de pasar a edición/preview.</p>
          </div>
          <button class="video-project-primary-action" type="button" data-action="video-project-prepare-preview" ${canPreparePreview ? '' : 'disabled'}>
            ${editorPhase === 'preparing' || editorPhase === 'preview_rendering' ? 'Preparando…' : 'Preparar editor →'}
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
    if (editorPhase === 'preparing' || editorPhase === 'preview_rendering' || (editorPhase === 'error' && !editorRows.length)) {
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

    sideContent = editorShellMode
      ? ''
      : `
        <div class="video-project-section-heading video-project-section-heading--compact">
          <div>
            <span class="video-projects-eyebrow">Estado</span>
            <h3>${buildPhaseBadge(editorPhase, editorState.dirty)}</h3>
          </div>
        </div>
        <div class="video-editor-meta">
          <div><span>Proyecto Remotion</span><strong>${escapeHtmlCore((editorState.remotion_project_id || '—').toString())}</strong></div>
          <div><span>Filas</span><strong>${editorRows.length}</strong></div>
          <div><span>Preview local</span><strong>${editorRows.length ? 'Lista' : 'Pendiente'}</strong></div>
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
        ${phaseInstruction ? `<p class="video-project-detail__instruction">${escapeHtmlCore(phaseInstruction)}</p>` : ''}
      </div>
      <span class="video-project-detail__phase-label">${phaseText}</span>
    </header>

    ${detailPending ? '<p class="video-projects-empty">Cargando imágenes del proyecto…</p>' : ''}

    <section class="video-project-detail__workspace ${editorShellMode ? 'video-project-detail__workspace--editor-shell' : ''}">
      <div class="video-project-detail__main">
        ${mainContent}
      </div>
      <aside class="video-project-detail__side ${editorShellMode ? 'video-project-detail__side--hidden' : ''}">
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

    hydrateSetupEvents({
      root: el.videoProjectDetail,
      uploadProjectAudio,
      selectDefaultBackgroundMusic,
      uploadCustomImages,
      toggleImageSelection,
    });
  } else {
    // Editor phase event hydration
    if (editorPhase === 'preview_ready' || editorPhase === 'editing_dirty' || editorPhase === 'final_ready' || editorPhase === 'error') {
      const useComposition = Boolean(editorRows.length);

      // ── 5.1/5.2: Composition renderer lifecycle ──
      if (useComposition) {
        const compositionContainer = el.videoProjectDetail.querySelector('[data-composition-container]');
        if (compositionContainer) {
          const renderer = ensureCompositionRenderer(compositionContainer);

          // Resolve asset URLs for preload
          const globalAudioData = project._globalAudio || { voice: { volume: 1, muted: false }, music: { volume: 0.16, muted: false } };
          const { voiceUrl, musicUrl, compositionRows, dustWebmUrl, logoUrl, outroUrl, outroDurationSeconds, assetSignature } = buildCompositionPreviewAssets({ project, rows: editorRows });
          const shouldPreloadAssets = _compositionRendererAssetSignature !== assetSignature;

          const applyRowsAndSeek = () => {
            renderer?.update({ rows: compositionRows });
            const imageUrls = compositionRows.map((row) => row.image).filter(Boolean);
            if (imageUrls.length) renderer?.preloadImages(imageUrls);
            // Seek to saved position if any
            const seekTime = Number(project._previewSeekTime);
            if (Number.isFinite(seekTime) && seekTime > 0) {
              renderer?.seek(seekTime);
            }
          };

          if (shouldPreloadAssets) {
            renderer.preload({
              dustWebmUrl,
              logoUrl,
              outroUrl,
              outroDurationSeconds,
              voiceUrl,
              musicUrl,
              voiceVolume: globalAudioData.voice?.volume ?? 1,
              voiceMuted: globalAudioData.voice?.muted ?? false,
              musicVolume: globalAudioData.music?.volume ?? 0.16,
              musicMuted: globalAudioData.music?.muted ?? false,
              musicFadeInSeconds: globalAudioData.music?.fadeInSeconds ?? 0,
              musicFadeOutSeconds: globalAudioData.music?.fadeOutSeconds ?? 0,
              rows: compositionRows,
            }).then(() => {
              _compositionRendererAssetSignature = assetSignature;
              applyRowsAndSeek();
            });
          } else {
            applyRowsAndSeek();
          }
        }
      } else {
        destroyCompositionRenderer();
      }

      // ── 5.5: Dirty flag preservation — composition preview changes don't mark dirty ──
      // The dirty flag is managed by updateRow() and updateGlobalAudio() in index.js,
      // which only fire on DATA changes (not preview rendering). No additional work needed here.

      const selectEditorRow = (rowId, startTime) => {
        if (!rowId) return;
        project._selectedEditorRowId = rowId;
        const nextTime = Number(startTime);
        if (Number.isFinite(nextTime)) {
          project._previewSeekTime = nextTime;
          // ── Task 5.1 (selectEditorRow): seek composition to row's startTime ──
          if (_compositionRenderer) {
            _compositionRenderer.seek(nextTime);
          }
        }
        renderSelectedVideoProject?.();
      };

      const restorePreviewSeekTime = () => {
        // Only needed for <video> mode — composition handles seek in preload callback
        if (_compositionRenderer) return;
        const video = el.videoProjectDetail.querySelector('[data-preview-video]');
        const seekTime = Number(project._previewSeekTime);
        if (!video || !Number.isFinite(seekTime)) return;
        const applySeek = () => {
          try { video.currentTime = seekTime; } catch {}
        };
        if (video.readyState >= 1) applySeek();
        else video.addEventListener('loadedmetadata', applySeek, { once: true });
      };

      // ── Shared transport elements ──
      const previewVideo = el.videoProjectDetail.querySelector('[data-preview-video]');
      const scrubber = el.videoProjectDetail.querySelector('[data-preview-scrubber]');
      const playButton = el.videoProjectDetail.querySelector('[data-action="toggle-preview-play"]');
      const playIcon = el.videoProjectDetail.querySelector('[data-preview-play-icon]');

      const findRowAtTime = (time) => {
        if (!editorRows.length) return null;
        return editorRows.find((row) => time >= Number(row.startTime || 0) && time < Number(row.endTime || 0)) || editorRows[editorRows.length - 1];
      };

      // ── Timeline update — works with both video and composition ──
      const updatePreviewTimeline = (currentTime, durationValue) => {
        const configuredDuration = Number(scrubber?.dataset.duration || 0);
        const duration = Math.max(Number(durationValue || previewVideo?.duration || _compositionRenderer?.duration || configuredDuration || 0), configuredDuration, 1);
        const pct = Math.max(0, Math.min((Number(currentTime || 0) / duration) * 100, 100));
        const progressEl = el.videoProjectDetail.querySelector('[data-preview-progress]');
        const playheadEl = el.videoProjectDetail.querySelector('[data-preview-playhead]');
        const currentTimeEl = el.videoProjectDetail.querySelector('[data-preview-current-time]');
        if (progressEl) progressEl.style.width = `${pct}%`;
        if (playheadEl) playheadEl.style.left = `${pct}%`;
        if (currentTimeEl) currentTimeEl.textContent = formatSeconds(currentTime || 0);
        const currentRow = findRowAtTime(Number(currentTime || 0));
        if (!currentRow) return;
        el.videoProjectDetail.querySelectorAll('.video-preview-timeline__marker').forEach((segment) => {
          segment.classList.toggle('is-current', segment.dataset.rowId === currentRow.id);
        });
        el.videoProjectDetail.querySelectorAll('.video-editor-row[data-row-id]').forEach((rowEl) => {
          rowEl.classList.toggle('is-current', rowEl.dataset.rowId === currentRow.id);
        });
      };

      // ── rAF timeline loop — works with both video and composition ──
      let previewTimelineFrame = 0;
      const stopPreviewTimelineLoop = () => {
        if (!previewTimelineFrame) return;
        window.cancelAnimationFrame(previewTimelineFrame);
        previewTimelineFrame = 0;
      };
      const startPreviewTimelineLoop = () => {
        stopPreviewTimelineLoop();
        const tick = () => {
          if (_compositionRenderer) {
            updatePreviewTimeline(_compositionRenderer.currentTime, _compositionRenderer.duration);
            if (_compositionRenderer.isPlaying) {
              previewTimelineFrame = window.requestAnimationFrame(tick);
            }
          } else if (previewVideo) {
            updatePreviewTimeline(previewVideo.currentTime, previewVideo.duration);
            if (!previewVideo.paused && !previewVideo.ended) {
              previewTimelineFrame = window.requestAnimationFrame(tick);
            }
          }
        };
        previewTimelineFrame = window.requestAnimationFrame(tick);
      };

      // ── Scrubber seek — works with both video and composition ──
      const seekPreviewFromPointer = (ev) => {
        if (!scrubber) return;
        const rect = scrubber.getBoundingClientRect();
        if (!rect.width) return;
        const pct = Math.max(0, Math.min((ev.clientX - rect.left) / rect.width, 1));
        const configuredDuration = Number(scrubber.dataset.duration || 0);

        if (_compositionRenderer) {
          // ── 5.4: Wire scrubber to CompositionRenderer.seek() ──
          const duration = Math.max(_compositionRenderer.duration, configuredDuration, 1);
          const nextTime = pct * duration;
          _compositionRenderer.seek(nextTime);
          project._previewSeekTime = nextTime;
          updatePreviewTimeline(nextTime, duration);
        } else if (previewVideo) {
          const duration = Math.max(Number(previewVideo.duration || 0), configuredDuration, 1);
          const nextTime = pct * duration;
          previewVideo.currentTime = nextTime;
          project._previewSeekTime = nextTime;
          updatePreviewTimeline(nextTime, duration);
        }
      };

      restorePreviewSeekTime();
      updatePreviewTimeline(Number(project._previewSeekTime || 0));

      // ── 5.3: Wire play/pause button to CompositionRenderer ──
      if (_compositionRenderer) {
        // Composition mode: play/pause via CompositionRenderer
        const handleCompositionPlay = async () => {
          if (!_compositionRenderer) return;
          if (_compositionRenderer.isPlaying) {
            _compositionRenderer.pause();
          } else {
            await _compositionRenderer.play();
          }
        };

        playButton?.addEventListener('click', handleCompositionPlay);

        // Click on stage to toggle play
        const stage = el.videoProjectDetail.querySelector('.composition-stage');
        stage?.addEventListener('click', handleCompositionPlay);

        // Update play icon on composition state changes
        const updatePlayIcon = () => {
          if (!_compositionRenderer) return;
          if (_compositionRenderer.isPlaying) {
            playButton?.classList.add('is-playing');
            if (playIcon) playIcon.textContent = '❚❚';
            startPreviewTimelineLoop();
          } else {
            playButton?.classList.remove('is-playing');
            if (playIcon) playIcon.textContent = '▶';
            stopPreviewTimelineLoop();
            updatePreviewTimeline(_compositionRenderer.currentTime, _compositionRenderer.duration);
          }
        };

        // Poll composition state for icon updates (lightweight, ~10Hz)
        let playStatePollId = 0;
        const pollPlayState = () => {
          if (!_compositionRenderer) return;
          const wasPlaying = playButton?.classList.contains('is-playing');
          if (wasPlaying !== _compositionRenderer.isPlaying) {
            updatePlayIcon();
          }
          playStatePollId = window.setTimeout(pollPlayState, 100);
        };
        pollPlayState();

        // Start timeline loop if composition is already playing
        if (_compositionRenderer.isPlaying) {
          startPreviewTimelineLoop();
        }
      } else if (previewVideo) {
        // ── Video mode: existing <video> event wiring ──
        previewVideo?.addEventListener('loadedmetadata', () => updatePreviewTimeline(previewVideo.currentTime, previewVideo.duration));
        previewVideo?.addEventListener('timeupdate', () => updatePreviewTimeline(previewVideo.currentTime, previewVideo.duration));
        previewVideo?.addEventListener('play', () => {
          playButton?.classList.add('is-playing');
          if (playIcon) playIcon.textContent = '❚❚';
          startPreviewTimelineLoop();
        });
        previewVideo?.addEventListener('pause', () => {
          playButton?.classList.remove('is-playing');
          if (playIcon) playIcon.textContent = '▶';
          stopPreviewTimelineLoop();
          updatePreviewTimeline(previewVideo.currentTime, previewVideo.duration);
        });
        previewVideo?.addEventListener('ended', () => {
          playButton?.classList.remove('is-playing');
          if (playIcon) playIcon.textContent = '▶';
          stopPreviewTimelineLoop();
          updatePreviewTimeline(previewVideo.currentTime, previewVideo.duration);
        });

        previewVideo?.addEventListener('click', async () => {
          if (previewVideo.paused) {
            try { await previewVideo.play(); } catch {}
          } else {
            previewVideo.pause();
          }
        });

        playButton?.addEventListener('click', async () => {
          if (!previewVideo) return;
          if (previewVideo.paused) {
            try { await previewVideo.play(); } catch {}
          } else {
            previewVideo.pause();
          }
        });
      }

      // ── Scrubber pointer events (shared for both modes) ──
      if (scrubber) {
        let scrubbing = false;
        scrubber.addEventListener('pointerdown', (ev) => {
          ev.preventDefault();
          scrubbing = true;
          scrubber.setPointerCapture?.(ev.pointerId);
          seekPreviewFromPointer(ev);
        });
        scrubber.addEventListener('pointermove', (ev) => {
          if (!scrubbing) return;
          seekPreviewFromPointer(ev);
        });
        scrubber.addEventListener('pointerup', (ev) => {
          if (!scrubbing) return;
          seekPreviewFromPointer(ev);
          scrubbing = false;
          scrubber.releasePointerCapture?.(ev.pointerId);
        });
        scrubber.addEventListener('pointercancel', () => {
          scrubbing = false;
        });
      }

      // Row selection
      el.videoProjectDetail.querySelectorAll('[data-action="select-row"]').forEach((btn) => {
        btn.addEventListener('pointerdown', (ev) => ev.stopPropagation());
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          selectEditorRow(btn.dataset.rowId, btn.dataset.startTime);
        });
      });

      el.videoProjectDetail.querySelectorAll('.video-editor-row[data-row-id]').forEach((rowEl) => {
        rowEl.addEventListener('click', (ev) => {
          if (ev.target.closest('button, input, label, select, a')) return;
          selectEditorRow(rowEl.dataset.rowId, rowEl.dataset.startTime);
        });
        rowEl.addEventListener('keydown', (ev) => {
          if (ev.key !== 'Enter' && ev.key !== ' ') return;
          ev.preventDefault();
          selectEditorRow(rowEl.dataset.rowId, rowEl.dataset.startTime);
        });
      });

      el.videoProjectDetail.querySelectorAll('[data-action="switch-effect-tab"]').forEach((button) => {
        button.addEventListener('click', () => {
          const activeTab = resolveEditorEffectTab(button.dataset.effectTab);
          project._editorEffectTab = activeTab;
          const section = button.closest('.video-editor-detail__section');
          section?.querySelectorAll('[data-action="switch-effect-tab"]').forEach((tabButton) => {
            const isActive = tabButton.dataset.effectTab === activeTab;
            tabButton.classList.toggle('is-active', isActive);
            tabButton.setAttribute('aria-selected', isActive ? 'true' : 'false');
            tabButton.setAttribute('tabindex', isActive ? '0' : '-1');
          });
          section?.querySelectorAll('.video-editor-effect-panel').forEach((panel) => {
            panel.hidden = panel.id !== `video-editor-effect-panel-${activeTab}`;
          });
        });
      });

      el.videoProjectDetail.querySelectorAll('[data-action="open-assets-tab"]').forEach((button) => {
        button.addEventListener('click', () => {
          const rowId = button.dataset.rowId;
          if (rowId) project._selectedEditorRowId = rowId;
          project._editorEffectTab = 'assets';
          renderSelectedVideoProject?.();
        });
      });

      el.videoProjectDetail.querySelectorAll('[data-action="open-videos-tab"]').forEach((button) => {
        button.addEventListener('click', () => {
          const rowId = button.dataset.rowId;
          if (rowId) project._selectedEditorRowId = rowId;
          project._editorEffectTab = 'videos';
          renderSelectedVideoProject?.();
        });
      });

      el.videoProjectDetail.querySelectorAll('[data-action="switch-motion-editor-tab"]').forEach((button) => {
        button.addEventListener('click', () => {
          const activeTab = button.dataset.motionEditorTab === 'manual' ? 'manual' : 'presets';
          project._motionEditorTab = activeTab;
          const section = button.closest('.video-editor-effect-panel');
          section?.querySelectorAll('[data-action="switch-motion-editor-tab"]').forEach((tabButton) => {
            const isActive = tabButton.dataset.motionEditorTab === activeTab;
            tabButton.classList.toggle('is-active', isActive);
            tabButton.setAttribute('aria-selected', isActive ? 'true' : 'false');
          });
          section?.querySelectorAll('[data-motion-editor-panel]').forEach((panel) => {
            panel.hidden = panel.dataset.motionEditorPanel !== activeTab;
          });
        });
      });

      el.videoProjectDetail.querySelectorAll('[data-action="assign-row-asset"]').forEach((button) => {
        button.addEventListener('click', async () => {
          const rowId = button.dataset.rowId;
          const assetUrl = button.dataset.assetUrl;
          if (!rowId || !assetUrl) return;
          await assignExistingImageToRow?.(rowId, assetUrl);
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

      el.videoProjectDetail.querySelectorAll('[data-action="upload-assets-image"]').forEach((input) => {
        input.addEventListener('change', async () => {
          const [file] = input.files || [];
          const rowId = input.dataset.rowId;
          if (!file || !rowId) return;
          project._editorEffectTab = 'assets';
          await uploadAndAssignImage?.(rowId, file);
          input.value = '';
        });
      });

      el.videoProjectDetail.querySelectorAll('[data-action="upload-row-video"]').forEach((input) => {
        input.addEventListener('change', async () => {
          const [file] = input.files || [];
          const rowId = input.dataset.rowId;
          if (!file || !rowId) return;
          project._editorEffectTab = 'videos';
          await uploadVideoToLibrary?.(rowId, file);
          input.value = '';
        });
      });

      el.videoProjectDetail.querySelectorAll('[data-action="open-video-selector"]').forEach((button) => {
        button.addEventListener('click', () => {
          const rowId = button.dataset.rowId;
          const videoId = button.dataset.videoId;
          const row = editorRows.find((item) => item.id === rowId || item.rowId === rowId);
          const action = resolveVideoSelectorOpenAction({
            row,
            video: {
              id: videoId,
              src: button.dataset.videoSrc || '',
              durationSeconds: Number(button.dataset.videoDuration || 0),
            },
          });
          if (!action.ok) {
            showToast?.(action.toastMessage);
            return;
          }
          project._selectedEditorRowId = rowId;
          project._editorEffectTab = 'videos';
          project._videoSelector = action.selector;
          renderSelectedVideoProject?.();
        });
      });

      el.videoProjectDetail.querySelectorAll('[data-action="cancel-video-selector"]').forEach((button) => {
        button.addEventListener('click', () => {
          project._videoSelector = null;
          renderSelectedVideoProject?.();
        });
      });

      el.videoProjectDetail.querySelectorAll('[data-video-selector-modal]').forEach((modal) => {
        const sourceInSeconds = Number(modal.querySelector('[data-video-selector-window]')?.dataset.sourceIn || 0);
        syncVideoSelectorPreviewLayers({ modal, sourceInSeconds, playing: false });
        const toggle = modal.querySelector('[data-action="toggle-video-selector-preview"]');
        toggle?.addEventListener('click', () => {
          const playing = modal.dataset.previewPlaying !== 'true';
          modal.dataset.previewPlaying = playing ? 'true' : 'false';
          updateVideoSelectorPreviewToggle(toggle, playing);
          const nextSourceInSeconds = Number(modal.querySelector('[data-video-selector-window]')?.dataset.sourceIn || 0);
          syncVideoSelectorPreviewLayers({ modal, sourceInSeconds: nextSourceInSeconds, playing });
        });
      });

      el.videoProjectDetail.querySelector('[data-video-selector-window]')?.addEventListener('pointerdown', (ev) => {
        const selectorWindow = ev.currentTarget;
        const modal = selectorWindow.closest('[data-video-selector-modal]');
        const timeline = modal?.querySelector('[data-video-selector-timeline]');
        if (!modal || !timeline) return;
        ev.preventDefault();
        selectorWindow.setPointerCapture?.(ev.pointerId);
        const move = (moveEvent) => {
          const rect = timeline.getBoundingClientRect();
          if (!rect.width) return;
          const pct = Math.max(0, Math.min((moveEvent.clientX - rect.left) / rect.width, 1));
          const sourceDurationSeconds = Number(timeline.dataset.sourceDuration || 0);
          const targetDurationSeconds = Number(timeline.dataset.targetDuration || 0);
          const requestedSourceInSeconds = pct * sourceDurationSeconds;
          const nextWindow = resolveVideoSegmentSelectionWindow({ sourceDurationSeconds, targetDurationSeconds, requestedSourceInSeconds });
          const windowLeftPercent = sourceDurationSeconds > 0 ? Math.round((nextWindow.sourceInSeconds / sourceDurationSeconds) * 100000) / 1000 : 0;
          const windowWidthPercent = sourceDurationSeconds > 0 ? Math.round((nextWindow.durationSeconds / sourceDurationSeconds) * 100000) / 1000 : 0;
          project._videoSelector = { videoId: modal.dataset.videoId, ...nextWindow, windowLeftPercent, windowWidthPercent };
          selectorWindow.dataset.sourceIn = nextWindow.sourceInSeconds.toString();
          selectorWindow.dataset.sourceOut = nextWindow.sourceOutSeconds.toString();
          selectorWindow.style.setProperty('--window-left', `${windowLeftPercent}%`);
          selectorWindow.style.setProperty('--window-width', `${windowWidthPercent}%`);
          modal.querySelector('[data-action="commit-video-segment"]')?.setAttribute('data-source-in', nextWindow.sourceInSeconds.toString());
          syncVideoSelectorPreviewLayers({ modal, sourceInSeconds: nextWindow.sourceInSeconds, playing: modal.dataset.previewPlaying === 'true' });
        };
        const up = (upEvent) => {
          selectorWindow.releasePointerCapture?.(upEvent.pointerId);
          selectorWindow.removeEventListener('pointermove', move);
          selectorWindow.removeEventListener('pointerup', up);
          selectorWindow.removeEventListener('pointercancel', up);
          renderSelectedVideoProject?.();
        };
        selectorWindow.addEventListener('pointermove', move);
        selectorWindow.addEventListener('pointerup', up);
        selectorWindow.addEventListener('pointercancel', up);
      });

      el.videoProjectDetail.querySelectorAll('[data-action="commit-video-segment"]').forEach((button) => {
        button.addEventListener('click', async () => {
          const rowId = button.dataset.rowId;
          const videoId = button.dataset.videoId;
          const video = findProjectVideoAsset(project, videoId);
          project._videoSelector = null;
          await assignVideoSegmentToRow?.(rowId, video, Number(button.dataset.sourceIn || 0));
          updateSelectedVideoProjectCompositionPreview?.({ project });
          renderSelectedVideoProject?.();
        });
      });

      // Row motion update
      el.videoProjectDetail.querySelectorAll('[data-action="update-row-motion"]').forEach((control) => {
        const eventName = control.tagName === 'SELECT' ? 'change' : 'click';
        control.addEventListener(eventName, () => {
          const rowId = control.dataset.rowId;
          if (!rowId) return;
          const preset = findMotionPreset(control.value);
          updateRow?.(rowId, { motionPresetId: preset?.name || control.value, motion: preset ? { ...preset } : control.value });
        });
      });

      el.videoProjectDetail.querySelectorAll('[data-action="seek-motion-keyframe"]').forEach((button) => {
        button.addEventListener('click', () => {
          const rowId = button.dataset.rowId;
          const seekTime = Number(button.dataset.seekTime || 0);
          if (rowId) project._selectedEditorRowId = rowId;
          if (Number.isFinite(seekTime)) {
            project._previewSeekTime = seekTime;
            if (_compositionRenderer) {
              _compositionRenderer.seek(seekTime);
              updatePreviewTimeline(seekTime, _compositionRenderer.duration);
            } else if (previewVideo) {
              previewVideo.currentTime = seekTime;
              updatePreviewTimeline(seekTime, previewVideo.duration);
            }
          }
        });
      });

      el.videoProjectDetail.querySelectorAll('[data-action="update-row-motion-keyframe"]').forEach((input) => {
        const updateManualMotionKeyframe = () => {
          const panel = input.closest('[data-motion-manual]');
          const rowId = panel?.dataset.rowId || '';
          if (!rowId) return;
          const readField = (field, fallback = 0) => {
            const value = Number(panel.querySelector(`[data-motion-field="${field}"]`)?.value);
            return Number.isFinite(value) ? value : fallback;
          };
          const motionPresetId = panel.dataset.motionPreset || 'custom';
          const motion = {
            name: motionPresetId,
            presetName: motionPresetId,
            fromX: readField('fromX'),
            fromY: readField('fromY'),
            toX: readField('toX'),
            toY: readField('toY'),
            fromScale: Math.max(0.1, readField('fromScalePercent', 100) / 100),
            toScale: Math.max(0.1, readField('toScalePercent', 100) / 100),
            easing: 'linear',
          };
          updateRow?.(rowId, { motionPresetId, motion, manualMotionDraft: true });
        };
        input.addEventListener('input', updateManualMotionKeyframe);
        input.addEventListener('change', updateManualMotionKeyframe);
        hydrateMotionScrubberInput(input);
      });

      // Row dust update
      el.videoProjectDetail.querySelectorAll('[data-action="update-row-dust"]').forEach((select) => {
        select.addEventListener('change', () => {
          const rowId = select.dataset.rowId;
          if (!rowId) return;
          updateRow?.(rowId, { dust: { enabled: select.value !== 'none', type: select.value === 'none' ? 'dust-1' : select.value } });
        });
      });

      // Row logo update
      el.videoProjectDetail.querySelectorAll('[data-action="update-row-logo"]').forEach((select) => {
        select.addEventListener('change', () => {
          const rowId = select.dataset.rowId;
          if (!rowId) return;
          updateRow?.(rowId, { logo: { enabled: select.value === 'true' } });
        });
      });

      // Brand channel update
      el.videoProjectDetail.querySelectorAll('[data-action="update-brand-channel"]').forEach((select) => {
        select.addEventListener('change', () => {
          updateBrandChannel?.(select.value);
        });
      });

      // Global audio updates
      el.videoProjectDetail.querySelectorAll('[data-action="update-global-audio"]').forEach((input) => {
        const updateRangePreview = () => {
          const value = Number(input.value);
          const percent = Math.round(value * 100);
          input.style.setProperty('--range-progress', `${percent}%`);
          const label = input.closest('.video-editor-control')?.querySelector(`[data-audio-volume-label="${input.dataset.audioKind}"]`);
          if (label) label.textContent = `${percent}%`;
        };

        if (input.dataset.field === 'volume') {
          input.addEventListener('input', updateRangePreview);
        }

        input.addEventListener('change', () => {
          const kind = input.dataset.audioKind;
          const field = input.dataset.field;
          if (!kind || !field) return;
          const patch = {};
          if (field === 'volume') {
            patch.volume = Number(input.value);
            updateRangePreview();
          }
          if (field === 'muted') patch.muted = input.checked;
          updateGlobalAudio?.(kind, patch);
        });
      });

      // Export final
      el.videoProjectDetail.querySelector('[data-action="export-final"]')?.addEventListener('click', () => {
        exportFinal?.();
      });
    }
  }
}
