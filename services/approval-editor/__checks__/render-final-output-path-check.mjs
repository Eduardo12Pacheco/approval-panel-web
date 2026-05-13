import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createApprovalEditorService } = require('../server.js');

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve(`http://127.0.0.1:${server.address().port}`);
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function requestJson(baseUrl, pathname, { method = 'GET', body } = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json() };
}

async function withService(renderAdapter, run) {
  const projectsRoot = await mkdtemp(path.join(tmpdir(), 'approval-render-output-'));
  const server = createApprovalEditorService({
    projectsRoot,
    renderAdapter,
    alignVoiceAudio: async ({ segments }) => ({
      segments: segments.map((segment, index) => ({ ...segment, startTime: index, endTime: index + 1, timingSource: 'test' })),
      alignedTimings: { phrases: segments.map((_, index) => ({ startTime: index, endTime: index + 1 })) },
      alignmentStatus: { status: 'ready', source: 'test', generatedAt: '2026-05-13T00:00:00.000Z' },
      paths: null,
    }),
    prepareAudioPreview: async () => null,
  });
  const baseUrl = await listen(server);
  try {
    return await run(baseUrl);
  } finally {
    await close(server);
    await rm(projectsRoot, { recursive: true, force: true });
  }
}

async function createProject(baseUrl) {
  const created = await requestJson(baseUrl, '/api/projects/create-from-approval', {
    method: 'POST',
    body: {
      project_id: 'render-output-contract',
      title: 'Render Output Contract',
      voice_audio: { public_url: 'https://example.test/voice.wav' },
      background_audio: { public_url: 'https://example.test/music.wav' },
      segments: [{ id: 'row-1', phrase: 'Hola mundo' }],
      selected_images: ['https://example.test/image.jpg'],
    },
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.ok, true);
  return created.body.data;
}

test('render-final rejects missing adapter output and does not persist rendered status', async () => {
  await withService(async () => ({ outputPath: null }), async (baseUrl) => {
    const project = await createProject(baseUrl);

    const rendered = await requestJson(baseUrl, `/api/projects/${project.projectId}/render-final`, {
      method: 'POST',
      body: { snapshotHash: project.snapshotHash },
    });
    const status = await requestJson(baseUrl, `/api/projects/${project.projectId}/status`);
    const download = await requestJson(baseUrl, `/api/projects/${project.projectId}/download/final`);

    assert.equal(rendered.status, 500);
    assert.equal(rendered.body.ok, false);
    assert.equal(rendered.body.error.code, 'render_output_missing');
    assert.notEqual(status.body.data.render?.status, 'rendered');
    assert.equal(download.body.data.finalUrl, null);
  });
});

test('render-final rejects non-string adapter output and does not persist rendered status', async () => {
  await withService(async () => ({ outputPath: 42 }), async (baseUrl) => {
    const project = await createProject(baseUrl);

    const rendered = await requestJson(baseUrl, `/api/projects/${project.projectId}/render-final`, {
      method: 'POST',
      body: { snapshotHash: project.snapshotHash },
    });
    const status = await requestJson(baseUrl, `/api/projects/${project.projectId}/status`);

    assert.equal(rendered.status, 500);
    assert.equal(rendered.body.ok, false);
    assert.equal(rendered.body.error.code, 'render_output_missing');
    assert.notEqual(status.body.data.render?.status, 'rendered');
  });
});

test('render-final persists adapter finalPath as downloadable outputPath', async () => {
  await withService(async () => ({ finalPath: 'C:/tmp/video-final.mp4' }), async (baseUrl) => {
    const project = await createProject(baseUrl);

    const rendered = await requestJson(baseUrl, `/api/projects/${project.projectId}/render-final`, {
      method: 'POST',
      body: { snapshotHash: project.snapshotHash },
    });
    const download = await requestJson(baseUrl, `/api/projects/${project.projectId}/download/final`);

    assert.equal(rendered.status, 202);
    assert.equal(rendered.body.ok, true);
    assert.equal(rendered.body.data.render.status, 'rendered');
    assert.equal(rendered.body.data.render.outputPath, 'C:/tmp/video-final.mp4');
    assert.equal(download.body.data.finalUrl, 'C:/tmp/video-final.mp4');
  });
});

test('render-final persists adapter finalUrl as downloadable outputPath', async () => {
  await withService(async () => ({ finalUrl: '/api/projects/render-output-contract/files/output/video-final.mp4' }), async (baseUrl) => {
    const project = await createProject(baseUrl);

    const rendered = await requestJson(baseUrl, `/api/projects/${project.projectId}/render-final`, {
      method: 'POST',
      body: { snapshotHash: project.snapshotHash },
    });
    const download = await requestJson(baseUrl, `/api/projects/${project.projectId}/download/final`);

    assert.equal(rendered.status, 202);
    assert.equal(rendered.body.ok, true);
    assert.equal(rendered.body.data.render.status, 'rendered');
    assert.equal(rendered.body.data.render.outputPath, '/api/projects/render-output-contract/files/output/video-final.mp4');
    assert.equal(download.body.data.finalUrl, '/api/projects/render-output-contract/files/output/video-final.mp4');
  });
});
