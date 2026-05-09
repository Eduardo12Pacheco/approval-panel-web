export function resolveVideoProjectKey(row = {}) {
  return (row.project_id || row.draft_id || row.id_noticia || row.cluster_id || '').toString();
}

export function resolveVideoProjectTitle(row = {}, fallback = 'Proyecto sin título') {
  return [row.title, row.tema_principal, row.jugador, row.draft_id]
    .map((part) => (part || '').toString().trim())
    .find(Boolean) || fallback;
}
