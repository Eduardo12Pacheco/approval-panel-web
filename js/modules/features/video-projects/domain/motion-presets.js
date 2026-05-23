export const MOTION_PRESET_CATEGORIES = ['ZOOMS', 'MOVIMIENTOS', 'MOVIMIENTOS DIAGONALES', 'VERTICALES', 'HORIZONTALES'];
export const DEFAULT_MOTION_PRESET_NAME = 'Zoom 150';

// Keep this module as the browser-facing motion preset source for Video Projects.

function normalizeMotionPresetKey(idOrName) {
  return String(idOrName || '').trim().toLowerCase().replace(/^zoom-(\d+)$/, 'zoom $1');
}

function isLegacyDefaultZoomAlias(value, { defaultEmpty = false } = {}) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return defaultEmpty;
  return normalized === 'slow-zoom' || normalized === 'slow-zoom-in' || normalized === 'zoom-110';
}

export const MOTION_PRESETS = [
  { category: 'ZOOMS', name: 'Zoom 125', fromX: 0, fromY: 0, toX: 0, toY: 0, fromScale: 1, toScale: 1.25, easing: 'linear' },
  { category: 'ZOOMS', name: 'Zoom 110', fromX: 0, fromY: 0, toX: 0, toY: 0, fromScale: 1, toScale: 1.1, easing: 'linear' },
  { category: 'ZOOMS', name: 'Zoom 150', fromX: 0, fromY: 0, toX: 0, toY: 0, fromScale: 1, toScale: 1.5, easing: 'linear' },
  { category: 'ZOOMS', name: 'Zoom 200', fromX: 0, fromY: 0, toX: 0, toY: 0, fromScale: 1, toScale: 2, easing: 'linear' },
  { category: 'MOVIMIENTOS', name: 'Movimiento-derecha-Izquierda-150-amplio', fromX: -240, fromY: 0, toX: 240, toY: 0, fromScale: 1.5, toScale: 1.5, easing: 'linear' },
  { category: 'MOVIMIENTOS', name: 'Movimiento-Izquierda-derecha-150-amplio', fromX: 240, fromY: 0, toX: -240, toY: 0, fromScale: 1.5, toScale: 1.5, easing: 'linear' },
  { category: 'MOVIMIENTOS', name: 'Movimiento-Izquierda-Derecha', fromX: 120, fromY: 0, toX: -120, toY: 0, fromScale: 1.25, toScale: 1.25, easing: 'linear' },
  { category: 'MOVIMIENTOS', name: 'Movimiento-Derecha-Izquierda', fromX: -120, fromY: 0, toX: 120, toY: 0, fromScale: 1.25, toScale: 1.25, easing: 'linear' },
  { category: 'MOVIMIENTOS', name: 'Movimiento-Izquierda-Derecha-Arriba', fromX: 120, fromY: 65, toX: -120, toY: 65, fromScale: 1.25, toScale: 1.25, easing: 'linear' },
  { category: 'MOVIMIENTOS', name: 'Movimiento-Derecha-Izquierda-Arriba', fromX: -120, fromY: 65, toX: 120, toY: 65, fromScale: 1.25, toScale: 1.25, easing: 'linear' },
  { category: 'MOVIMIENTOS DIAGONALES', name: 'Movimiento-Diagonal-1', fromX: -120, fromY: 65, toX: 120, toY: -60, fromScale: 1.25, toScale: 1.25, easing: 'linear' },
  { category: 'MOVIMIENTOS DIAGONALES', name: 'Movimiento-Diagonal-2', fromX: 120, fromY: -60, toX: -120, toY: 65, fromScale: 1.25, toScale: 1.25, easing: 'linear' },
  { category: 'MOVIMIENTOS DIAGONALES', name: 'Movimiento-Diagonal-3', fromX: 120, fromY: 65, toX: -120, toY: -60, fromScale: 1.25, toScale: 1.25, easing: 'linear' },
  { category: 'MOVIMIENTOS DIAGONALES', name: 'Movimiento-Diagonal-4', fromX: -120, fromY: -60, toX: 120, toY: 65, fromScale: 1.25, toScale: 1.25, easing: 'linear' },
  { category: 'VERTICALES', name: 'Zoom-Vertical-1', sourceScaleBase: 2, fromX: 0, fromY: 776, toX: 0, toY: 1070, fromScale: 1, toScale: 1.25, easing: 'linear' },
  { category: 'VERTICALES', name: 'Zoom-Vertical-2', sourceScaleBase: 2, fromX: 0, fromY: 776, toX: 276, toY: 1070, fromScale: 1, toScale: 1.25, easing: 'linear' },
  { category: 'VERTICALES', name: 'Zoom-Vertical-3', sourceScaleBase: 2, fromX: 0, fromY: 776, toX: -310, toY: 1070, fromScale: 1, toScale: 1.25, easing: 'linear' },
  { category: 'VERTICALES', name: 'Zoom-Vertical-4', sourceScaleBase: 2, fromX: 0, fromY: 776, toX: 0, toY: 360, fromScale: 1, toScale: 1, easing: 'linear' },
  { category: 'VERTICALES', name: 'Movimiento-Vertical-1', sourceScaleBase: 2, fromX: 270, fromY: 905, toX: -274, toY: 905, fromScale: 1.25, toScale: 1.25, easing: 'linear' },
  { category: 'VERTICALES', name: 'Movimiento-Vertical-2', sourceScaleBase: 2, fromX: -274, fromY: 905, toX: 270, toY: 905, fromScale: 1.25, toScale: 1.25, easing: 'linear' },
  { category: 'HORIZONTALES', name: 'Movimiento-horizontal-1', sourceScaleBase: 1.45, fromX: -320, fromY: 0, toX: 320, toY: 0, fromScale: 1, toScale: 1, easing: 'linear' },
  { category: 'HORIZONTALES', name: 'Movimiento-horizontal-2', sourceScaleBase: 1.45, fromX: 320, fromY: 0, toX: -320, toY: 0, fromScale: 1, toScale: 1, easing: 'linear' },
  { category: 'HORIZONTALES', name: 'Movimiento-Diagonal-horizontal-1', sourceScaleBase: 1.45, fromX: 320, fromY: 65, toX: -320, toY: -60, fromScale: 1.2, toScale: 1.2, easing: 'linear' },
  { category: 'HORIZONTALES', name: 'Movimiento-Diagonal-horizontal-2', sourceScaleBase: 1.45, fromX: -320, fromY: -60, toX: 320, toY: 65, fromScale: 1.2, toScale: 1.2, easing: 'linear' },
  { category: 'HORIZONTALES', name: 'Movimiento-Diagonal-horizontal-3', sourceScaleBase: 1.45, fromX: -320, fromY: 65, toX: 320, toY: -60, fromScale: 1.2, toScale: 1.2, easing: 'linear' },
  { category: 'HORIZONTALES', name: 'Movimiento-Diagonal-horizontal-4', sourceScaleBase: 1.45, fromX: 320, fromY: -60, toX: -320, toY: 65, fromScale: 1.2, toScale: 1.2, easing: 'linear' },
  { category: 'ZOOMS', name: 'Zoom-Esquina-Arriba-Derecha', fromX: 0, fromY: 0, toX: -120, toY: 65, fromScale: 1, toScale: 1.25, easing: 'linear' },
  { category: 'ZOOMS', name: 'Zoom-Arriba-Centro', fromX: 0, fromY: 0, toX: 0, toY: 65, fromScale: 1, toScale: 1.25, easing: 'linear' },
  { category: 'ZOOMS', name: 'Zoom-Esquina-Arriba-Izquierda', fromX: 0, fromY: 0, toX: 120, toY: 65, fromScale: 1, toScale: 1.25, easing: 'linear' },
  { category: 'ZOOMS', name: 'Zoom-derecha', fromX: 0, fromY: 0, toX: -120, toY: 0, fromScale: 1, toScale: 1.25, easing: 'linear' },
  { category: 'ZOOMS', name: 'Zoom-Izquierda', fromX: 0, fromY: 0, toX: 120, toY: 0, fromScale: 1, toScale: 1.25, easing: 'linear' },
];

export function findMotionPreset(idOrName) {
  const key = normalizeMotionPresetKey(idOrName);
  return MOTION_PRESETS.find((preset) => normalizeMotionPresetKey(preset.name) === key) || null;
}

export function defaultMotionPresetMotion() {
  const { category, name, ...motion } = findMotionPreset(DEFAULT_MOTION_PRESET_NAME) || {};
  return Object.keys(motion).length ? motion : { fromX: 0, fromY: 0, toX: 0, toY: 0, fromScale: 1, toScale: 1.5, easing: 'linear' };
}

export function normalizeLegacyDefaultMotionPresetName(value, options = {}) {
  return isLegacyDefaultZoomAlias(value, options) ? DEFAULT_MOTION_PRESET_NAME : String(value || '').trim();
}

export function shouldUseDefaultMotionPresetForRow(row = {}) {
  const explicitPreset = row?.motionPresetId || row?.motion_preset_id || row?.motionPreset;
  if (findMotionPreset(explicitPreset)?.name === DEFAULT_MOTION_PRESET_NAME) return true;
  if (isLegacyDefaultZoomAlias(explicitPreset, { defaultEmpty: false })) return true;
  if (typeof row?.motion === 'string') return isLegacyDefaultZoomAlias(row.motion, { defaultEmpty: !explicitPreset });
  if (row?.motion && typeof row.motion === 'object') {
    const motionPreset = row.motion.presetName || row.motion.name;
    if (motionPreset) return isLegacyDefaultZoomAlias(motionPreset, { defaultEmpty: false });
    return !explicitPreset
      && Number(row.motion.fromX ?? 0) === 0
      && Number(row.motion.fromY ?? 0) === 0
      && Number(row.motion.toX ?? 0) === 0
      && Number(row.motion.toY ?? 0) === 0
      && Number(row.motion.fromScale ?? 1) === 1
      && Number(row.motion.toScale ?? 1) === 1.08;
  }
  return !explicitPreset && isLegacyDefaultZoomAlias('', { defaultEmpty: true });
}

export function normalizeRowMotionForPreview(row = {}) {
  if (!shouldUseDefaultMotionPresetForRow(row)) {
    const motionPresetId = row?.motionPresetId || row?.motion_preset_id || row?.motionPreset || (typeof row?.motion === 'string' ? row.motion : DEFAULT_MOTION_PRESET_NAME);
    return {
      motionPresetId,
      motion: row?.motion || motionPresetId,
    };
  }
  return {
    motionPresetId: DEFAULT_MOTION_PRESET_NAME,
    motion: defaultMotionPresetMotion(),
  };
}
