import { escapeHtmlCore } from '../../core/ui/escape-html.js';

export function normalizeScriptDraftRows(payload = {}) {
  const candidates = [payload?.drafts, payload?.items, payload?.rows, payload?.data];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

export function buildScriptSelectionCardMarkup(item = {}, { selected = false } = {}) {
  const processed = isScriptProcessed(item);
  const selectedClass = selected ? ' is-selected' : '';
  const processedClass = processed ? ' is-processed' : '';
  const selectedPressed = selected ? 'true' : 'false';
  const identity = resolveScriptListKey(item);
  const encodedIdentity = encodeURIComponent(identity);
  const country = escapeHtmlCore((item.seleccion || 'Sin país').toString());
  const player = escapeHtmlCore((item.jugador || 'Sin jugador').toString());
  const title = escapeHtmlCore(resolveScriptTitle(item));
  const processedBadge = processed
    ? '<span class="script-selection-card__status">Procesado</span>'
    : '';
  const dismissButton = processed && identity
    ? `<button class="script-selection-card__dismiss" type="button" data-action="dismiss-processed-script" data-script-id="${encodedIdentity}" aria-label="Ocultar guion procesado">×</button>`
    : '';

  return `
    <article class="script-selection-card${selectedClass}${processedClass}" data-script-id="${encodedIdentity}" role="button" tabindex="0" aria-pressed="${selectedPressed}">
      <div class="meta script-selection-card__eyebrow">${country} · ${player}</div>
      <div class="topic">${title}</div>
      ${processedBadge}
      ${dismissButton}
    </article>
  `;
}

export function resolveScriptListKey(row = {}) {
  return (row.draft_id || row.id_noticia || row.cluster_id || '').toString();
}

export function resolveScriptTitle(row = {}, fallback = 'Sin tema') {
  const title = [
    row.titulo_noticia,
    row.titular,
    row.headline,
    row.title,
    row.titulo,
    row.tema_principal,
  ]
    .map((part) => (part || '').toString().trim())
    .find(Boolean);

  return title || fallback;
}

export function isScriptProcessed(row = {}) {
  const status = (row.estado_guion || row.estado || '').toString().trim().toLowerCase();
  return status === 'publicado' || Boolean(row.doc_id);
}

export function resolveScriptIdentity(row = {}) {
  return {
    draft_id: (row.draft_id || '').toString(),
    id_noticia: (row.id_noticia || '').toString(),
    cluster_id: (row.cluster_id || '').toString(),
  };
}

export function buildScriptDocxFilename(row = {}) {
  const base = [row.jugador, resolveScriptTitle(row, '')]
    .map((part) => (part || '').toString().trim())
    .filter(Boolean)
    .join(' - ')
    || row.draft_id
    || row.id_noticia
    || row.cluster_id
    || 'guion';

  const safe = base
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._ -]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90)
    || 'guion';

  return `${safe}.docx`;
}

export function createScriptsFeature({ api, store, ui, selectors, callbacks, helpers }) {
  const {
    renderScriptStats = () => {},
    renderScriptCards = () => {},
    renderSelectedScriptEditor = () => {},
  } = callbacks || {};
  const { downloadBlob = () => {} } = helpers || {};

  async function refreshScriptDrafts({ silent = false } = {}) {
    const state = store.getState();
    try {
      const data = await api.get('/webhook/mvp-script-drafts-pending/supabase/v2');
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

  function matchesIdentity(row = {}, requested = '') {
    const id = (requested || '').toString();
    if (!id) return false;
    const ids = resolveScriptIdentity(row);
    return ids.draft_id === id || ids.id_noticia === id || ids.cluster_id === id;
  }

  async function dismissProcessedScript(scriptId) {
    const state = store.getState();
    const id = (scriptId || '').toString();
    if (!id) return;

    const row = state.scriptDrafts.find((item) => matchesIdentity(item, id));
    if (!row || !isScriptProcessed(row)) return;

    const ids = resolveScriptIdentity(row);

    try {
      await api.post('/webhook/mvp-script-draft-save/supabase/v2', {
        ...ids,
        action: 'dismiss_processed',
      });
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
      await api.post('/webhook/mvp-script-draft-save/supabase/v2', {
        ...ids,
        guion_editado: edited,
      });
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
      await api.post('/webhook/mvp-script-draft-save/supabase/v2', {
        ...ids,
        guion_editado: edited,
      });
      const published = await api.post('/webhook/mvp-script-publish/supabase/v2', {
        ...ids,
      });
      selectors.publishConfirmDialog.close();
      state.scriptEditorDirty = false;
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
      const result = await api.postBlob('/webhook/mvp-script-download-doc/supabase/v1', {
        ...ids,
        format: 'docx',
      });
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
