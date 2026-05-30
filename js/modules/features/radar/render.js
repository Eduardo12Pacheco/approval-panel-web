import { RADAR_COUNTRIES, filterMonitorCards, mapMonitorCard, normalizeMonitorCardStatus } from './state.js';
import { formatEcuadorDateTimeWithZone } from '../../shared/time/ecuador-time.js';

const COUNTRY_LABELS = new Map([
  ...RADAR_COUNTRIES.map((country) => [country.value, country.label]),
  ['ar', 'Argentina'],
  ['arg', 'Argentina'],
  ['co', 'Colombia'],
  ['col', 'Colombia'],
  ['ec', 'Ecuador'],
  ['ecu', 'Ecuador'],
  ['py', 'Paraguay'],
  ['pry', 'Paraguay'],
  ['uy', 'Uruguay'],
  ['ury', 'Uruguay'],
  ['mx', 'México'],
  ['mex', 'México'],
  ['important', 'IMPORTANTES'],
]);

const LIFECYCLE_LABELS = {
  aprobado: 'APROBADO',
  transcribiendo: 'TRANSCRIBIENDO',
  transcrito: 'TRANSCRITO',
  enqueue_pending: 'Esperando análisis Radar',
  enqueued: 'En cola para analizar',
  queued: 'En cola para analizar',
  processing: 'Analizando menciones',
  processed: 'Análisis listo',
  completed: 'Análisis listo',
  ignored_seen: 'Ya visto · descartado',
  ignored: 'Descartado por monitor',
  skipped: 'Omitido',
  failed: 'Revisar error',
  monitor: 'Monitoreado',
};

const IMPORTANT_LIFECYCLE_LABELS = {
  aprobado: 'Aprobado para transcripción prioritaria',
  transcribiendo: 'Transcribiendo ahora · prioridad IMPORTANTES',
  transcrito: 'Transcrito · prioridad IMPORTANTES',
  enqueue_pending: 'Esperando entrar a la cola prioritaria',
  enqueued: 'En cola prioritaria de transcripción',
  queued: 'En cola prioritaria de transcripción',
  processing: 'Analizando menciones · prioridad IMPORTANTES',
  processed: 'Análisis listo · prioridad IMPORTANTES',
  completed: 'Análisis listo · prioridad IMPORTANTES',
  ignored_seen: 'Ya visto · descartado por monitor',
  ignored: 'Descartado por monitor',
  skipped: 'Omitido por monitor',
  failed: 'Revisar error de cola prioritaria',
  monitor: 'Monitoreado como IMPORTANTE',
};

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
  if (el.radarBasuraCount) el.radarBasuraCount.textContent = String(Number(state.basuraCount || 0));
  renderBasuraList({ el, state });
  updateCountryBar(el.radarCountryBar, state.selectedCountry || '');
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

function updateCountryBar(countryBar, selectedCountry = '') {
  countryBar?.querySelectorAll?.('[data-radar-country-option]')?.forEach?.((button) => {
    const isActive = button.dataset?.radarCountryOption === selectedCountry;
    button.classList?.toggle?.('is-active', isActive);
    button.setAttribute?.('aria-pressed', isActive ? 'true' : 'false');
  });
}

function renderMonitorCard(card = {}) {
  const dashboardCard = mapMonitorCard(card, Array.isArray(card.mentionCounts) ? card.mentionCounts : []);
  const title = card.title || card.video_id || 'Video sin título';
  const meta = formatMonitorMetadata(card);
  const importantAudit = formatImportantAudit(card);
  const status = normalizeMonitorCardStatus(card);
  const statusLabel = formatMonitorDisplayStatus(card, status);
  const url = resolveMonitorVideoUrl(card);
  const canDownloadTranscript = status === 'transcrito' && Boolean(card.radar_job_id);
  const linkDisabled = url ? '' : 'disabled aria-disabled="true" title="Link no disponible"';
  const transcriptDisabled = canDownloadTranscript ? '' : 'disabled aria-disabled="true" title="Disponible cuando la transcripción esté lista"';
  const mentions = Array.isArray(dashboardCard.mentionCounts) ? dashboardCard.mentionCounts : [];
  const dismissContext = resolveDismissContext(card);
  const dismissLabel = formatCountryLabel(dismissContext) || 'este contexto';
  const emptyMentions = status === 'transcrito'
    ? '<span class="radar-mention-row is-ready"><small>Sin menciones:</small><strong>0</strong></span>'
    : '<span class="radar-mention-row is-pending"><small>Pendiente:</small><strong>—</strong></span>';
  return `
    <article class="radar-monitor-card" data-video-id="${escapeHtml(card.video_id || '')}" data-radar-job-id="${escapeHtml(card.radar_job_id || '')}">
      <div class="radar-monitor-card__main">
        <span class="radar-status-chip ${escapeHtml(monitorStatusChipClass(status))}">${escapeHtml(statusLabel)}</span>
        <strong>${escapeHtml(title)}</strong>
        <small class="radar-monitor-card__meta">${escapeHtml(meta || 'Metadata pendiente')}</small>
        ${importantAudit ? `<small class="radar-monitor-card__meta">${escapeHtml(importantAudit)}</small>` : ''}
      </div>
      <div class="radar-monitor-card__actions" aria-label="Acciones del video monitoreado">
        <button type="button" data-radar-action="dismiss-monitor-card" data-radar-dismiss-surface="monitor-card" data-radar-dismiss-target-context="${escapeHtml(dismissContext)}" data-radar-dismiss-target-label="${escapeHtml(dismissLabel)}" data-radar-dismiss-video-id="${escapeHtml(card.video_id || '')}" aria-label="Ocultar card solo en ${escapeHtml(dismissLabel)}">×</button>
        <button type="button" data-radar-action="open-link" data-radar-url="${escapeHtml(url)}" aria-label="Abrir video en YouTube" ${linkDisabled}>Link</button>
        <button type="button" data-radar-action="download-monitor-transcript" data-radar-job-id="${escapeHtml(card.radar_job_id || '')}" aria-label="Descargar transcripción TXT" ${transcriptDisabled}>Transcripción</button>
      </div>
      <div class="radar-monitor-card__mentions" aria-label="Menciones detectadas">
        <span class="radar-monitor-card__mentions-title">Menciones:</span>
        <div class="radar-monitor-card__mentions-grid">
          ${mentions.length ? mentions.map(renderMentionColumn).join('') : emptyMentions}
        </div>
      </div>
    </article>
  `;
}

function resolveDismissContext(card = {}) {
  const rawContext = card.target_country || card.country || '';
  const normalized = normalizeKey(rawContext);
  if (normalized === 'importantes') return 'important';
  return normalized || 'monitor';
}

function resolveMonitorVideoUrl(card = {}) {
  const rawUrl = (card.url || '').toString().trim();
  if (isSafeYouTubeUrl(rawUrl)) return rawUrl;
  const videoId = (card.video_id || '').toString().trim();
  if (/^[a-zA-Z0-9_-]{6,}$/.test(videoId)) return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  return '';
}

function isSafeYouTubeUrl(rawUrl = '') {
  if (!rawUrl) return false;
  try {
    const url = new URL(rawUrl);
    const hostname = url.hostname.toLowerCase();
    return url.protocol === 'https:' && ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(hostname);
  } catch {
    return false;
  }
}

function monitorStatusChipClass(status = '') {
  const normalized = normalizeKey(status).replace(/-/g, '_');
  if (normalized === 'aprobado') return 'is-info';
  if (normalized === 'transcribiendo') return 'is-warning';
  if (normalized === 'transcrito') return 'is-success';
  if (normalized === 'geo_blocked' || normalized === 'yt_dlp_geo_blocked') return 'is-failed';
  if (normalized === 'error' || normalized === 'failed') return 'is-failed';
  return 'is-processing';
}

function formatMonitorMetadata(card = {}) {
  const target = card.target_country_label || card.country_label || formatCountryLabel(card.target_country || card.country);
  const source = card.source_country_label || formatCountryLabel(card.source_country);
  const channel = card.channel_label || card.channel_name || card.channel;
  const uploaded = formatUploadedAt(card.published_at || card.uploaded_at || card.created_at);
  return [target ? `Destino: ${target}` : '', source ? `Fuente: ${source}` : '', channel ? `Canal: ${channel}` : '', uploaded].filter(Boolean).join(' · ');
}

function formatImportantAudit(card = {}) {
  if (!card.important && normalizeKey(card.target_country || card.country) !== 'important') return '';
  const reason = formatImportantReason(card.important_reason || card.importantReason || card.classification_reason || card.classificationReason || '');
  const rule = formatImportantRule(card.important_rule || card.importantRule);
  return [reason ? `IMPORTANTE: ${reason}` : 'IMPORTANTE', rule].filter(Boolean).join(' · ');
}

function formatImportantReason(value = '') {
  const normalized = normalizeKey(value).replace(/-/g, '_');
  const labels = {
    important_program_match: 'coincidencia de programa',
    important_full_channel: 'canal completo',
    full_channel: 'canal completo',
    program_rules: 'coincidencia de programa',
    important_channel: 'canal importante',
  };
  return labels[normalized] || humanizeToken(value);
}

function formatImportantRule(rule = null) {
  if (!rule || typeof rule !== 'object') return '';
  const op = (rule.op || rule.type || '').toString().trim();
  const value = (rule.value || rule.label || '').toString().trim();
  if (op && value) return `${op}: ${value}`;
  return value || op;
}

function formatCountryLabel(value = '') {
  const normalized = normalizeKey(value);
  if (!normalized) return '';
  return COUNTRY_LABELS.get(normalized) || value.toString().trim();
}

function formatLifecycleLabel(value = '') {
  const normalized = normalizeKey(value).replace(/-/g, '_');
  if (!normalized) return 'Monitoreado';
  return LIFECYCLE_LABELS[normalized] || humanizeToken(value);
}

function formatMonitorDisplayStatus(card = {}, normalizedStatus = '') {
  const displayStatus = (card.display_status || card.displayStatus || '').toString().trim();
  if (displayStatus) return displayStatus;
  if (isGeoBlockedStatus(normalizedStatus) || isGeoBlockedStatus(card.last_error || card.lastError)) return 'GEO-BLOQUEADO';
  if (isImportantMonitorCard(card)) {
    return formatImportantLifecycleLabel(normalizedStatus);
  }
  return formatLifecycleLabel(normalizedStatus);
}

function formatImportantLifecycleLabel(value = '') {
  const normalized = normalizeKey(value).replace(/-/g, '_');
  if (!normalized) return 'Monitoreado como IMPORTANTE';
  return IMPORTANT_LIFECYCLE_LABELS[normalized] || humanizeToken(value);
}

function isImportantMonitorCard(card = {}) {
  return Boolean(card.important)
    || normalizeKey(card.target_country || card.country) === 'important'
    || normalizeKey(card.target_country_label || card.country_label) === 'importantes';
}

function isGeoBlockedStatus(value = '') {
  const normalized = normalizeKey(value).replace(/-/g, '_');
  return normalized === 'geo_blocked' || normalized === 'yt_dlp_geo_blocked';
}

function formatUploadedAt(value = '') {
  const formatted = formatEcuadorDateTimeWithZone(value);
  return formatted ? `Subido ${formatted}` : '';
}

function normalizeKey(value = '') {
  return (value || '').toString().trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function humanizeToken(value = '') {
  const text = (value || '').toString().trim().replace(/[_-]+/g, ' ').toLowerCase();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : 'Monitoreado';
}

function renderMentionColumn(item = {}) {
  const isPending = item.status && item.status !== 'ready';
  return `
    <span class="radar-mention-row ${isPending ? 'is-pending' : ''}">
      <small>${escapeHtml(item.label || 'Pendiente')}:</small>
      <strong>${escapeHtml(item.count ?? '—')}</strong>
    </span>
  `;
}

function humanJobStatus(status = '') {
  const map = {
    aprobado: 'Aprobado',
    transcribiendo: 'Transcribiendo',
    transcrito: 'Transcrito',
    geo_blocked: 'GEO-BLOQUEADO',
    yt_dlp_geo_blocked: 'GEO-BLOQUEADO',
    error: 'Error',
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

function renderBasuraList({ el, state }) {
  if (!el.radarBasuraList) return;
  const items = Array.isArray(state.basuraItems) ? state.basuraItems : [];
  el.radarBasuraList.innerHTML = items.length
    ? items.map((item) => `
      <article class="radar-basura-item" data-video-id="${escapeHtml(item.video_id || '')}">
        <strong>${escapeHtml(item.title || item.video_id || 'Video rechazado')}</strong>
        <small>${escapeHtml([item.source_country_label || formatCountryLabel(item.source_country), item.channel_label, item.reason].filter(Boolean).join(' · '))}</small>
      </article>
    `).join('')
    : '<article class="radar-monitor-empty">Sin videos en Basura.</article>';
}

export function renderRadarSummary({ el, summary }) {
  if (!el.radarSummaryBody) return;
  const items = summary?.items || [];
  el.radarSummaryBody.innerHTML = items.length
    ? items.map((item) => `<p><strong>${escapeHtml(item.label)}</strong>: ${escapeHtml(item.count)} menciones · ${escapeHtml((item.timestamps || []).join(', '))}</p>`).join('')
    : '<p>Sin menciones detectadas.</p>';
}
