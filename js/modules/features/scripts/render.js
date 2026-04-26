import { buildScriptSelectionCardMarkup } from './index.js';

export function renderScriptStatsView({ scriptDrafts, el }) {
  const total = scriptDrafts.length;
  const inReview = scriptDrafts.filter((i) => (i.estado || '').toLowerCase() === 'en_revision').length;
  const generated = scriptDrafts.filter((i) => (i.estado || '').toLowerCase() === 'borrador_generado').length;

  el.scriptStats.innerHTML = `
    <div class="stat"><small>Pendientes</small><strong>${total}</strong></div>
    <div class="stat"><small>En revisión</small><strong>${inReview}</strong></div>
    <div class="stat"><small>Nuevos</small><strong>${generated}</strong></div>
  `;
}

export function renderScriptCardsView({ state, el, openScriptEditor }) {
  if (!state.scriptDrafts.length) {
    el.scriptCards.innerHTML = '<p class="meta">No hay guiones pendientes de edición/publicación.</p>';
    return;
  }

  el.scriptCards.innerHTML = state.scriptDrafts.map((item) => {
    const selectedId = state.selectedScript?.draft_id || state.selectedScript?.id_noticia || state.selectedScript?.cluster_id;
    const currentId = item.draft_id || item.id_noticia || item.cluster_id;
    const isSelected = Boolean(selectedId && currentId === selectedId);

    return buildScriptSelectionCardMarkup(item, { selected: isSelected });
  }).join('');

  el.scriptCards.querySelectorAll('.script-selection-card[data-script-id]').forEach((card) => {
    const openSelectedCard = async () => {
      const id = decodeURIComponent(card.dataset.scriptId);
      await openScriptEditor(id);
    };

    card.addEventListener('click', openSelectedCard);
    card.addEventListener('keydown', async (ev) => {
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
