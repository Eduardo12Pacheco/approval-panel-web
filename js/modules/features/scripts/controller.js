import {
  buildScriptDocxFilename,
  isScriptProcessed,
  normalizeScriptDraftRows,
  resolveScriptIdentity,
  resolveScriptListKey,
} from './domain.js';
import { buildScriptSelectionCardMarkup } from './cards.js';
import {
  dismissProcessedScriptDraft,
  downloadScriptDocx,
  fetchScriptDrafts,
  publishScriptDraft,
  saveScriptDraft,
} from './client.js';
import { createScriptPublishPolling } from './polling.js';

function matchesIdentity(row = {}, requested = '') {
  const id = (requested || '').toString();
  if (!id) return false;
  const ids = resolveScriptIdentity(row);
  return ids.draft_id === id || ids.id_noticia === id || ids.cluster_id === id;
}

export function createScriptsFeature({ api, store, ui, selectors, callbacks, helpers }) {
  const {
    renderScriptStats = () => {},
    renderScriptCards = () => {},
    renderSelectedScriptEditor = () => {},
  } = callbacks || {};
  const { downloadBlob = () => {} } = helpers || {};
  const controllerCallbacks = {
    renderScriptCards,
    renderSelectedScriptEditor,
    refreshScriptDrafts: async (...args) => refreshScriptDrafts(...args),
  };
  const publishPolling = createScriptPublishPolling({ api, store, ui, callbacks: controllerCallbacks });

  async function refreshScriptDrafts({ silent = false } = {}) {
    const state = store.getState();
    try {
      const data = await fetchScriptDrafts(api);
      state.scriptDrafts = normalizeScriptDraftRows(data);

      if (state.selectedScript) {
        const selectedKey = resolveScriptListKey(state.selectedScript);
        const refreshedSelection = state.scriptDrafts.find((item) => resolveScriptListKey(item) === selectedKey);
        state.selectedScript = refreshedSelection || null;
      }

      renderScriptStats();
      renderScriptCards();
      renderSelectedScriptEditor();
    } catch (err) {
      console.error(err);
      if (!silent) {
        ui.toast('Error cargando borradores');
      }
    }
  }

  async function dismissProcessedScript(scriptId) {
    const state = store.getState();
    const id = (scriptId || '').toString();
    if (!id) return;

    const row = state.scriptDrafts.find((item) => matchesIdentity(item, id));
    if (!row || !isScriptProcessed(row)) return;

    const ids = resolveScriptIdentity(row);

    try {
      await dismissProcessedScriptDraft(api, ids);
    } catch (err) {
      console.error(err);
      ui.toast('Error ocultando guion procesado');
      return;
    }

    if (!(state.dismissedProcessedScripts instanceof Set)) {
      state.dismissedProcessedScripts = new Set();
    }

    state.dismissedProcessedScripts.add(resolveScriptListKey(row) || id);
    state.scriptDrafts = state.scriptDrafts.filter((item) => !matchesIdentity(item, id));
    if (state.selectedScript && matchesIdentity(state.selectedScript, id)) {
      state.selectedScript = null;
      state.scriptEditorDirty = false;
      renderSelectedScriptEditor();
    }
    renderScriptStats();
    renderScriptCards();
    ui.toast('Guion ocultado del panel');
  }

  async function openScriptEditor(scriptId) {
    const state = store.getState();
    await refreshScriptDrafts();
    const row = state.scriptDrafts.find((item) => matchesIdentity(item, scriptId));
    if (!row) {
      ui.toast('Ese borrador ya no existe o cambió. Actualizá la lista.');
      return;
    }
    state.scriptEditorDirty = false;
    state.selectedScript = row;
    renderScriptCards();
    renderSelectedScriptEditor();
    if (typeof selectors.scriptEditedArea?.focus !== 'function' && typeof selectors.scriptEditorDialog?.showModal === 'function') {
      selectors.scriptEditorDialog.showModal();
    }
    selectors.scriptEditedArea?.focus?.();
    selectors.scriptEditedArea?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
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
      const ids = resolveScriptIdentity(state.selectedScript);
      await saveScriptDraft(api, ids, edited);
      state.scriptEditorDirty = false;
      ui.toast('Cambios guardados');
      await refreshScriptDrafts();
    } catch (err) {
      console.error(err);
      if (String(err?.message || '').toLowerCase().includes('cluster_id no encontrado')) {
        ui.toast('El borrador cambió o ya no existe. Actualizá la lista.');
        await refreshScriptDrafts();
        return;
      }
      ui.toast('Error guardando cambios');
    } finally {
      state.savingScript = false;
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
      await saveScriptDraft(api, ids, edited);
      const published = await publishScriptDraft(api, ids);
      selectors.publishConfirmDialog.close();
      state.scriptEditorDirty = false;

      const asyncJobId = (published?.job_id || '').toString().trim();
      if (asyncJobId) {
        publishPolling.setScriptPublishJob({
          job_id: asyncJobId,
          ...ids,
          status: (published?.status || 'queued').toString().toLowerCase(),
          stage: (published?.stage || published?.status || 'queued').toString().toLowerCase(),
          message: published?.message || 'Job en cola',
          error: '',
        });
        publishPolling.startPublishPolling(asyncJobId);
        renderSelectedScriptEditor();
        ui.toast('Procesamiento iniciado en segundo plano');
        return;
      }

      const publishedSelection = {
        ...state.selectedScript,
        ...published,
        ...ids,
        guion_editado: edited,
        doc_id: published?.doc_id || state.selectedScript.doc_id || '',
        doc_url: published?.doc_url || state.selectedScript.doc_url || '',
        estado_guion: published?.estado_guion || state.selectedScript.estado_guion || 'publicado',
      };
      ui.toast('Guion publicado correctamente');
      await refreshScriptDrafts();
      state.selectedScript = publishedSelection;
      renderScriptCards();
      renderSelectedScriptEditor();
    } catch (err) {
      console.error(err);
      if (String(err?.message || '').toLowerCase().includes('cluster_id no encontrado')) {
        ui.toast('El borrador cambió o ya no existe. Actualizá la lista.');
        await refreshScriptDrafts();
        selectors.publishConfirmDialog.close();
        return;
      }
      ui.toast('Error publicando guion');
    } finally {
      state.publishingScript = false;
      selectors.confirmPublishBtn.disabled = false;
    }
  }

  async function downloadSelectedScriptDocx() {
    const state = store.getState();
    if (!state.selectedScript || state.downloadingScript) return;
    if (!state.selectedScript.doc_id) {
      ui.toast('Primero publicá el guion para poder descargarlo.');
      return;
    }

    try {
      state.downloadingScript = true;
      if (selectors.downloadDraftBtn) selectors.downloadDraftBtn.disabled = true;
      const ids = resolveScriptIdentity(state.selectedScript);
      const result = await downloadScriptDocx(api, ids);
      const filename = result.filename || buildScriptDocxFilename(state.selectedScript);
      downloadBlob(result.blob, filename);
      ui.toast('Descarga DOCX iniciada');
    } catch (err) {
      console.error(err);
      ui.toast('Error descargando DOCX');
    } finally {
      state.downloadingScript = false;
      renderSelectedScriptEditor();
    }
  }

  return {
    buildScriptSelectionCardMarkup,
    refreshScriptDrafts,
    openScriptEditor,
    saveSelectedScript,
    publishSelectedScript,
    downloadSelectedScriptDocx,
    dismissProcessedScript,
  };
}
