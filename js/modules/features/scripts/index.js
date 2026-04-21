import { escapeHtmlCore } from '../../core/ui/escape-html.js';

export function normalizeScriptDraftRows(payload = {}) {
  const candidates = [payload?.drafts, payload?.items, payload?.rows, payload?.data];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

export function buildScriptSelectionCardMarkup(item = {}, { selected = false } = {}) {
  const selectedClass = selected ? ' is-selected' : '';
  const selectedPressed = selected ? 'true' : 'false';
  const identity = (item.draft_id || item.id_noticia || item.cluster_id || '').toString();
  const country = escapeHtmlCore((item.seleccion || 'Sin país').toString());
  const player = escapeHtmlCore((item.jugador || 'Sin jugador').toString());
  const title = escapeHtmlCore((item.tema_principal || 'Sin tema').toString());

  return `
    <article class="script-selection-card${selectedClass}" data-script-id="${encodeURIComponent(identity)}" role="button" tabindex="0" aria-pressed="${selectedPressed}">
      <div class="meta script-selection-card__eyebrow">${country} · ${player}</div>
      <div class="topic">${title}</div>
    </article>
  `;
}

export function resolveScriptIdentity(row = {}) {
  return {
    draft_id: (row.draft_id || '').toString(),
    id_noticia: (row.id_noticia || '').toString(),
    cluster_id: (row.cluster_id || '').toString(),
  };
}

export function createScriptsFeature({ api, store, ui, selectors, callbacks }) {
  const {
    renderScriptStats = () => {},
    renderScriptCards = () => {},
    renderSelectedScriptEditor = () => {},
  } = callbacks || {};

  async function refreshScriptDrafts({ silent = false } = {}) {
    const state = store.getState();
    try {
      const data = await api.get('/webhook/mvp-script-drafts-pending/supabase/v2');
      state.scriptDrafts = normalizeScriptDraftRows(data);

      if (state.selectedScript) {
        const currentIds = resolveScriptIdentity(state.selectedScript);
        const refreshedSelection = state.scriptDrafts.find((item) => {
          const rowIds = resolveScriptIdentity(item);
          return (
            (currentIds.draft_id && rowIds.draft_id === currentIds.draft_id)
            || (currentIds.id_noticia && rowIds.id_noticia === currentIds.id_noticia)
            || (currentIds.cluster_id && rowIds.cluster_id === currentIds.cluster_id)
          );
        });
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
      await api.post('/webhook/mvp-script-draft-save/supabase/v2', {
        ...ids,
        guion_editado: edited,
      });
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
      await api.post('/webhook/mvp-script-draft-save/supabase/v2', {
        ...ids,
        guion_editado: edited,
      });
      await api.post('/webhook/mvp-script-publish/supabase/v2', {
        ...ids,
      });
      selectors.publishConfirmDialog.close();
      state.selectedScript = null;
      ui.toast('Guion publicado correctamente');
      await refreshScriptDrafts();
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

  return {
    buildScriptSelectionCardMarkup,
    refreshScriptDrafts,
    openScriptEditor,
    saveSelectedScript,
    publishSelectedScript,
  };
}
