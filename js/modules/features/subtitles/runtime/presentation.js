import {
  buildSubtitleCueMarkersRuntime,
  buildSubtitlePreviewPresentationRuntime,
  parseSubtitleTimeToMsRuntime,
} from './services.js';

export function buildSubtitleSelectOptionsMarkupRuntime(options = [], selectedValue, { escapeHtml } = {}) {
  const escape = typeof escapeHtml === 'function' ? escapeHtml : (value) => (value ?? '').toString();
  const selected = (selectedValue ?? '').toString();
  return (Array.isArray(options) ? options : []).map((option) => {
    const value = (typeof option === 'object' ? option?.value : option ?? '').toString();
    const label = (typeof option === 'object' ? option?.label : option ?? '').toString();
    return `<option value="${escape(value)}" ${value === selected ? 'selected' : ''}>${escape(label)}</option>`;
  }).join('');
}

export function resolveSubtitleHistoryToneRuntime({ sessionId = '', status = '', item = {}, activeSessionId = '' } = {}) {
  if (sessionId && sessionId === activeSessionId) return 'active';
  const normalizedStatus = status.toString().trim().toLowerCase();
  if (item?.download?.ready || ['succeeded', 'completed', 'complete', 'done', 'finished'].includes(normalizedStatus)) return 'done';
  return 'editing';
}

export function buildSubtitleSessionHistoryMarkupRuntime({ items = [], activeSessionId = '', escapeHtml } = {}) {
  const escape = typeof escapeHtml === 'function' ? escapeHtml : (value) => (value ?? '').toString();
  const sessions = Array.isArray(items) ? items : [];
  if (!sessions.length) return '<p class="meta">Todavía no hay sesiones remotas.</p>';
  return sessions.map((item) => {
    const sessionId = (item?.id || '').toString();
    const status = (item?.status || 'unknown').toString();
    const tone = resolveSubtitleHistoryToneRuntime({ sessionId, status, item, activeSessionId });
    return `
    <article class="subtitle-history-item subtitle-history-item--${tone}" aria-current="${tone === 'active' ? 'true' : 'false'}">
      <button type="button" class="secondary subtitle-history-item__resume" data-action="resume-subtitle-session" data-session-id="${escape(sessionId)}">
        <span class="subtitle-history-item__id">${escape(sessionId)}</span>
        <span class="subtitle-history-item__status">${escape(status)}</span>
      </button>
      <button type="button" class="subtitle-history-item__delete" aria-label="Eliminar proyecto" data-action="delete-subtitle-session" data-session-id="${escape(sessionId)}">×</button>
    </article>
  `;
  }).join('');
}

export function buildSubtitleTableRowMarkupRuntime({
  row,
  index = 0,
  sizeOptions = [],
  fontOptions = [],
  colorOptions = [],
  lastNonDraftRowIndex = -1,
  escapeHtml,
  formatDisplayTime,
  getAlignmentButtonState,
  resolveFontWeight,
} = {}) {
  const escape = typeof escapeHtml === 'function' ? escapeHtml : (value) => (value ?? '').toString();
  const formatTime = typeof formatDisplayTime === 'function' ? formatDisplayTime : (value) => value;
  const resolveWeight = typeof resolveFontWeight === 'function' ? resolveFontWeight : () => 'normal';
  const alignment = typeof getAlignmentButtonState === 'function'
    ? getAlignmentButtonState(row?.align)
    : {
      left: { className: '', selected: false },
      center: { className: '', selected: false },
      right: { className: '', selected: false },
    };
  const canDelete = index > 0;
  const isDraft = Boolean(row?.isDraft);
  const isLastTimedRow = index === lastNonDraftRowIndex;
  return `
      <tr data-row-id="${row.id}" data-draft="${isDraft ? 'true' : 'false'}" class="${isDraft ? 'subtitle-row--draft' : ''}" ${isDraft ? 'draggable="true"' : ''}>
        <td>
          <div class="subtitle-time-range" aria-label="Rango de tiempo">
            <div class="subtitle-time-row">
              <input type="text" data-row-id="${row.id}" data-field="start" aria-label="Start" placeholder="sin tiempo" value="${isDraft ? '' : escape(formatTime(row.start))}" ${isDraft ? 'disabled' : ''} />
              <div class="subtitle-time-nudge" aria-label="Ajustar Start">
                <button type="button" data-action="nudge-subtitle-time" data-row-id="${row.id}" data-field="start" data-direction="up" aria-label="Subir Start 00:00.10" ${isDraft || index === 0 ? 'disabled' : ''}>⌃</button>
              </div>
            </div>
            <span class="subtitle-time-range__line" aria-hidden="true"></span>
            <div class="subtitle-time-row">
              <input type="text" data-row-id="${row.id}" data-field="end" aria-label="End" placeholder="arrastrá" value="${isDraft ? '' : escape(formatTime(row.end))}" ${isDraft ? 'disabled' : ''} />
              <div class="subtitle-time-nudge" aria-label="Ajustar End">
                <button type="button" data-action="nudge-subtitle-time" data-row-id="${row.id}" data-field="end" data-direction="down" aria-label="Bajar End 00:00.10" ${isDraft || isLastTimedRow ? 'disabled' : ''}>⌄</button>
              </div>
            </div>
          </div>
        </td>
        <td><textarea data-row-id="${row.id}" data-field="phrase" style="font-family:${escape(row.fontFamily)};font-weight:${escape(row.fontWeight || resolveWeight(row.fontFamily))};">${escape(row.phrase)}</textarea></td>
        <td><select data-row-id="${row.id}" data-field="size">${buildSubtitleSelectOptionsMarkupRuntime(sizeOptions, row.size, { escapeHtml: escape })}</select></td>
        <td><input type="number" min="1" step="10" data-row-id="${row.id}" data-field="maxWidthPx" value="${escape(String(row.maxWidthPx || 1080))}" /></td>
        <td><select data-row-id="${row.id}" data-field="fontFamily">${buildSubtitleSelectOptionsMarkupRuntime(fontOptions, row.fontFamily, { escapeHtml: escape })}</select></td>
        <td><select data-row-id="${row.id}" data-field="color">${buildSubtitleSelectOptionsMarkupRuntime(colorOptions, row.color, { escapeHtml: escape })}</select></td>
        <td>
          <div class="subtitle-align-group subtitle-align-group--compact">
            <button type="button" data-row-id="${row.id}" data-field="align" data-align="left" class="${alignment.left.className}" aria-label="Alinear izquierda" aria-pressed="${alignment.left.selected}">I</button>
            <button type="button" data-row-id="${row.id}" data-field="align" data-align="center" class="${alignment.center.className}" aria-label="Alinear centro" aria-pressed="${alignment.center.selected}">C</button>
            <button type="button" data-row-id="${row.id}" data-field="align" data-align="right" class="${alignment.right.className}" aria-label="Alinear derecha" aria-pressed="${alignment.right.selected}">D</button>
          </div>
        </td>
        <td>
          <button type="button" class="subtitle-row-delete" data-action="delete-subtitle-row" data-row-id="${row.id}" aria-label="Eliminar frase" ${canDelete ? '' : 'disabled'}>×</button>
        </td>
      </tr>
    `;
}

export function buildSubtitlesTableRowsMarkupRuntime({ rows = [], lastNonDraftRowIndex = -1, ...deps } = {}) {
  return (Array.isArray(rows) ? rows : []).map((row, index) => buildSubtitleTableRowMarkupRuntime({
    ...deps,
    row,
    index,
    lastNonDraftRowIndex,
  })).join('');
}

export function normalizeSubtitleMetaValueRuntime(value) {
  if (value == null) return '—';
  const text = value.toString().trim();
  return text || '—';
}

export function hasSubtitleDraftRowsRuntime(rows = []) {
  return (Array.isArray(rows) ? rows : []).some((row) => Boolean(row?.isDraft));
}

export function getLastSubtitleNonDraftRowIndexRuntime(rows = []) {
  const list = Array.isArray(rows) ? rows : [];
  for (let index = list.length - 1; index >= 0; index -= 1) {
    if (!list[index]?.isDraft) return index;
  }
  return -1;
}

export function resolveSubtitlePreviewDurationMsRuntime({ audioDurationMs = 0, rows = [] } = {}) {
  const declared = Math.max(0, Number(audioDurationMs || 0));
  const rowsMax = (Array.isArray(rows) ? rows : []).reduce((max, row) => {
    const endMs = parseSubtitleTimeToMsRuntime(row?.end);
    return Number.isFinite(endMs) ? Math.max(max, endMs) : max;
  }, 0);
  return Math.max(declared, rowsMax);
}

export function buildSubtitlePreviewTimelineMarkupRuntime({ rows = [], durationMs = 0, currentMs = 0 } = {}) {
  const cueRatios = buildSubtitleCueMarkersRuntime(rows, durationMs);
  const presentation = buildSubtitlePreviewPresentationRuntime({
    currentMs,
    durationMs,
  });
  const markers = cueRatios.map((ratio) => `<div class="subtitle-preview-timeline-cue" style="left:${ratio * 100}%"></div>`).join('');
  return `${markers}<div id="subtitle2PreviewPlayhead" class="subtitle-preview-playhead" style="left:${presentation.playheadPercent}%"></div>`;
}
