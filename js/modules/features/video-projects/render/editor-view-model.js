import { formatSeconds } from '../domain/formatters.js';
import { resolveVideoProjectTitle } from '../domain/project-identity.js';
import { resolveRowImageUrl } from '../composition/composition-view-model.js';

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
    motion: row?.motion,
    dustEnabled: Boolean(row?.dust?.enabled),
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
