import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { prepareVideoCompositionContract } from '../contract-pipeline-client.js';
import { createVideoProjectsApiClient } from '../api.js';
import { createVideoProjectsFeature } from '../index.js';
import { renderSelectedVideoProjectView } from '../render.js';
const cjsRequire = createRequire(import.meta.url);
const approvalService = cjsRequire('../../../../../../02-Video-Engine/scripts/approval-pipeline-local-service.js');

const { createApprovalPipelineLocalService } = approvalService;

function baseProject() {
  return {
    draft_id: 'draft-1',
    title: 'Proyecto 1',
    guion_piped: 'linea|dos',
    segments: [
      { id: 'row-1', text: 'Hola mundo' },
      { id: 'row-2', phrase: 'Segunda línea' },
    ],
    selected_images: [{ id: 'asset-1' }],
    voice_audio: { public_url: 'https://cdn.example.com/voice.mp3' },
    background_audio: { public_url: 'https://cdn.example.com/music.mp3' },
  };
}

function makeFakeElement() {
  return {
    innerHTML: '',
    classList: { add() {}, remove() {} },
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };
}

function makeApprovalEditorProject() {
  const snapshot = {
    contractVersion: 'approval-editor-service-v1',
    snapshotId: 'snapshot-ok',
    snapshotHash: 'hash-ok',
    rows: [
      { rowId: 'row-1', id: 'row-1', index: 0, phrase: 'Fila estable', startTime: 0, endTime: 1, selectedAssetId: 'asset-1' },
      { rowId: 'row-2', id: 'row-2', index: 1, phrase: 'Fila con error', startTime: 1, endTime: 2, selectedAssetId: 'asset-2' },
    ],
    audio: { voice: { volume: 1, muted: false }, music: { volume: 0.16, muted: false } },
    assets: {
      'asset-1': { assetId: 'asset-1', previewUrl: 'https://cdn.example.com/stable-1.jpg', renderPath: 'https://cdn.example.com/stable-1.jpg' },
      'asset-2': { assetId: 'asset-2', previewUrl: 'https://cdn.example.com/stable-2.jpg', renderPath: 'https://cdn.example.com/stable-2.jpg' },
    },
  };
  return {
    draft_id: 'draft-editor',
    title: 'Proyecto editor',
    status: 'ready',
    _videoProjectStep: 'audio',
    _editorRows: snapshot.rows.map((row) => ({ ...row })),
    _globalAudio: { voice: { volume: 1, muted: false }, music: { volume: 0.16, muted: false } },
    editor_state: {
      phase: 'preview_ready',
      remotion_project_id: 'approval-project-1',
      pipeline_provider: 'approval',
      pipeline_base_url: 'https://approval.local',
      approval_contract_snapshot: snapshot,
      snapshot_id: snapshot.snapshotId,
      snapshot_hash: snapshot.snapshotHash,
      last_preview_hash: snapshot.snapshotHash,
      timed_rows: snapshot.rows.map((row) => ({ ...row })),
      global_audio: { voice: { volume: 1, muted: false }, music: { volume: 0.16, muted: false } },
      dirty: false,
      error: '',
    },
  };
}

async function captureExpectedConsoleErrors(action, expectedMessage) {
  const originalConsoleError = console.error;
  const captured = [];
  let expectedRejection = false;
  console.error = (...args) => {
    captured.push(args);
  };

  try {
    try {
      await action();
    } catch (error) {
      if (!String(error?.message || error).includes(expectedMessage)) throw error;
      expectedRejection = true;
    }
    await new Promise((resolve) => setTimeout(resolve, 450));
  } finally {
    console.error = originalConsoleError;
  }

  const unexpected = captured.filter((args) => !args.some((arg) => String(arg?.message || arg).includes(expectedMessage)));
  if (unexpected.length) {
    for (const args of unexpected) originalConsoleError(...args);
    throw new Error(`Unexpected console.error while exercising expected failure path: ${unexpected.length}`);
  }
  if (!captured.length && !expectedRejection) {
    throw new Error('Expected failure path to log the caught service error');
  }
}

async function assertServiceEditErrorKeepsStablePreview({ action, expectedContext, expectedStablePhrase, allowLocalSnapshotDraft = false }) {
  const project = makeApprovalEditorProject();
  const state = { selectedVideoProject: project, settings: { approvalPipelineBaseUrl: 'https://approval.local' } };
  const persisted = [];
  const toasts = [];
  const el = { videoProjectDetail: makeFakeElement(), viewScripts: makeFakeElement(), videoProjectsCatalog: makeFakeElement() };
  const failingApi = {
    createApprovalPipelineClient() {
      return {
        async updateSnapshot() {
          throw new Error('validation failed: selected asset is blocked');
        },
      };
    },
    async updateVideoProjectEditorState({ editorState }) {
      persisted.push(editorState);
      return { ok: true };
    },
  };
  const store = { getState: () => state };
  const feature = createVideoProjectsFeature({
    api: failingApi,
    store,
    ui: { toast(message) { toasts.push(message); } },
    callbacks: {
      renderSelectedVideoProject() {
        renderSelectedVideoProjectView({ state, el, updateRow: feature.updateRow, updateGlobalAudio: feature.updateGlobalAudio });
      },
    },
  });

  const stableSnapshot = JSON.stringify(project.editor_state.approval_contract_snapshot);
  const stableRows = JSON.stringify(project._editorRows);
  await captureExpectedConsoleErrors(() => action(feature), 'validation failed: selected asset is blocked');

  if (!allowLocalSnapshotDraft && JSON.stringify(project.editor_state.approval_contract_snapshot) !== stableSnapshot) {
    throw new Error('Expected failed service update to preserve the last stable canonical snapshot');
  }
  if (JSON.stringify(project._editorRows) !== stableRows) {
    throw new Error('Expected failed service update to preserve the last stable preview rows');
  }
  if (!project.editor_state.error.includes(expectedContext)) {
    throw new Error(`Expected visible service error to include ${expectedContext}; got ${project.editor_state.error}`);
  }
  renderSelectedVideoProjectView({ state, el, updateRow: feature.updateRow, updateGlobalAudio: feature.updateGlobalAudio });
  if (!el.videoProjectDetail.innerHTML.includes(expectedStablePhrase)) {
    throw new Error('Expected error render to keep the last stable preview/editor row visible');
  }
  if (!el.videoProjectDetail.innerHTML.includes(expectedContext) || !el.videoProjectDetail.innerHTML.includes('validation failed')) {
    throw new Error('Expected rendered error state to show row/global validation context');
  }
  if (!toasts.length) {
    throw new Error('Expected failed service update to surface a user toast');
  }
  if (persisted.length) {
    throw new Error('Expected failed service update not to persist a replacement snapshot');
  }
}

function makeApprovalFetchFixture() {
  const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Zz5QAAAAASUVORK5CYII=', 'base64');
  const voice = Buffer.from('voice-bytes');
  const music = Buffer.from('music-bytes');
  const byUrl = new Map([
    ['https://cdn.example.com/image-1.jpg', { bytes: image, contentType: 'image/jpeg' }],
    ['https://cdn.example.com/image-2.jpg', { bytes: image, contentType: 'image/jpeg' }],
    ['https://cdn.example.com/voice.mp3', { bytes: voice, contentType: 'audio/mpeg' }],
    ['https://cdn.example.com/music.mp3', { bytes: music, contentType: 'audio/mpeg' }],
  ]);

  return async (url) => {
    const found = byUrl.get(String(url));
    if (!found) return new Response('not found', { status: 404 });
    return new Response(found.bytes, { status: 200, headers: { 'content-type': found.contentType } });
  };
}

async function withApprovalService(fn) {
  const projectsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'approval-pipeline-check-'));
  const server = createApprovalPipelineLocalService({ projectsRoot, env: {}, fetchImpl: makeApprovalFetchFixture() });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

export async function runContractPipelineClientCheck() {
  await withApprovalService(async (approvalBaseUrl) => {
    const api = createVideoProjectsApiClient({ fetchImpl: fetch });
    const remotionCalls = [];
    const remotionApi = {
      createApprovalPipelineClient({ resolveBaseUrl }) {
        remotionCalls.push({ type: 'approval-adapter', baseUrl: resolveBaseUrl() });
        return api.createApprovalPipelineClient({ resolveBaseUrl });
      },
      createRemotionClient({ resolveBaseUrl }) {
        remotionCalls.push({ type: 'remotion-adapter', baseUrl: resolveBaseUrl() });
        return {
          async createFromApproval() {
            throw new Error('Remotion fallback should not run for healthy approval service');
          },
          async status() {
            throw new Error('Remotion fallback should not run for healthy approval service');
          },
        };
      },
    };

    const prepared = await prepareVideoCompositionContract({
      project: baseProject(),
      settings: { remotionApiUrl: 'https://remotion.local', approvalPipelineBaseUrl: approvalBaseUrl },
      api: remotionApi,
    });

    if (prepared.provider !== 'approval') {
      throw new Error('Expected healthy local approval service to be selected');
    }
    if (prepared.providerMetadata?.health?.ok !== true) {
      throw new Error('Expected healthy service metadata to preserve ok=true');
    }
    if (prepared.providerMetadata?.health?.status !== 'ready') {
      throw new Error('Expected healthy service metadata to preserve ready status');
    }
    if (!Array.isArray(prepared.timedRows) || prepared.timedRows.length !== 2) {
      throw new Error('Expected approval service to provide timed rows');
    }
    if (remotionCalls.some((entry) => entry.type === 'remotion-adapter' && entry.baseUrl !== 'https://remotion.local')) {
      throw new Error('Expected remotion adapter base URL to remain unchanged');
    }
  });

  const calls = [];
  const fakeAdapter = {
    async createFromApproval(seed) {
      calls.push({ type: 'create', seed });
      return {
        alignmentStatus: { status: 'ready' },
        projectId: 'remotion-123',
        snapshot: {
          project: {
            rows: [],
          },
        },
        previewAssets: { from: 'created' },
      };
    },
    async status(projectId) {
      calls.push({ type: 'status', projectId });
      return {
        project: {
          rows: [
            { id: 'row-1', phrase: 'Hola mundo', startTime: 0, endTime: 2, selectedAssetId: 'asset-1' },
          ],
        },
        previewAssets: { from: 'status' },
      };
    },
  };

  const api = {
    createRemotionClient({ resolveBaseUrl }) {
      calls.push({ type: 'adapter', baseUrl: resolveBaseUrl() });
      return fakeAdapter;
    },
  };

  const prepared = await prepareVideoCompositionContract({
    project: baseProject(),
    settings: { remotionApiUrl: 'https://remotion.local' },
    api,
  });

  if (prepared.compositionProjectId !== 'remotion-123') {
    throw new Error('Expected normalized compositionProjectId');
  }
  if (!Array.isArray(prepared.timedRows) || prepared.timedRows.length !== 1) {
    throw new Error('Expected timedRows fallback from status rows');
  }
  if (prepared.previewAssets?.from !== 'status') {
    throw new Error('Expected status previewAssets to win over created fallback');
  }
  if (prepared.providerMetadata?.id !== 'remotion') {
    throw new Error('Expected default metadata to identify remotion provider');
  }
  if (!('baseUrl' in (prepared.providerMetadata || {})) || !('fallbackFrom' in (prepared.providerMetadata || {}))) {
    throw new Error('Expected minimal provider metadata to be present');
  }

  const adapterCall = calls.find((entry) => entry.type === 'adapter');
  if (!adapterCall || adapterCall.baseUrl !== 'https://remotion.local') {
    throw new Error('Expected contract pipeline client to configure adapter with settings base URL');
  }

  const createCall = calls.find((entry) => entry.type === 'create');
  if (!createCall?.seed?.draft_id || !createCall?.seed?.voice_audio || !createCall?.seed?.background_audio) {
    throw new Error('Expected create-from-approval seed to preserve contract payload essentials');
  }

  let missingAudioError = '';
  try {
    await prepareVideoCompositionContract({
      project: { ...baseProject(), voice_audio: null },
      settings: { remotionApiUrl: 'https://remotion.local' },
      api,
    });
  } catch (error) {
    missingAudioError = error?.message || '';
  }
  if (!missingAudioError.includes('voice_audio.public_url')) {
    throw new Error('Expected existing missing-audio fallback error behavior');
  }

  const providerCalls = [];
  const apiWithApproval = {
    createApprovalPipelineClient({ resolveBaseUrl }) {
      providerCalls.push({ type: 'approval-adapter', baseUrl: resolveBaseUrl() });
      return {
        async health() {
          providerCalls.push({ type: 'approval-health' });
          return { ok: true, status: 'ready' };
        },
        async createFromApproval() {
          providerCalls.push({ type: 'approval-create' });
          return {
            alignmentStatus: { status: 'ready' },
            projectId: 'approval-123',
            snapshot: { project: { rows: [{ id: 'row-a', phrase: 'Desde approval', startTime: 0, endTime: 2 }] } },
          };
        },
        async status(projectId) {
          providerCalls.push({ type: 'approval-status', projectId });
          return { project: { rows: [{ id: 'row-a', phrase: 'Desde approval', startTime: 0, endTime: 2 }] } };
        },
      };
    },
    createRemotionClient() {
      providerCalls.push({ type: 'remotion-adapter' });
      return fakeAdapter;
    },
  };

  const preparedWithApproval = await prepareVideoCompositionContract({
    project: baseProject(),
    settings: { remotionApiUrl: 'https://remotion.local', approvalPipelineBaseUrl: 'https://approval.local' },
    api: apiWithApproval,
  });

  if (preparedWithApproval.provider !== 'approval') {
    throw new Error('Expected healthy configured approval provider to be selected');
  }
  if (preparedWithApproval.providerMetadata?.id !== 'approval') {
    throw new Error('Expected provider metadata for approval selection');
  }
  const approvalRenderCalls = providerCalls.filter((entry) => entry.type?.includes('render'));
  if (approvalRenderCalls.length) {
    throw new Error('Prepare pipeline must not move preview/final rendering ownership');
  }

  const healthFailCalls = [];
  const apiWithUnhealthyApproval = {
    createApprovalPipelineClient() {
      healthFailCalls.push({ type: 'approval-adapter' });
      return {
        async health() {
          healthFailCalls.push({ type: 'approval-health' });
          return { ok: false, status: 'degraded' };
        },
      };
    },
    createRemotionClient() {
      healthFailCalls.push({ type: 'remotion-adapter' });
      return fakeAdapter;
    },
  };

  const preparedFallback = await prepareVideoCompositionContract({
    project: baseProject(),
    settings: { remotionApiUrl: 'https://remotion.local', approvalPipelineBaseUrl: 'https://approval.local' },
    api: apiWithUnhealthyApproval,
  });
  if (preparedFallback.provider !== 'remotion') {
    throw new Error('Expected unhealthy approval health to fallback to remotion');
  }
  if (preparedFallback.providerMetadata?.fallbackFrom !== 'approval') {
    throw new Error('Expected fallback metadata source when approval health is degraded');
  }

  const malformedHealthCalls = [];
  const apiWithMalformedHealth = {
    createApprovalPipelineClient() {
      malformedHealthCalls.push({ type: 'approval-adapter' });
      return {
        async health() {
          malformedHealthCalls.push({ type: 'approval-health' });
          return {};
        },
      };
    },
    createRemotionClient() {
      malformedHealthCalls.push({ type: 'remotion-adapter' });
      return fakeAdapter;
    },
  };

  const preparedMalformedFallback = await prepareVideoCompositionContract({
    project: baseProject(),
    settings: { remotionApiUrl: 'https://remotion.local', approvalPipelineBaseUrl: 'https://approval.local' },
    api: apiWithMalformedHealth,
  });
  if (preparedMalformedFallback.provider !== 'remotion') {
    throw new Error('Expected malformed approval health payload to fallback to remotion');
  }

  const nonReadyCalls = [];
  const apiWithNonReadyApproval = {
    createApprovalPipelineClient() {
      nonReadyCalls.push({ type: 'approval-adapter' });
      return {
        async health() {
          return { ok: true, status: 'ready' };
        },
        async createFromApproval() {
          nonReadyCalls.push({ type: 'approval-create' });
          return { alignmentStatus: { status: 'pending' }, projectId: 'approval-pending' };
        },
        async status() {
          nonReadyCalls.push({ type: 'approval-status' });
          return { project: { rows: [] } };
        },
      };
    },
    createRemotionClient() {
      nonReadyCalls.push({ type: 'remotion-adapter' });
      return {
        async createFromApproval() {
          nonReadyCalls.push({ type: 'remotion-create' });
          throw new Error('Remotion fallback should not run when healthy approval preparation fails');
        },
        async status() {
          nonReadyCalls.push({ type: 'remotion-status' });
          throw new Error('Remotion fallback should not run when healthy approval preparation fails');
        },
      };
    },
  };

  let nonReadyError = '';
  try {
    await prepareVideoCompositionContract({
      project: baseProject(),
      settings: { remotionApiUrl: 'https://remotion.local', approvalPipelineBaseUrl: 'https://approval.local' },
      api: apiWithNonReadyApproval,
    });
  } catch (error) {
    nonReadyError = error?.message || '';
  }
  if (!nonReadyError.includes('Alineación de audio pendiente')) {
    throw new Error('Expected healthy approval preparation failures to stay on approval provider and surface the real error');
  }
  if (nonReadyCalls.some((entry) => entry.type === 'remotion-create' || entry.type === 'remotion-status')) {
    throw new Error('Expected non-ready approval payload not to fallback to remotion');
  }

  const apiWithApprovalDebugHealth = {
    createApprovalPipelineClient() {
      return {
        async health() {
          return { ok: true, status: 'ready', debug: 'must-not-leak' };
        },
        async createFromApproval() {
          return {
            alignmentStatus: { status: 'ready' },
            projectId: 'approval-456',
            snapshot: { project: { rows: [{ id: 'row-b', phrase: 'Desde approval 2', startTime: 0, endTime: 2 }] } },
          };
        },
        async status() {
          return { project: { rows: [{ id: 'row-b', phrase: 'Desde approval 2', startTime: 0, endTime: 2 }] } };
        },
      };
    },
    createRemotionClient() {
      return fakeAdapter;
    },
  };

  const preparedSanitizedHealth = await prepareVideoCompositionContract({
    project: baseProject(),
    settings: { remotionApiUrl: 'https://remotion.local', approvalPipelineBaseUrl: 'https://approval.local' },
    api: apiWithApprovalDebugHealth,
  });
  if (preparedSanitizedHealth.provider !== 'approval') {
    throw new Error('Expected healthy approval payload to remain on approval provider');
  }
  if (preparedSanitizedHealth.providerMetadata?.health?.debug !== undefined) {
    throw new Error('Expected provider metadata health to be sanitized (no debug field leakage)');
  }
  if (preparedSanitizedHealth.providerMetadata?.health?.ok !== true) {
    throw new Error('Expected provider metadata health to preserve the ok flag');
  }

  await assertServiceEditErrorKeepsStablePreview({
    action: (feature) => feature.updateRow('row-2', { selectedAssetId: 'blocked-asset' }),
    expectedContext: 'Fila row-2',
    expectedStablePhrase: 'Fila con error',
  });

  await assertServiceEditErrorKeepsStablePreview({
    action: (feature) => feature.updateGlobalAudio('voice', { volume: 0.35 }),
    expectedContext: 'Audio voice',
    expectedStablePhrase: 'Fila estable',
    allowLocalSnapshotDraft: true,
  });

  return { ok: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runContractPipelineClientCheck()
    .then(() => {
      console.log('contract-pipeline-client-check: PASS');
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
