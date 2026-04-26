import {
  buildScriptSelectionCardMarkup,
  isScriptProcessed,
  resolveScriptIdentity,
  resolveScriptListKey,
} from './index.js';

export function renderScriptStatsView({ scriptDrafts, el }) {
  const total = scriptDrafts.filter((i) => !isScriptProcessed(i)).length;
  const inReview = scriptDrafts.filter((i) => ((i.estado_guion || i.estado || '').toLowerCase()) === 'en_revision').length;
  const processed = scriptDrafts.filter((i) => isScriptProcessed(i)).length;

  el.scriptStats.innerHTML = `
    <div class="stat"><small>Pendientes</small><strong>${total}</strong></div>
    <div class="stat"><small>En revisión</small><strong>${inReview}</strong></div>
    <div class="stat"><small>Procesados</small><strong>${processed}</strong></div>
  `;
}

export function renderScriptCardsView({ state, el, openScriptEditor, dismissProcessedScript = () => {} }) {
  const dismissed = state.dismissedProcessedScripts instanceof Set
    ? state.dismissedProcessedScripts
    : new Set();
  const visibleScripts = state.scriptDrafts.filter((item) => {
    if (!isScriptProcessed(item)) return true;
    return !dismissed.has(resolveScriptListKey(item));
  });

  if (!visibleScripts.length) {
    el.scriptCards.innerHTML = '<p class="meta">No hay guiones para editar o descargar.</p>';
    return;
  }

  el.scriptCards.innerHTML = visibleScripts.map((item) => {
    const selectedIds = resolveScriptIdentity(state.selectedScript || {});
    const currentIds = resolveScriptIdentity(item);
    const isSelected = Boolean(
      (selectedIds.draft_id && currentIds.draft_id === selectedIds.draft_id)
      || (selectedIds.id_noticia && currentIds.id_noticia === selectedIds.id_noticia)
      || (selectedIds.cluster_id && currentIds.cluster_id === selectedIds.cluster_id),
    );

    return buildScriptSelectionCardMarkup(item, { selected: isSelected });
  }).join('');

  el.scriptCards.querySelectorAll('.script-selection-card[data-script-id]').forEach((card) => {
    const openSelectedCard = async () => {
      const id = decodeURIComponent(card.dataset.scriptId);
      await openScriptEditor(id);
    };

    card.addEventListener('click', async (ev) => {
      const dismissButton = ev.target.closest('[data-action="dismiss-processed-script"]');
      if (dismissButton) {
        ev.preventDefault();
        ev.stopPropagation();
        await dismissProcessedScript(decodeURIComponent(dismissButton.dataset.scriptId || ''));
        return;
      }
      await openSelectedCard();
    });
    card.addEventListener('keydown', async (ev) => {
      if (ev.target.closest('[data-action="dismiss-processed-script"]')) return;
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      ev.preventDefault();
      await openSelectedCard();
    });
  });
}

export function renderSelectedScriptEditorView({ selected, el, updateWordCounter }) {
  const hasSelected = Boolean(selected);

  el.scriptEditorTitle.textContent = hasSelected
    ? `${selected.jugador || 'Sin jugador'} · ${selected.tema_principal || 'Sin tema'}`
    : 'Editor de guion';

  el.scriptEditorMeta.textContent = hasSelected
    ? ''
    : 'Seleccioná un borrador desde la columna derecha para editarlo acá.';

  if (!hasSelected) {
    el.scriptEditedArea.value = '';
    el.scriptEditedArea.disabled = true;
    el.viewOriginalBtn.disabled = true;
    el.voiceAiBtn.disabled = true;
    el.downloadDraftBtn.disabled = true;
    el.publishDraftBtn.disabled = true;
    el.closeScriptEditor.disabled = true;
    updateWordCounter('', el.scriptEditedWordCount);
    return;
  }

  el.scriptEditedArea.disabled = false;
  el.viewOriginalBtn.disabled = false;
  el.voiceAiBtn.disabled = false;
  el.downloadDraftBtn.disabled = !selected.doc_id;
  el.publishDraftBtn.disabled = false;
  el.closeScriptEditor.disabled = false;

  const nextValue = (selected.guion_editado || selected.guion_draft || '').toString();
  if (el.scriptEditedArea.value !== nextValue) {
    el.scriptEditedArea.value = nextValue;
  }

  updateWordCounter(el.scriptEditedArea.value, el.scriptEditedWordCount);
}

export function renderOriginalScriptDialogMeta(selected) {
  if (!selected) return '';
  return '';
}
