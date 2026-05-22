export const RADAR_COUNTRIES = [
  { value: 'ecuador', label: 'Ecuador', players: ['Caicedo', 'Pacho', 'Hincapié'] },
  { value: 'colombia', label: 'Colombia', players: ['Luis Díaz', 'James', 'Quintero'] },
  { value: 'argentina', label: 'Argentina', players: ['Messi', 'Álvarez', 'Di María'] },
  { value: 'uruguay', label: 'Uruguay', players: ['Valverde', 'Darwin', 'Suárez'] },
  { value: 'paraguay', label: 'Paraguay', players: ['Almirón', 'Enciso', 'Sanabria'] },
  { value: 'mexico', label: 'México', players: ['Giménez', 'Ochoa', 'Edson Álvarez'] },
];

const DEFAULT_MENTION_LABELS = ['Jugador clave', 'Referente', 'Selección', 'País'];

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
    monitorSummary: null,
    basuraItems: [],
    basuraCount: 0,
    monitorError: '',
    selectedCountry: '',
    summaryByJobId: {},
    pollingTimer: null,
    pollingInFlight: false,
  };
}

export function normalizeMonitorSummary(summary = {}, { limit = 12 } = {}) {
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
  return cards.filter((card) => normalizeCountryKey(card.target_country || card.country) === selected);
}

export function mapMonitorCard(card = {}, summaryColumns = []) {
  const countryConfig = getCountryConfig(card.target_country || card.country);
  const sourceCounts = summaryColumns.length ? summaryColumns : normalizeExistingMentionCounts(card.mention_counts);
  const mentionCounts = buildCountryMentionDashboard({ countryConfig, sourceCounts });
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
    .slice(0, 12);
}

function buildCountryMentionDashboard({ countryConfig, sourceCounts = [] } = {}) {
  const labels = countryConfig
    ? [...countryConfig.players, countryConfig.label]
    : DEFAULT_MENTION_LABELS;
  const countsByLabel = new Map(sourceCounts.map((item) => [normalizeCountryKey(item.label), item]));

  return labels.map((label) => {
    const source = countsByLabel.get(normalizeCountryKey(label));
    return {
      label,
      count: source?.count ?? '—',
      status: source?.status || 'pending',
    };
  });
}

function getCountryConfig(country = '') {
  return RADAR_COUNTRIES.find((item) => item.value === normalizeCountryKey(country));
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
