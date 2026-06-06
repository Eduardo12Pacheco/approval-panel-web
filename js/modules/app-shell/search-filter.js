export function normalizeApprovalSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

export function tokenizeApprovalSearchQuery(value) {
  const normalized = normalizeApprovalSearchText(value);
  return normalized ? normalized.split(' ').filter(Boolean) : [];
}

function collectApprovalSourceSearchFields(sources = []) {
  if (!Array.isArray(sources)) return [];
  return sources.flatMap((source) => [
    source?.titular,
    source?.headline,
    source?.fuente,
    source?.fuente_origen,
    source?.source,
    source?.source_name,
    source?.channel,
    source?.channel_name,
    source?.channel_label,
    source?.canal,
    source?.canal_nombre,
    source?.nombre_canal,
  ]);
}

export function buildApprovalSearchText(item = {}) {
  return normalizeApprovalSearchText([
    item.jugador,
    item.tema_principal,
    item.seleccion,
    item.fuente,
    item.fuente_origen,
    item.source,
    item.source_name,
    item.channel,
    item.channel_name,
    item.channel_label,
    item.canal,
    item.canal_nombre,
    item.nombre_canal,
    item.resumen_cluster,
    ...collectApprovalSourceSearchFields(item.sources),
  ].filter(Boolean).join(' '));
}

export function approvalItemMatchesSearch(item, query) {
  const tokens = Array.isArray(query) ? query : tokenizeApprovalSearchQuery(query);
  if (!tokens.length) return true;

  const searchable = buildApprovalSearchText(item);
  return tokens.every((token) => searchable.includes(token));
}
