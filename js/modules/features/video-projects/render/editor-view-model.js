import { formatSeconds } from '../domain/formatters.js';
import { MOTION_PRESET_CATEGORIES, MOTION_PRESETS } from '../domain/motion-presets.js';
import { resolveVideoProjectTitle } from '../domain/project-identity.js';
import { resolveRowImageUrl } from '../composition/composition-view-model.js';
import { resolveCandidateImageUrl, resolveCandidateDimensions } from '../domain/image-candidates.js';

const EDITOR_EFFECT_TAB_IDS = new Set(['motion', 'audio', 'global', 'assets']);
const DEFAULT_MOTION_PRESET_NAME = 'Zoom 110';

function normalizeLegacyMotionName(value = '', { defaultEmpty = false } = {}) {
  const normalized = value.toString().trim().toLowerCase();
  if (!normalized) return defaultEmpty ? DEFAULT_MOTION_PRESET_NAME : '';
  if (normalized === 'slow-zoom-in' || normalized === 'slow-zoom' || normalized === 'zoom-110') {
    return DEFAULT_MOTION_PRESET_NAME;
  }
  return value.toString().trim();
}

function resolveEditorEffectTab(value = '') {
  const tab = value.toString();
  return EDITOR_EFFECT_TAB_IDS.has(tab) ? tab : 'motion';
}

function resolveMotionPresetName(row = {}) {
  const explicit = normalizeLegacyMotionName(row.motionPresetId || row.motion_preset_id || row.motionPreset || '');
  if (explicit) return explicit;
  const motion = row.motion;
  if (typeof motion === 'string') return normalizeLegacyMotionName(motion, { defaultEmpty: true });
  const presetName = normalizeLegacyMotionName(motion?.name || motion?.presetName || '');
  if (presetName) return presetName;
  const match = MOTION_PRESETS.find((preset) => (
    Number(preset.fromX ?? 0) === Number(motion?.fromX ?? 0)
    && Number(preset.fromY ?? 0) === Number(motion?.fromY ?? 0)
    && Number(preset.toX ?? 0) === Number(motion?.toX ?? 0)
    && Number(preset.toY ?? 0) === Number(motion?.toY ?? 0)
    && Number(preset.fromScale ?? 1) === Number(motion?.fromScale ?? 1)
    && Number(preset.toScale ?? 1) === Number(motion?.toScale ?? 1)
  ));
  return match?.name || DEFAULT_MOTION_PRESET_NAME;
}

function buildMotionPresetGroups() {
  return MOTION_PRESET_CATEGORIES.map((category) => ({
    category,
    presets: MOTION_PRESETS.filter((preset) => preset.category === category),
  })).filter((group) => group.presets.length);
}

function resolveSelectedImageEntryUrl(entry = null) {
  if (!entry) return '';
  if (typeof entry === 'string') return entry.trim();
  if (typeof entry === 'object') return resolveCandidateImageUrl(entry);
  return '';
}

function isUserUploadCandidate(candidate = {}) {
  const provider = (candidate.provider || candidate.source || '').toString().toLowerCase();
  return provider === 'user-upload';
}

function normalizeAssetKey(url = '') {
  return url.toString().trim().toLowerCase();
}

function createAssetViewModel({ url, title, source, dimensions, currentImageUrl, selectedAssetId, index }) {
  const normalizedUrl = normalizeAssetKey(url);
  return {
    id: normalizedUrl || `asset-${index + 1}`,
    url,
    title: title || `Asset ${index + 1}`,
    source,
    dimensions,
    isSelected: Boolean(normalizedUrl && (
      normalizedUrl === normalizeAssetKey(selectedAssetId)
      || normalizedUrl === normalizeAssetKey(currentImageUrl)
    )),
  };
}

export function buildEditorAssetsViewModel({ project = {}, row = null, rowIndex = 0 } = {}) {
  const selectedImages = Array.isArray(project.selected_images) ? project.selected_images : [];
  const candidates = Array.isArray(project.image_candidates) ? project.image_candidates : [];
  const currentImageUrl = row ? resolveRowImageUrl(row, rowIndex, project) : '';
  const selectedAssetId = row?.selectedAssetId || '';
  const seen = new Set();
  const assets = [];

  const addAsset = ({ url, title, source, dimensions }) => {
    const cleanUrl = (url || '').toString().trim();
    const key = normalizeAssetKey(cleanUrl);
    if (!key || seen.has(key)) return;
    seen.add(key);
    assets.push(createAssetViewModel({
      url: cleanUrl,
      title,
      source,
      dimensions,
      currentImageUrl,
      selectedAssetId,
      index: assets.length,
    }));
  };

  selectedImages.forEach((entry, index) => {
    const url = resolveSelectedImageEntryUrl(entry);
    const title = typeof entry === 'object'
      ? (entry.title || entry.file_name || `Imagen seleccionada ${index + 1}`).toString()
      : `Imagen seleccionada ${index + 1}`;
    const dimensions = typeof entry === 'object' ? resolveCandidateDimensions(entry) : '';
    addAsset({ url, title, source: 'Seleccionada', dimensions });
  });

  candidates.filter(isUserUploadCandidate).forEach((candidate, index) => {
    addAsset({
      url: resolveCandidateImageUrl(candidate),
      title: (candidate.title || candidate.file_name || `Upload ${index + 1}`).toString(),
      source: 'Upload',
      dimensions: resolveCandidateDimensions(candidate),
    });
  });

  return assets;
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
    assets: buildEditorAssetsViewModel({ project, row, rowIndex }),
    assetsUploading: Boolean(project._rowImageUploading && row?.id && project._rowImageUploading === row.id),
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
