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

export function buildApprovalSearchText(item = {}) {
  return normalizeApprovalSearchText([
    item.jugador,
    item.tema_principal,
    item.seleccion,
    item.fuente,
    item.resumen_cluster,
  ].filter(Boolean).join(' '));
}

export function approvalItemMatchesSearch(item, query) {
  const tokens = Array.isArray(query) ? query : tokenizeApprovalSearchQuery(query);
  if (!tokens.length) return true;

  const searchable = buildApprovalSearchText(item);
  return tokens.every((token) => searchable.includes(token));
}
