import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createAudioFeature } from '../index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODULES_ROOT = path.resolve(__dirname, '../../..');

async function readModule(relativePath) {
  return readFile(path.join(MODULES_ROOT, relativePath), 'utf8');
}

async function readAudioControllerSources() {
  const controllerSource = await readModule('features/audio/controller.js');
  const controllerDir = path.join(MODULES_ROOT, 'features/audio/controller');
  const requiredModules = [
    'context.js',
    'commands.js',
    'jobs.js',
    'download.js',
    'tracking.js',
    'status-stream.js',
    'polling.js',
    'queue-renderer.js',
  ];
  const moduleSources = await Promise.all(requiredModules.map(async (name) => ({
    name,
    source: await readFile(path.join(controllerDir, name), 'utf8'),
  })));
  return {
    controllerSource,
    moduleSources,
    combinedSource: [controllerSource, ...moduleSources.map((entry) => entry.source)].join('\n'),
  };
}

async function readAppShellSources() {
  const shellDir = path.join(MODULES_ROOT, 'app-shell');
  const entries = [];
  async function collect(currentDir, prefix = '') {
    const names = await readdir(currentDir, { withFileTypes: true });
    for (const entry of names) {
      const relativeName = prefix ? `${prefix}/${entry.name}` : entry.name;
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await collect(fullPath, relativeName);
        continue;
      }
      if (!entry.name.endsWith('.js')) continue;
      entries.push({
        name: relativeName,
        source: await readFile(fullPath, 'utf8'),
      });
    }
  }
  await collect(shellDir);
  return entries;
}

test('Audio facade exposes the migration public contract without renaming app-shell methods', () => {
  const calls = [];
  const handlers = Object.fromEntries([
    'runAudioGeneration',
    'runAudioGenerationFromText',
    'startAudioTracking',
    'stopAudioTracking',
    'startAudioQueueSync',
    'stopAudioQueueSync',
    'downloadAudioJob',
    'dismissAudioJob',
    'getLatestTrackedJobId',
    'applyAudioJobStatus',
    'startAudioStatusStream',
    'startAudioPolling',
    'syncAudioQueueStatuses',
    'renderAudioQueue',
  ].map((name) => [name, (...args) => calls.push({ name, args })]));

  const feature = createAudioFeature({
    api: { id: 'api' },
    store: { id: 'store' },
    ui: { id: 'ui' },
    selectors: { id: 'selectors' },
    handlers,
  });

  for (const method of Object.keys(handlers)) {
    assert.equal(typeof feature[method], 'function', `Expected Audio facade method ${method} to remain callable`);
  }

  feature.runAudioGenerationFromText({ text: 'Texto suficientemente largo para audio', voiceProfile: 'voice-a', title: 'title-a' });
  feature.getLatestTrackedJobId();
  assert.deepEqual(calls, [
    {
      name: 'runAudioGenerationFromText',
      args: [{ text: 'Texto suficientemente largo para audio', voiceProfile: 'voice-a', title: 'title-a' }],
    },
    { name: 'getLatestTrackedJobId', args: [] },
  ]);
  assert.deepEqual(feature.dependencies, {
    api: { id: 'api' },
    store: { id: 'store' },
    ui: { id: 'ui' },
    selectors: { id: 'selectors' },
  });
});

test('Audio controller preserves endpoint, payload, selector, copy, data-action, and timer contracts', async () => {
  const [{ combinedSource }, selectorsSource] = await Promise.all([
    readAudioControllerSources(),
    readModule('shared/dom/selectors.js'),
  ]);

  for (const endpoint of [
    "'/api/tts/jobs'",
    '`/api/tts/jobs/${encodeURIComponent(jobId)}`',
    '`${baseUrl}/api/tts/jobs/${encodeURIComponent(jobId)}/events`',
    '`/api/tts/jobs/${encodeURIComponent(targetJobId)}/download`',
  ]) {
    assert.ok(combinedSource.includes(endpoint), `Expected Audio endpoint contract ${endpoint}`);
  }

  for (const payloadKey of ['text:', 'voice_profile:', 'request_id:', 'title,']) {
    assert.ok(combinedSource.includes(payloadKey), `Expected Audio generation payload key ${payloadKey}`);
  }

  for (const selector of ['audioPresetSelect', 'audioTextArea', 'audioWordCount', 'audioRunBtn', 'audioClearBtn', 'audioQueueList', 'audioQueueMeta']) {
    assert.match(selectorsSource, new RegExp(`${selector}: doc\\.getElementById\\('${selector}'\\)`));
  }

  for (const copy of [
    'Configurá Base URL Audio API antes de ejecutar',
    'Configurá x-api-key Audio API antes de ejecutar',
    'El texto es demasiado corto para generar audio',
    'Job enviado. Comienza el procesamiento...',
    'Audio listo para descarga',
    'Sin jobs todavía.',
    'Descargar audio',
    'Ocultar job',
  ]) {
    assert.ok(combinedSource.includes(copy), `Expected Audio visible copy to stay protected: ${copy}`);
  }

  assert.ok(combinedSource.includes('data-action="dismiss-audio-job"'), 'Expected dismiss queue data-action contract');
  assert.ok(combinedSource.includes('data-action="download-audio-job"'), 'Expected download queue data-action contract');
  assert.match(combinedSource, /}, 4000\)/, 'Expected polling interval to remain 4000ms');
  assert.match(combinedSource, /}, 6000\)/, 'Expected queue sync interval to remain 6000ms');
});

test('Audio controller internals are extracted behind controller wiring modules', async () => {
  const { controllerSource, moduleSources } = await readAudioControllerSources();
  const moduleNames = moduleSources.map((entry) => entry.name).sort();

  assert.deepEqual(moduleNames, [
    'commands.js',
    'context.js',
    'download.js',
    'jobs.js',
    'polling.js',
    'queue-renderer.js',
    'status-stream.js',
    'tracking.js',
  ]);

  for (const importPath of [
    './controller/context.js',
    './controller/commands.js',
    './controller/jobs.js',
    './controller/download.js',
    './controller/tracking.js',
    './controller/status-stream.js',
    './controller/polling.js',
    './controller/queue-renderer.js',
  ]) {
    assert.ok(controllerSource.includes(importPath), `Expected controller.js to wire ${importPath}`);
  }

  assert.ok(controllerSource.split(/\r?\n/).length < 180, 'Expected controller.js to be reduced to wiring/facade size');
});

test('App-shell depends on stable Audio entry points and not controller internals', async () => {
  const shellSources = await readAppShellSources();
  for (const { name, source } of shellSources) {
    assert.doesNotMatch(
      source,
      /from ['"]\.\.\/features\/audio\/controller\//,
      `Expected app-shell/${name} not to import Audio controller internals`,
    );
  }

  const combinedShellSource = shellSources.map((entry) => entry.source).join('\n');
  assert.match(combinedShellSource, /createAudioFeature/);
  assert.match(combinedShellSource, /audioFeature\.runAudioGeneration/);
  assert.match(combinedShellSource, /audioFeature\.startAudioQueueSync\(\)/);
  assert.match(combinedShellSource, /audioFeature\.stopAudioQueueSync\(\)/);
  assert.match(combinedShellSource, /audioFeature\.getLatestTrackedJobId\(\)/);
});
