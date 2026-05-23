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
  const SEARCH_REFRESH_START_PATH = '/webhook/approval/search-refresh/supabase/v2';
  const SEARCH_REFRESH_STATUS_PATH = '/webhook/approval/search-refresh/status/supabase/v1';
  const SEARCH_REFRESH_POLL_INTERVAL_MS = 5000;
  const SEARCH_REFRESH_MAX_POLL_MS = 60 * 60 * 1000;
  const SEARCH_REFRESH_MAX_STATUS_ERRORS = 5;
  const SEARCH_REFRESH_SUCCESS_STATUSES = new Set(['succeeded']);
  const SEARCH_REFRESH_FAILURE_STATUSES = new Set(['failed', 'error']);

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
    return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
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
    el.lastNewsSearchMeta.hidden = false;
    el.lastNewsSearchMeta.textContent = formatted
      ? `Última actualización del panel: ${formatted}`
      : 'Última actualización del panel: pendiente';
  }

  function getSearchRefreshRunId(result) {
    return String(result?.run_id || result?.created_run?.run_id || '').trim();
  }

  function getSearchRefreshStatusCopy(run, windowLabel) {
    const status = String(run?.status || '').trim().toLowerCase();
    const stats = run?.stats && typeof run.stats === 'object' ? run.stats : {};
    const staged = Number(stats.staged_news || stats.valid || stats.received || 0);
    const clusters = Number(stats.staged_clusters || 0);

    if (status === 'queued') return `Búsqueda en cola: ${windowLabel}. Esperando turno...`;
    if (status === 'running' || status === 'discovery_running') return `Buscando noticias: ${windowLabel}. Proceso iniciado...`;
    if (status === 'discovery_succeeded') return staged > 0
      ? `Noticias encontradas: ${staged}. Agrupando con IA...`
      : 'Búsqueda terminada sin noticias nuevas. Cerrando proceso...';
    if (status === 'cluster_running') return staged > 0
      ? `Agrupando ${staged} noticias con IA. Esto puede tardar varios minutos...`
      : 'Agrupando noticias con IA. Esto puede tardar varios minutos...';
    if (status === 'cluster_succeeded') return clusters > 0
      ? `Clusters listos: ${clusters}. Publicando panel...`
      : 'Clusters listos. Publicando panel...';
    if (status === 'promoting') return 'Publicando noticias nuevas en el panel...';
    if (SEARCH_REFRESH_SUCCESS_STATUSES.has(status)) return 'Búsqueda completada. Actualizando panel...';
    if (SEARCH_REFRESH_FAILURE_STATUSES.has(status)) return 'La búsqueda falló. El panel actual se mantiene sin cambios.';
    return `Proceso en curso: ${windowLabel}. Seguimos esperando respuesta segura...`;
  }

  async function pollSearchRefreshRun({ runId, windowLabel, token }) {
    const startedAt = Date.now();
    let firstPoll = true;

    while (state.searchRefreshPollingToken === token) {
      if (!firstPoll) await wait(SEARCH_REFRESH_POLL_INTERVAL_MS);
      firstPoll = false;

      if (Date.now() - startedAt > SEARCH_REFRESH_MAX_POLL_MS) {
        throw new Error('La búsqueda sigue en proceso desde hace demasiado tiempo. Revisá n8n antes de lanzar otra búsqueda.');
      }

      let run;
      try {
        run = await approvalApi.post(SEARCH_REFRESH_STATUS_PATH, { run_id: runId });
        state.searchRefreshPollingErrorStreak = 0;
      } catch (err) {
        state.searchRefreshPollingErrorStreak += 1;
        if (state.searchRefreshPollingErrorStreak >= SEARCH_REFRESH_MAX_STATUS_ERRORS) throw err;
        state.searchRefreshStatusKind = 'running';
        state.searchRefreshStatus = `La búsqueda sigue corriendo, pero hubo un problema consultando estado (${state.searchRefreshPollingErrorStreak}/${SEARCH_REFRESH_MAX_STATUS_ERRORS}). Reintentando...`;
        renderSearchRefreshState();
        continue;
      }

      const status = String(run?.status || '').trim().toLowerCase();
      state.lastSearchRefresh = run;
      state.searchRefreshStatusKind = SEARCH_REFRESH_FAILURE_STATUSES.has(status) ? 'error' : 'running';
      state.searchRefreshStatus = getSearchRefreshStatusCopy(run, windowLabel);
      renderSearchRefreshState();

      if (SEARCH_REFRESH_FAILURE_STATUSES.has(status)) {
        throw new Error(run?.error_message || run?.message || 'La búsqueda falló en n8n. El panel actual se mantiene sin cambios.');
      }

      if (SEARCH_REFRESH_SUCCESS_STATUSES.has(status)) return run;
    }

    throw new Error('La búsqueda fue reemplazada por otro proceso.');
  }

  async function runSearchRefresh() {
    if (state.searchRefreshRunning) return;

    const windowValue = getSearchRefreshWindowValue();
    const windowLabel = getSearchRefreshWindowLabel(windowValue);
    state.searchRefreshRunning = true;
    state.searchRefreshStatusKind = 'running';
    state.searchRefreshStatus = `Buscando noticias: ${windowLabel}. Esto puede tardar varios minutos...`;
    state.lastSearchRefresh = null;
    renderSearchRefreshState();

    try {
      const result = await approvalApi.post(SEARCH_REFRESH_START_PATH, { window: windowValue });
      const runId = getSearchRefreshRunId(result);
      const isAsyncRun = String(result?.status || '').toLowerCase() === 'accepted' && runId;

      let finalResult = result;
      if (isAsyncRun) {
        const token = Symbol(`search-refresh:${runId}`);
        state.searchRefreshRunId = runId;
        state.searchRefreshPollingToken = token;
        state.searchRefreshPollingErrorStreak = 0;
        state.searchRefreshStatus = `Búsqueda iniciada (${runId}). Podés dejarla corriendo; voy actualizando el estado...`;
        renderSearchRefreshState();
        finalResult = await pollSearchRefreshRun({ runId, windowLabel, token });
      } else {
        assertSearchRefreshSucceeded(result);
      }

      state.lastSearchRefresh = finalResult;
      state.searchRefreshStatusKind = 'success';
      state.searchRefreshStatus = 'Búsqueda completada. Actualizando panel...';
      renderSearchRefreshState();
      toast('Búsqueda completada. Actualizando noticias...');
      await refreshAll();
      state.lastNewsSearchAt = finalResult?.promoted_at || finalResult?.completed_at || new Date().toISOString();
      saveLastNewsSearchAt(state.lastNewsSearchAt);
      renderLastNewsSearchMeta();
      renderCards();
      state.searchRefreshStatus = isAsyncRun
        ? `Última elección: ${windowLabel}. Panel actualizado.`
        : resolveSearchRefreshCompletionMessage(result, windowLabel);
    } catch (err) {
      console.error(err);
      const message = getErrorMessage(err, 'Error ejecutando búsqueda');
      state.searchRefreshStatusKind = 'error';
      state.searchRefreshStatus = `Error: ${message}`;
      toast(message);
    } finally {
      state.searchRefreshPollingToken = null;
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
