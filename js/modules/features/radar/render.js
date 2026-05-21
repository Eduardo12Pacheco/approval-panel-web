import { filterMonitorCards } from './state.js';

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

export function formatTranscriptCopy(transcript = {}) {
  if (transcript.text) return transcript.text.toString().trim();
  return (transcript.segments || [])
    .map((segment) => `(${formatTimestamp(segment.start_ms)}) ${(segment.text || '').toString().trim()}`.trim())
    .filter(Boolean)
    .join('\n');
}

export function formatMentionsCopy(mentions = {}) {
  return (mentions.matches || [])
    .map((match) => {
      const canonical = match.canonical || match.canonical_target || match.target || '';
      const keyword = match.keyword || match.matched_variant || match.variant || '';
      const context = match.context || match.text || [match.context_before, match.context_after].filter(Boolean).join(' ');
      return `(${formatTimestamp(match.start_ms)}) ${canonical} [${keyword}] ${context}`.trim();
    })
    .join('\n');
}

export function renderRadarStatus({ el, state }) {
  if (el.radarHealthStatus) {
    const status = state.health?.status || 'unknown';
    const isReachable = status === 'ok' || status === 'degraded';
    el.radarHealthStatus.textContent = isReachable ? 'Servicio activo' : 'Servicio inactivo';
    el.radarHealthStatus.title = status === 'degraded'
      ? 'El servicio responde, pero hay dependencias runtime pendientes de validar.'
      : (state.health?.message || '');
    el.radarHealthStatus.classList?.toggle?.('is-online', isReachable);
    el.radarHealthStatus.classList?.toggle?.('is-offline', !isReachable);
  }
  if (el.radarProgressStatus) {
    const percent = state.currentJob?.progress?.percent;
    const suffix = Number.isFinite(Number(percent)) ? ` · ${percent}%` : '';
    const errorMessage = state.currentJob?.error?.message;
    el.radarProgressStatus.textContent = state.currentJob
      ? `${humanJobStatus(state.currentJob.status)}${suffix}${errorMessage ? ` · ${errorMessage}` : ''}`
      : state.health?.status === 'error' && state.health?.message
        ? state.health.message
      : 'Listo para investigar.';
  }
  if (el.radarSubmitBtn) el.radarSubmitBtn.disabled = ['queued', 'running'].includes(state.currentJob?.status);
}

export function renderRadarResults({ el, state }) {
  if (!el.radarQueueList) return;
  const job = state.currentJob;
  if (!job || job.status === 'succeeded' || job.status === 'cancelled') {
    el.radarQueueList.classList?.add?.('is-empty');
    el.radarQueueList.innerHTML = 'Sin trabajos en cola.';
    return;
  }
  const countries = (job.selected_countries || job.countries || []).join(', ');
  const title = job.title || job.url || job.job_id;
  const isFailed = job.status === 'failed';
  const error = job.error?.message || job.error?.code || '';
  el.radarQueueList.classList?.remove?.('is-empty');
  el.radarQueueList.innerHTML = `
    <article class="audio-queue-item radar-job-card ${isFailed ? 'is-failed' : 'is-active'}" data-radar-job-id="${escapeHtml(job.job_id)}">
      <div class="radar-job-card__main">
        <span class="radar-kicker">${isFailed ? 'Job fallido' : 'Procesando'}</span>
        <strong>${escapeHtml(title)}</strong>
        <small>${escapeHtml(countries || 'Sin país')}</small>
        ${error ? `<p class="radar-error-text">${escapeHtml(error)}</p>` : ''}
      </div>
      <span class="radar-status-chip ${isFailed ? 'is-failed' : 'is-processing'}">${escapeHtml(humanJobStatus(job.status || 'queued'))}</span>
      <button type="button" data-radar-action="${isFailed ? 'delete' : 'cancel'}" data-radar-job-id="${escapeHtml(job.job_id)}">${isFailed ? 'Eliminar' : 'Cancelar'}</button>
    </article>
  `;
}

export function renderRadarHistory({ el, history = [] }) {
  if (!el.radarHistoryList) return;
  const completed = history.filter((job) => job.status === 'succeeded');
  if (!completed.length) {
    el.radarHistoryList.classList?.add?.('is-empty');
    el.radarHistoryList.innerHTML = 'Sin transcripciones todavía.';
    return;
  }
  el.radarHistoryList.classList?.remove?.('is-empty');
  el.radarHistoryList.innerHTML = completed.map((job) => {
    const target = job.title || job.target?.name || (job.selected_countries || []).join(', ') || 'Sin título';
    const count = Number(job.mention_count || job.matches_count || 0);
    const language = job.detected_language || 'idioma pendiente';
    const canDownload = job.artifacts?.export_txt;
    return `
      <article class="audio-queue-item radar-transcript-card" data-radar-job-id="${escapeHtml(job.job_id)}">
        <div class="radar-job-card__main">
          <span class="radar-kicker">Transcripción lista</span>
          <strong>${escapeHtml(target)}</strong>
          <small>${escapeHtml(language)} · ${count} ${count === 1 ? 'mención' : 'menciones'}</small>
        </div>
        <div class="radar-card-actions">
          <button type="button" data-radar-action="summary" data-radar-job-id="${escapeHtml(job.job_id)}">Resumen</button>
          <button type="button" data-radar-action="download" data-radar-job-id="${escapeHtml(job.job_id)}" ${canDownload ? '' : 'disabled'}>Descargar TXT</button>
          <button type="button" data-radar-action="delete" data-radar-job-id="${escapeHtml(job.job_id)}">Eliminar</button>
        </div>
      </article>
    `;
  }).join('');
}

export function renderRadarMonitor({ el, state }) {
  if (!el.radarMonitorList) return;
  const status = state.monitorStatus || 'idle';
  const visibleCards = filterMonitorCards(state.monitorCards || [], state.selectedCountry || '');
  if (el.radarMonitorStatus) {
    el.radarMonitorStatus.textContent = monitorStatusText({ status, total: state.monitorCards?.length || 0, visible: visibleCards.length, error: state.monitorError });
  }
  if (status === 'loading') {
    el.radarMonitorList.classList?.add?.('is-empty');
    el.radarMonitorList.innerHTML = '<article class="radar-monitor-empty">Cargando videos monitoreados.</article>';
    return;
  }
  if (status === 'error') {
    el.radarMonitorList.classList?.add?.('is-empty');
    el.radarMonitorList.innerHTML = `<article class="radar-monitor-error">${escapeHtml(state.monitorError || 'Channel Monitor no disponible')}</article>`;
    return;
  }
  if (!visibleCards.length) {
    el.radarMonitorList.classList?.add?.('is-empty');
    el.radarMonitorList.innerHTML = '<article class="radar-monitor-empty">Sin videos monitoreados para este filtro.</article>';
    return;
  }
  el.radarMonitorList.classList?.remove?.('is-empty');
  el.radarMonitorList.innerHTML = visibleCards.map(renderMonitorCard).join('');
}

function monitorStatusText({ status, total, visible, error }) {
  if (status === 'loading') return 'Cargando videos monitoreados.';
  if (status === 'error') return error || 'Channel Monitor no disponible.';
  if (status === 'degraded') return `${visible}/${total} videos · monitor degradado`;
  return `${visible}/${total} videos monitoreados`;
}

function renderMonitorCard(card = {}) {
  const title = card.title || card.video_id || 'Video sin título';
  const meta = [card.country, card.channel_label || card.channel, card.published_at].filter(Boolean).join(' · ');
  const mentions = Array.isArray(card.mentionCounts) ? card.mentionCounts : [];
  return `
    <article class="radar-monitor-card" data-video-id="${escapeHtml(card.video_id || '')}">
      <div class="radar-monitor-card__main">
        <span class="radar-kicker">${escapeHtml(card.lifecycle || card.enqueue_status || 'monitor')}</span>
        <strong>${escapeHtml(title)}</strong>
        <small class="radar-monitor-card__meta">${escapeHtml(meta || 'Metadata pendiente')}</small>
      </div>
      <div class="radar-monitor-card__mentions" aria-label="Menciones detectadas">
        ${mentions.length ? mentions.map(renderMentionColumn).join('') : '<span class="radar-mention-column is-pending"><strong>—</strong><small>Pendiente</small></span>'}
      </div>
    </article>
  `;
}

function renderMentionColumn(item = {}) {
  const isPending = item.status && item.status !== 'ready';
  return `
    <span class="radar-mention-column ${isPending ? 'is-pending' : ''}">
      <strong>${escapeHtml(item.count ?? '—')}</strong>
      <small>${escapeHtml(item.label || 'Pendiente')}</small>
    </span>
  `;
}

function humanJobStatus(status = '') {
  const map = {
    queued: 'En cola',
    running: 'Procesando',
    succeeded: 'Completado',
    failed: 'Falló',
    cancelled: 'Cancelado',
    cancel_requested: 'Cancelando',
    delete_requested: 'Eliminando',
  };
  return map[status] || status || 'Sin estado';
}

export function renderRadarSummary({ el, summary }) {
  if (!el.radarSummaryBody) return;
  const items = summary?.items || [];
  el.radarSummaryBody.innerHTML = items.length
    ? items.map((item) => `<p><strong>${escapeHtml(item.label)}</strong>: ${escapeHtml(item.count)} menciones · ${escapeHtml((item.timestamps || []).join(', '))}</p>`).join('')
    : '<p>Sin menciones detectadas.</p>';
}
