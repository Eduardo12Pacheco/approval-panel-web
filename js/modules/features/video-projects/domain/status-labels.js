export function getStatusLabel(status = '') {
  const normalized = status.toString().trim().toLowerCase();
  if (normalized === 'ready') return 'Listo';
  if (normalized === 'image_search_error') return 'Error Serper';
  if (normalized === 'no_candidates') return 'Sin imágenes';
  if (normalized === 'pending') return 'Procesando';
  return status || 'Sin estado';
}

export function getPhaseLabel(phase = '') {
  const map = {
    idle: 'Pendiente',
    preparing: 'Preparando…',
    preview_rendering: 'Preparando editor…',
    preview_ready: 'Editor listo',
    editing_dirty: 'Edición (cambios sin exportar)',
    final_rendering: 'Exportando…',
    final_ready: 'Exportación lista',
    error: 'Error',
  };
  return map[phase] || phase;
}
