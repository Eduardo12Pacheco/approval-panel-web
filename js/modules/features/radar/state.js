export const RADAR_COUNTRIES = [
  { value: 'ecuador', label: 'Ecuador', players: ['Caicedo', 'Pacho', 'Hincapié'] },
  { value: 'colombia', label: 'Colombia', players: ['Luis Díaz', 'James', 'Quintero'] },
  { value: 'argentina', label: 'Argentina', players: ['Messi', 'Álvarez', 'Di María'] },
  { value: 'paraguay', label: 'Paraguay', players: ['Almirón', 'Enciso', 'Sanabria'] },
  { value: 'uruguay', label: 'Uruguay', players: ['Valverde', 'Darwin', 'Suárez'] },
  { value: 'mexico', label: 'México', players: ['Giménez', 'Ochoa', 'Edson Álvarez'] },
];

const DEFAULT_PENDING_PLAYERS = ['Menciones', 'Jugadores', 'País'];

export function createRadarState() {
  return {
    status: 'idle',
    activeJobId: null,
    health: null,
    currentJob: null,
    summary: null,
    history: [],
    monitorStatus: 'idle',
    monitorCards: [],
    monitorError: '',
    selectedCountry: '',
    summaryByJobId: {},
    pollingTimer: null,
    pollingInFlight: false,
  };
}

export function normalizeMonitorSummary(summary = {}, { limit = 3 } = {}) {
  const items = Array.isArray(summary?.items) ? summary.items : [];
  return items
    .map((item) => ({
      label: (item?.label || 'Sin etiqueta').toString(),
      count: Number.isFinite(Number(item?.count)) ? Number(item.count) : 0,
      status: item?.status || 'ready',
    }))
    .slice(0, limit);
}

export function filterMonitorCards(cards = [], country = '') {
  const selected = normalizeCountryKey(country);
  if (!selected) return [...cards];
  return cards.filter((card) => normalizeCountryKey(card.country) === selected);
}

export function mapMonitorCard(card = {}, summaryColumns = []) {
  const mentionCounts = summaryColumns.length
    ? summaryColumns
    : normalizeExistingMentionCounts(card.mention_counts).length
      ? normalizeExistingMentionCounts(card.mention_counts)
      : buildPendingMentionColumns(card.country);
  return {
    ...card,
    mentionCounts,
  };
}

function normalizeExistingMentionCounts(mentionCounts = []) {
  if (!Array.isArray(mentionCounts)) return [];
  return mentionCounts
    .map((item) => ({
      label: (item?.label || item?.player || item?.name || 'Pendiente').toString(),
      count: Number.isFinite(Number(item?.count)) ? Number(item.count) : (item?.count ?? '—'),
      status: item?.status || 'ready',
    }))
    .slice(0, 3);
}

function buildPendingMentionColumns(country = '') {
  const countryConfig = RADAR_COUNTRIES.find((item) => item.value === normalizeCountryKey(country));
  return (countryConfig?.players || DEFAULT_PENDING_PLAYERS).map((label) => ({
    label,
    count: '—',
    status: 'pending',
  }));
}

function normalizeCountryKey(value = '') {
  const raw = (value || '').toString().trim().toLowerCase();
  return raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function parseRadarKeywords(value) {
  return (value || '')
    .toString()
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function buildRadarJobPayload({ url, countries = [], extraKeywords = '' }) {
  const cleanUrl = (url || '').toString().trim();
  if (!cleanUrl) throw new Error('Pegá un link para investigar.');
  const selectedCountries = countries.map((country) => country.toString().trim().toLowerCase()).filter(Boolean);
  if (!selectedCountries.length) throw new Error('Elegí al menos un país para investigar.');

  return {
    url: cleanUrl,
    countries: selectedCountries,
    extra_keywords: parseRadarKeywords(extraKeywords),
  };
}
