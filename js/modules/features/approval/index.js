const normalizeText = (value) => (value == null ? '' : String(value).trim());
const toFiniteNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const pickFirstText = (...values) => {
  for (const value of values) {
    const normalized = normalizeText(value);
    if (normalized) return normalized;
  }
  return '';
};

export function resolveApprovalSourceLink(source = {}) {
  return pickFirstText(
    source?.url,
    source?.link,
    source?.href,
    source?.detail_url,
    source?.source_url,
  );
}

export function normalizeApprovalQueueItems(payload = {}) {
  const candidates = [payload?.items, payload?.queue, payload?.rows, payload?.data];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

export function createApprovalFeature({ api, store, ui, selectors, callbacks, helpers }) {
  const {
    renderStats,
    renderCountryFilter,
    renderCards,
    renderQueue,
    renderTopicDetail,
    refreshScriptDrafts = async () => {},
    confirmDelete,
  } = callbacks;
  const { getErrorMessage } = helpers;

  function buildClusterSnapshot(topic, approvedIdNoticia) {
    const currentSources = Array.isArray(topic?.sources) ? topic.sources : [];
    const ids = currentSources.map((source) => normalizeText(source?.id_noticia));
    const titulares = currentSources.map((source) => pickFirstText(source?.titular, source?.headline));
    const links = currentSources.map((source) => resolveApprovalSourceLink(source));
    const fuentes = currentSources.map((source) => pickFirstText(source?.fuente, source?.fuente_origen, source?.source));

    const approvedId = normalizeText(approvedIdNoticia);
    const approvedCount = Math.max(
      toFiniteNumber(topic?.cantidad_fuentes_aprobadas, 0),
      toFiniteNumber(topic?.approved_sources_count, 0),
      0,
    );
    const totalCount = Math.max(
      toFiniteNumber(topic?.cantidad_fuentes_total, 0),
      currentSources.length + approvedCount,
      currentSources.length,
    );
    const availableCount = approvedId
      ? ids.filter((value) => value && value !== approvedId).length
      : ids.filter(Boolean).length;

    return {
      ids_noticias_relacionadas: ids,
      titulares_relacionados: titulares,
      links_relacionados: links,
      fuentes_relacionadas: fuentes,
      cantidad_fuentes_total: Math.max(totalCount, availableCount, approvedCount + (approvedId ? 1 : 0)),
      cantidad_fuentes_disponibles: availableCount,
      cantidad_fuentes_aprobadas: Math.min(totalCount || approvedCount + 1, approvedCount + (approvedId ? 1 : 0)),
    };
  }

  function buildDecisionPayload(topic, source, action) {
    const idNoticia = normalizeText(source?.id_noticia);
    const clusterId = pickFirstText(topic?.cluster_id, source?.cluster_id);
    const temaPrincipal = pickFirstText(topic?.tema_principal, source?.tema_principal);
    const selection = pickFirstText(topic?.seleccion, topic?.['selección'], source?.seleccion, source?.['selección']);
    const jugador = pickFirstText(topic?.jugador, source?.jugador);
    const clusterSnapshot = buildClusterSnapshot(topic, idNoticia);

    return {
      action,
      id_noticia: idNoticia,
      cluster_id: clusterId,
      tema_principal: temaPrincipal,
      seleccion: selection,
      jugador,
      titular: pickFirstText(source?.titular, source?.headline),
      fuente: pickFirstText(source?.fuente, source?.fuente_origen, source?.source),
      link: resolveApprovalSourceLink(source),
      snippet: pickFirstText(source?.snippet, source?.resumen),
      fuente_origen: pickFirstText(source?.fuente_origen, source?.fuente, source?.source),
      fecha_publicacion: pickFirstText(source?.fecha_publicacion),
      fecha_detectada: pickFirstText(source?.fecha_detectada),
      estado_revision_actual: pickFirstText(source?.estado_revision),
      queue_id: pickFirstText(source?.queue_id),
      estado_queue_actual: pickFirstText(source?.estado_queue),
      attempts_actuales: toFiniteNumber(source?.attempts, 0),
      last_error_actual: pickFirstText(source?.last_error),
      timestamps_actuales: pickFirstText(source?.timestamps),
      resumen_cluster: pickFirstText(topic?.resumen_cluster, topic?.resumen),
      tag_editorial: pickFirstText(topic?.tag_editorial),
      ...clusterSnapshot,
    };
  }

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

  async function refreshQueue({ silent = false } = {}) {
    const state = store.getState();
    try {
      const data = await api.get('/webhook/approval/queue/v2');
      state.queue = normalizeApprovalQueueItems(data);
      renderQueue();
    } catch (err) {
      console.error(err);
      if (!silent) {
        ui.toast('Error cargando cola de aprobados');
      }
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

  async function removeSourceFromTopic(sourceToRemove) {
    const state = store.getState();
    if (!state.selectedTopic || !state.selectedTopic.cluster_id) return;
    if (state.deletingSource) return;

    const confirmed = confirmDelete('¿Eliminar esta fuente de la noticia?');
    if (!confirmed) return;

    const clusterId = state.selectedTopic.cluster_id;
    const idNoticia = (sourceToRemove?.id_noticia || '').toString().trim();
    const removeIndex = Number(sourceToRemove?.index || 0);
    const currentSources = Array.isArray(state.selectedTopic.sources) ? state.selectedTopic.sources : [];
    const optimistic = currentSources
      .filter((source) => {
        if (idNoticia) return (source.id_noticia || '').toString() !== idNoticia;
        return Number(source.index) !== removeIndex;
      })
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
        id_noticia: idNoticia,
        cluster_id: clusterId,
        estado_revision: 'descartada',
        reason: 'fuente_descartada_desde_panel',
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

  async function approveSourceFromTopic(source) {
    const state = store.getState();
    const idNoticia = (source?.id_noticia || '').toString().trim();
    const clusterId = (state.selectedTopic?.cluster_id || '').toString().trim();

    if (!idNoticia) {
      ui.toast('Esta fuente no tiene id_noticia. Actualizá clusters y volvé a intentar.');
      return;
    }

    try {
      state.approvingSourceId = idNoticia;
      renderTopicDetail();

      await api.post('/webhook/approval/decision/v2', buildDecisionPayload(state.selectedTopic, source, 'approve'));
      ui.toast('Noticia aprobada y encolada para guion');
      await refreshPending();
      await Promise.all([refreshQueue(), refreshScriptDrafts()]);
      await openDetail(clusterId);
    } catch (err) {
      console.error(err);
      ui.toast(getErrorMessage(err, 'Error aprobando noticia'));
    } finally {
      state.approvingSourceId = '';
      renderTopicDetail();
    }
  }

  async function decision(clusterId, action, refreshAll) {
    try {
      await api.post('/webhook/approval/decision/v2', { cluster_id: clusterId, action });
      ui.toast(`Tema ${action === 'approve' ? 'aprobado' : 'rechazado'}`);
      await refreshAll();
    } catch (err) {
      console.error(err);
      ui.toast('Error al registrar decisión');
    }
  }

  async function runQueue(refreshAll) {
    const runButton = selectors.runQueueBtn;
    try {
      if (runButton) {
        runButton.disabled = true;
        runButton.textContent = 'Actualizando...';
      }
      await refreshAll();
      ui.toast('La cola ahora se procesa automáticamente. Monitor actualizado.');
    } catch (err) {
      console.error(err);
      ui.toast(getErrorMessage(err, 'Error actualizando cola'));
    } finally {
      if (runButton) {
        runButton.disabled = false;
        runButton.textContent = 'Actualizar cola';
      }
    }
  }

  return {
    refreshPending,
    refreshQueue,
    openDetail,
    removeSourceFromTopic,
    approveSourceFromTopic,
    decision,
    runQueue,
  };
}
