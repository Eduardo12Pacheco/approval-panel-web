export const MOTION_PRESET_CATEGORIES = ['ZOOMS', 'MOVIMIENTOS', 'MOVIMIENTOS DIAGONALES', 'VERTICALES', 'HORIZONTALES'];

export const MOTION_PRESETS = [
  { category: 'MOVIMIENTOS', name: 'Movimiento-derecha-Izquierda-150-amplio', fromX: -325, fromY: 0, toX: 315, toY: 0, fromScale: 1.5, toScale: 1.5, easing: 'linear' },
  { category: 'MOVIMIENTOS', name: 'Movimiento-Izquierda-Derecha', fromX: 240, fromY: 0, toX: -240, toY: 0, fromScale: 1.25, toScale: 1.25, easing: 'linear' },
  { category: 'MOVIMIENTOS', name: 'Movimiento-Derecha-Izquierda', fromX: -240, fromY: 0, toX: 238.4, toY: 0, fromScale: 1.25, toScale: 1.25, easing: 'linear' },
  { category: 'MOVIMIENTOS DIAGONALES', name: 'Movimiento-Diagonal-1', fromX: -240, fromY: 120, toX: 240, toY: -20, fromScale: 1.25, toScale: 1.25, easing: 'linear' },
  { category: 'VERTICALES', name: 'Zoom-Vertical-1', sourceScaleBase: 2, fromX: 0, fromY: 776, toX: 0, toY: 1070, fromScale: 1, toScale: 1.25, easing: 'linear' },
  { category: 'HORIZONTALES', name: 'Movimiento-horizontal-1', sourceScaleBase: 1.45, fromX: -310, fromY: 0, toX: 320, toY: 0, fromScale: 1, toScale: 1, easing: 'linear' },
  { category: 'ZOOMS', name: 'Zoom-125', fromX: 0, fromY: 0, toX: 0, toY: 0, fromScale: 1, toScale: 1.25, easing: 'linear' },
  { category: 'ZOOMS', name: 'Zoom-Esquina-Arriba-Derecha', fromX: 0, fromY: 0, toX: -229, toY: 114, fromScale: 1, toScale: 1.25, easing: 'linear' },
  { category: 'ZOOMS', name: 'Zoom-Arriba-Centro', fromX: 0, fromY: 0, toX: 0, toY: 115, fromScale: 1, toScale: 1.25, easing: 'linear' },
  { category: 'ZOOMS', name: 'Zoom-Esquina-Arriba-Izquierda', fromX: 0, fromY: 0, toX: 231, toY: 115, fromScale: 1, toScale: 1.25, easing: 'linear' },
  { category: 'ZOOMS', name: 'Zoom-derecha', fromX: 0, fromY: 0, toX: -240, toY: 0, fromScale: 1, toScale: 1.25, easing: 'linear' },
  { category: 'ZOOMS', name: 'Zoom-Izquierda', fromX: 0, fromY: 0, toX: 240, toY: 0, fromScale: 1, toScale: 1.25, easing: 'linear' },
];

export function findMotionPreset(idOrName = '') {
  const key = idOrName.toString().trim().toLowerCase();
  return MOTION_PRESETS.find((preset) => preset.name.toLowerCase() === key) || null;
}
