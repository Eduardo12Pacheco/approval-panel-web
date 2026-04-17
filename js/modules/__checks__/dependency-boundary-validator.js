export const LEGACY_ARCHIVE_PATH = 'js/legacy/app.js';

export function validateDependencyBoundaries(importGraph = {}, forbiddenRules = {}) {
  const violations = [];

  for (const [from, imports] of Object.entries(importGraph)) {
    const forbidden = new Set(forbiddenRules[from] || []);
    for (const to of imports || []) {
      if (forbidden.has(to)) {
        violations.push({ from, to, rule: `${from} -> ${to}` });
      }
    }
  }

  return {
    ok: violations.length === 0,
    violations,
  };
}

export function validateNoLegacyArchiveRuntimeReferences(sourceByPath = {}) {
  const violations = [];
  const archiveTokens = [
    LEGACY_ARCHIVE_PATH,
    './js/legacy/app.js',
    '../legacy/app.js',
    '/js/legacy/app.js',
  ];

  for (const [path, source] of Object.entries(sourceByPath || {})) {
    const text = (source || '').toString();
    if (!text) continue;
    const hitToken = archiveTokens.find((token) => text.includes(token));
    if (!hitToken) continue;
    violations.push({
      path,
      token: hitToken,
      rule: `runtime must not reference ${LEGACY_ARCHIVE_PATH}`,
    });
  }

  return {
    ok: violations.length === 0,
    violations,
  };
}
