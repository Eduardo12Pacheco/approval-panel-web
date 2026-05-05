import { escapeHtmlCore } from '../../core/ui/escape-html.js';

const SCRIPT_PUBLISH_STATUS_ENDPOINT = '/webhook/mvp-script-publish-status/supabase/v1';
const SCRIPT_PUBLISH_POLL_INTERVAL_MS = 3000;

const SCRIPT_PUBLISH_STAGE_ORDER = [
  'queued',
  'saving_script',
  'creating_doc',
  'uploading_txt',
  'rewriting_pronunciation',
  'searching_images',
  'caching_images',
  'finalizing',
  'completed',
  'failed',
];

const SCRIPT_PUBLISH_STAGE_LABELS = {
  queued: 'En cola',
  saving_script: 'Guardando guion',
  creating_doc: 'Creando Google Doc',
  uploading_txt: 'Subiendo TXT',
  rewriting_pronunciation: 'Reescribiendo pronunciación',
  searching_images: 'Buscando imágenes',
  caching_images: 'Cacheando imágenes',
  finalizing: 'Finalizando',
  completed: 'Completado',
  failed: 'Falló',
};

export function getScriptPublishStageMeta(stage, status = '') {
  const normalizedStatus = (status || '').toString().trim().toLowerCase();
  const normalizedStage = (stage || '').toString().trim().toLowerCase();
  const effective = normalizedStage || normalizedStatus || 'queued';
  const index = SCRIPT_PUBLISH_STAGE_ORDER.indexOf(effective);
  const basePercent = index >= 0
    ? Math.min(100, Math.max(0, Math.round((index / Math.max(1, SCRIPT_PUBLISH_STAGE_ORDER.length - 2)) * 100)))
    : 0;
  return {
    stage: effective,
    label: SCRIPT_PUBLISH_STAGE_LABELS[effective] || effective,
    percent: effective === 'failed' ? 100 : basePercent,
  };
}

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
    renderScriptPublishMonitor = () => {},
  } = callbacks || {};
  const { downloadBlob = () => {} } = helpers || {};

  function clearPublishPolling() {
    const state = store.getState();
    if (state.scriptPublishPollingTimer) {
      clearInterval(state.scriptPublishPollingTimer);
      state.scriptPublishPollingTimer = null;
    }
    state.scriptPublishPollingInFlight = false;
  }

  function setScriptPublishJob(next = null) {
    const state = store.getState();
    if (!next) {
      state.scriptPublishJob = null;
      renderScriptPublishMonitor();
      return;
    }

    const stageMeta = getScriptPublishStageMeta(next.stage, next.status);
    state.scriptPublishJob = {
      ...(state.scriptPublishJob || {}),
      ...next,
      stage: stageMeta.stage,
      percent: Number.isFinite(Number(next.percent)) ? Number(next.percent) : stageMeta.percent,
    };
    renderScriptPublishMonitor();
  }

  async function syncPublishJobStatus(jobId) {
    const state = store.getState();
    if (!jobId || state.scriptPublishPollingInFlight) return;
    state.scriptPublishPollingInFlight = true;
    try {
      const row = await api.post(SCRIPT_PUBLISH_STATUS_ENDPOINT, { job_id: jobId });
      const status = (row?.status || row?.job?.status || '').toString().toLowerCase() || 'queued';
      const stage = (row?.stage || row?.job?.stage || status).toString().toLowerCase();
      const error = row?.error || row?.job?.error || '';
      const message = row?.message || row?.job?.message || '';
      const result = row?.result || row?.job?.result || null;
      setScriptPublishJob({
        job_id: jobId,
        status,
        stage,
        message,
        error,
        result,
        updated_at: row?.updated_at || row?.job?.updated_at || new Date().toISOString(),
      });

      if (status === 'completed' || status === 'failed') {
        clearPublishPolling();
      }

      if (status === 'completed') {
        const selected = state.selectedScript || {};
        const ids = resolveScriptIdentity(selected);
        const resultRow = result && typeof result === 'object' ? result : {};
        state.selectedScript = {
          ...selected,
          ...ids,
          ...resultRow,
          estado_guion: 'publicado',
          doc_id: resultRow.doc_id || selected.doc_id || '',
          doc_url: resultRow.doc_url || selected.doc_url || '',
        };
        await refreshScriptDrafts({ silent: true });
        renderSelectedScriptEditor();
        ui.toast('Guion procesado correctamente');
      } else if (status === 'failed') {
        ui.toast(error || 'Falló el procesamiento del guion');
      }
    } catch (err) {
      console.error(err);
    } finally {
      state.scriptPublishPollingInFlight = false;
    }
  }

  function startPublishPolling(jobId) {
    const state = store.getState();
    clearPublishPolling();
    state.scriptPublishPollingTimer = setInterval(() => {
      void syncPublishJobStatus(jobId);
    }, SCRIPT_PUBLISH_POLL_INTERVAL_MS);
    void syncPublishJobStatus(jobId);
  }

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

      const asyncJobId = (published?.job_id || '').toString().trim();
      if (asyncJobId) {
        setScriptPublishJob({
          job_id: asyncJobId,
          status: (published?.status || 'queued').toString().toLowerCase(),
          stage: (published?.stage || published?.status || 'queued').toString().toLowerCase(),
          message: published?.message || 'Job en cola',
          error: '',
        });
        startPublishPolling(asyncJobId);
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
