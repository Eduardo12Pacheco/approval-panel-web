import { formatSeconds } from '../domain/formatters.js';
import { MOTION_PRESET_CATEGORIES, MOTION_PRESETS } from '../domain/motion-presets.js';
import { resolveVideoProjectTitle } from '../domain/project-identity.js';
import { resolveRowImageUrl } from '../composition/composition-view-model.js';

const EDITOR_EFFECT_TAB_IDS = new Set(['motion', 'audio', 'global']);

function resolveEditorEffectTab(value = '') {
  const tab = value.toString();
  return EDITOR_EFFECT_TAB_IDS.has(tab) ? tab : 'motion';
}

function resolveMotionPresetName(row = {}) {
  const explicit = (row.motionPresetId || row.motion_preset_id || row.motionPreset || '').toString().trim();
  if (explicit) return explicit;
  const motion = row.motion;
  if (typeof motion === 'string') return motion;
  const presetName = (motion?.name || motion?.presetName || '').toString().trim();
  if (presetName) return presetName;
  const match = MOTION_PRESETS.find((preset) => (
    Number(preset.fromX ?? 0) === Number(motion?.fromX ?? 0)
    && Number(preset.fromY ?? 0) === Number(motion?.fromY ?? 0)
    && Number(preset.toX ?? 0) === Number(motion?.toX ?? 0)
    && Number(preset.toY ?? 0) === Number(motion?.toY ?? 0)
    && Number(preset.fromScale ?? 1) === Number(motion?.fromScale ?? 1)
    && Number(preset.toScale ?? 1) === Number(motion?.toScale ?? 1)
  ));
  return match?.name || 'Zoom-125';
}

function buildMotionPresetGroups() {
  return MOTION_PRESET_CATEGORIES.map((category) => ({
    category,
    presets: MOTION_PRESETS.filter((preset) => preset.category === category),
  })).filter((group) => group.presets.length);
}

export function buildPreviewTimelineViewModel(rows = [], selectedRowId = null) {
  const totalDuration = Math.max(...rows.map((row) => Number(row.endTime || 0)), 1);
  const markers = rows.map((row, index) => {
    const start = Math.max(0, Number(row.startTime || 0));
    return {
      row,
      index,
      start,
      position: Math.min((start / totalDuration) * 100, 100),
      isSelected: selectedRowId === row.id,
      title: `${formatSeconds(start)} · ${(row.phrase || '').toString()}`,
    };
  });

  return {
    totalDuration,
    totalDurationLabel: formatSeconds(totalDuration),
    markers,
  };
}

export function buildEditorRowsTableViewModel(rows = [], { selectedRowId, rowImageUploading, project = {} } = {}) {
  return rows.map((row, index) => {
    const isSelected = selectedRowId === row.id;
    const uploadingThisRow = rowImageUploading === row.id;
    return {
      row,
      index,
      isSelected,
      selectedClass: isSelected ? 'is-selected' : '',
      uploadingThisRow,
      imageUrl: resolveRowImageUrl(row, index, project),
      startTimeValue: String(Number(row.startTime || 0)),
      startTimeLabel: formatSeconds(row.startTime),
      endTimeLabel: formatSeconds(row.endTime),
      phrase: (row.phrase || '').toString(),
      thumbAlt: `Imagen de la fila ${index + 1}`,
      uploadLabel: uploadingThisRow ? 'Subiendo…' : 'Cambiar',
    };
  });
}

export function buildEditorDetailRailViewModel({ row, globalAudio, project = {}, rowIndex = 0 } = {}) {
  const voice = globalAudio?.voice || { volume: 1, muted: false };
  const music = globalAudio?.music || { volume: 0.16, muted: false };
  const detailImageUrl = row ? resolveRowImageUrl(row, rowIndex, project) : '';

  return {
    row,
    voice,
    music,
    detailImageUrl,
    phraseLabel: row ? (row.phrase || 'Fila').toString().slice(0, 64) : '',
    timeLabel: row ? `${formatSeconds(row.startTime)} → ${formatSeconds(row.endTime)}` : '',
    missingAssetLabel: row ? (row.selectedAssetId || 'Sin imagen asignada').toString().slice(0, 40) : '',
    voiceVolumePercent: Math.round((voice.volume || 1) * 100),
    voiceVolumeValue: voice.volume || 1,
    musicVolumePercent: Math.round((music.volume || 0.16) * 100),
    musicVolumeValue: music.volume || 0.16,
    activeEffectTab: resolveEditorEffectTab(project._editorEffectTab),
    motion: resolveMotionPresetName(row),
    motionPresetGroups: buildMotionPresetGroups(),
    dustEnabled: Boolean(row?.dust?.enabled),
    dustType: row?.dust?.enabled ? (row?.dust?.type || 'dust-1') : 'none',
    logoEnabled: row?.logo?.enabled !== false,
  };
}

export function buildEditorShellViewModel(project = {}, { editorRows = [], selectedRowId = null } = {}) {
  const activeSelectedRowId = selectedRowId || editorRows[0]?.id || null;
  const selectedRow = editorRows.find((row) => row.id === activeSelectedRowId) || null;
  const selectedRowIndex = Math.max(0, editorRows.findIndex((row) => row.id === activeSelectedRowId));

  return {
    title: resolveVideoProjectTitle(project),
    activeSelectedRowId,
    selectedRow,
    selectedRowIndex,
  };
}
