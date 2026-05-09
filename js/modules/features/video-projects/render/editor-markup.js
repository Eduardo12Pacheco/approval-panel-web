import { escapeHtmlCore } from '../../../core/ui/escape-html.js';
import {
  buildEditorDetailRailViewModel,
  buildEditorRowsTableViewModel,
  buildPreviewTimelineViewModel,
} from './editor-view-model.js';

export function buildPreviewTimeline(rows = [], selectedRowId = null) {
  if (!rows.length) return '';
  const timeline = buildPreviewTimelineViewModel(rows, selectedRowId);
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
            <th>Cambiar</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows.map(({ row, index, isSelected, selectedClass, uploadingThisRow, imageUrl, startTimeValue, startTimeLabel, endTimeLabel, phrase, thumbAlt, uploadLabel }) => {
            return `
              <tr class="video-editor-row ${selectedClass}" data-row-id="${escapeHtmlCore(row.id)}" data-start-time="${escapeHtmlCore(startTimeValue)}" data-index="${index}" role="button" tabindex="0" aria-selected="${isSelected}">
                <td class="video-editor-row__time"><span class="video-editor-row__time-start">${escapeHtmlCore(startTimeLabel)}</span><span class="video-editor-row__time-end">${escapeHtmlCore(endTimeLabel)}</span></td>
                <td class="video-editor-row__phrase">${escapeHtmlCore(phrase)}</td>
                <td class="video-editor-row__image">
                  ${imageUrl
                    ? `<img class="video-editor-row__thumb" src="${escapeHtmlCore(imageUrl)}" alt="${escapeHtmlCore(thumbAlt)}" loading="lazy" />`
                    : '<span class="video-editor-row__thumb video-editor-row__thumb--missing">Sin foto</span>'}
                </td>
                <td class="video-editor-row__actions">
                  <label class="video-editor-row__upload-label">
                    <input type="file" accept="image/jpeg,image/png,image/webp" data-action="upload-row-image" data-row-id="${escapeHtmlCore(row.id)}" ${uploadingThisRow ? 'disabled' : ''} />
                    <span>${uploadLabel}</span>
                  </label>
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
  const { voice, music, detailImageUrl } = detail;

  const rowControls = row
    ? `
      <div class="video-editor-detail__section">
        <span class="video-projects-eyebrow">Detalles de efectos</span>
        <strong>${escapeHtmlCore(detail.phraseLabel)}</strong>
        <p class="video-editor-detail__time">${escapeHtmlCore(detail.timeLabel)}</p>
        <div class="video-editor-detail__asset-row">
          ${detailImageUrl
            ? `<img class="video-editor-detail__thumb" src="${escapeHtmlCore(detailImageUrl)}" alt="Imagen seleccionada" loading="lazy" />`
            : `<span class="video-editor-row__image-tag video-editor-row__image-tag--missing">${escapeHtmlCore(detail.missingAssetLabel)}</span>`}
          <label class="video-editor-row__upload-label video-editor-row__upload-label--detail">
            <input type="file" accept="image/jpeg,image/png,image/webp" data-action="upload-row-image" data-row-id="${escapeHtmlCore(row.id)}" />
            <span>Cambiar imagen</span>
          </label>
        </div>
        <div class="video-editor-control">
          <label>Movimiento</label>
          <select data-action="update-row-motion" data-row-id="${escapeHtmlCore(row.id)}">
            <option value="slow-zoom-in" ${detail.motion === 'slow-zoom-in' ? 'selected' : ''}>Slow zoom in</option>
            <option value="slow-zoom-out" ${detail.motion === 'slow-zoom-out' ? 'selected' : ''}>Slow zoom out</option>
            <option value="pan-left" ${detail.motion === 'pan-left' ? 'selected' : ''}>Pan left</option>
            <option value="pan-right" ${detail.motion === 'pan-right' ? 'selected' : ''}>Pan right</option>
            <option value="none" ${detail.motion === 'none' ? 'selected' : ''}>Ninguno</option>
          </select>
        </div>
        <div class="video-editor-control">
          <label>Polvo</label>
          <select data-action="update-row-dust" data-row-id="${escapeHtmlCore(row.id)}">
            <option value="true" ${detail.dustEnabled ? 'selected' : ''}>Activado</option>
            <option value="false" ${!detail.dustEnabled ? 'selected' : ''}>Desactivado</option>
          </select>
        </div>
        <div class="video-editor-control">
          <label>Logo</label>
          <select data-action="update-row-logo" data-row-id="${escapeHtmlCore(row.id)}">
            <option value="true" ${detail.logoEnabled ? 'selected' : ''}>Activado</option>
            <option value="false" ${!detail.logoEnabled ? 'selected' : ''}>Desactivado</option>
          </select>
        </div>
      </div>
    `
    : `
      <div class="video-editor-detail__section">
        <span class="video-projects-eyebrow">Detalles de efectos</span>
        <p class="video-projects-empty">Seleccioná una fila de la tabla para editar imagen, movimiento, polvo y logo.</p>
      </div>
    `;

  return `
    <div class="video-editor-detail">
      ${rowControls}
      <div class="video-editor-detail__section">
        <span class="video-projects-eyebrow">Audio global</span>
        <div class="video-editor-control">
          <label>Volumen voz · ${detail.voiceVolumePercent}%</label>
          <input type="range" min="0" max="1" step="0.05" data-action="update-global-audio" data-audio-kind="voice" data-field="volume" value="${detail.voiceVolumeValue}" />
          <label class="video-editor-check">
            <input type="checkbox" data-action="update-global-audio" data-audio-kind="voice" data-field="muted" ${voice.muted ? 'checked' : ''} />
            Mute voz
          </label>
        </div>
        <div class="video-editor-control">
          <label>Volumen música · ${detail.musicVolumePercent}%</label>
          <input type="range" min="0" max="1" step="0.05" data-action="update-global-audio" data-audio-kind="music" data-field="volume" value="${detail.musicVolumeValue}" />
          <label class="video-editor-check">
            <input type="checkbox" data-action="update-global-audio" data-audio-kind="music" data-field="muted" ${music.muted ? 'checked' : ''} />
            Mute música
          </label>
        </div>
      </div>
    </div>
  `;
}
