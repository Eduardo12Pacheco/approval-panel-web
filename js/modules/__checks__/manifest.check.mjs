import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHECK_MANIFEST, validateCheckManifestCoverage } from './manifest.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODULES_ROOT = path.resolve(__dirname, '..');

test('check manifest accounts for every legacy facade and implementation exactly once', async () => {
  const result = validateCheckManifestCoverage(CHECK_MANIFEST);
  const facadeCount = new Set(CHECK_MANIFEST.map((entry) => entry.facadePath)).size;
  const implementationCount = new Set(CHECK_MANIFEST.map((entry) => entry.implementationPath)).size;

  assert.deepEqual(result.failures, [], `manifest coverage failures: ${result.failures.join('; ')}`);
  assert.equal(result.summary.total, CHECK_MANIFEST.length, 'current __checks__ inventory must stay fully accounted for');
  assert.equal(result.summary.facades, facadeCount, 'every legacy __checks__ path must be a stable facade or kept entry');
  assert.equal(result.summary.implementations, implementationCount, 'every implementation path must be mapped once');
});

test('check manifest paths resolve and expose ownership metadata', async () => {
  assert.ok(CHECK_MANIFEST.some((entry) => entry.owner === 'global' && entry.implementationPath.includes('/global/')), 'global checks must move behind global implementations');
  assert.ok(CHECK_MANIFEST.some((entry) => entry.owner === 'video-projects' && entry.exportedHelpers.includes('runEditorAssetsTabCheck')), 'feature helper exports must remain inventoried');

  for (const entry of CHECK_MANIFEST) {
    assert.ok(entry.facadePath.startsWith('js/modules/__checks__/'), `${entry.facadePath} must preserve the legacy public surface`);
    assert.ok(entry.owner, `${entry.facadePath} must declare an owner`);
    assert.ok(entry.commandKind, `${entry.facadePath} must declare how it is executed`);
    await access(path.join(MODULES_ROOT, entry.facadePath.replace('js/modules/', '')));
    await access(path.join(MODULES_ROOT, entry.implementationPath.replace('js/modules/', '')));
  }
});

test('feature-owned manifest entries point to owner check implementations behind stable facades', () => {
  const expectedFeatureImplementations = new Map([
    ['js/modules/__checks__/audio-seams.check.mjs', 'js/modules/features/audio/__checks__/audio-seams.check.mjs'],
    ['js/modules/__checks__/app-shell-seams.check.mjs', 'js/modules/app-shell/__checks__/app-shell-seams.check.mjs'],
    ['js/modules/__checks__/subtitles-controller-seams.check.mjs', 'js/modules/features/subtitles/__checks__/subtitles-controller-seams.check.mjs'],
    ['js/modules/__checks__/radar-panel-check.js', 'js/modules/features/radar/__checks__/radar-panel-check.js'],
    ['js/modules/__checks__/ai-rescue-panel-check.js', 'js/modules/features/ai-rescue/__checks__/ai-rescue-panel-check.js'],
    ['js/modules/__checks__/video-segment-picker-ux.check.mjs', 'js/modules/features/video-projects/__checks__/video-segment-picker-ux.check.mjs'],
    ['js/modules/__checks__/composition-renderer-helpers.check.mjs', 'js/modules/features/video-projects/__checks__/composition-renderer-helpers.check.mjs'],
    ['js/modules/__checks__/video-projects-controller-seams.check.mjs', 'js/modules/features/video-projects/__checks__/video-projects-controller-seams.check.mjs'],
    ['js/modules/__checks__/video-projects-render-seams.check.mjs', 'js/modules/features/video-projects/__checks__/video-projects-render-seams.check.mjs'],
    ['js/modules/__checks__/editor-assets-tab-check.js', 'js/modules/features/video-projects/__checks__/editor-assets-tab-check.js'],
    ['js/modules/__checks__/approval-motion-draft-check.js', 'js/modules/features/video-projects/__checks__/approval-motion-draft-check.js'],
    ['js/modules/__checks__/composition-cover-pan-check.js', 'js/modules/features/video-projects/__checks__/composition-cover-pan-check.js'],
    ['js/modules/__checks__/editor-motion-presets-check.js', 'js/modules/features/video-projects/__checks__/editor-motion-presets-check.js'],
    ['js/modules/__checks__/contract-pipeline-client-check.js', 'js/modules/features/video-projects/__checks__/contract-pipeline-client-check.js'],
    ['js/modules/__checks__/composition-renderer-preload-window.check.mjs', 'js/modules/features/video-projects/__checks__/composition-renderer-preload-window.check.mjs'],
    ['js/modules/__checks__/video-projects-composition-payload.check.mjs', 'js/modules/features/video-projects/__checks__/video-projects-composition-payload.check.mjs'],
    ['js/modules/__checks__/video-projects-manifest-resolution.check.mjs', 'js/modules/features/video-projects/__checks__/video-projects-manifest-resolution.check.mjs'],
  ]);

  for (const [facadePath, implementationPath] of expectedFeatureImplementations) {
    const entry = CHECK_MANIFEST.find((candidate) => candidate.facadePath === facadePath);
    assert.equal(entry?.implementationPath, implementationPath, `${facadePath} must delegate to its feature-owned implementation`);
  }
});

test('assertion inventory reads moved implementation source instead of thin facade source', async () => {
  const assertionTokens = new Map([
    ['js/modules/__checks__/audio-seams.check.mjs', 'Audio endpoint contract'],
    ['js/modules/__checks__/app-shell-seams.check.mjs', 'app-shell lifecycle replay preserves public boot'],
    ['js/modules/__checks__/subtitles-controller-seams.check.mjs', 'subtitles public facades keep stable exports'],
    ['js/modules/__checks__/radar-panel-check.js', 'monitor cards payload drift'],
    ['js/modules/__checks__/ai-rescue-panel-check.js', 'candidate order must preserve descending score'],
    ['js/modules/__checks__/video-projects-composition-payload.check.mjs', 'buildCompositionPayloadForCheck'],
  ]);

  for (const [facadePath, token] of assertionTokens) {
    const entry = CHECK_MANIFEST.find((candidate) => candidate.facadePath === facadePath);
    const source = await readFile(path.join(MODULES_ROOT, entry.implementationPath.replace('js/modules/', '')), 'utf8');
    assert.ok(source.includes(token), `${entry.implementationPath} must preserve assertion token ${token}`);
  }
});
