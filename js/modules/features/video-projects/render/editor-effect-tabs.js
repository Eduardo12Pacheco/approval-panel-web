import { escapeHtmlCore } from '../../../core/ui/escape-html.js';
import { convertVideoForegroundTransformToPreview } from '../composition/renderer/video-layers.js';
import { buildEditorAssetsPicker } from './editor-assets-picker.js';
import { buildMotionPicker } from './editor-motion-picker.js';
import { buildEditorVideoPicker } from './editor-video-picker.js';

export const EDITOR_EFFECT_TABS = [
  { id: 'content', label: 'Contenido' },
  { id: 'framing', label: 'Movimiento' },
  { id: 'layers', label: 'Capas' },
  { id: 'audio', label: 'Audio' },
];

const LEGACY_EFFECT_TAB_MAP = {
  assets: 'content',
  videos: 'content',
  motion: 'framing',
  newspaper: 'framing',
  global: 'layers',
};

export function resolveEditorEffectTab(value = '') {
  const tab = value.toString();
  const normalizedTab = LEGACY_EFFECT_TAB_MAP[tab] || tab;
  return EDITOR_EFFECT_TABS.some((item) => item.id === normalizedTab) ? normalizedTab : 'content';
}

export function deriveRowSettingsCapabilities(row = null) {
  const isVideo = row?.media?.kind === 'video-segment';
  const isNewspaper = !isVideo && row?.mediaMode === 'newspaper';

  if (isVideo) {
    return {
      format: 'video',
      content: 'video',
      framing: 'video-window',
      layers: { projectBrand: true, dust: false, logo: false, newspaperLabel: false },
    };
  }

  if (isNewspaper) {
    return {
      format: 'newspaper',
      content: 'image',
      framing: 'newspaper-motion',
      layers: { projectBrand: true, dust: false, logo: true, newspaperLabel: true },
    };
  }

  return {
    format: 'image',
    content: 'image',
    framing: 'image-motion',
    layers: { projectBrand: true, dust: true, logo: true, newspaperLabel: false },
  };
}

function isImageDustRow(row = null) {
  return Boolean(row) && row?.media?.kind !== 'video-segment' && row?.mediaMode !== 'newspaper';
}

function resolveRowDustType(row = null) {
  return row?.dust?.enabled ? (row?.dust?.type || 'dust-1') : 'none';
}

export function resolveDustApplyAllState(row = null, detail = {}) {
  const selectedDustType = detail.dustType || resolveRowDustType(row);
  const imageRows = (Array.isArray(detail.editorRows) ? detail.editorRows : []).filter(isImageDustRow);
  if (!isImageDustRow(row)) return { visible: false, disabled: true, imageRowCount: imageRows.length, selectedDustType };
  const disabled = imageRows.length > 0 && imageRows.every((item) => resolveRowDustType(item) === selectedDustType);
  return { visible: true, disabled, imageRowCount: imageRows.length, selectedDustType };
}

function buildEffectTabsNav(activeTab) {
  return `
    <div class="video-editor-effect-tabs" role="tablist" aria-label="Detalles de efectos">
      ${EDITOR_EFFECT_TABS.map((tab, index) => {
        const isActive = tab.id === activeTab;
        return `
          <button
            class="video-editor-effect-tabs__button ${isActive ? 'is-active' : ''}"
            type="button"
            role="tab"
            id="video-editor-effect-tab-${escapeHtmlCore(tab.id)}"
            aria-selected="${isActive}"
            aria-controls="video-editor-effect-panel-${escapeHtmlCore(tab.id)}"
            tabindex="${isActive ? '0' : '-1'}"
            data-action="switch-effect-tab"
            data-effect-tab="${escapeHtmlCore(tab.id)}"
            style="--tab-index:${index};"
          >${escapeHtmlCore(tab.label)}</button>
        `;
      }).join('')}
    </div>
  `;
}

function buildMotionPanel({ row, detail }) {
  if (!row) {
    return '<p class="video-projects-empty">Seleccioná una fila de la tabla para editar imagen y movimiento.</p>';
  }

  const activeMotionTab = detail.activeMotionEditorTab === 'manual' ? 'manual' : 'presets';

  return `
    <div class="video-editor-control video-editor-control--effect-panel">
      <div class="video-motion-mode">
        <div class="video-motion-mode__hint" aria-label="Guía de movimiento">
          <span class="video-motion-mode__hint-icon" aria-hidden="true">i</span>
          <span>Elegí un preset y ajustá el movimiento si hace falta.</span>
        </div>
        <div class="video-motion-mode__tabs" role="tablist" aria-label="Modo de movimiento">
          <button class="${activeMotionTab === 'presets' ? 'is-active' : ''}" type="button" data-action="switch-motion-editor-tab" data-motion-editor-tab="presets" aria-selected="${activeMotionTab === 'presets'}">Presets</button>
          <button class="${activeMotionTab === 'manual' ? 'is-active' : ''}" type="button" data-action="switch-motion-editor-tab" data-motion-editor-tab="manual" aria-selected="${activeMotionTab === 'manual'}">Ajuste manual</button>
        </div>
      </div>
      <div class="video-motion-editor-panel" data-motion-editor-panel="presets" ${activeMotionTab === 'presets' ? '' : 'hidden'}>
        <h4 class="video-motion-editor-panel__title">Presets</h4>
        ${buildMotionPicker({ rowId: row.id, selectedMotion: detail.motion, motionPresetGroups: detail.motionPresetGroups })}
      </div>
      <div class="video-motion-editor-panel" data-motion-editor-panel="manual" ${activeMotionTab === 'manual' ? '' : 'hidden'}>
        ${buildManualMotionControls({ row, manualMotion: detail.manualMotion })}
      </div>
    </div>
  `;
}

function buildManualMotionInput({ field, label, value, step = 1 }) {
  return `
    <label class="video-motion-manual__field">
      <span>${escapeHtmlCore(label)}</span>
      <input type="number" step="${escapeHtmlCore(step.toString())}" value="${escapeHtmlCore(value.toString())}" data-action="update-row-motion-keyframe" data-motion-field="${escapeHtmlCore(field)}" />
    </label>
  `;
}

function buildManualMotionControls({ row, manualMotion }) {
  if (!row || !manualMotion) return '';
  const rowId = escapeHtmlCore(row.id || '');
  const startTime = Number(row.startTime || 0);
  const endTime = Math.max(startTime, Number(row.endTime || startTime) - 0.05);

  return `
    <div class="video-motion-manual" data-motion-manual data-framing-keyframe-controls data-row-id="${rowId}" data-motion-preset="${escapeHtmlCore(manualMotion.presetName)}">
      <div class="video-motion-manual__header">
        <div>
          <h4>Ajuste manual</h4>
          <p>Corregí posición y escala del inicio o final del movimiento.</p>
        </div>
        <div class="video-motion-manual__seek">
          <button type="button" data-action="seek-motion-keyframe" data-row-id="${rowId}" data-keyframe-button data-keyframe="start" data-keyframe-time="${escapeHtmlCore(startTime.toString())}" data-seek-time="${escapeHtmlCore(startTime.toString())}" aria-pressed="false">Start</button>
          <button type="button" data-action="seek-motion-keyframe" data-row-id="${rowId}" data-keyframe-button data-keyframe="end" data-keyframe-time="${escapeHtmlCore(endTime.toString())}" data-seek-time="${escapeHtmlCore(endTime.toString())}" aria-pressed="false">End</button>
        </div>
      </div>
      <div class="video-motion-manual__grid">
        <section class="video-motion-manual__keyframe" data-keyframe-group="start">
          <h5>Start</h5>
          <div class="video-motion-manual__fields">
            ${buildManualMotionInput({ field: 'fromX', label: 'X', value: manualMotion.fromX })}
            ${buildManualMotionInput({ field: 'fromY', label: 'Y', value: manualMotion.fromY })}
            ${buildManualMotionInput({ field: 'fromScalePercent', label: 'Escala %', value: manualMotion.fromScalePercent })}
          </div>
        </section>
        <section class="video-motion-manual__keyframe" data-keyframe-group="end">
          <h5>End</h5>
          <div class="video-motion-manual__fields">
            ${buildManualMotionInput({ field: 'toX', label: 'X', value: manualMotion.toX })}
            ${buildManualMotionInput({ field: 'toY', label: 'Y', value: manualMotion.toY })}
            ${buildManualMotionInput({ field: 'toScalePercent', label: 'Escala %', value: manualMotion.toScalePercent })}
          </div>
        </section>
      </div>
    </div>
  `;
}

function buildAudioPanel({ detail }) {
  const { voice, music } = detail;

  return `
    <div class="video-editor-control video-editor-control--effect-panel">
      <label>Volumen voz · <span data-audio-volume-label="voice">${detail.voiceVolumePercent}%</span></label>
      <input type="range" min="0" max="1" step="0.01" data-action="update-global-audio" data-audio-kind="voice" data-field="volume" value="${detail.voiceVolumeValue}" style="--range-progress:${detail.voiceVolumePercent}%" />
      <label class="video-editor-check">
        <input type="checkbox" data-action="update-global-audio" data-audio-kind="voice" data-field="muted" ${voice.muted ? 'checked' : ''} />
        Mute voz
      </label>
    </div>
    <div class="video-editor-control">
      <label>Volumen música · <span data-audio-volume-label="music">${detail.musicVolumePercent}%</span></label>
      <input type="range" min="0" max="1" step="0.01" data-action="update-global-audio" data-audio-kind="music" data-field="volume" value="${detail.musicVolumeValue}" style="--range-progress:${detail.musicVolumePercent}%" />
      <label class="video-editor-check">
        <input type="checkbox" data-action="update-global-audio" data-audio-kind="music" data-field="muted" ${music.muted ? 'checked' : ''} />
        Mute música
      </label>
    </div>
  `;
}

function buildProjectBrandControls({ detail }) {
  return `
    <div class="video-editor-layer-panel video-editor-layer-panel--project">
      <div class="video-editor-layer-panel__heading">
        <span>Proyecto completo</span>
        <small>Aplica a todo el video.</small>
      </div>
      <div class="video-editor-control video-editor-control--effect-panel">
        <label>Proyecto</label>
        <select data-action="update-brand-channel">
          <option value="pelotazo-ecuador" ${detail.brandChannel === 'pelotazo-ecuador' ? 'selected' : ''}>Pelotazo Ecuador</option>
          <option value="pelotazo-colombia" ${detail.brandChannel === 'pelotazo-colombia' ? 'selected' : ''}>Pelotazo Colombia</option>
          <option value="final-mundial" ${detail.brandChannel === 'final-mundial' ? 'selected' : ''}>Final Mundial</option>
        </select>
      </div>
    </div>
  `;
}

function buildDustControl({ row, detail }) {
  const applyAll = resolveDustApplyAllState(row, detail);
  const applyAllButton = applyAll.visible ? `
      <button
        class="video-editor-apply-all-button"
        type="button"
        data-action="apply-row-dust-all"
        ${applyAll.disabled ? 'disabled aria-disabled="true"' : 'aria-disabled="false"'}
        data-row-id="${escapeHtmlCore(row.id)}"
        data-dust-type="${escapeHtmlCore(applyAll.selectedDustType)}"
      >Aplicar a todos</button>` : '';
  return `
    <div class="video-editor-control">
      <label>Polvo</label>
      <select data-action="update-row-dust" data-row-id="${escapeHtmlCore(row.id)}">
        <option value="none" ${detail.dustType === 'none' ? 'selected' : ''}>Sin polvo</option>
        <option value="dust-1" ${detail.dustType === 'dust-1' ? 'selected' : ''}>Polvo 1</option>
        <option value="dust-2" ${detail.dustType === 'dust-2' ? 'selected' : ''}>Polvo 2</option>
      </select>
      ${applyAllButton}
    </div>
  `;
}

function buildLogoControl({ row, detail }) {
  return `
    <div class="video-editor-control">
      <label>Logo</label>
      <select data-action="update-row-logo" data-row-id="${escapeHtmlCore(row.id)}">
        <option value="true" ${detail.logoEnabled ? 'selected' : ''}>Activado</option>
        <option value="false" ${!detail.logoEnabled ? 'selected' : ''}>Desactivado</option>
      </select>
    </div>
  `;
}

function buildNewspaperLabelControl({ row, detail }) {
  const newspaper = detail.newspaper || {};
  return `
    <label class="video-editor-check">
      <input type="checkbox" data-action="update-row-newspaper-label" data-row-id="${escapeHtmlCore(row.id || '')}" ${newspaper.labelEnabled ? 'checked' : ''} />
      Mostrar “Recreación artística”
    </label>
  `;
}

function buildLayersPanel({ row, detail, capabilities }) {
  if (!row) {
    return '<p class="video-projects-empty">Seleccioná una fila de la tabla para editar polvo y logo.</p>';
  }

  const rowLayerControls = [
    capabilities.layers.newspaperLabel ? buildNewspaperLabelControl({ row, detail }) : '',
    capabilities.layers.dust ? buildDustControl({ row, detail }) : '',
    capabilities.layers.logo ? buildLogoControl({ row, detail }) : '',
  ].filter(Boolean).join('');

  return `
    ${capabilities.layers.projectBrand ? buildProjectBrandControls({ detail }) : ''}
    ${rowLayerControls ? `<div class="video-editor-layer-panel video-editor-layer-panel--row">
      <div class="video-editor-layer-panel__heading">
        <span>Fila seleccionada</span>
        <small>Aplica solo a esta fila.</small>
      </div>
      ${rowLayerControls}
    </div>` : '<p class="video-projects-empty">Esta fila no tiene capas propias disponibles por ahora.</p>'}
  `;
}

function resolveContentTypeLabel(contentType = 'image') {
  if (contentType === 'video') return 'Video';
  if (contentType === 'newspaper') return 'Periódico';
  return 'Imagen';
}

function buildContentTypeSwitcher({ row, activeContentType = 'image' } = {}) {
  if (!row) return '';
  const rowId = escapeHtmlCore(row.id || '');
  const startTime = escapeHtmlCore(String(Number(row.startTime || 0)));
  const currentLabel = resolveContentTypeLabel(activeContentType);
  const options = [
    { type: 'image', label: 'Imagen', action: 'open-assets-tab' },
    { type: 'video', label: 'Video', action: 'open-videos-tab' },
    { type: 'newspaper', label: 'Periódico', action: 'open-newspaper-tab' },
  ];

  return `
    <div class="video-editor-content-type" aria-label="Tipo de contenido de la fila">
      <div class="video-editor-content-type__heading">
        <span>Tipo actual</span>
        <strong>${escapeHtmlCore(currentLabel)}</strong>
      </div>
      <div class="video-editor-content-type__actions" role="group" aria-label="Cambiar tipo de contenido">
        ${options.map((option) => `
          <button
            class="video-editor-content-type__button ${option.type === activeContentType ? 'is-active' : ''}"
            type="button"
            data-action="${escapeHtmlCore(option.action)}"
            data-row-id="${rowId}"
            data-start-time="${startTime}"
            data-content-type-switch="${escapeHtmlCore(option.type)}"
            data-target-effect-tab="content"
            aria-pressed="${option.type === activeContentType ? 'true' : 'false'}"
          >${escapeHtmlCore(option.label)}</button>
        `).join('')}
      </div>
    </div>
  `;
}

function buildContentPanel({ row, detail, capabilities }) {
  const activeContentType = detail.activeContentType || capabilities.format || 'image';
  const picker = activeContentType === 'video'
    ? buildEditorVideoPicker({ row, videos: detail.videos, selector: detail.videoSelector, uploading: detail.videosUploading })
    : buildEditorAssetsPicker({ row, assets: detail.assets, uploading: detail.assetsUploading });

  return `
    ${buildContentTypeSwitcher({ row, activeContentType })}
    ${picker}
  `;
}

function buildVideoFramingPanel({ row, detail = {} }) {
  if (!row) return '<p class="video-projects-empty">Seleccioná una fila de video para ver el encuadre.</p>';
  const media = row.media || {};
  const sourceIn = Number(media.sourceInSeconds ?? media.source_in_seconds ?? 0);
  const duration = Number(media.durationSeconds ?? media.duration_seconds ?? Math.max(0, Number(row.endTime || 0) - Number(row.startTime || 0)));
  const sourceOut = Number.isFinite(sourceIn) && Number.isFinite(duration) ? sourceIn + duration : 0;
  const transform = media.foregroundTransform && typeof media.foregroundTransform === 'object' ? media.foregroundTransform : {};
  const previewTransform = convertVideoForegroundTransformToPreview(transform, detail.previewViewport || {});
  const x = Math.round(Number.isFinite(Number(previewTransform.x)) ? Number(previewTransform.x) : 0);
  const y = Math.round(Number.isFinite(Number(previewTransform.y)) ? Number(previewTransform.y) : 0);
  const scale = Number.isFinite(Number(transform.scale)) && Number(transform.scale) > 0 ? Number(transform.scale) : 1;
  const scalePercent = Math.round(scale * 100);
  return `
    <div class="video-editor-control video-editor-control--effect-panel">
      <h4>Ventana de video</h4>
      <p>El segmento usa una ventana fija del video fuente para cubrir la duración de la frase.</p>
      <p class="video-projects-empty">${Number.isFinite(sourceIn) && Number.isFinite(sourceOut)
        ? `Fuente: ${escapeHtmlCore(sourceIn.toFixed(2))}s → ${escapeHtmlCore(sourceOut.toFixed(2))}s`
        : 'Sin ventana de video definida todavía.'}</p>
    </div>
    <div class="video-motion-manual" data-video-foreground-controls data-row-id="${escapeHtmlCore(row.id || row.rowId || '')}">
      <div class="video-motion-manual__header">
        <div>
          <h4>Video fuente</h4>
          <p>Ajustá solo el video central. El fondo y los efectos se mantienen igual.</p>
        </div>
      </div>
      <div class="video-motion-manual__fields">
        ${buildVideoForegroundNumberInput({ field: 'x', label: 'X', value: x })}
        ${buildVideoForegroundNumberInput({ field: 'y', label: 'Y', value: y })}
        ${buildVideoForegroundNumberInput({ field: 'scalePercent', label: 'Escala %', value: scalePercent, min: 10, step: 1 })}
      </div>
      ${buildFramingDefaultsHint()}
    </div>
  `;
}

function buildVideoForegroundNumberInput({ field, label, value, min = null, step = 1 }) {
  const minAttribute = min === null ? '' : ` min="${escapeHtmlCore(min.toString())}"`;
  return `
    <label class="video-motion-manual__field video-motion-manual__field--video-foreground">
      <span>${escapeHtmlCore(label)}</span>
      <input type="number"${minAttribute} step="${escapeHtmlCore(step.toString())}" value="${escapeHtmlCore(value.toString())}" data-action="update-row-video-foreground" data-video-foreground-field="${escapeHtmlCore(field)}" />
    </label>
  `;
}

function buildFramingDefaultsHint() {
  return `
    <div class="video-motion-defaults-hint" aria-label="Guía de ajuste base">
      <span class="video-motion-defaults-hint__icon" aria-hidden="true">i</span>
      <span>Para volver al ajuste base, ingresá X: 0, Y: 0 y Escala: 100%.</span>
    </div>
  `;
}

function buildNewspaperNumberInput({ field, label, value, step = 1 }) {
  return `
    <label class="video-motion-manual__field">
      <span>${escapeHtmlCore(label)}</span>
      <input type="number" step="${escapeHtmlCore(step.toString())}" value="${escapeHtmlCore(value.toString())}" data-action="update-row-newspaper" data-newspaper-field="${escapeHtmlCore(field)}" />
    </label>
  `;
}

function buildNewspaperPanel({ row, detail }) {
  if (!row) return '<p class="video-projects-empty">Seleccioná una fila para ajustar el formato periódico.</p>';
  if (row.mediaMode !== 'newspaper') return '<p class="video-projects-empty">Esta sección se activa cuando la fila está en formato periódico.</p>';
  const rowId = escapeHtmlCore(row.id || '');
  const newspaper = detail.newspaper || {};
  const startTime = Number(row.startTime || 0);
  const endTime = Math.max(startTime, Number(row.endTime || startTime) - 0.05);
  return `
    <div class="video-motion-manual" data-newspaper-controls data-framing-keyframe-controls data-row-id="${rowId}">
      <div class="video-motion-manual__header">
        <div>
          <h4>Periódico</h4>
          <p>Mové libremente la imagen central. El fondo difuminado cubre el espacio que quede alrededor.</p>
        </div>
        <div class="video-motion-manual__seek">
          <button type="button" data-action="seek-motion-keyframe" data-row-id="${rowId}" data-keyframe-button data-keyframe="start" data-keyframe-time="${escapeHtmlCore(startTime.toString())}" data-seek-time="${escapeHtmlCore(startTime.toString())}" aria-pressed="false">Start</button>
          <button type="button" data-action="seek-motion-keyframe" data-row-id="${rowId}" data-keyframe-button data-keyframe="end" data-keyframe-time="${escapeHtmlCore(endTime.toString())}" data-seek-time="${escapeHtmlCore(endTime.toString())}" aria-pressed="false">End</button>
        </div>
      </div>
      ${buildNewspaperLabelControl({ row, detail })}
      <div class="video-motion-manual__grid">
        <section class="video-motion-manual__keyframe" data-keyframe-group="start">
          <h5>Start</h5>
          <div class="video-motion-manual__fields">
            ${buildNewspaperNumberInput({ field: 'fromX', label: 'X', value: newspaper.fromX })}
            ${buildNewspaperNumberInput({ field: 'fromY', label: 'Y', value: newspaper.fromY })}
            ${buildNewspaperNumberInput({ field: 'fromScalePercent', label: 'Escala %', value: newspaper.fromScalePercent })}
          </div>
        </section>
        <section class="video-motion-manual__keyframe" data-keyframe-group="end">
          <h5>End</h5>
          <div class="video-motion-manual__fields">
            ${buildNewspaperNumberInput({ field: 'toX', label: 'X', value: newspaper.toX })}
            ${buildNewspaperNumberInput({ field: 'toY', label: 'Y', value: newspaper.toY })}
            ${buildNewspaperNumberInput({ field: 'toScalePercent', label: 'Escala %', value: newspaper.toScalePercent })}
          </div>
        </section>
      </div>
      ${buildFramingDefaultsHint()}
    </div>
  `;
}

function buildFramingPanel({ row, detail, capabilities }) {
  if (capabilities.framing === 'video-window') return buildVideoFramingPanel({ row, detail });
  if (capabilities.framing === 'newspaper-motion') return buildNewspaperPanel({ row, detail });
  return buildMotionPanel({ row, detail });
}

export function buildEditorEffectTabs({ row, detail, activeTab = 'motion' } = {}) {
  const capabilities = deriveRowSettingsCapabilities(row);
  const resolvedTab = resolveEditorEffectTab(activeTab);
  const panels = {
    content: buildContentPanel({ row, detail, capabilities }),
    framing: buildFramingPanel({ row, detail, capabilities }),
    layers: buildLayersPanel({ row, detail, capabilities }),
    audio: buildAudioPanel({ detail }),
  };

  return `
    ${buildEffectTabsNav(resolvedTab)}
    ${EDITOR_EFFECT_TABS.map((tab) => `
      <div
        class="video-editor-effect-panel"
        id="video-editor-effect-panel-${escapeHtmlCore(tab.id)}"
        role="tabpanel"
        aria-labelledby="video-editor-effect-tab-${escapeHtmlCore(tab.id)}"
        ${tab.id === resolvedTab ? '' : 'hidden'}
      >
        ${panels[tab.id]}
      </div>
    `).join('')}
  `;
}
