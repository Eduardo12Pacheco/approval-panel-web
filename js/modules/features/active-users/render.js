import { emptyPresenceSnapshot, normalizePresenceSnapshot } from './state.js';

function escapeHtml(value) {
  return (value ?? '').toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(value = '') {
  if (!value) return 'Sin actividad reciente';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.toString();
  return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }).format(date).replace(/\./g, '') + ' UTC';
}

export function renderActiveUsersView({ el, state }) {
  const snapshot = state.status === 'error'
    ? emptyPresenceSnapshot()
    : normalizePresenceSnapshot(state.snapshot);

  if (el.activeUsersStatus) {
    el.activeUsersStatus.textContent = state.status === 'loading'
      ? 'Cargando usuarios activos.'
      : state.status === 'error'
        ? 'No pude cargar usuarios activos.'
        : `${snapshot.sessions.length} sesiones activas`;
  }
  if (!el.activeUsersList) return;
  if (state.status === 'loading') {
    el.activeUsersList.innerHTML = '<article class="active-users-empty">Cargando actividad.</article>';
    return;
  }
  if (state.status === 'error') {
    el.activeUsersList.innerHTML = `<article class="active-users-error" role="alert"><strong>Activos no disponible.</strong><p>${escapeHtml(state.error || 'Iniciá sesión o reintentá la lectura.')}</p><button type="button" data-active-users-action="refresh">Reintentar</button></article>`;
    return;
  }
  el.activeUsersList.innerHTML = snapshot.sessions.length
    ? snapshot.sessions.map(renderPresenceCard).join('')
    : '<article class="active-users-empty">No hay sesiones activas para mostrar.</article>';
}

function renderPresenceCard(session) {
  return `
    <article class="active-users-card">
      <header>
        <strong>${escapeHtml(session.actorLabel)}</strong>
        <span>${escapeHtml(session.mode)}</span>
      </header>
      <p>${escapeHtml(session.area)} · ${escapeHtml(session.resourceLabel)}</p>
      <small>Última actividad: ${escapeHtml(formatDate(session.lastActivityAt))}</small>
    </article>`;
}
