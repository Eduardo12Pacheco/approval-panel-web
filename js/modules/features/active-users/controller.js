import { emptyPresenceSnapshot, createActiveUsersState } from './state.js';
import { renderActiveUsersView } from './render.js';

export function createActiveUsersController({ state = createActiveUsersState(), el, api, ui = {} }) {
  function toast(message) { ui.toast?.(message); }

  function render() {
    renderActiveUsersView({ el, state });
  }

  async function refresh({ silent = false } = {}) {
    if (state.refreshInFlight) return;
    state.refreshInFlight = true;
    state.status = silent ? state.status : 'loading';
    render();
    try {
      state.snapshot = await api.presence();
      state.status = 'ready';
      state.error = '';
    } catch (error) {
      state.status = 'error';
      state.snapshot = emptyPresenceSnapshot();
      state.error = error?.message || 'Activos no disponible.';
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

  function bindEvents() {
    el.activeUsersRefreshBtn?.addEventListener?.('click', async (event) => {
      event?.preventDefault?.();
      await refresh();
    });
    el.activeUsersList?.addEventListener?.('click', async (event) => {
      const button = event.target?.closest?.('[data-active-users-action="refresh"]');
      if (button) await refresh();
    });
  }

  return { activate, deactivate, bindEvents, refresh, render };
}
