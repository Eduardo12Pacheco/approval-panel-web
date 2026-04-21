import { escapeHtmlCore } from '../../core/ui/escape-html.js';

function normalizeNewsCardText(value, fallback) {
  const normalized = (value ?? '').toString().trim();
  return normalized || fallback;
}

export function buildApprovalNewsCardMarkup(item = {}) {
  const clusterId = encodeURIComponent(normalizeNewsCardText(item.cluster_id, ''));
  const title = escapeHtmlCore(normalizeNewsCardText(item.tema_principal, 'Sin tema'));
  const country = escapeHtmlCore(normalizeNewsCardText(item.seleccion, 'Sin país'));
  const player = escapeHtmlCore(normalizeNewsCardText(item.jugador, 'Sin jugador'));
  const sources = Number(item.cantidad_fuentes || 0);
  const metaLine = `${country} · ${player} · ${sources} fuentes`;

  return `
    <article
      class="card card--approval card--approval-compact"
      data-card-id="${clusterId}"
      role="button"
      tabindex="0"
      aria-label="Abrir detalle de ${title}"
    >
      <div class="card-title">${title}</div>
      <div class="card-meta-row"><span>${metaLine}</span></div>
    </article>
  `;
}
