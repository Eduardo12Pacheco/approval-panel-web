export function getStatusLabel(status = '') {
  const normalized = status.toString().trim().toLowerCase();
  if (normalized === 'ready') return 'Listo';
  if (normalized === 'image_search_error') return 'Error Serper';
  if (normalized === 'no_candidates') return 'Sin imágenes';
  if (normalized === 'pending') return 'Buscando imágenes…';
  return status || 'Sin estado';
}

export function getProjectPhaseLabel(project = {}) {
  const status = (project.status || '').toString().trim().toLowerCase();
  const editorPhase = (project.editor_state?.phase || '').toString().trim().toLowerCase();
  const exportStatus = (project.editor_state?.export_status || '').toString().trim().toLowerCase();
  const currentStep = (project._videoProjectStep || '').toString().trim().toLowerCase();

  if (editorPhase === 'final_rendering' || exportStatus === 'rendering') return 'Renderizado';
  if (editorPhase === 'final_ready' || exportStatus === 'ready') return 'Renderizado';
  if (['preparing', 'preview_rendering', 'preview_ready', 'editing_dirty', 'error'].includes(editorPhase)) return 'Edición';
  if (currentStep === 'audio' || project.voice_audio?.public_url || project.background_audio?.public_url) return 'Audio';
  if (status === 'image_search_error') return 'Imágenes · error';
  if (status === 'no_candidates') return 'Imágenes · sin resultados';
  return 'Imágenes';
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
