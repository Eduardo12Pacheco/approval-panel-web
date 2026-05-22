const MOTION_PRESET_CATEGORIES = ["ZOOMS", "MOVIMIENTOS", "MOVIMIENTOS DIAGONALES", "VERTICALES", "HORIZONTALES"];

function normalizeMotionPresetKey(idOrName) {
  return String(idOrName || "").trim().toLowerCase().replace(/^zoom-(\d+)$/, "zoom $1");
}

const MOTION_PRESETS = [
  { category: "ZOOMS", name: "Zoom 125", fromX: 0, fromY: 0, toX: 0, toY: 0, fromScale: 1, toScale: 1.25, easing: "linear" },
  { category: "ZOOMS", name: "Zoom 110", fromX: 0, fromY: 0, toX: 0, toY: 0, fromScale: 1, toScale: 1.1, easing: "linear" },
  { category: "ZOOMS", name: "Zoom 150", fromX: 0, fromY: 0, toX: 0, toY: 0, fromScale: 1, toScale: 1.5, easing: "linear" },
  { category: "ZOOMS", name: "Zoom 200", fromX: 0, fromY: 0, toX: 0, toY: 0, fromScale: 1, toScale: 2, easing: "linear" },
  { category: "MOVIMIENTOS", name: "Movimiento-derecha-Izquierda-150-amplio", fromX: -240, fromY: 0, toX: 240, toY: 0, fromScale: 1.5, toScale: 1.5, easing: "linear" },
  { category: "MOVIMIENTOS", name: "Movimiento-Izquierda-derecha-150-amplio", fromX: 240, fromY: 0, toX: -240, toY: 0, fromScale: 1.5, toScale: 1.5, easing: "linear" },
  { category: "MOVIMIENTOS", name: "Movimiento-Izquierda-Derecha", fromX: 120, fromY: 0, toX: -120, toY: 0, fromScale: 1.25, toScale: 1.25, easing: "linear" },
  { category: "MOVIMIENTOS", name: "Movimiento-Derecha-Izquierda", fromX: -120, fromY: 0, toX: 120, toY: 0, fromScale: 1.25, toScale: 1.25, easing: "linear" },
  { category: "MOVIMIENTOS", name: "Movimiento-Izquierda-Derecha-Arriba", fromX: 120, fromY: 65, toX: -120, toY: 65, fromScale: 1.25, toScale: 1.25, easing: "linear" },
  { category: "MOVIMIENTOS", name: "Movimiento-Derecha-Izquierda-Arriba", fromX: -120, fromY: 65, toX: 120, toY: 65, fromScale: 1.25, toScale: 1.25, easing: "linear" },
  { category: "MOVIMIENTOS DIAGONALES", name: "Movimiento-Diagonal-1", fromX: -120, fromY: 65, toX: 120, toY: -60, fromScale: 1.25, toScale: 1.25, easing: "linear" },
  { category: "MOVIMIENTOS DIAGONALES", name: "Movimiento-Diagonal-2", fromX: 120, fromY: -60, toX: -120, toY: 65, fromScale: 1.25, toScale: 1.25, easing: "linear" },
  { category: "MOVIMIENTOS DIAGONALES", name: "Movimiento-Diagonal-3", fromX: 120, fromY: 65, toX: -120, toY: -60, fromScale: 1.25, toScale: 1.25, easing: "linear" },
  { category: "MOVIMIENTOS DIAGONALES", name: "Movimiento-Diagonal-4", fromX: -120, fromY: -60, toX: 120, toY: 65, fromScale: 1.25, toScale: 1.25, easing: "linear" },
  { category: "VERTICALES", name: "Zoom-Vertical-1", sourceScaleBase: 2, fromX: 0, fromY: 776, toX: 0, toY: 1070, fromScale: 1, toScale: 1.25, easing: "linear" },
  { category: "VERTICALES", name: "Zoom-Vertical-2", sourceScaleBase: 2, fromX: 0, fromY: 776, toX: 276, toY: 1070, fromScale: 1, toScale: 1.25, easing: "linear" },
  { category: "VERTICALES", name: "Zoom-Vertical-3", sourceScaleBase: 2, fromX: 0, fromY: 776, toX: -310, toY: 1070, fromScale: 1, toScale: 1.25, easing: "linear" },
  { category: "VERTICALES", name: "Zoom-Vertical-4", sourceScaleBase: 2, fromX: 0, fromY: 776, toX: 0, toY: 360, fromScale: 1, toScale: 1, easing: "linear" },
  { category: "VERTICALES", name: "Movimiento-Vertical-1", sourceScaleBase: 2, fromX: 270, fromY: 905, toX: -274, toY: 905, fromScale: 1.25, toScale: 1.25, easing: "linear" },
  { category: "VERTICALES", name: "Movimiento-Vertical-2", sourceScaleBase: 2, fromX: -274, fromY: 905, toX: 270, toY: 905, fromScale: 1.25, toScale: 1.25, easing: "linear" },
  { category: "HORIZONTALES", name: "Movimiento-horizontal-1", sourceScaleBase: 1.45, fromX: -320, fromY: 0, toX: 320, toY: 0, fromScale: 1, toScale: 1, easing: "linear" },
  { category: "HORIZONTALES", name: "Movimiento-horizontal-2", sourceScaleBase: 1.45, fromX: 320, fromY: 0, toX: -320, toY: 0, fromScale: 1, toScale: 1, easing: "linear" },
  { category: "HORIZONTALES", name: "Movimiento-Diagonal-horizontal-1", sourceScaleBase: 1.45, fromX: 320, fromY: 65, toX: -320, toY: -60, fromScale: 1.2, toScale: 1.2, easing: "linear" },
  { category: "HORIZONTALES", name: "Movimiento-Diagonal-horizontal-2", sourceScaleBase: 1.45, fromX: -320, fromY: -60, toX: 320, toY: 65, fromScale: 1.2, toScale: 1.2, easing: "linear" },
  { category: "HORIZONTALES", name: "Movimiento-Diagonal-horizontal-3", sourceScaleBase: 1.45, fromX: -320, fromY: 65, toX: 320, toY: -60, fromScale: 1.2, toScale: 1.2, easing: "linear" },
  { category: "HORIZONTALES", name: "Movimiento-Diagonal-horizontal-4", sourceScaleBase: 1.45, fromX: 320, fromY: -60, toX: -320, toY: 65, fromScale: 1.2, toScale: 1.2, easing: "linear" },
  { category: "ZOOMS", name: "Zoom-Esquina-Arriba-Derecha", fromX: 0, fromY: 0, toX: -120, toY: 65, fromScale: 1, toScale: 1.25, easing: "linear" },
  { category: "ZOOMS", name: "Zoom-Arriba-Centro", fromX: 0, fromY: 0, toX: 0, toY: 65, fromScale: 1, toScale: 1.25, easing: "linear" },
  { category: "ZOOMS", name: "Zoom-Esquina-Arriba-Izquierda", fromX: 0, fromY: 0, toX: 120, toY: 65, fromScale: 1, toScale: 1.25, easing: "linear" },
  { category: "ZOOMS", name: "Zoom-derecha", fromX: 0, fromY: 0, toX: -120, toY: 0, fromScale: 1, toScale: 1.25, easing: "linear" },
  { category: "ZOOMS", name: "Zoom-Izquierda", fromX: 0, fromY: 0, toX: 120, toY: 0, fromScale: 1, toScale: 1.25, easing: "linear" },
];

function findMotionPreset(idOrName) {
  const key = normalizeMotionPresetKey(idOrName);
  return MOTION_PRESETS.find((preset) => normalizeMotionPresetKey(preset.name) === key) || null;
}

module.exports = { MOTION_PRESET_CATEGORIES, MOTION_PRESETS, findMotionPreset };
