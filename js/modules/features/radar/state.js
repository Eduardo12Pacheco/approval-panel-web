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
  const selected = (country || '').toString().trim().toLowerCase();
  if (!selected) return [...cards];
  return cards.filter((card) => (card.country || '').toString().trim().toLowerCase() === selected);
}

export function mapMonitorCard(card = {}, summaryColumns = []) {
  return {
    ...card,
    mentionCounts: summaryColumns.length ? summaryColumns : (Array.isArray(card.mention_counts) ? card.mention_counts : []),
  };
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
