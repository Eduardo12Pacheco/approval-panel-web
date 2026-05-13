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
      : '';
    el.radarHealthStatus.classList?.toggle?.('is-online', isReachable);
    el.radarHealthStatus.classList?.toggle?.('is-offline', !isReachable);
  }
  if (el.radarProgressStatus) {
    const percent = state.currentJob?.progress?.percent;
    const suffix = Number.isFinite(Number(percent)) ? ` · ${percent}%` : '';
    const errorMessage = state.currentJob?.error?.message;
    el.radarProgressStatus.textContent = state.currentJob
      ? `${humanJobStatus(state.currentJob.status)}${suffix}${errorMessage ? ` · ${errorMessage}` : ''}`
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
