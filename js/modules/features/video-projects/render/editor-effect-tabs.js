import { escapeHtmlCore } from '../../../core/ui/escape-html.js';
import { buildEditorAssetsPicker } from './editor-assets-picker.js';
import { buildMotionPicker } from './editor-motion-picker.js';

export const EDITOR_EFFECT_TABS = [
  { id: 'motion', label: 'Movimiento' },
  { id: 'audio', label: 'Audio' },
  { id: 'global', label: 'Global' },
  { id: 'assets', label: 'Assets' },
];

export function resolveEditorEffectTab(value = '') {
  const tab = value.toString();
  return EDITOR_EFFECT_TABS.some((item) => item.id === tab) ? tab : 'motion';
}

function buildEffectTabsNav(activeTab) {
  return `
    <div class="video-editor-effect-tabs" role="tablist" aria-label="Detalles de efectos">
      ${EDITOR_EFFECT_TABS.map((tab) => {
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

  return `
    <div class="video-editor-control video-editor-control--effect-panel">
      <span class="video-editor-control__label">Movimiento</span>
      ${buildMotionPicker({ rowId: row.id, selectedMotion: detail.motion, motionPresetGroups: detail.motionPresetGroups })}
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

export function buildEditorEffectTabs({ row, detail, activeTab = 'motion' } = {}) {
  const resolvedTab = resolveEditorEffectTab(activeTab);
  const panels = {
    motion: buildMotionPanel({ row, detail }),
    audio: buildAudioPanel({ detail }),
    global: buildGlobalPanel({ row, detail }),
    assets: buildAssetsPanel({ row, detail }),
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
