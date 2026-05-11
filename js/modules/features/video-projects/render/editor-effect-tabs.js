import { escapeHtmlCore } from '../../../core/ui/escape-html.js';
import { buildEditorAssetsPicker } from './editor-assets-picker.js';
import { buildMotionPicker } from './editor-motion-picker.js';
import { buildEditorVideoPicker } from './editor-video-picker.js';

export const EDITOR_EFFECT_TABS = [
  { id: 'motion', label: 'Movimiento' },
  { id: 'audio', label: 'Audio' },
  { id: 'global', label: 'Global' },
  { id: 'assets', label: 'Imágenes' },
  { id: 'videos', label: 'Videos' },
];

export function resolveEditorEffectTab(value = '') {
  const tab = value.toString();
  return EDITOR_EFFECT_TABS.some((item) => item.id === tab) ? tab : 'motion';
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
    <div class="video-motion-manual" data-motion-manual data-row-id="${rowId}" data-motion-preset="${escapeHtmlCore(manualMotion.presetName)}">
      <div class="video-motion-manual__header">
        <div>
          <h4>Ajuste manual</h4>
          <p>Corregí posición y escala del inicio o final del movimiento.</p>
        </div>
        <div class="video-motion-manual__seek">
          <button type="button" data-action="seek-motion-keyframe" data-row-id="${rowId}" data-seek-time="${escapeHtmlCore(startTime.toString())}">Start</button>
          <button type="button" data-action="seek-motion-keyframe" data-row-id="${rowId}" data-seek-time="${escapeHtmlCore(endTime.toString())}">End</button>
        </div>
      </div>
      <div class="video-motion-manual__grid">
        <section class="video-motion-manual__keyframe">
          <h5>Start</h5>
          <div class="video-motion-manual__fields">
            ${buildManualMotionInput({ field: 'fromX', label: 'X', value: manualMotion.fromX })}
            ${buildManualMotionInput({ field: 'fromY', label: 'Y', value: manualMotion.fromY })}
            ${buildManualMotionInput({ field: 'fromScalePercent', label: 'Escala %', value: manualMotion.fromScalePercent })}
          </div>
        </section>
        <section class="video-motion-manual__keyframe">
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

function buildGlobalPanel({ row, detail }) {
  if (!row) {
    return '<p class="video-projects-empty">Seleccioná una fila de la tabla para editar polvo y logo.</p>';
  }

  return `
    <div class="video-editor-control video-editor-control--effect-panel">
      <label>Proyecto</label>
      <select data-action="update-brand-channel">
        <option value="pelotazo-ecuador" ${detail.brandChannel === 'pelotazo-ecuador' ? 'selected' : ''}>Pelotazo Ecuador</option>
        <option value="pelotazo-colombia" ${detail.brandChannel === 'pelotazo-colombia' ? 'selected' : ''}>Pelotazo Colombia</option>
      </select>
    </div>
    <div class="video-editor-control">
      <label>Polvo</label>
      <select data-action="update-row-dust" data-row-id="${escapeHtmlCore(row.id)}">
        <option value="none" ${detail.dustType === 'none' ? 'selected' : ''}>Sin polvo</option>
        <option value="dust-1" ${detail.dustType === 'dust-1' ? 'selected' : ''}>Polvo 1</option>
        <option value="dust-2" ${detail.dustType === 'dust-2' ? 'selected' : ''}>Polvo 2</option>
      </select>
    </div>
    <div class="video-editor-control">
      <label>Logo</label>
      <select data-action="update-row-logo" data-row-id="${escapeHtmlCore(row.id)}">
        <option value="true" ${detail.logoEnabled ? 'selected' : ''}>Activado</option>
        <option value="false" ${!detail.logoEnabled ? 'selected' : ''}>Desactivado</option>
      </select>
    </div>
  `;
}

function buildAssetsPanel({ row, detail }) {
  return buildEditorAssetsPicker({ row, assets: detail.assets, uploading: detail.assetsUploading });
}

function buildVideosPanel({ row, detail }) {
  return buildEditorVideoPicker({ row, videos: detail.videos, selector: detail.videoSelector, uploading: detail.videosUploading });
}

export function buildEditorEffectTabs({ row, detail, activeTab = 'motion' } = {}) {
  const resolvedTab = resolveEditorEffectTab(activeTab);
  const panels = {
    motion: buildMotionPanel({ row, detail }),
    audio: buildAudioPanel({ detail }),
    global: buildGlobalPanel({ row, detail }),
    assets: buildAssetsPanel({ row, detail }),
    videos: buildVideosPanel({ row, detail }),
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
