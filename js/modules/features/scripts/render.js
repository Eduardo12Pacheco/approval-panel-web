import {
  buildScriptSelectionCardMarkup,
  getScriptPublishStageMeta,
  isScriptProcessed,
  resolveScriptListKey,
  resolveScriptTitle,
} from './index.js';
import { escapeHtmlCore } from '../../core/ui/escape-html.js';

function setProcessButtonStyle(button, { processed = false } = {}) {
  button?.classList?.toggle('approve', !processed);
  button?.classList?.toggle('secondary', processed);
}

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
    const selectedKey = resolveScriptListKey(state.selectedScript || {});
    const currentKey = resolveScriptListKey(item);
    const isSelected = Boolean(selectedKey && currentKey && currentKey === selectedKey);

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

export function renderSelectedScriptEditorView({ selected, el, updateWordCounter, preserveCurrentValue = false }) {
  const hasSelected = Boolean(selected);

  el.scriptEditorTitle.textContent = hasSelected
    ? `${selected.jugador || 'Sin jugador'} · ${resolveScriptTitle(selected)}`
    : 'Editor de guion';

  el.scriptEditorMeta.textContent = hasSelected
    ? ''
    : 'Seleccioná un borrador desde la columna derecha para editarlo acá.';

  if (!hasSelected) {
    el.scriptEditedArea.value = '';
    el.scriptEditedArea.disabled = true;
    el.viewOriginalBtn.disabled = true;
    el.voiceAiBtn.disabled = true;
    el.voiceAiBtn.title = '';
    el.downloadDraftBtn.disabled = true;
    el.publishDraftBtn.disabled = true;
    setProcessButtonStyle(el.publishDraftBtn, { processed: false });
    el.closeScriptEditor.disabled = true;
    updateWordCounter('', el.scriptEditedWordCount);
    return;
  }

  const isProcessed = isScriptProcessed(selected);

  el.scriptEditedArea.disabled = false;
  el.viewOriginalBtn.disabled = false;
  el.voiceAiBtn.disabled = !isProcessed;
  el.voiceAiBtn.title = isProcessed
    ? 'Generar voz desde la versión procesada con pronunciación'
    : 'Primero procesá el guion para habilitar Voz con IA';
  el.downloadDraftBtn.disabled = !selected.doc_id;
  el.publishDraftBtn.disabled = false;
  setProcessButtonStyle(el.publishDraftBtn, { processed: isProcessed });
  el.closeScriptEditor.disabled = false;

  const nextValue = (selected.guion_editado || selected.guion_draft || '').toString();
  if (!preserveCurrentValue && el.scriptEditedArea.value !== nextValue) {
    el.scriptEditedArea.value = nextValue;
  }

  updateWordCounter(el.scriptEditedArea.value, el.scriptEditedWordCount);
}

export function renderOriginalScriptDialogMeta(selected) {
  if (!selected) return '';
  return '';
}

export function renderScriptPublishMonitorView({ state, el }) {
  if (!el.scriptPublishMonitor) return;

  const job = state.scriptPublishJob;
  if (!job || !job.job_id) {
    el.scriptPublishMonitor.classList.add('hidden');
    el.scriptPublishMonitor.innerHTML = '';
    return;
  }

  const stageMeta = getScriptPublishStageMeta(job.stage, job.status);
  const percent = Number.isFinite(Number(job.percent)) ? Number(job.percent) : stageMeta.percent;
  const statusLabel = escapeHtmlCore(stageMeta.label);
  const jobId = escapeHtmlCore(job.job_id);
  const message = escapeHtmlCore((job.message || '').toString().trim());
  const error = escapeHtmlCore((job.error || '').toString().trim());
  const isFailed = (job.status || '').toLowerCase() === 'failed';
  const isDone = (job.status || '').toLowerCase() === 'completed';

  el.scriptPublishMonitor.classList.remove('hidden');
  el.scriptPublishMonitor.innerHTML = `
    <header class="script-publish-monitor__header">
      <strong>Procesamiento en segundo plano</strong>
      <span class="script-publish-monitor__pill ${isFailed ? 'is-failed' : (isDone ? 'is-done' : 'is-running')}">${statusLabel}</span>
    </header>
    <p class="meta script-publish-monitor__job">Job: ${jobId}</p>
    <div class="script-publish-monitor__track">
      <div class="script-publish-monitor__fill ${isFailed ? 'is-failed' : (isDone ? 'is-done' : 'is-running')}" style="width:${Math.max(0, Math.min(100, percent))}%"></div>
    </div>
    <p class="meta script-publish-monitor__meta">${message || (isFailed ? 'Falló el procesamiento' : 'Actualizando estado...')}</p>
    ${error ? `<p class="meta script-publish-monitor__error">${error}</p>` : ''}
  `;
}
