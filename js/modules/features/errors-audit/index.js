import { buildGatewayEventsFilters, createErrorsAuditState } from './state.js';
import { renderErrorsAuditDetail, renderErrorsAuditEvents } from './render.js';

export { createErrorsAuditApiClient } from './api-client.js';
export { createErrorsAuditState } from './state.js';

export function createErrorsAuditController({ state = createErrorsAuditState(), el, api, ui = {} }) {
  function toast(message) { ui.toast?.(message); }
  function readFilters() {
    return buildGatewayEventsFilters({
      kind: el.errorsAuditKindFilter?.value,
      status: el.errorsAuditStatusFilter?.value,
      service: el.errorsAuditServiceFilter?.value,
      actor: el.errorsAuditActorFilter?.value,
      correlationId: el.errorsAuditCorrelationFilter?.value,
      from: el.errorsAuditFromFilter?.value,
      to: el.errorsAuditToFilter?.value,
      limit: 50,
    });
  }

  function render() {
    renderErrorsAuditEvents({ el, state });
  }

  async function refresh({ silent = false } = {}) {
    if (state.refreshInFlight) return;
    state.refreshInFlight = true;
    state.status = silent ? state.status : 'loading';
    state.filters = readFilters();
    render();
    try {
      const payload = await api.events(state.filters);
      state.events = Array.isArray(payload?.events) ? payload.events : [];
      state.retention = payload?.retention || null;
      state.status = 'ready';
      state.error = '';
      if (!state.selectedEventId && state.events[0]) state.selectedEventId = state.events[0].event_id || state.events[0].id || '';
      renderErrorsAuditDetail({ el, event: findSelectedEvent() });
    } catch (error) {
      state.status = 'error';
      state.error = error?.message || 'Gateway events no disponible.';
      if (!silent) toast(state.error);
    } finally {
      state.refreshInFlight = false;
      render();
    }
  }

  async function activate() {
    await refresh();
  }

  function deactivate() {}

  function openDetail(eventId) {
    state.selectedEventId = eventId || '';
    renderErrorsAuditDetail({ el, event: findSelectedEvent() });
  }

  function bindEvents() {
    el.errorsAuditRefreshBtn?.addEventListener?.('click', async (event) => {
      event?.preventDefault?.();
      await refresh();
    });
    const filterEls = [
      el.errorsAuditKindFilter,
      el.errorsAuditStatusFilter,
      el.errorsAuditServiceFilter,
      el.errorsAuditActorFilter,
      el.errorsAuditCorrelationFilter,
      el.errorsAuditFromFilter,
      el.errorsAuditToFilter,
    ];
    for (const filterEl of filterEls) {
      filterEl?.addEventListener?.('change', () => { void refresh({ silent: true }); });
    }
    el.errorsAuditList?.addEventListener?.('click', async (event) => {
      const button = event.target?.closest?.('[data-errors-audit-action]');
      if (!button) return;
      if (button.dataset.errorsAuditAction === 'refresh') {
        await refresh();
        return;
      }
      openDetail(button.dataset.errorsAuditEventId || '');
    });
  }

  function findSelectedEvent() {
    return (state.events || []).find((event) => (event.event_id || event.id) === state.selectedEventId) || state.events?.[0] || null;
  }

  return { activate, deactivate, bindEvents, refresh, openDetail, render };
}
