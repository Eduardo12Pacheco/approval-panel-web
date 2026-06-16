import { fileURLToPath } from 'node:url';
import {
  COMPOSITION_DUST_PREVIEW_URL,
  COMPOSITION_DUST_PREVIEW_URLS,
  resolveCompositionDustUrlForRow,
} from '../composition/composition-view-model.js';

const __filename = fileURLToPath(import.meta.url);

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function runCompositionDustPreviewUrlsHasDust1ThroughDust4Check() {
  assertEqual(COMPOSITION_DUST_PREVIEW_URLS['dust-1'], './assets/dust-1.webm', 'Expected dust-1 preview URL to be unchanged');
  assertEqual(COMPOSITION_DUST_PREVIEW_URLS['dust-2'], './assets/dust-2.webm', 'Expected dust-2 preview URL to be unchanged');
  assertEqual(COMPOSITION_DUST_PREVIEW_URLS['dust-3'], './assets/dust-3.webm', 'Expected dust-3 preview URL to map to assets/dust-3.webm');
  assertEqual(COMPOSITION_DUST_PREVIEW_URLS['dust-4'], './assets/dust-4.webm', 'Expected dust-4 preview URL to map to assets/dust-4.webm');
}

function runCompositionDustPreviewUrlDefaultFallbackCheck() {
  // Default fallback export must remain dust-1 — Polvo 1 is the default for new rows.
  assertEqual(COMPOSITION_DUST_PREVIEW_URL, './assets/dust-1.webm', 'Expected COMPOSITION_DUST_PREVIEW_URL default to remain dust-1');
}

function runResolveCompositionDustUrlForRowDust3AndDust4Check() {
  const project = {};
  const row3 = { dust: { enabled: true, type: 'dust-3', assetId: 'dust-3' } };
  const row4 = { dust: { enabled: true, type: 'dust-4', assetId: 'dust-4' } };
  assertEqual(
    resolveCompositionDustUrlForRow(project, row3),
    './assets/dust-3.webm',
    'Expected resolveCompositionDustUrlForRow to return the dust-3 webm URL for a row with dust-3',
  );
  assertEqual(
    resolveCompositionDustUrlForRow(project, row4),
    './assets/dust-4.webm',
    'Expected resolveCompositionDustUrlForRow to return the dust-4 webm URL for a row with dust-4',
  );
}

function runResolveCompositionDustUrlForRowDisabledReturnsEmptyCheck() {
  const project = {};
  const row = { dust: { enabled: false, type: 'dust-3' } };
  assertEqual(
    resolveCompositionDustUrlForRow(project, row),
    '',
    'Expected resolveCompositionDustUrlForRow to return empty when dust is disabled',
  );
}

export async function runCompositionViewModelCheck() {
  runCompositionDustPreviewUrlsHasDust1ThroughDust4Check();
  runCompositionDustPreviewUrlDefaultFallbackCheck();
  runResolveCompositionDustUrlForRowDust3AndDust4Check();
  runResolveCompositionDustUrlForRowDisabledReturnsEmptyCheck();
}

if (process.argv[1] && __filename === process.argv[1]) {
  await runCompositionViewModelCheck();
  console.log('composition-view-model-check: ok');
}
