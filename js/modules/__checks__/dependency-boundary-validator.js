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
