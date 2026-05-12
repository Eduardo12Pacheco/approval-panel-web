export function createApprovalSearchController({
  state,
  el,
  customDropdowns,
  approvalApi,
  refreshAll,
  renderCards,
  saveLastNewsSearchAt,
  toast,
  getErrorMessage,
}) {
  function getSearchRefreshWindowValue() {
    return el.searchRefreshWindow?.value === '1h' ? '1h' : '24h';
  }

  function getSearchRefreshWindowLabel(value) {
    return value === '1h' ? 'Última hora' : 'Últimas 24 horas';
  }

  function formatNewsSearchTimestamp(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (input) => String(input).padStart(2, '0');
    return `${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function assertSearchRefreshSucceeded(result) {
    const status = (result?.status || '').toString().trim().toLowerCase();
    const promoteStatus = (result?.promote?.status || '').toString().trim().toLowerCase();
    const errorMessage = (result?.error || result?.message || result?.promote?.error || '').toString().trim();

    if (status !== 'ok' || promoteStatus !== 'succeeded') {
      throw new Error(errorMessage || 'La búsqueda no terminó correctamente. El panel actual se mantiene sin cambios.');
    }
  }

  function resolveSearchRefreshCompletionMessage(result, windowLabel) {
    const promote = result?.promote || {};
    const promoted = promote.promoted ?? result?.promoted;
    const noPromoteReason = (promote.no_promote_reason || result?.no_promote_reason || '').toString().trim();

    if (promoted === false) {
      const reasonCopy = noPromoteReason === 'no_staged_clusters'
        ? 'No hubo clusters nuevos para publicar.'
        : 'No se publicaron cambios nuevos.';
      return `Última elección: ${windowLabel}. ${reasonCopy}`;
    }

    return `Última elección: ${windowLabel}. Panel actualizado.`;
  }

  function renderSearchRefreshState() {
    if (!el.searchRefreshBtn || !el.searchRefreshStatus) return;

    el.searchRefreshBtn.disabled = state.searchRefreshRunning;
    el.searchRefreshBtn.textContent = state.searchRefreshRunning ? 'Actualizando...' : 'Actualizar noticias de hoy';
    if (el.searchRefreshWindow) {
      el.searchRefreshWindow.disabled = state.searchRefreshRunning;
      customDropdowns.refreshAll();
    }

    el.searchRefreshStatus.textContent = state.searchRefreshStatus;
    el.searchRefreshStatus.classList.toggle('is-running', state.searchRefreshStatusKind === 'running');
    el.searchRefreshStatus.classList.toggle('is-success', state.searchRefreshStatusKind === 'success');
    el.searchRefreshStatus.classList.toggle('is-error', state.searchRefreshStatusKind === 'error');
  }

  function renderLastNewsSearchMeta() {
    if (!el.lastNewsSearchMeta) return;
    const formatted = formatNewsSearchTimestamp(state.lastNewsSearchAt);
    el.lastNewsSearchMeta.hidden = !formatted;
    el.lastNewsSearchMeta.textContent = formatted ? `Última actualización: ${formatted}` : '';
  }

  async function runSearchRefresh() {
    if (state.searchRefreshRunning) return;

    const windowValue = getSearchRefreshWindowValue();
    const windowLabel = getSearchRefreshWindowLabel(windowValue);
    state.searchRefreshRunning = true;
    state.searchRefreshStatusKind = 'running';
    state.searchRefreshStatus = `Buscando noticias: ${windowLabel}. Esto puede tardar aproximadamente 2 minutos...`;
    state.lastSearchRefresh = null;
    renderSearchRefreshState();

    try {
      const result = await approvalApi.post('/webhook/approval/search-refresh/supabase/v2', { window: windowValue });
      assertSearchRefreshSucceeded(result);
      state.lastSearchRefresh = result;
      state.searchRefreshStatusKind = 'success';
      state.searchRefreshStatus = 'Búsqueda completada. Actualizando panel...';
      renderSearchRefreshState();
      toast('Búsqueda completada. Actualizando noticias...');
      await refreshAll();
      state.lastNewsSearchAt = new Date().toISOString();
      saveLastNewsSearchAt(state.lastNewsSearchAt);
      renderCards();
      state.searchRefreshStatus = resolveSearchRefreshCompletionMessage(result, windowLabel);
    } catch (err) {
      console.error(err);
      const message = getErrorMessage(err, 'Error ejecutando búsqueda');
      state.searchRefreshStatusKind = 'error';
      state.searchRefreshStatus = `Error: ${message}`;
      toast(message);
    } finally {
      state.searchRefreshRunning = false;
      renderSearchRefreshState();
    }
  }

  return {
    getSearchRefreshWindowValue,
    getSearchRefreshWindowLabel,
    formatNewsSearchTimestamp,
    assertSearchRefreshSucceeded,
    resolveSearchRefreshCompletionMessage,
    renderSearchRefreshState,
    renderLastNewsSearchMeta,
    runSearchRefresh,
  };
}
