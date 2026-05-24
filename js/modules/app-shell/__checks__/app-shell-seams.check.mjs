import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizeShellView } from '../navigation.js';
import { createShellState } from '../state.js';
import { createSettingsController } from '../settings.js';
import {
  runAppShellLifecycleReplay,
  runAppShellSetViewReplay,
  runScriptToAudioVoiceReplay,
} from '../../__checks__/runtime-ui-parity-replay.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODULES_ROOT = path.resolve(__dirname, '../..');

async function readModule(relativePath) {
  return readFile(path.join(MODULES_ROOT, relativePath), 'utf8');
}

test('app-shell facade stays import-only and preserves public boot contracts', async () => {
  const facadeSource = await readModule('app-shell.js');
  assert.match(facadeSource, /from '\.\/app-shell\/index\.js'/);
  assert.match(facadeSource, /export function bootApp\(\)/);
  assert.match(facadeSource, /export function bootCompatibilityShell\(\)/);
  assert.match(facadeSource, /export const __testHooks/);
  assert.doesNotMatch(facadeSource, /from '\.\/features\//);
  assert.doesNotMatch(facadeSource, /document\.getElementById/);
});

test('navigation guardrails keep existing valid views and activate Radar without defaulting to approval', () => {
  assert.equal(normalizeShellView('approval'), 'approval');
  assert.equal(normalizeShellView('scripts'), 'scripts');
  assert.equal(normalizeShellView('audio'), 'audio');
  assert.equal(normalizeShellView('radar'), 'radar');
  assert.equal(normalizeShellView('subtitulos2'), 'subtitulos2');
  assert.equal(normalizeShellView('unknown'), 'approval');
  assert.equal(normalizeShellView('  radar  '), 'radar');
});

test('settings controller hydrates and saves through existing storage wiring', () => {
  const storageWrites = [];
  const state = {
    settings: {
      baseUrl: 'http://approval.local',
      secret: 's1',
    transcriptServiceBaseUrl: 'http://radar.local',
    transcriptServiceApiKey: 'radar-key',
    },
  };
  const el = {
    baseUrlInput: { value: '' },
    secretInput: { value: '' },
    ttsBaseUrlInput: { value: '' },
    ttsApiKeyInput: { value: '' },
    ttsBasicUserInput: { value: '' },
    ttsBasicPassInput: { value: '' },
    sharedApiKeyInput: { value: '' },
    remotionApiUrlInput: { value: '' },
    approvalPipelineBaseUrlInput: { value: '' },
    brandChannelSelect: { value: '' },
    transcriptServiceBaseUrlInput: { value: '' },
  };

  const settings = createSettingsController({
    state,
    el,
    storage: {
      setItem(key, value) { storageWrites.push({ key, value }); },
      getItem() { return null; },
      removeItem() {},
    },
    storageKey: 'settings-key',
    lastNewsSearchKey: 'news-key',
  });

  settings.hydrateSettingsForm();
  assert.equal(el.baseUrlInput.value, 'http://approval.local');
  assert.equal(el.transcriptServiceBaseUrlInput.value, 'http://radar.local');
  assert.equal(el.sharedApiKeyInput.value, 'radar-key', 'legacy radar API keys hydrate through the shared API key form contract');

  settings.saveSettings({ baseUrl: 'http://next.local', transcriptServiceApiKey: 'next-key' });
  assert.equal(state.settings.baseUrl, 'http://next.local');
  assert.equal(state.settings.transcriptServiceApiKey, 'next-key');
  assert.equal(storageWrites[0].key, 'settings-key');
  assert.deepEqual(JSON.parse(storageWrites[0].value), state.settings);
});

test('state and render shell modules preserve callback responsibilities', async () => {
  const state = createShellState({
    settings: { baseUrl: 'http://approval.local' },
    lastNewsSearchAt: '2026-05-11T12:00:00.000Z',
  });
  assert.equal(state.currentView, 'approval');
  assert.equal(state.settings.baseUrl, 'http://approval.local');
  assert.equal(state.lastNewsSearchAt, '2026-05-11T12:00:00.000Z');
  assert.ok(state.dismissedQueueJobs instanceof Set);
  assert.ok(state.dismissedAudioJobs instanceof Set);

  const renderCallbacksSource = await readModule('app-shell/render-callbacks.js');
  for (const expected of [
    'renderVideoProjectsListView',
    'renderSelectedVideoProjectView',
    'updateSelectedVideoProjectCompositionPreviewView',
    'renderScriptCardsView',
    'renderApprovalTopicDetail',
  ]) {
    assert.match(renderCallbacksSource, new RegExp(expected));
  }
});

test('app-shell runtime extraction exposes focused shell seams', async () => {
  const expectedModules = [
    'app-shell/composition.js',
    'app-shell/lifecycle.js',
    'app-shell/services.js',
    'app-shell/settings.js',
    'app-shell/events/index.js',
    'app-shell/events/scripts.js',
    'app-shell/events/audio.js',
    'app-shell/events/subtitles.js',
    'app-shell/events/approval-dialog.js',
    'app-shell/views/navigation.js',
    'app-shell/views/approval-search.js',
    'app-shell/views/renderers.js',
    'app-shell/voice/script-to-audio.js',
  ];

  const moduleSources = await Promise.all(expectedModules.map((modulePath) => readModule(modulePath)));
  const combinedSource = moduleSources.join('\n');

  for (const expectedExport of [
    'createAppShellComposition',
    'createAppShellLifecycle',
    'createShellServiceRegistry',
    'createSettingsController',
    'bindShellEvents',
    'bindScriptEvents',
    'bindAudioEvents',
    'bindSubtitlesEvents',
    'bindApprovalDialogEvents',
    'createShellNavigationController',
    'createApprovalSearchController',
    'createShellRenderers',
    'createScriptToAudioVoiceController',
  ]) {
    assert.match(combinedSource, new RegExp(`export function ${expectedExport}\\b`));
  }
});

test('app-shell runtime delegates lifecycle, events, views, and voice flow to focused seams', async () => {
  const runtimeSource = await readModule('app-shell/runtime.js');

  for (const expectedImport of [
    "from './composition.js'",
    "from './lifecycle.js'",
    "from './events/index.js'",
    "from './views/navigation.js'",
    "from './views/approval-search.js'",
    "from './views/renderers.js'",
    "from './voice/script-to-audio.js'",
  ]) {
    assert.match(runtimeSource, new RegExp(expectedImport.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.match(runtimeSource, /const composition = createAppShellComposition\(/);
  assert.match(runtimeSource, /const navigation = createShellNavigationController\(/);
  assert.match(runtimeSource, /const lifecycle = createAppShellLifecycle\(/);
  assert.match(runtimeSource, /const voiceController = createScriptToAudioVoiceController\(/);
  assert.doesNotMatch(runtimeSource, /function setView\(view\)/);
  assert.doesNotMatch(runtimeSource, /function runVoiceAiFromSelectedScript\(/);
});

test('app-shell lifecycle replay preserves public boot, auth, settings, and initial refresh contracts', async () => {
  const result = await runAppShellLifecycleReplay();
  assert.deepEqual(result, { ok: true });
});

test('app-shell setView replay preserves navigation and feature lifecycle side effects', async () => {
  const result = await runAppShellSetViewReplay();
  assert.deepEqual(result, { ok: true });
});

test('Script to Audio voice replay preserves state sync before delegated generation', async () => {
  const result = await runScriptToAudioVoiceReplay();
  assert.deepEqual(result, { ok: true });
});
