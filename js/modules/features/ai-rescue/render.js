import {
  AI_RESCUE_COUNTRY_TABS,
  getAiRescueVisibleCandidates,
  normalizeAiRescueCandidate,
  normalizeAiRescueQueue,
  normalizeAiRescueQueueItem,
  normalizeAiRescueRejection,
} from './state.js';

function escapeHtml(value) {
  return (value ?? '').toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatTimestamp(ms = 0) {
  const totalSeconds = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatDate(value = '') {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.toString();
  return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }).format(date).replace(/\./g, '') + ' UTC';
}

export function renderAiRescueCandidates({ el, state }) {
  renderAiRescueTabs({ el, selectedTab: state.selectedTab });
  if (state.selectedTab === 'rejected') {
    renderAiRescueRejections({ el, rejections: state.rejections });
    return;
  }
  if (el.aiRescueStatus) {
    const visibleCount = getAiRescueVisibleCandidates(state).length;
    el.aiRescueStatus.textContent = state.status === 'loading'
      ? 'Cargando candidatos AI Rescue.'
      : state.status === 'error'
        ? state.error || 'AI Rescue no disponible.'
        : `${visibleCount}/${state.candidates?.length || 0} candidatos`;
  }
  if (!el.aiRescueList) return;
  if (state.status === 'loading') {
    el.aiRescueList.innerHTML = '<article class="ai-rescue-empty">Cargando candidatos.</article>';
    return;
  }
  if (state.status === 'error') {
    el.aiRescueList.innerHTML = `<article class="ai-rescue-error">${escapeHtml(state.error || 'AI Rescue no disponible.')}</article>`;
    return;
  }
  const visible = getAiRescueVisibleCandidates(state);
  el.aiRescueList.innerHTML = visible.length
    ? visible.map(renderCandidateCard).join('')
    : '<article class="ai-rescue-empty">Sin candidatos para este filtro.</article>';
}

function renderAiRescueTabs({ el, selectedTab }) {
  if (!el.aiRescueTabs) return;
  el.aiRescueTabs.innerHTML = AI_RESCUE_COUNTRY_TABS.map((tab, index) => {
    const active = tab.value === selectedTab;
    const prefix = tab.value === 'rejected' ? 'IA' : String(index + 1).padStart(2, '0');
    return `<button class="ai-rescue-country-card ${active ? 'is-active' : ''}" type="button" data-ai-rescue-tab="${escapeHtml(tab.value)}" aria-pressed="${active ? 'true' : 'false'}"><span>${escapeHtml(prefix)} / ${escapeHtml(tab.label)}</span><strong>${tab.value === 'rejected' ? 'Calibración' : 'Candidatos'}</strong></button>`;
  }).join('');
}

function renderCandidateCard(candidate) {
  const item = normalizeAiRescueCandidate(candidate);
  const published = formatDate(item.publishedAt);
  const meta = [`Destino: ${item.targetLabel}`, `Fuente excluida: ${item.sourceLabel}`, published].filter(Boolean).join(' · ');
  const linkDisabled = item.url ? '' : 'disabled aria-disabled="true" title="Link no disponible"';
  return `
    <article class="ai-rescue-card" data-ai-rescue-candidate-id="${escapeHtml(item.id)}">
      <div class="ai-rescue-card__score"><span>Score</span><strong>Score ${escapeHtml(item.score)}</strong></div>
      <div class="ai-rescue-card__main">
        <strong>${escapeHtml(item.title)}</strong>
        <small>${escapeHtml(meta)}</small>
        <p>${escapeHtml(item.summary || 'Resumen pendiente.')}</p>
      </div>
      <div class="ai-rescue-card__actions" aria-label="Acciones AI Rescue">
        <button type="button" data-ai-rescue-action="open-link" data-ai-rescue-url="${escapeHtml(item.url)}" ${linkDisabled}>Link</button>
        <button type="button" data-ai-rescue-action="summary" data-ai-rescue-candidate-id="${escapeHtml(item.id)}">Resumen</button>
      </div>
    </article>`;
}

export function renderAiRescueDetail({ el, candidate }) {
  if (!el.aiRescueDetailBody) return;
  const item = normalizeAiRescueCandidate(candidate || {});
  const risks = item.risks.length ? item.risks : [item.risk].filter(Boolean);
  el.aiRescueDetailBody.innerHTML = `
    <section class="ai-rescue-detail">
      <header class="ai-rescue-detail__header">
        <span class="ai-rescue-score-chip">Score ${escapeHtml(item.score)}</span>
        <div><h3>${escapeHtml(item.title)}</h3><p class="meta">Destino: ${escapeHtml(item.targetLabel)} · Fuente excluida: ${escapeHtml(item.sourceLabel)}</p></div>
      </header>
      ${renderDetailRow('Motivo', item.reason || 'Candidato generado por evidencia subtitulada.')}
      ${renderDetailRow('Resumen', item.summary)}
      ${renderDetailRow('Ángulo sugerido', item.angle)}
      ${renderDetailRow('Riesgo', item.risk || 'Sin riesgo declarado')}
      ${renderDetailRow('Riesgos', risks.join(' · ') || 'Sin riesgos adicionales')}
      <section class="ai-rescue-evidence"><h4>Evidencia</h4>${renderEvidenceList(item.evidence)}</section>
      <div class="queue-actions">
        <button class="secondary" type="button" data-ai-rescue-action="reject" data-ai-rescue-candidate-id="${escapeHtml(item.id)}">Rechazar</button>
        <button class="approve" type="button" data-ai-rescue-action="approve" data-ai-rescue-candidate-id="${escapeHtml(item.id)}">Aprobar</button>
      </div>
    </section>`;
}

function renderDetailRow(label, value) {
  return `<p><strong>${escapeHtml(label)}</strong>: ${escapeHtml(value || '—')}</p>`;
}

function renderEvidenceList(evidence = []) {
  if (!evidence.length) return '<article class="ai-rescue-evidence-item">Sin evidencia cargada.</article>';
  return evidence.map((item) => `<article class="ai-rescue-evidence-item"><strong>${formatTimestamp(item.start_ms)}-${formatTimestamp(item.end_ms)}</strong><p>${escapeHtml(item.text || '')}</p><p>${escapeHtml(item.translation_es || '')}</p><small>${escapeHtml(item.explanation_es || '')}</small></article>`).join('');
}

export function renderAiRescueRejections({ el, rejections = [] }) {
  if (!el.aiRescueList) return;
  const items = rejections.map(normalizeAiRescueRejection);
  el.aiRescueList.innerHTML = items.length
    ? items.map((item) => `<article class="ai-rescue-rejection-card"><span class="ai-rescue-source-chip">${escapeHtml(item.sourceLabel)}</span><strong>${escapeHtml(item.reason)}</strong><small>${escapeHtml([item.targetLabel, item.videoId].filter(Boolean).join(' · '))}</small><p>${escapeHtml(item.detailText || 'Sin detalle adicional.')}</p></article>`).join('')
    : '<article class="ai-rescue-empty">Sin rechazados IA para calibrar.</article>';
}

export function renderAiRescueQueue({ el, queue }) {
  if (!el.aiRescueQueueBody) return;
  const normalized = normalizeAiRescueQueue(queue || {});
  const current = normalized.current;
  const upcoming = normalized.upcoming;
  el.aiRescueQueueBody.innerHTML = `
    <section class="ai-rescue-queue-section"><h3>Analizando ahora</h3>${current ? renderQueueItem(current) : '<p class="meta">Sin video en análisis.</p>'}</section>
    <section class="ai-rescue-queue-section"><h3>Videos próximos</h3>${upcoming.length ? upcoming.map(renderQueueItem).join('') : '<p class="meta">Sin próximos videos.</p>'}</section>
    <p class="meta">En espera: ${escapeHtml(normalized.counts.waiting ?? 0)} · Reintento: ${escapeHtml(normalized.counts.retry ?? 0)}</p>`;
}

function renderQueueItem(rawItem) {
  const item = normalizeAiRescueQueueItem(rawItem);
  return `<article class="ai-rescue-queue-item"><span>${escapeHtml(item.statusLabel)}</span><strong>${escapeHtml(item.videoId || 'Video pendiente')}</strong><small>${escapeHtml([item.sourceLabel, item.attemptCount ? `Intentos ${item.attemptCount}` : '', item.nextAttemptAt ? `Próximo ${item.nextAttemptAt}` : '', item.lastError].filter(Boolean).join(' · '))}</small></article>`;
}
