import { escapeHtmlCore } from '../../core/ui/escape-html.js';
import { isScriptProcessed, resolveScriptListKey, resolveScriptTitle } from './domain.js';
import { resolveScriptPublishCardState } from './publish-status.js';

export function buildScriptSelectionCardMarkup(item = {}, { selected = false, publishJob = null } = {}) {
  const processed = isScriptProcessed(item);
  const selectedClass = selected ? ' is-selected' : '';
  const processedClass = processed ? ' is-processed' : '';
  const selectedPressed = selected ? 'true' : 'false';
  const identity = resolveScriptListKey(item);
  const encodedIdentity = encodeURIComponent(identity);
  const country = escapeHtmlCore((item.seleccion || 'Sin país').toString());
  const player = escapeHtmlCore((item.jugador || 'Sin jugador').toString());
  const title = escapeHtmlCore(resolveScriptTitle(item));
  const publishState = resolveScriptPublishCardState(item, publishJob);
  const processedBadge = processed
    ? '<span class="script-selection-card__status">Procesado</span>'
    : (publishState.failed
      ? '<span class="script-selection-card__status script-selection-card__status--failed">ERROR</span>'
      : (publishState.locked ? `<span class="script-selection-card__status script-selection-card__status--progress">${escapeHtmlCore(publishState.label)}</span>` : ''));
  const dismissButton = processed && identity
    ? `<button class="script-selection-card__dismiss" type="button" data-action="dismiss-processed-script" data-script-id="${encodedIdentity}" aria-label="Ocultar guion procesado">×</button>`
    : '';
  const lockedClass = publishState.locked ? ' is-locked' : '';
  const disabledAttr = publishState.locked ? ' aria-disabled="true"' : '';

  return `
    <article class="script-selection-card${selectedClass}${processedClass}${lockedClass}" data-script-id="${encodedIdentity}" role="button" tabindex="0" aria-pressed="${selectedPressed}"${disabledAttr}>
      <div class="meta script-selection-card__eyebrow">${country} · ${player}</div>
      <div class="topic">${title}</div>
      ${processedBadge}
      ${dismissButton}
    </article>
  `;
}
