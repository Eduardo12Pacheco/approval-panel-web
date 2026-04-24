export function renderQueueMonitor({ queueItems, el, escapeHtml }) {
  const queue = queueItems
    .map((item) => buildQueueMonitorCard(item))
    .filter((item) => item.isVisible);

  el.queueMeta.textContent = queue.length
    ? `${queue.length} job${queue.length === 1 ? '' : 's'} en curso`
    : '';
  el.queueMeta.classList.toggle('hidden', !queue.length);

  if (!queue.length) {
    el.queueList.innerHTML = '<p class="meta queue-list__empty">Sin jobs en curso.</p>';
    return;
  }

  el.queueList.innerHTML = queue.map((item) => `
    <article class="queue-item queue-item--monitor queue-item--${item.tone}">
      <div class="queue-item__header">
        <div class="queue-item__title-group">
          <div class="meta queue-item__eyebrow">${escapeHtml(item.eyebrow)}</div>
          <strong>${escapeHtml(item.title)}</strong>
        </div>
        <span class="queue-status-pill queue-status-pill--${item.tone}">${escapeHtml(item.statusLabel)}</span>
      </div>
      <div class="queue-progress">
        <div class="queue-progress__meta">
          <span>${escapeHtml(item.progressLabel)}</span>
          <span>${item.percent}%</span>
        </div>
        <div class="queue-progress__track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${item.percent}">
          <div class="queue-progress__fill queue-progress__fill--${item.tone}" style="width:${item.percent}%"></div>
        </div>
      </div>
    </article>
  `).join('');
}

export function buildQueueMonitorCard(item = {}) {
  const rawStatus = pickFirstNonEmpty(
    item.estado_queue,
    item.estado,
    item.status,
    item.stage,
    item.progress?.stage,
  );
  const normalizedStatus = normalizeQueueStatus(rawStatus);
  const percent = resolveQueueProgressPercent(item, normalizedStatus);
  const title = pickFirstNonEmpty(item.tema_principal, item.titular, item.jugador, item.cluster_id, item.queue_id, 'Job sin título');
  const eyebrow = [pickFirstNonEmpty(item.jugador, 'Sin jugador'), pickFirstNonEmpty(item.fuente, item.seleccion, 'Sin origen')]
    .filter(Boolean)
    .join(' · ');
  return {
    title,
    eyebrow,
    statusLabel: getQueueStatusLabel(normalizedStatus),
    progressLabel: getQueueProgressLabel(normalizedStatus, percent),
    percent,
    tone: getQueueTone(normalizedStatus),
    isVisible: shouldDisplayInQueueMonitor(normalizedStatus),
  };
}

export function pickFirstNonEmpty(...values) {
  for (const value of values) {
    const normalized = `${value ?? ''}`.trim();
    if (normalized) return normalized;
  }
  return '';
}

export function normalizeQueueStatus(value = '') {
  return value
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_');
}

export function resolveQueueProgressPercent(item = {}, normalizedStatus = '') {
  const candidates = [
    item.progress_percent,
    item.progreso_percent,
    item.progress_pct,
    item.progreso_pct,
    item.progress?.percent,
    item.progress?.pct,
    item.progress,
    item.progreso,
  ];

  for (const candidate of candidates) {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed)) {
      return Math.min(100, Math.max(0, Math.round(parsed)));
    }
  }

  const fallbackByStatus = {
    queued: 12,
    pending: 12,
    aprobado: 16,
    approved: 16,
    generating: 48,
    generando: 48,
    processing: 52,
    procesando: 52,
    writing: 68,
    redactando: 68,
    editing: 82,
    en_edicion: 82,
    en_revision: 86,
    ready_for_edit: 92,
    borrador_generado: 92,
    done: 100,
    completed: 100,
    publicado: 100,
    failed: 100,
    error: 100,
  };

  return fallbackByStatus[normalizedStatus] ?? 24;
}

export function isQueueTerminalStatus(normalizedStatus = '') {
  return new Set(['done', 'completed', 'published', 'publicado', 'cancelled', 'cancelado']).has(normalizedStatus);
}

export function shouldDisplayInQueueMonitor(normalizedStatus = '') {
  if (isQueueTerminalStatus(normalizedStatus)) return false;
  if (normalizedStatus === 'ready_for_edit' || normalizedStatus === 'borrador_generado') return false;
  return true;
}

export function getQueueStatusLabel(normalizedStatus = '') {
  const labels = {
    queued: 'En espera',
    pending: 'En espera',
    approved: 'Aprobado',
    aprobado: 'Aprobado',
    generating: 'Generando',
    generando: 'Generando',
    processing: 'Procesando',
    procesando: 'Procesando',
    writing: 'Redactando',
    redactando: 'Redactando',
    editing: 'Editando',
    en_edicion: 'Editando',
    en_revision: 'En revisión',
    ready_for_edit: 'Listo para editar',
    borrador_generado: 'Listo para editar',
    failed: 'Con error',
    error: 'Con error',
  };

  return labels[normalizedStatus] || 'En progreso';
}

export function getQueueProgressLabel(normalizedStatus = '', percent = 0) {
  if (normalizedStatus === 'failed' || normalizedStatus === 'error') {
    return 'Requiere revisión';
  }
  if (normalizedStatus === 'ready_for_edit' || normalizedStatus === 'borrador_generado') {
    return 'Draft listo';
  }
  if (percent >= 90) {
    return 'Casi listo';
  }
  if (percent >= 50) {
    return 'Avanzando';
  }
  return 'Iniciando';
}

export function getQueueTone(normalizedStatus = '') {
  if (normalizedStatus === 'failed' || normalizedStatus === 'error') return 'error';
  if (normalizedStatus === 'ready_for_edit' || normalizedStatus === 'borrador_generado') return 'warm';
  return 'active';
}

export function formatQueueAttempts(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return '';
  return `Intento ${Math.round(parsed)}`;
}

