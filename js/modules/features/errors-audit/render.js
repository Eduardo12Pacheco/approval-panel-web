import { normalizeGatewayEvent } from './state.js';

function escapeHtml(value) {
  return (value ?? '').toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(value = '') {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.toString();
  return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }).format(date).replace(/\./g, '') + ' UTC';
}

export function renderErrorsAuditEvents({ el, state }) {
  if (el.errorsAuditStatus) {
    el.errorsAuditStatus.textContent = state.status === 'loading'
      ? 'Cargando eventos Gateway.'
      : state.status === 'error'
        ? 'No pude cargar eventos Gateway.'
        : `${state.events?.length || 0} eventos`;
  }
  if (!el.errorsAuditList) return;
  if (state.status === 'loading') {
    el.errorsAuditList.innerHTML = '<article class="errors-audit-empty">Cargando eventos.</article>';
    return;
  }
  if (state.status === 'error') {
    el.errorsAuditList.innerHTML = `<article class="errors-audit-error" role="alert"><strong>Eventos Gateway no disponibles.</strong><p>${escapeHtml(safeErrorMessage(state.error))}</p><button type="button" data-errors-audit-action="refresh">Reintentar</button></article>`;
    return;
  }
  const events = Array.isArray(state.events) ? state.events.map(normalizeGatewayEvent) : [];
  el.errorsAuditList.innerHTML = events.length
    ? events.map(renderEventCard).join('')
    : '<article class="errors-audit-empty">Sin eventos para estos filtros.</article>';
}

export function renderErrorsAuditDetail({ el, event }) {
  if (!el.errorsAuditDetail) return;
  if (!event) {
    el.errorsAuditDetail.innerHTML = '<p class="meta">Seleccioná un evento para ver el detalle.</p>';
    return;
  }
  const item = normalizeGatewayEvent(event);
  el.errorsAuditDetail.innerHTML = `
    <section class="errors-audit-detail" aria-live="polite">
      <header>
        <span class="errors-audit-chip">${escapeHtml(item.kind)}</span>
        <div><h3>${escapeHtml(item.safeMessage || item.reasonCode || 'Evento Gateway')}</h3><p class="meta">${escapeHtml(formatDate(item.timestamp))}</p></div>
      </header>
      ${detailRow('Correlation ID', item.correlationId)}
      ${detailRow('Estado', item.status)}
      ${detailRow('Ruta / servicio', [item.method, item.path, item.routeService].filter(Boolean).join(' · '))}
      ${detailRow('Actor / sesión', [item.actorLabel, item.sessionId].filter(Boolean).join(' · '))}
      ${detailRow('Acción / motivo', [item.action, item.reasonCode].filter(Boolean).join(' · '))}
      <pre class="errors-audit-context">${escapeHtml(JSON.stringify(item.context || {}, null, 2))}</pre>
    </section>`;
}

function renderEventCard(rawEvent) {
  const item = normalizeGatewayEvent(rawEvent);
  const meta = [item.kind, item.status, item.routeService, item.actorLabel].filter(Boolean).join(' · ');
  return `
    <article class="errors-audit-card" data-errors-audit-event-id="${escapeHtml(item.id)}">
      <button type="button" data-errors-audit-action="detail" data-errors-audit-event-id="${escapeHtml(item.id)}">
        <span class="errors-audit-card__status">${escapeHtml(item.kind)}</span>
        <strong>${escapeHtml(item.safeMessage || item.reasonCode || item.action || 'Evento Gateway')}</strong>
        <small>${escapeHtml(meta)}</small>
        <code>${escapeHtml(item.correlationId || 'sin correlación')}</code>
      </button>
    </article>`;
}

function detailRow(label, value) {
  return `<p><strong>${escapeHtml(label)}</strong>: ${escapeHtml(value || '—')}</p>`;
}

function safeErrorMessage(message = '') {
  const text = (message || '').toString();
  if (!text) return 'Iniciá sesión o reintentá la lectura.';
  return text.replace(/Detalle:.*/i, '').replace(/raw[-_\w]*secret[-_\w]*/gi, '[redacted]').trim() || 'Iniciá sesión o reintentá la lectura.';
}
