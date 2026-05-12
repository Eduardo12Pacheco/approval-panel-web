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

const FEATURE_PATH_PATTERN = /js\/modules\/features\/([^/]+)\//;
const IMPORT_PATH_PATTERN = /(?:import|export)\s+(?:[^'\"]*?from\s+)?['\"]([^'\"]+)['\"]/g;

export function validateNoSiblingFeatureImports(sourceByPath = {}) {
  const violations = [];

  for (const [from, source] of Object.entries(sourceByPath || {})) {
    const featureMatch = from.match(FEATURE_PATH_PATTERN);
    if (!featureMatch) continue;

    const currentFeature = featureMatch[1];
    const text = (source || '').toString();
    let importMatch = IMPORT_PATH_PATTERN.exec(text);

    while (importMatch) {
      const importPath = importMatch[1];
      const siblingMatch = importPath.match(/(?:\.\.\/)+([^./][^/]+)(?:\/|$)/);
      const feature = siblingMatch?.[1];

      if (feature && feature !== currentFeature && !['core', 'shared', 'utils', 'data'].includes(feature)) {
        violations.push({
          from,
          to: importPath,
          feature,
          rule: `${currentFeature} feature must not import sibling feature ${feature}`,
        });
      }

      importMatch = IMPORT_PATH_PATTERN.exec(text);
    }
  }

  return {
    ok: violations.length === 0,
    violations,
  };
}
