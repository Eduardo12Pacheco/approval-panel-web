export const AI_RESCUE_COUNTRY_TABS = [
  { value: 'ecuador', label: 'Ecuador' },
  { value: 'colombia', label: 'Colombia' },
  { value: 'argentina', label: 'Argentina' },
  { value: 'uruguay', label: 'Uruguay' },
  { value: 'paraguay', label: 'Paraguay' },
  { value: 'mexico', label: 'México' },
  { value: 'rejected', label: 'Rechazados IA' },
];

const COUNTRY_LABELS = new Map(AI_RESCUE_COUNTRY_TABS.filter((tab) => tab.value !== 'rejected').map((tab) => [tab.value, tab.label]));
const QUEUE_STATUS_LABELS = {
  waiting: 'En espera',
  processing: 'Analizando',
  retry: 'Reintento',
  candidate: 'Con candidatos',
  rejected: 'Rechazado',
  approved: 'Aprobado',
  dismissed: 'Descartado',
};
const REJECTION_SOURCE_LABELS = { ai: 'IA', system: 'Sistema', human: 'Humano' };

export function createAiRescueState() {
  return {
    status: 'idle',
    selectedTab: 'ecuador',
    candidates: [],
    rejections: [],
    queue: { current: null, upcoming: [], counts: {} },
    selectedCandidate: null,
    error: '',
    activePollingTimer: null,
    queuePollingTimer: null,
    refreshInFlight: false,
    queueInFlight: false,
  };
}

export function getAiRescueVisibleCandidates({ candidates = [], selectedTab = '' } = {}) {
  const selected = normalizeAiRescueCountryKey(selectedTab);
  return candidates
    .map(normalizeAiRescueCandidate)
    .filter((candidate) => !selected || selected === 'rejected' || candidate.targetCountry === selected)
    .sort((a, b) => b.score - a.score || a.id - b.id);
}

export function normalizeAiRescueCandidate(candidate = {}) {
  const targetCountry = normalizeAiRescueCountryKey(candidate.target_country || candidate.targetCountry);
  const sourceCountry = normalizeAiRescueCountryKey(candidate.source_country || candidate.sourceCountry);
  const score = Number(candidate.score || 0);
  return {
    ...candidate,
    id: Number(candidate.id || 0),
    videoId: (candidate.video_id || candidate.videoId || '').toString(),
    title: (candidate.title || candidate.video_id || candidate.videoId || 'Video sin título').toString(),
    url: (candidate.url || '').toString().trim(),
    targetCountry,
    targetLabel: candidate.target_country_label || candidate.targetLabel || formatAiRescueCountryLabel(targetCountry),
    sourceCountry,
    sourceLabel: candidate.source_country_label || candidate.sourceLabel || formatAiRescueCountryLabel(sourceCountry),
    score: Number.isFinite(score) ? score : 0,
    summary: candidate.summary_es || candidate.summary || '',
    angle: candidate.angle_es || candidate.angle || '',
    risk: candidate.risk || '',
    risks: Array.isArray(candidate.risks) ? candidate.risks : [],
    evidence: Array.isArray(candidate.evidence) ? candidate.evidence : [],
    evidenceCount: Number(candidate.evidence_count ?? candidate.evidenceCount ?? candidate.evidence?.length ?? 0),
    reason: candidate.reason || candidate.raw_response?.reason || candidate.rawResponse?.reason || '',
    publishedAt: candidate.published_at || candidate.publishedAt || '',
    submittedAt: candidate.submitted_at || candidate.submittedAt || candidate.created_at || candidate.createdAt || '',
  };
}

export function normalizeAiRescueQueue(payload = {}) {
  return {
    current: normalizeAiRescueQueueItem(payload.current),
    upcoming: Array.isArray(payload.upcoming) ? payload.upcoming.map(normalizeAiRescueQueueItem).filter(Boolean) : [],
    counts: payload.counts || {},
  };
}

export function normalizeAiRescueQueueItem(item = null) {
  if (!item) return null;
  const status = (item.status || 'waiting').toString().trim().toLowerCase();
  return {
    ...item,
    videoId: (item.video_id || item.videoId || '').toString(),
    sourceLabel: item.source_country_label || item.sourceLabel || formatAiRescueCountryLabel(item.source_country || item.sourceCountry),
    status,
    statusLabel: QUEUE_STATUS_LABELS[status] || humanizeToken(status),
    displayStatus: item.display_status || item.displayStatus || '',
    failureCode: item.failure_code || item.failureCode || '',
    attemptCount: Number(item.attempt_count ?? item.attemptCount ?? 0),
    nextAttemptAt: item.next_attempt_at || item.nextAttemptAt || '',
    lastError: item.last_error || item.lastError || '',
  };
}

export function normalizeAiRescueRejection(record = {}) {
  const source = (record.source || 'ai').toString().trim().toLowerCase();
  const targetCountry = normalizeAiRescueCountryKey(record.target_country || record.targetCountry);
  const videoId = (record.video_id || record.videoId || '').toString();
  return {
    ...record,
    id: Number(record.id || 0),
    videoId,
    candidateId: record.candidate_id || record.candidateId || null,
    source,
    sourceLabel: REJECTION_SOURCE_LABELS[source] || humanizeToken(source),
    reason: record.reason || 'Sin motivo',
    displayStatus: record.display_status || record.displayStatus || '',
    failureCode: record.failure_code || record.failureCode || '',
    targetCountry,
    targetLabel: record.target_country_label || record.targetLabel || formatAiRescueCountryLabel(targetCountry),
    url: normalizeVideoUrl(record.url || record.video_url || record.videoUrl, videoId),
    createdAt: record.created_at || record.createdAt || '',
    detailText: getAiRescueRejectionDetailText(record.details),
  };
}

export function getAiRescueRejectionGroups(records = []) {
  const groups = new Map();
  for (const record of records.map(normalizeAiRescueRejection)) {
    const key = record.videoId || `rejection-${record.id}`;
    if (!groups.has(key)) {
      groups.set(key, { videoId: record.videoId, url: record.url, items: [], summaryItems: [], sources: new Set(), latestTime: 0, latestId: 0 });
    }
    const group = groups.get(key);
    group.url = group.url || record.url;
    group.sources.add(record.sourceLabel);
    group.latestTime = Math.max(group.latestTime, getSortableTime(record.createdAt));
    group.latestId = Math.max(group.latestId, record.id);
    if (!record.targetCountry && record.reason === 'no-candidates') {
      group.summaryItems.push(record);
    } else {
      group.items.push(record);
    }
  }
  return Array.from(groups.values()).map((group) => ({
    ...group,
    sourceLabel: Array.from(group.sources).filter(Boolean).join(' · '),
    items: group.items.length ? group.items : group.summaryItems,
    summary: group.items.length ? '' : group.summaryItems[0]?.detailText || '',
  })).filter((group) => group.items.length)
    .sort((a, b) => b.latestTime - a.latestTime || b.latestId - a.latestId);
}

export function normalizeAiRescueCountryKey(value = '') {
  return (value || '').toString().trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function formatAiRescueCountryLabel(value = '') {
  const normalized = normalizeAiRescueCountryKey(value);
  return COUNTRY_LABELS.get(normalized) || (value || '').toString().trim();
}

function humanizeToken(value = '') {
  const text = (value || '').toString().trim().replace(/[_-]+/g, ' ').toLowerCase();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : 'Sin estado';
}

function getAiRescueRejectionDetailText(details) {
  if (typeof details === 'string') {
    const trimmed = details.trim();
    return looksLikeJsonString(trimmed) ? '' : trimmed;
  }
  if (!details || typeof details !== 'object') return '';
  return firstStringValue([
    details.explanation_es,
    details.explanation,
    details.note,
    details.error,
    details.message,
  ]);
}

function firstStringValue(values = []) {
  for (const value of values) {
    const text = (value || '').toString().trim();
    if (text) return text;
  }
  return '';
}

function looksLikeJsonString(value = '') {
  const trimmed = value.trim();
  return (trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'));
}

function normalizeVideoUrl(value = '', videoId = '') {
  const explicitUrl = (value || '').toString().trim();
  if (explicitUrl && /^https?:\/\//i.test(explicitUrl)) return explicitUrl;
  const id = (videoId || '').toString().trim();
  return id ? `https://www.youtube.com/watch?v=${encodeURIComponent(id)}` : '';
}

function getSortableTime(value = '') {
  if (!value) return 0;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}
