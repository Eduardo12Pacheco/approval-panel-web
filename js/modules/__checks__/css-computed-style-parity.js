import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..', '..');

const GUARDED_SELECTOR_BASELINE = {
  '.sidebar': {
    position: 'fixed',
    width: 'var(--sidebar-collapsed)',
    display: 'flex',
  },
  '.topbar': {
    display: 'flex',
    'justify-content': 'space-between',
    'align-items': 'center',
  },
  '.card': {
    display: 'flex',
    'min-height': '240px',
    'border-radius': '18px',
  },
  '.audio-queue-card': {
    'border-radius': '0',
    background: 'linear-gradient(180deg, rgba(18, 18, 18, 0.98), rgba(10, 10, 10, 0.96))',
  },
  '.subtitle-phase-bar': {
    display: 'grid',
    'grid-template-columns': 'repeat(5, minmax(0, 1fr))',
  },
};

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '');
}

function removeAtMediaBlocks(source) {
  let result = '';
  let i = 0;

  while (i < source.length) {
    const mediaIndex = source.indexOf('@media', i);
    if (mediaIndex === -1) {
      result += source.slice(i);
      break;
    }

    result += source.slice(i, mediaIndex);

    const openBrace = source.indexOf('{', mediaIndex);
    if (openBrace === -1) break;

    let depth = 1;
    let j = openBrace + 1;
    while (j < source.length && depth > 0) {
      const char = source[j];
      if (char === '{') depth += 1;
      if (char === '}') depth -= 1;
      j += 1;
    }

    i = j;
  }

  return result;
}

function parseCssRules(cssSource) {
  const source = removeAtMediaBlocks(stripComments(cssSource));
  const ruleRegex = /([^{}]+)\{([^{}]+)\}/g;
  const rules = [];
  let match = ruleRegex.exec(source);

  while (match) {
    const selectorText = match[1].trim();
    const declarationsText = match[2].trim();

    if (!selectorText.startsWith('@')) {
      const selectors = selectorText.split(',').map((selector) => selector.trim()).filter(Boolean);
      const declarations = {};

      for (const chunk of declarationsText.split(';')) {
        const line = chunk.trim();
        if (!line) continue;
        const colonIndex = line.indexOf(':');
        if (colonIndex <= 0) continue;
        const property = line.slice(0, colonIndex).trim();
        const value = line.slice(colonIndex + 1).trim();
        if (property && value) declarations[property] = value;
      }

      rules.push({ selectors, declarations });
    }

    match = ruleRegex.exec(source);
  }

  return rules;
}

async function getStyleImportPaths() {
  const stylesEntry = await readFile(path.join(ROOT, 'styles.css'), 'utf-8');
  const imports = [];
  const importRegex = /@import\s+'([^']+)'\s*;/g;
  let match = importRegex.exec(stylesEntry);

  while (match) {
    const rawPath = match[1];
    imports.push(path.resolve(ROOT, rawPath.replace('./', '')));
    match = importRegex.exec(stylesEntry);
  }

  return imports;
}

async function computeGuardedSelectorStyles() {
  const selectors = Object.keys(GUARDED_SELECTOR_BASELINE);
  const computed = Object.fromEntries(selectors.map((selector) => [selector, {}]));
  const importPaths = await getStyleImportPaths();

  for (const filePath of importPaths) {
    const source = await readFile(filePath, 'utf-8');
    const rules = parseCssRules(source);

    for (const rule of rules) {
      for (const selector of selectors) {
        if (!rule.selectors.includes(selector)) continue;
        computed[selector] = {
          ...computed[selector],
          ...rule.declarations,
        };
      }
    }
  }

  return computed;
}

export async function runComputedStyleParityCheck() {
  const computed = await computeGuardedSelectorStyles();
  const failures = [];

  for (const [selector, expected] of Object.entries(GUARDED_SELECTOR_BASELINE)) {
    const actual = computed[selector] || {};
    for (const [property, expectedValue] of Object.entries(expected)) {
      const actualValue = actual[property];
      if (actualValue !== expectedValue) {
        failures.push({ selector, property, expected: expectedValue, actual: actualValue ?? null });
      }
    }
  }

  return {
    ok: failures.length === 0,
    baseline: GUARDED_SELECTOR_BASELINE,
    computed,
    failures,
  };
}
