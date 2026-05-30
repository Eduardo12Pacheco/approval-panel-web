import {
  AI_RESCUE_COUNTRY_TABS,
  getAiRescueVisibleCandidates,
  getAiRescueRejectionGroups,
  normalizeAiRescueCandidate,
  normalizeAiRescueQueue,
  normalizeAiRescueQueueItem,
} from './state.js';
import { formatEcuadorDateTimeWithZone } from '../../shared/time/ecuador-time.js';

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
  return formatEcuadorDateTimeWithZone(value);
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
      ? 'Cargando candidatos Prensa IA.'
      : state.status === 'error'
        ? state.error || 'Prensa IA no disponible.'
        : `${visibleCount}/${state.candidates?.length || 0} candidatos`;
  }
  if (!el.aiRescueList) return;
  if (state.status === 'loading') {
    el.aiRescueList.innerHTML = '<article class="ai-rescue-empty">Cargando candidatos.</article>';
    return;
  }
  if (state.status === 'error') {
    el.aiRescueList.innerHTML = `<article class="ai-rescue-error">${escapeHtml(state.error || 'Prensa IA no disponible.')}</article>`;
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
  const published = formatDate(item.publishedAt || item.submittedAt);
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
      <div class="ai-rescue-card__actions" aria-label="Acciones Prensa IA">
        <button class="secondary" type="button" data-ai-rescue-action="dismiss-candidate" data-ai-rescue-dismiss-surface="ai-rescue-candidate" data-ai-rescue-dismiss-target-context="${escapeHtml(item.targetCountry)}" data-ai-rescue-dismiss-video-id="${escapeHtml(item.videoId)}" data-ai-rescue-dismiss-candidate-id="${escapeHtml(item.id)}" aria-label="Ocultar candidato Prensa IA para ${escapeHtml(item.targetLabel)}">×</button>
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
  const groups = getAiRescueRejectionGroups(rejections);
  el.aiRescueList.innerHTML = groups.length
    ? `<div class="ai-rescue-rejection-scroll">${groups.map(renderRejectionGroup).join('')}</div>`
    : '<article class="ai-rescue-empty">Sin rechazados IA para calibrar.</article>';
}

function renderRejectionGroup(group) {
  const videoMeta = group.videoId ? `<small>Video: ${escapeHtml(group.videoId)}</small>` : '';
  const summary = group.summary ? `<p class="meta">${escapeHtml(group.summary)}</p>` : '';
  const source = group.sourceLabel ? `<span class="ai-rescue-source-chip">Fuente: ${escapeHtml(group.sourceLabel)}</span>` : '';
  const videoLink = group.url ? `<a class="ai-rescue-video-link" href="${escapeHtml(group.url)}" target="_blank" rel="noopener noreferrer">Ver video</a>` : '';
  return `
    <article class="ai-rescue-rejection-card">
      <header class="ai-rescue-rejection-card__header">
        <div class="ai-rescue-rejection-card__title">
          <strong>Video rechazado IA</strong>
          <div class="ai-rescue-rejection-card__meta">${videoMeta}${source}</div>
        </div>
        ${videoLink}
      </header>
      ${summary}
      <div class="ai-rescue-rejection-card__items">
        ${group.items.map(renderRejectionItem).join('')}
      </div>
    </article>`;
}

function renderRejectionItem(item) {
  const meta = [item.targetLabel, item.sourceLabel].filter(Boolean).join(' · ');
  const country = item.targetLabel || 'Sin país específico';
  const reason = item.reason ? `<small>Motivo técnico: ${escapeHtml(item.reason)}</small>` : '';
  return `<section class="ai-rescue-rejection-item"><strong>${escapeHtml(country)}</strong><p>${escapeHtml(item.detailText || 'Sin detalle adicional.')}</p>${reason}<small>${escapeHtml(meta)}</small></section>`;
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
