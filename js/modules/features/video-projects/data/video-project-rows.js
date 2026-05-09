export function normalizeVideoProjectRows(payload = {}) {
  const candidates = [payload?.projects, payload?.items, payload?.rows, payload?.data];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}
