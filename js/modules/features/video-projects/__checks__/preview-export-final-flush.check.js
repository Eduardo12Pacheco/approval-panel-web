import test from 'node:test';
import assert from 'node:assert/strict';

import { createPreviewExportCommands } from '../controller/preview-export-commands.js';

test('exportFinal flushes pending approval drafts before renderFinal and uses the updated snapshot hash', async () => {
  const calls = [];
  const project = {
    editor_state: {
      dirty: false,
      pipeline_provider: 'approval',
      approval_contract_snapshot: { snapshotHash: 'hash-before' },
      remotion_project_id: 'approval-project-1',
      snapshot_hash: 'hash-before',
    },
  };
  const store = { getState: () => ({ selectedVideoProject: project, settings: {} }) };
  const client = {
    renderFinal: async (projectId, payload) => {
      calls.push({ type: 'renderFinal', projectId, payload });
      return { render: { status: 'rendered', outputPath: 'output/video-final.mp4' }, lastRenderedSnapshotHash: payload.snapshotHash };
    },
    finalDownloadUrl: () => '/api/projects/approval-project-1/final',
  };
  const flushPendingApprovalDrafts = async (flushProject) => {
    calls.push({ type: 'flush', snapshotHash: flushProject.editor_state.snapshot_hash });
    flushProject.editor_state.snapshot_hash = 'hash-after';
    flushProject.editor_state.approval_contract_snapshot.snapshotHash = 'hash-after';
    return { flushedOperations: 1, snapshotHash: 'hash-after' };
  };

  const commands = createPreviewExportCommands({
    api: {},
    store,
    ui: { toast() {} },
    persistEditorState: async (persistProject, patch) => {
      calls.push({ type: 'persist', phase: patch.phase, lastRenderedHash: patch.last_rendered_hash });
      persistProject.editor_state = { ...persistProject.editor_state, ...patch };
    },
    isApprovalServiceMode: () => true,
    createApprovalServiceClient: () => client,
    renderSelectedVideoProject() {},
    flushPendingApprovalDrafts,
    renderFinalPollDelayMs: 0,
    renderFinalMaxPolls: 0,
  });

  await commands.exportFinal();

  assert.equal(calls[0].type, 'flush');
  const renderCall = calls.find((call) => call.type === 'renderFinal');
  assert.deepEqual(renderCall, {
    type: 'renderFinal',
    projectId: 'approval-project-1',
    payload: { snapshotHash: 'hash-after', async: true },
  });
  const finalPersist = calls.find((call) => call.type === 'persist' && call.phase === 'final_ready');
  assert.equal(finalPersist.lastRenderedHash, 'hash-after');
});
