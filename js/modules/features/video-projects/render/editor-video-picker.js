import { escapeHtmlCore } from '../../../core/ui/escape-html.js';
import { formatSeconds } from '../domain/formatters.js';

const SHORT_SOURCE_REASON = 'El video es más corto que la frase seleccionada.';
const SHORT_SOURCE_TOAST = 'Video demasiado corto para esta frase';

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function roundSeconds(value) {
  return Math.round(finiteNumber(value, 0) * 1000) / 1000;
}

export function resolveVideoSegmentSelectionWindow({ sourceDurationSeconds = 0, targetDurationSeconds = 0, requestedSourceInSeconds = 0 } = {}) {
  const sourceDuration = Math.max(0, finiteNumber(sourceDurationSeconds, 0));
  const targetDuration = Math.max(0, finiteNumber(targetDurationSeconds, 0));
  const maxSourceIn = Math.max(0, sourceDuration - targetDuration);
  const sourceInSeconds = roundSeconds(Math.max(0, Math.min(finiteNumber(requestedSourceInSeconds, 0), maxSourceIn)));
  const durationSeconds = roundSeconds(targetDuration);
  const sourceOutSeconds = roundSeconds(sourceInSeconds + durationSeconds);
  const ok = targetDuration > 0 && sourceDuration >= targetDuration;
  return {
    ok,
    sourceInSeconds,
    durationSeconds,
    sourceOutSeconds,
    canResize: false,
    reason: ok ? '' : SHORT_SOURCE_REASON,
  };
}

function resolveRowDuration(row = {}) {
  const start = finiteNumber(row.startTime, 0);
  const end = finiteNumber(row.effectiveEndTime ?? row.endTime, start);
  return Math.max(0, end - start);
}

function normalizeVideoAsset(video = {}, index = 0) {
  const id = (video.id || video.assetId || video.storage_public_url || video.public_url || video.src || `video-${index + 1}`).toString();
  const src = (video.src || video.previewUrl || video.public_url || video.storage_public_url || video.url || '').toString();
  return {
    id,
    src,
    title: (video.title || video.name || video.file_name || `Video ${index + 1}`).toString(),
    durationSeconds: finiteNumber(video.durationSeconds ?? video.duration_seconds, 0),
    sizeLabel: video.sizeLabel || (Number(video.file_size || video.size || 0) > 0 ? `${(Number(video.file_size || video.size) / 1024 / 1024).toFixed(1)} MB` : ''),
  };
}

export function resolveVideoSelectorOpenAction({ row = {}, video = {}, requestedSourceInSeconds = 0 } = {}) {
  const videoId = (video.id || video.assetId || video.storage_public_url || video.public_url || video.src || '').toString();
  const sourceDurationSeconds = Math.max(0, finiteNumber(video.durationSeconds ?? video.duration_seconds, 0));
  const window = resolveVideoSegmentSelectionWindow({
    sourceDurationSeconds,
    targetDurationSeconds: resolveRowDuration(row),
    requestedSourceInSeconds,
  });

  if (!window.ok) {
    return { ok: false, selector: null, toastMessage: SHORT_SOURCE_TOAST };
  }

  return {
    ok: true,
    selector: {
      videoId,
      ...window,
      windowLeftPercent: sourceDurationSeconds > 0 ? roundSeconds((window.sourceInSeconds / sourceDurationSeconds) * 100) : 0,
      windowWidthPercent: sourceDurationSeconds > 0 ? roundSeconds((window.durationSeconds / sourceDurationSeconds) * 100) : 0,
    },
    toastMessage: '',
  };
}

function buildSelectorModal({ rowId, selectedVideo, window }) {
  const sourceDuration = Math.max(0, finiteNumber(selectedVideo.durationSeconds, 0));
  const left = Number.isFinite(Number(window.windowLeftPercent)) ? finiteNumber(window.windowLeftPercent, 0) : (sourceDuration > 0 ? roundSeconds((finiteNumber(window.sourceInSeconds, 0) / sourceDuration) * 100) : 0);
  const width = Number.isFinite(Number(window.windowWidthPercent)) ? finiteNumber(window.windowWidthPercent, 0) : (sourceDuration > 0 ? roundSeconds((finiteNumber(window.durationSeconds, 0) / sourceDuration) * 100) : 0);

  return `
    <div class="video-editor-video-selector__backdrop" data-video-selector-backdrop></div>
    <section class="video-editor-video-selector" role="dialog" aria-modal="true" aria-label="Selector fijo de video" data-video-selector-modal data-row-id="${escapeHtmlCore(rowId)}" data-video-id="${escapeHtmlCore(selectedVideo.id)}">
      <div class="video-editor-video-selector__preview" data-video-selector-composition-preview aria-label="Preview de composición">
        <video class="video-editor-video-selector__layer video-editor-video-selector__layer--background" data-layer="background-video" src="${escapeHtmlCore(selectedVideo.src)}" muted playsinline preload="metadata"></video>
        <span class="video-editor-video-selector__layer video-editor-video-selector__layer--overlay" data-layer="color-overlay"></span>
        <span class="video-editor-video-selector__layer video-editor-video-selector__layer--effect video-editor-video-selector__layer--effect-01" data-layer="effect-layer-01">effect-layer-01 · screen</span>
        <span class="video-editor-video-selector__layer video-editor-video-selector__layer--effect video-editor-video-selector__layer--effect-02" data-layer="effect-layer-02">effect-layer-02 · multiply</span>
        <video class="video-editor-video-selector__layer video-editor-video-selector__layer--foreground" data-layer="foreground-video" src="${escapeHtmlCore(selectedVideo.src)}" muted playsinline preload="metadata"></video>
      </div>
      <div class="video-editor-video-selector__meta">
        <strong>${escapeHtmlCore(selectedVideo.title)}</strong>
        <span>Fuente total: ${escapeHtmlCore(formatSeconds(sourceDuration))}</span>
      </div>
      <div class="video-editor-video-selector__timeline" data-video-selector-timeline data-source-duration="${escapeHtmlCore(sourceDuration.toString())}" data-target-duration="${escapeHtmlCore(window.durationSeconds.toString())}">
        <span class="video-editor-video-selector__timeline-track" aria-hidden="true"></span>
        <span class="video-editor-video-selector__window" data-video-selector-window data-source-in="${escapeHtmlCore(window.sourceInSeconds.toString())}" data-source-out="${escapeHtmlCore(window.sourceOutSeconds.toString())}" style="--window-left:${escapeHtmlCore(left.toString())}%;--window-width:${escapeHtmlCore(width.toString())}%;"></span>
      </div>
      <p class="video-editor-video-selector__range">Duración fija: ${escapeHtmlCore(window.durationSeconds.toFixed(2))}s · ${escapeHtmlCore(window.sourceInSeconds.toFixed(2))}s → ${escapeHtmlCore(window.sourceOutSeconds.toFixed(2))}s</p>
      <div class="video-editor-video-selector__actions">
        <button type="button" class="video-editor-video-selector__button" data-action="cancel-video-selector">Cancelar</button>
        <button type="button" class="video-editor-video-selector__button video-editor-video-selector__button--accept" data-action="commit-video-segment" data-row-id="${escapeHtmlCore(rowId)}" data-video-id="${escapeHtmlCore(selectedVideo.id)}" data-source-in="${escapeHtmlCore(window.sourceInSeconds.toString())}">Aceptar</button>
      </div>
    </section>
  `;
}

export function buildEditorVideoPicker({ row = null, videos = [], selector = null, uploading = false } = {}) {
  const rowId = row?.id || '';
  const targetDuration = resolveRowDuration(row);
  const normalizedVideos = Array.isArray(videos) ? videos.map(normalizeVideoAsset) : [];
  const selectedVideo = selector ? normalizedVideos.find((video) => video.id === selector?.videoId) || null : null;
  const window = selector && selectedVideo
    ? { ...resolveVideoSegmentSelectionWindow({ sourceDurationSeconds: selectedVideo.durationSeconds, targetDurationSeconds: targetDuration, requestedSourceInSeconds: selector.sourceInSeconds }), ...selector }
    : null;
  const durationLabel = formatSeconds(targetDuration);

  if (!row) {
    return '<p class="video-projects-empty">Seleccioná una fila para cambiarla a video.</p>';
  }

  return `
    <div class="video-editor-video-picker" data-row-id="${escapeHtmlCore(rowId)}" data-target-duration="${escapeHtmlCore(targetDuration.toString())}">
      <div class="video-editor-video-picker__header">
        <div>
          <h4>Videos</h4>
          <p>La ventana queda fija en ${escapeHtmlCore(durationLabel)}: solo se arrastra, no se redimensiona.</p>
        </div>
        <label class="video-editor-video-picker__upload">
          <input type="file" accept="video/mp4,video/webm,video/quicktime,video/x-m4v" data-action="upload-row-video" data-row-id="${escapeHtmlCore(rowId)}" ${uploading ? 'disabled' : ''} />
          <span>${uploading ? 'Subiendo…' : 'Subir video'}</span>
        </label>
      </div>
      ${normalizedVideos.length
        ? `<div class="video-editor-video-library" aria-label="Biblioteca de videos">
            ${normalizedVideos.map((video) => `
              <button class="video-editor-video-card" type="button" data-action="open-video-selector" data-row-id="${escapeHtmlCore(rowId)}" data-video-id="${escapeHtmlCore(video.id)}" data-video-src="${escapeHtmlCore(video.src)}" data-video-duration="${escapeHtmlCore(video.durationSeconds.toString())}">
                <span class="video-editor-video-card__media">
                  ${video.src
                    ? `<video src="${escapeHtmlCore(video.src)}" muted playsinline preload="metadata"></video>`
                    : '<span>Sin preview</span>'}
                </span>
                <div class="video-editor-video-card__copy">
                  <strong>${escapeHtmlCore(video.title)}</strong>
                  <span>${escapeHtmlCore(formatSeconds(video.durationSeconds))}${video.sizeLabel ? ` · ${escapeHtmlCore(video.sizeLabel)}` : ''}</span>
                </div>
              </button>
            `).join('')}
          </div>`
        : '<p class="video-projects-empty">Todavía no subiste videos para este proyecto.</p>'}
      ${selectedVideo && window?.ok ? buildSelectorModal({ rowId, selectedVideo, window }) : ''}
    </div>
  `;
}
