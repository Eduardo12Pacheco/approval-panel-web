export function createScriptsFeature({ api, store, ui, selectors, callbacks }) {
  const { renderScriptStats, renderScriptCards, updateWordCounter } = callbacks;

  async function refreshScriptDrafts() {
    const state = store.getState();
    try {
      const data = await api.get('/webhook/mvp-script-drafts-pending-v1');
      state.scriptDrafts = data.drafts || [];
      renderScriptStats();
      renderScriptCards();
    } catch (err) {
      console.error(err);
      ui.toast('Error cargando borradores');
    }
  }

  function resolveScriptIdentity(row = {}) {
    return {
      draft_id: (row.draft_id || '').toString(),
      id_noticia: (row.id_noticia || '').toString(),
      cluster_id: (row.cluster_id || '').toString(),
    };
  }

  function matchesIdentity(row = {}, requested = '') {
    const id = (requested || '').toString();
    if (!id) return false;
    const ids = resolveScriptIdentity(row);
    return ids.draft_id === id || ids.id_noticia === id || ids.cluster_id === id;
  }

  async function openScriptEditor(scriptId) {
    const state = store.getState();
    await refreshScriptDrafts();
    const row = state.scriptDrafts.find((item) => matchesIdentity(item, scriptId));
    if (!row) {
      ui.toast('Ese borrador ya no existe o cambió. Actualizá la lista.');
      return;
    }
    state.selectedScript = row;
    selectors.scriptEditorTitle.textContent = `${row.jugador || 'Sin jugador'} · ${row.tema_principal || 'Sin tema'}`;
    selectors.scriptEditorMeta.textContent = `Estado: ${row.estado || 'borrador_generado'}`;
    selectors.scriptEditedArea.value = (row.guion_editado || row.guion_draft || '').toString();
    updateWordCounter(selectors.scriptEditedArea.value, selectors.scriptEditedWordCount);
    selectors.scriptEditorDialog.showModal();
  }

  async function saveSelectedScript() {
    const state = store.getState();
    if (!state.selectedScript || state.savingScript) return;
    const edited = selectors.scriptEditedArea.value.trim();
    if (edited.length < 20) {
      ui.toast('El guion editado es demasiado corto');
      return;
    }

    try {
      state.savingScript = true;
      selectors.saveDraftBtn.disabled = true;
      const ids = resolveScriptIdentity(state.selectedScript);
      await api.post('/webhook/mvp-script-draft-save-v1', {
        ...ids,
        guion_editado: edited,
      });
      ui.toast('Cambios guardados');
      await refreshScriptDrafts();
      if (state.selectedScript) {
        const selectedIds = resolveScriptIdentity(state.selectedScript);
        const refreshed = state.scriptDrafts.find((item) => {
          const rowIds = resolveScriptIdentity(item);
          return (
            (selectedIds.draft_id && rowIds.draft_id === selectedIds.draft_id)
            || (selectedIds.id_noticia && rowIds.id_noticia === selectedIds.id_noticia)
            || (selectedIds.cluster_id && rowIds.cluster_id === selectedIds.cluster_id)
          );
        });
        if (refreshed) state.selectedScript = refreshed;
      }
      selectors.scriptEditorMeta.textContent = 'Estado: en_revision';
    } catch (err) {
      console.error(err);
      if (String(err?.message || '').toLowerCase().includes('cluster_id no encontrado')) {
        ui.toast('El borrador cambió o ya no existe. Actualizá la lista.');
        await refreshScriptDrafts();
        selectors.scriptEditorDialog.close();
        return;
      }
      ui.toast('Error guardando cambios');
    } finally {
      state.savingScript = false;
      selectors.saveDraftBtn.disabled = false;
    }
  }

  async function publishSelectedScript() {
    const state = store.getState();
    if (!state.selectedScript || state.publishingScript) return;
    const edited = selectors.scriptEditedArea.value.trim();
    if (edited.length < 20) {
      ui.toast('Guardá un guion válido antes de publicar');
      return;
    }

    try {
      state.publishingScript = true;
      selectors.confirmPublishBtn.disabled = true;
      const ids = resolveScriptIdentity(state.selectedScript);
      await api.post('/webhook/mvp-script-draft-save-v1', {
        ...ids,
        guion_editado: edited,
      });
      await api.post('/webhook/mvp-script-publish-v1', {
        ...ids,
      });
      selectors.publishConfirmDialog.close();
      selectors.scriptEditorDialog.close();
      state.selectedScript = null;
      ui.toast('Guion publicado correctamente');
      await refreshScriptDrafts();
    } catch (err) {
      console.error(err);
      if (String(err?.message || '').toLowerCase().includes('cluster_id no encontrado')) {
        ui.toast('El borrador cambió o ya no existe. Actualizá la lista.');
        await refreshScriptDrafts();
        selectors.publishConfirmDialog.close();
        selectors.scriptEditorDialog.close();
        return;
      }
      ui.toast('Error publicando guion');
    } finally {
      state.publishingScript = false;
      selectors.confirmPublishBtn.disabled = false;
    }
  }

  return {
    refreshScriptDrafts,
    openScriptEditor,
    saveSelectedScript,
    publishSelectedScript,
  };
}
