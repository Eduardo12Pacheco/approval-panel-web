import { escapeHtmlCore } from '../../../core/ui/escape-html.js';

const MAX_PREVIEW_OFFSET = 30;
const MOTION_OFFSET_DIVISOR = 18;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeOffset(value) {
  return clamp(Number(value || 0) / MOTION_OFFSET_DIVISOR, -MAX_PREVIEW_OFFSET, MAX_PREVIEW_OFFSET);
}

function normalizeSourceScale(scale = 1, sourceScaleBase = 1) {
  const sourceScale = Number(sourceScaleBase || 1) * Number(scale || 1);
  return clamp(1 + ((sourceScale - 1) * 0.28), 0.9, 1.7);
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
  const fromImageScale = normalizeSourceScale(preset.fromScale, sourceScaleBase);
  const toImageScale = normalizeSourceScale(preset.toScale, sourceScaleBase);
  const vars = {
    '--motion-image-from-x': `${normalizeOffset(preset.fromX).toFixed(2)}px`,
    '--motion-image-to-x': `${normalizeOffset(preset.toX).toFixed(2)}px`,
    '--motion-image-from-y': `${normalizeOffset(preset.fromY).toFixed(2)}px`,
    '--motion-image-to-y': `${normalizeOffset(preset.toY).toFixed(2)}px`,
    '--motion-image-from-scale': fromImageScale.toFixed(3),
    '--motion-image-to-scale': toImageScale.toFixed(3),
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
