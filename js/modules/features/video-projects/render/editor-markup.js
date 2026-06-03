import { escapeHtmlCore } from '../../../core/ui/escape-html.js';
import {
  buildEditorDetailRailViewModel,
  buildEditorRowsTableViewModel,
  buildPreviewTimelineViewModel,
} from './editor-view-model.js';
import { buildEditorEffectTabs } from './editor-effect-tabs.js';

export function buildPreviewTimeline(rows = [], selectedRowId = null, { totalDurationSeconds } = {}) {
  if (!rows.length) return '';
  const timeline = buildPreviewTimelineViewModel(rows, selectedRowId, { totalDurationSeconds });
  const { totalDuration } = timeline;

  return `
    <div class="video-preview-transport" aria-label="Controles de preview">
      <button class="video-preview-play" type="button" data-action="toggle-preview-play" aria-label="Reproducir preview"><span data-preview-play-icon>▶</span></button>
      <div class="video-preview-timeline" data-preview-scrubber data-duration="${escapeHtmlCore(totalDuration.toString())}" aria-label="Línea de tiempo de cambios de imagen">
        <div class="video-preview-timeline__track">
        <div class="video-preview-timeline__progress" data-preview-progress></div>
        ${timeline.markers.map(({ row, index, start, position, isSelected, title }) => {
          return `
            <span class="video-preview-timeline__marker ${isSelected ? 'is-selected' : ''}" data-row-id="${escapeHtmlCore(row.id)}" data-start-time="${escapeHtmlCore(start.toString())}" style="--pos:${position}%;" title="${escapeHtmlCore(title)}">
              <span>${index + 1}</span>
            </span>
          `;
        }).join('')}
        <div class="video-preview-timeline__playhead" data-preview-playhead></div>
        </div>
      </div>
      <div class="video-preview-timecode" aria-live="polite">
        <span data-preview-current-time>0.00s</span>
        <span class="video-preview-timecode__divider">/</span>
        <span>${escapeHtmlCore(timeline.totalDurationLabel)}</span>
      </div>
    </div>
  `;
}

function buildVideoThumbnailMarkup({ videoSrc = '', detail = false, forceFallback = false } = {}) {
  const cardClass = detail
    ? 'video-editor-row__video-card video-editor-row__video-card--detail'
    : 'video-editor-row__video-card';
  const thumbMarkup = videoSrc && !forceFallback
    ? `<video class="video-editor-row__thumb video-editor-row__thumb--video" src="${escapeHtmlCore(videoSrc)}" muted playsinline preload="metadata"></video>`
    : '<span class="video-editor-row__thumb video-editor-row__thumb--video video-editor-row__thumb--video-fallback" aria-hidden="true">▶</span>';

  return `<span class="${cardClass}">${thumbMarkup}<span class="video-editor-row__video-badge">Video</span></span>`;
}

export function buildEditorRowsTable(rows = [], { selectedRowId, rowImageUploading, project = {} } = {}) {
  if (!rows.length) {
    return '<p class="video-projects-empty">Sin filas cronometradas todavía.</p>';
  }
  const tableRows = buildEditorRowsTableViewModel(rows, { selectedRowId, rowImageUploading, project });

  return `
    <div class="video-editor-table-wrap">
      <table class="video-editor-table">
        <thead>
          <tr>
            <th>Tiempo</th>
            <th>Frase</th>
            <th>Imagen</th>
            <th>Transición</th>
            <th>Cambiar</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows.map(({ row, index, isSelected, selectedClass, imageUrl, imageSwapAssetId, startTimeValue, startTimeLabel, endTimeLabel, phrase, thumbAlt, uploadLabel, mediaKind, videoSrc, boundaryConnector }) => {
            const connectorMarkup = boundaryConnector ? `
              <div class="video-editor-boundary-connector-group" aria-label="Transición entre párrafos">
                ${[
                  ['glitch-1', 'Glitch 1'],
                  ['glitch-2', 'Glitch 2'],
                ].map(([transition, label]) => `
                  <button class="video-editor-boundary-connector ${boundaryConnector.activeTransition === transition ? 'is-active' : ''}" type="button" data-action="set-boundary-transition" data-row-id="${escapeHtmlCore(boundaryConnector.rowId)}" data-next-row-id="${escapeHtmlCore(boundaryConnector.nextRowId)}" data-transition="${escapeHtmlCore(transition)}" aria-pressed="${boundaryConnector.activeTransition === transition ? 'true' : 'false'}" title="Activar ${escapeHtmlCore(label)} entre párrafos">
                    <span>${escapeHtmlCore(label)}</span>
                  </button>
                `).join('')}
                ${boundaryConnector.activeTransition ? `
                  <button class="video-editor-boundary-connector video-editor-boundary-connector--remove" type="button" data-action="set-boundary-transition" data-row-id="${escapeHtmlCore(boundaryConnector.rowId)}" data-next-row-id="${escapeHtmlCore(boundaryConnector.nextRowId)}" data-transition="none" aria-pressed="false" title="Quitar transición entre párrafos">
                    <span>Quitar</span>
                  </button>
                ` : ''}
              </div>
            ` : '<span class="video-editor-boundary-empty" aria-hidden="true">—</span>';
            return `
              <tr class="video-editor-row ${selectedClass}" data-row-id="${escapeHtmlCore(row.id)}" data-start-time="${escapeHtmlCore(startTimeValue)}" data-index="${index}" role="button" tabindex="0" aria-selected="${isSelected}">
                <td class="video-editor-row__time"><span class="video-editor-row__time-start">${escapeHtmlCore(startTimeLabel)}</span><span class="video-editor-row__time-end">${escapeHtmlCore(endTimeLabel)}</span></td>
                <td class="video-editor-row__phrase">${escapeHtmlCore(phrase)}</td>
                <td class="video-editor-row__image">
                  ${mediaKind === 'video-segment'
                    ? buildVideoThumbnailMarkup({ videoSrc })
                    : imageUrl
                    ? `<img class="video-editor-row__thumb video-editor-row__thumb--swap" src="${escapeHtmlCore(imageUrl)}" alt="${escapeHtmlCore(thumbAlt)}" loading="lazy" draggable="true" data-action="swap-row-image" data-row-id="${escapeHtmlCore(row.id)}" data-asset-id="${escapeHtmlCore(imageSwapAssetId)}" />`
                    : '<span class="video-editor-row__thumb video-editor-row__thumb--missing">Sin foto</span>'}
                </td>
                <td class="video-editor-row__transition">${connectorMarkup}</td>
                <td class="video-editor-row__actions">
                  <button class="video-editor-row__upload-label" type="button" data-action="open-assets-tab" data-row-id="${escapeHtmlCore(row.id)}" data-start-time="${escapeHtmlCore(startTimeValue)}" data-content-type-switch="image" data-target-effect-tab="content">
                    <span>${uploadLabel}</span>
                  </button>
                  <button class="video-editor-row__upload-label" type="button" data-action="open-videos-tab" data-row-id="${escapeHtmlCore(row.id)}" data-start-time="${escapeHtmlCore(startTimeValue)}" data-content-type-switch="video" data-target-effect-tab="content">
                    <span>Cambiar a video</span>
                  </button>
                  <button class="video-editor-row__upload-label" type="button" data-action="open-newspaper-tab" data-row-id="${escapeHtmlCore(row.id)}" data-start-time="${escapeHtmlCore(startTimeValue)}" data-content-type-switch="newspaper" data-target-effect-tab="content">
                    <span>Cambiar a periódico</span>
                  </button>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

export function buildEditorDetailRail({ row, globalAudio, project = {}, rowIndex = 0 } = {}) {
  const detail = buildEditorDetailRailViewModel({ row, globalAudio, project, rowIndex });
  const { detailImageUrl } = detail;
  const isVideoSegment = row?.media?.kind === 'video-segment';

  const rowControls = row
    ? `
      <div class="video-editor-detail__section">
        <span class="video-projects-eyebrow">Detalles de efectos</span>
        <div class="video-editor-detail__summary">
          <div class="video-editor-detail__copy">
            <strong>“${escapeHtmlCore(detail.phraseLabel)}”</strong>
            <p class="video-editor-detail__time">${escapeHtmlCore(detail.timeLabel)}</p>
          </div>
          <div class="video-editor-detail__image-card">
            ${isVideoSegment
              ? buildVideoThumbnailMarkup({ detail: true, forceFallback: true })
              : detailImageUrl
              ? `<img class="video-editor-detail__thumb" src="${escapeHtmlCore(detailImageUrl)}" alt="Imagen seleccionada" loading="lazy" />`
              : `<span class="video-editor-row__image-tag video-editor-row__image-tag--missing">${escapeHtmlCore(detail.missingAssetLabel)}</span>`}
          </div>
        </div>
        ${buildEditorEffectTabs({ row, detail, activeTab: detail.activeEffectTab })}
      </div>
    `
    : `
      <div class="video-editor-detail__section">
        <span class="video-projects-eyebrow">Detalles de efectos</span>
        <p class="video-projects-empty">Seleccioná una fila de la tabla para editar imagen, movimiento, polvo y logo.</p>
        ${buildEditorEffectTabs({ row, detail, activeTab: detail.activeEffectTab })}
      </div>
    `;

  return `
    <div class="video-editor-detail">
      ${rowControls}
    </div>
  `;
}
