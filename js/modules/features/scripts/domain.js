export function normalizeScriptDraftRows(payload = {}) {
  const candidates = [payload?.drafts, payload?.items, payload?.rows, payload?.data];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

export function resolveScriptListKey(row = {}) {
  return (row.draft_id || row.id_noticia || row.cluster_id || '').toString();
}

export function resolveScriptTitle(row = {}, fallback = 'Sin tema') {
  const title = [
    row.titulo_noticia,
    row.titular,
    row.headline,
    row.title,
    row.titulo,
    row.tema_principal,
  ]
    .map((part) => (part || '').toString().trim())
    .find(Boolean);

  return title || fallback;
}

export function isScriptProcessed(row = {}) {
  const status = (row.estado_guion || row.estado || '').toString().trim().toLowerCase();
  return status === 'publicado' || Boolean(row.doc_id);
}

export function resolveScriptIdentity(row = {}) {
  return {
    draft_id: (row.draft_id || '').toString(),
    id_noticia: (row.id_noticia || '').toString(),
    cluster_id: (row.cluster_id || '').toString(),
  };
}

export function buildScriptDocxFilename(row = {}) {
  const base = [row.jugador, resolveScriptTitle(row, '')]
    .map((part) => (part || '').toString().trim())
    .filter(Boolean)
    .join(' - ')
    || row.draft_id
    || row.id_noticia
    || row.cluster_id
    || 'guion';

  const safe = base
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._ -]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90)
    || 'guion';

  return `${safe}.docx`;
}
