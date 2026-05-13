import { escapeHtmlCore } from '../../../core/ui/escape-html.js';

const MAX_PREVIEW_OFFSET = 30;
const MOTION_OFFSET_DIVISOR = 18;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeOffset(value) {
  return clamp(Number(value || 0) / MOTION_OFFSET_DIVISOR, -MAX_PREVIEW_OFFSET, MAX_PREVIEW_OFFSET);
}

function normalizeViewportOffset(value) {
  return normalizeOffset(-Number(value || 0));
}

function normalizeViewportScale(scale = 1, sourceScaleBase = 1) {
  const sourceScale = Number(sourceScaleBase || 1) * Number(scale || 1);
  return clamp(1 / Math.max(sourceScale, 0.01), 0.34, 1.18);
}

function formatPresetLabel(name = '') {
  return name
    .toString()
    .replaceAll('-', ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildMotionViewportPreviewStyle(preset = {}) {
  const sourceScaleBase = Number(preset.sourceScaleBase || 1);
  const fromScale = normalizeViewportScale(preset.fromScale, sourceScaleBase);
  const toScale = normalizeViewportScale(preset.toScale, sourceScaleBase);
  const vars = {
    '--motion-from-x': `${normalizeViewportOffset(preset.fromX).toFixed(2)}px`,
    '--motion-to-x': `${normalizeViewportOffset(preset.toX).toFixed(2)}px`,
    '--motion-from-y': `${normalizeViewportOffset(preset.fromY).toFixed(2)}px`,
    '--motion-to-y': `${normalizeViewportOffset(preset.toY).toFixed(2)}px`,
    '--motion-from-scale': fromScale.toFixed(3),
    '--motion-to-scale': toScale.toFixed(3),
    '--motion-easing': (preset.easing || 'linear').toString(),
  };

  return Object.entries(vars)
    .map(([name, value]) => `${name}:${escapeHtmlCore(value)};`)
    .join('');
}

export function buildMotionPicker({ rowId = '', selectedMotion = '', motionPresetGroups = [] } = {}) {
  if (!rowId || !motionPresetGroups.length) return '';
  const escapedRowId = escapeHtmlCore(rowId);

  return `
    <div class="video-motion-picker" role="group" aria-label="Movimiento">
      ${motionPresetGroups.map((group) => `
        <section class="video-motion-picker__group" aria-label="${escapeHtmlCore(group.category)}">
          <h4>${escapeHtmlCore(group.category)}</h4>
          <div class="video-motion-picker__grid">
            ${group.presets.map((preset) => {
              const isSelected = selectedMotion === preset.name;
              const label = formatPresetLabel(preset.name);
              return `
                <button
                  class="video-motion-card ${isSelected ? 'is-selected' : ''}"
                  type="button"
                  aria-pressed="${isSelected}"
                  aria-label="Movimiento ${escapeHtmlCore(label)}"
                  data-action="update-row-motion"
                  data-row-id="${escapedRowId}"
                  value="${escapeHtmlCore(preset.name)}"
                  style="${buildMotionViewportPreviewStyle(preset)}"
                >
                  <span class="video-motion-card__check" aria-hidden="true">✓</span>
                  <span class="video-motion-card__viewport" aria-hidden="true">
                    <span class="video-motion-card__image">
                      <span class="video-motion-card__grid-lines"></span>
                    </span>
                    <span class="video-motion-card__motion-box"></span>
                  </span>
                  <span class="video-motion-card__name">${escapeHtmlCore(label)}</span>
                </button>
              `;
            }).join('')}
          </div>
        </section>
      `).join('')}
    </div>
  `;
}
