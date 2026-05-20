import test from 'node:test';
import assert from 'node:assert/strict';

import { createPreviewExportCommands } from '../controller/preview-export-commands.js';

function makeApprovalProject() {
  return {
    draft_id: 'draft-export',
    title: 'Export contract',
    editor_state: {
      dirty: false,
      phase: 'preview_ready',
      pipeline_provider: 'approval',
      remotion_project_id: 'approval-project-export',
      snapshot_hash: 'snapshot-export-hash',
      approval_contract_snapshot: {
        contractVersion: 'approval-editor-service-v1',
        snapshotHash: 'snapshot-export-hash',
        rows: [
          { id: 'row-1', rowId: 'row-1', phrase: 'Intro', startTime: 0, endTime: 1.5, selectedAssetId: 'img-1' },
        ],
        audio: {
          totalDurationSeconds: 3.5,
          voice: { volume: 1, muted: false },
          music: { volume: 0.15, muted: false, loop: true },
        },
        brandChannel: 'pelotazo-colombia',
        globalLayers: {
          logoAssetId: 'brand-logo-colombia',
          outroAssetId: 'brand-outro-colombia',
        },
        assets: {
          'img-1': { status: 'ready', renderPath: 'generated/img-1.jpg' },
          'brand-logo-colombia': { status: 'ready', renderPath: 'overlays/logo-colombia.webm' },
          'brand-outro-colombia': { status: 'ready', renderPath: 'overlays/final-colombia.mp4', durationSeconds: 30.16 },
        },
      },
    },
  };
}

function createHarness({ finalDownloadResult, renderFinalResult, finalDownloadImpl, statusResults = [] }) {
  const project = makeApprovalProject();
  const persisted = [];
  const toasts = [];
  const renderCalls = [];
  const state = { selectedVideoProject: project, settings: {} };
  const commands = createPreviewExportCommands({
    api: {},
    store: { getState: () => state },
    ui: { toast: (message) => toasts.push(message) },
    isApprovalServiceMode: () => true,
    createApprovalServiceClient: () => ({
      async renderFinal(projectId, payload) {
        renderCalls.push({ projectId, payload });
        return renderFinalResult || { lastRenderedSnapshotHash: 'snapshot-export-hash', render: { status: 'rendered', outputPath: finalDownloadResult?.renderOutputPath || null } };
      },
      async status() {
        return statusResults.shift() || renderFinalResult || { lastRenderedSnapshotHash: 'snapshot-export-hash', render: { status: 'rendered', outputPath: finalDownloadResult?.renderOutputPath || null } };
      },
      async finalDownload() {
        if (finalDownloadImpl) return finalDownloadImpl();
        return finalDownloadResult;
      },
      finalDownloadUrl(projectId) {
        return `https://approval.local/api/projects/${encodeURIComponent(projectId)}/download/final?download=1`;
      },
    }),
    async persistEditorState(targetProject, patch) {
      targetProject.editor_state = { ...(targetProject.editor_state || {}), ...patch };
      persisted.push(patch);
    },
    renderSelectedVideoProject() {},
    renderFinalPollDelayMs: 0,
  });
  return { project, persisted, toasts, renderCalls, commands };
}

test('approval export does not mark final ready when backend returns no downloadable final URL', async () => {
  const originalConsoleError = console.error;
  const capturedErrors = [];
  console.error = (...args) => capturedErrors.push(args);
  try {
    const { project, persisted, toasts, renderCalls, commands } = createHarness({ finalDownloadResult: { finalUrl: '' } });

    await commands.exportFinal();

    assert.equal(renderCalls.length, 1);
    assert.deepEqual(renderCalls[0], { projectId: 'approval-project-export', payload: { snapshotHash: 'snapshot-export-hash', async: true } });
    assert.equal(project.editor_state.phase, 'error');
    assert.equal(project.editor_state.export_status, 'error');
    assert.match(project.editor_state.error, /no devolvió una URL final descargable/i);
    assert.equal(persisted.some((patch) => patch.phase === 'final_ready'), false);
    assert.equal(toasts.includes('Error exportando video final'), true);
    assert.equal(capturedErrors.length, 1);
  } finally {
    console.error = originalConsoleError;
  }
});

test('approval export marks final ready only after backend exposes a final download URL', async () => {
  const { project, persisted, toasts, renderCalls, commands } = createHarness({ finalDownloadResult: { finalUrl: '/api/projects/approval-project-export/download/final', renderOutputPath: '/api/projects/approval-project-export/files/output/video-final.mp4' } });

  await commands.exportFinal();

  assert.equal(renderCalls.length, 1);
  assert.equal(project.editor_state.phase, 'final_ready');
  assert.equal(project.editor_state.export_status, 'ready');
  assert.equal(project.editor_state.final_url, 'https://approval.local/api/projects/approval-project-export/download/final?download=1');
  assert.equal(project.editor_state.last_rendered_hash, 'snapshot-export-hash');
  assert.equal(persisted.some((patch) => patch.phase === 'error'), false);
  assert.equal(toasts.includes('Exportación lista. Descargá el video final.'), true);
});

test('approval export starts async render and polls status until rendered', async () => {
  const { project, renderCalls, commands } = createHarness({
    renderFinalResult: { lastRenderedSnapshotHash: 'snapshot-export-hash', render: { status: 'rendering' } },
    statusResults: [
      { lastRenderedSnapshotHash: 'snapshot-export-hash', render: { status: 'rendering' } },
      { lastRenderedSnapshotHash: 'snapshot-export-hash', render: { status: 'rendered', outputPath: '/api/projects/approval-project-export/files/output/video-final.mp4' } },
    ],
  });

  await commands.exportFinal();

  assert.deepEqual(renderCalls[0], { projectId: 'approval-project-export', payload: { snapshotHash: 'snapshot-export-hash', async: true } });
  assert.equal(project.editor_state.phase, 'final_ready');
  assert.equal(project.editor_state.export_status, 'ready');
  assert.equal(project.editor_state.final_url, 'https://approval.local/api/projects/approval-project-export/download/final?download=1');
});

test('approval export stores browser-download endpoint instead of raw local final path', async () => {
  const { project, persisted, commands } = createHarness({
    renderFinalResult: {
      lastRenderedSnapshotHash: 'snapshot-export-hash',
      render: { outputPath: 'C:\\renders\\approval-project-export\\output\\video-final.mp4' },
    },
    finalDownloadImpl: () => {
      throw new Error('download/final JSON should not be needed when render-final returned outputPath');
    },
  });

  await commands.exportFinal();

  assert.equal(project.editor_state.phase, 'final_ready');
  assert.equal(project.editor_state.export_status, 'ready');
  assert.equal(project.editor_state.final_url, 'https://approval.local/api/projects/approval-project-export/download/final?download=1');
  assert.equal(project.editor_state.final_url.includes('C:\\renders'), false);
  assert.equal(persisted.some((patch) => patch.final_url?.startsWith('C:\\')), false);
});

test('approval export prefers downloadable outputPath from render-final response before calling download endpoint', async () => {
  const { project, persisted, commands } = createHarness({
    renderFinalResult: {
      lastRenderedSnapshotHash: 'snapshot-export-hash',
      render: { outputPath: '/api/projects/approval-project-export/files/output/video-final.mp4' },
    },
    finalDownloadImpl: () => {
      throw new Error('download/final should not be called when render-final returned outputPath');
    },
  });

  await commands.exportFinal();

  assert.equal(project.editor_state.phase, 'final_ready');
  assert.equal(project.editor_state.export_status, 'ready');
  assert.equal(project.editor_state.final_url, 'https://approval.local/api/projects/approval-project-export/download/final?download=1');
  assert.equal(persisted.some((patch) => patch.phase === 'error'), false);
});

test('approval export does not mask rendered response with missing outputPath by accepting download fallback', async () => {
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    const { project, persisted, commands } = createHarness({
      renderFinalResult: {
        lastRenderedSnapshotHash: 'snapshot-export-hash',
        render: { status: 'rendered', outputPath: null },
      },
      finalDownloadResult: { finalUrl: '/api/projects/approval-project-export/download/final' },
    });

    await commands.exportFinal();

    assert.equal(project.editor_state.phase, 'error');
    assert.equal(project.editor_state.export_status, 'error');
    assert.match(project.editor_state.error, /no devolvió una URL final descargable/i);
    assert.equal(persisted.some((patch) => patch.phase === 'final_ready'), false);
  } finally {
    console.error = originalConsoleError;
  }
});

test('remotion export path sends the canonical preview snapshot payload without dropping global assets or timing', async () => {
  const project = makeApprovalProject();
  project.editor_state.pipeline_provider = 'remotion';
  project.editor_state.remotion_project_id = 'remotion-project-export';
  const persisted = [];
  const updateCompositionCalls = [];
  const state = { selectedVideoProject: project, settings: { remotionApiUrl: 'http://127.0.0.1:3037' } };
  const commands = createPreviewExportCommands({
    api: {
      createRemotionClient: () => ({
        async updateComposition(projectId, payload) {
          updateCompositionCalls.push({ projectId, payload });
        },
        async renderFinal(projectId) {
          return { projectId, diagnostics: null };
        },
        finalDownloadUrl: (projectId) => `/api/projects/${projectId}/download/final`,
      }),
    },
    store: { getState: () => state },
    ui: { toast() {} },
    isApprovalServiceMode: () => false,
    createApprovalServiceClient: () => { throw new Error('Approval service client should not be used'); },
    async persistEditorState(targetProject, patch) {
      targetProject.editor_state = { ...(targetProject.editor_state || {}), ...patch };
      persisted.push(patch);
    },
    renderSelectedVideoProject() {},
  });

  await commands.exportFinal();

  assert.equal(updateCompositionCalls.length, 1);
  assert.equal(updateCompositionCalls[0].projectId, 'remotion-project-export');
  const payload = updateCompositionCalls[0].payload;
  assert.equal(payload.snapshotHash, 'snapshot-export-hash');
  assert.equal(payload.contract.brandChannel, 'pelotazo-colombia');
  assert.equal(payload.contract.audio.totalDurationSeconds, 3.5);
  assert.equal(payload.contract.globalLayers.logoAssetId, 'brand-logo-colombia');
  assert.equal(payload.contract.globalLayers.outroAssetId, 'brand-outro-colombia');
  assert.equal(payload.manifest.assets['brand-outro-colombia'].durationSeconds, 30.16);
  assert.equal(payload.rows[0].selectedAssetId, 'img-1');
  assert.equal(project.editor_state.final_url, '/api/projects/remotion-project-export/download/final');
  assert.equal(persisted.some((patch) => patch.phase === 'final_ready'), true);
});
