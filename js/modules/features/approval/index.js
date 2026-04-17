export function createApprovalFeature({ api, store, ui, selectors, callbacks, helpers }) {
  const { renderStats, renderCountryFilter, renderCards, renderQueue, renderTopicDetail, confirmDelete } = callbacks;
  const { getErrorMessage } = helpers;

  async function refreshPending() {
    const state = store.getState();
    try {
      const data = await api.get('/webhook/approval/pending/v1');
      state.items = (data.items || []).map((item) => ({
        ...item,
        resumen_cluster: (item.resumen_cluster ?? item.resumen ?? '').toString(),
      }));
      renderStats();
      renderCountryFilter();
      renderCards();
    } catch (err) {
      console.error(err);
      ui.toast('Error cargando pendientes');
    }
  }

  async function refreshQueue() {
    const state = store.getState();
    try {
      const data = await api.get('/webhook/approval/queue/v1');
      state.queue = data.items || [];
      renderQueue();
    } catch (err) {
      console.error(err);
      ui.toast('Error cargando cola de aprobados');
    }
  }

  async function openDetail(clusterId) {
    const state = store.getState();
    try {
      const data = await api.get(`/webhook/approval/topic/v1?cluster_id=${encodeURIComponent(clusterId)}`);
      state.selectedCardId = clusterId;
      state.selectedTopic = data.item;
      renderTopicDetail();
      selectors.topicDialog.showModal();
    } catch (err) {
      console.error(err);
      ui.toast('No pude abrir el detalle');
    }
  }

  async function removeSourceFromTopic(removeIndex) {
    const state = store.getState();
    if (!state.selectedTopic || !state.selectedTopic.cluster_id) return;
    if (state.deletingSource) return;

    const confirmed = confirmDelete('¿Eliminar esta fuente de la noticia?');
    if (!confirmed) return;

    const clusterId = state.selectedTopic.cluster_id;
    const currentSources = Array.isArray(state.selectedTopic.sources) ? state.selectedTopic.sources : [];
    const optimistic = currentSources
      .filter((source) => Number(source.index) !== removeIndex)
      .map((source, idx) => ({ ...source, index: idx + 1 }));

    state.selectedTopic = {
      ...state.selectedTopic,
      sources: optimistic,
      cantidad_fuentes: optimistic.length,
    };
    state.deletingSource = true;
    renderTopicDetail();

    try {
      await api.post('/webhook/approval/sources/v1', {
        cluster_id: clusterId,
        remove_index: removeIndex,
      });
      ui.toast('Fuente eliminada');
      await refreshPending();
      await openDetail(clusterId);
    } catch (err) {
      console.error(err);
      ui.toast('Error eliminando fuente');
      await openDetail(clusterId);
    } finally {
      state.deletingSource = false;
      renderTopicDetail();
    }
  }

  async function decision(clusterId, action, refreshAll) {
    try {
      await api.post('/webhook/approval/decision/v1', { cluster_id: clusterId, action });
      ui.toast(`Tema ${action === 'approve' ? 'aprobado' : 'rechazado'}`);
      await refreshAll();
    } catch (err) {
      console.error(err);
      ui.toast('Error al registrar decisión');
    }
  }

  async function runQueue(refreshAll) {
    try {
      selectors.runQueueBtn.disabled = true;
      selectors.runQueueBtn.textContent = 'Ejecutando...';
      const result = await api.post('/webhook/approval/run-queue/v1', { max_items: 20 });
      ui.toast(`Cola ejecutada: ${result.processed || 0} OK · ${result.failed || 0} error(es)`);
      await refreshAll();
    } catch (err) {
      console.error(err);
      ui.toast(getErrorMessage(err, 'Error ejecutando cola'));
    } finally {
      selectors.runQueueBtn.disabled = false;
      selectors.runQueueBtn.textContent = 'Ejecutar cola';
    }
  }

  return {
    refreshPending,
    refreshQueue,
    openDetail,
    removeSourceFromTopic,
    decision,
    runQueue,
  };
}
