export function createRadarState() {
  return {
    status: 'idle',
    activeJobId: null,
    health: null,
    currentJob: null,
    transcript: null,
    mentions: null,
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

export function buildRadarJobPayload({ url, targetType, targetName, targetAliases = '', extraKeywords = '' }) {
  const cleanUrl = (url || '').toString().trim();
  const cleanName = (targetName || '').toString().trim();
  if (!cleanUrl) throw new Error('Pegá un link para investigar.');
  if (!cleanName) throw new Error('Definí un objetivo para buscar menciones.');

  const type = ['country', 'player'].includes(targetType) ? targetType : 'player';
  const aliases = parseRadarKeywords(targetAliases);
  const target = { type, name: cleanName };
  if (aliases.length) target.aliases = aliases;
  return {
    url: cleanUrl,
    target,
    extra_keywords: parseRadarKeywords(extraKeywords),
  };
}
