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
    const status = state.health?.status || 'sin verificar';
    el.radarHealthStatus.textContent = `Servicio: ${status}`;
  }
  if (el.radarProgressStatus) {
    const percent = state.currentJob?.progress?.percent;
    const suffix = Number.isFinite(Number(percent)) ? ` · ${percent}%` : '';
    el.radarProgressStatus.textContent = state.currentJob
      ? `Estado: ${state.currentJob.status}${suffix}`
      : 'Listo para investigar.';
  }
  if (el.radarSubmitBtn) el.radarSubmitBtn.disabled = ['queued', 'running'].includes(state.currentJob?.status);
}

export function renderRadarResults({ el, transcript, mentions }) {
  const transcriptText = formatTranscriptCopy(transcript || {});
  const mentionsText = formatMentionsCopy(mentions || {});
  if (el.radarTranscriptOutput) el.radarTranscriptOutput.textContent = transcriptText || 'Todavía no hay transcripción.';
  if (el.radarMentionsOutput) el.radarMentionsOutput.textContent = mentionsText || 'Todavía no hay menciones.';
  if (el.radarCopyTranscriptBtn) el.radarCopyTranscriptBtn.disabled = !transcriptText;
  if (el.radarCopyMentionsBtn) el.radarCopyMentionsBtn.disabled = !mentionsText;
}

export function renderRadarHistory({ el, history = [] }) {
  if (!el.radarHistoryList) return;
  if (!history.length) {
    el.radarHistoryList.classList?.add?.('is-empty');
    el.radarHistoryList.innerHTML = 'Sin trabajos todavía.';
    return;
  }
  el.radarHistoryList.classList?.remove?.('is-empty');
  el.radarHistoryList.innerHTML = history.map((job) => {
    const target = job.target?.name || job.target_name || 'Sin objetivo';
    const count = Number(job.mention_count || job.matches_count || 0);
    return `
      <article class="audio-queue-item" data-radar-job-id="${escapeHtml(job.job_id)}">
        <strong>${escapeHtml(target)}</strong>
        <span>${escapeHtml(job.status || 'unknown')}</span>
        <small>${count} ${count === 1 ? 'mención' : 'menciones'}</small>
      </article>
    `;
  }).join('');
}
