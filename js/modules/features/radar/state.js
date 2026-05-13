export function createRadarState() {
  return {
    status: 'idle',
    activeJobId: null,
    health: null,
    currentJob: null,
    summary: null,
    history: [],
    pollingTimer: null,
    pollingInFlight: false,
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
