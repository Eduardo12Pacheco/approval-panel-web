import { pathToFileURL } from 'node:url';
import { createGlobalAudioCommands } from '../controller/audio-commands.js';
import { createApprovalSnapshotOperations } from '../controller/approval-snapshot-operations.js';
import { buildEditorDetailRailViewModel } from '../render/editor-view-model.js';

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${expected}; got ${actual}`);
  }
}

function makeApprovalProject() {
  const snapshot = {
    contractVersion: 'approval-editor-service-v1',
    snapshotId: 'snapshot-1',
    snapshotHash: 'hash-1',
    rows: [{ id: 'row-1', rowId: 'row-1', phrase: 'Fila', startTime: 0, endTime: 1 }],
    audio: {
      voice: { volume: 1, muted: false, assetId: 'voice-audio' },
      music: { volume: 0.16, muted: false, assetId: 'music-audio' },
    },
    assets: {},
  };
  return {
    draft_id: 'draft-audio',
    _editorRows: snapshot.rows.map((row) => ({ ...row })),
    _globalAudio: { voice: { volume: 1, muted: false }, music: { volume: 0.16, muted: false } },
    editor_state: {
      phase: 'preview_ready',
      pipeline_provider: 'approval',
      approval_contract_snapshot: snapshot,
      snapshot_hash: snapshot.snapshotHash,
      global_audio: { voice: { volume: 1, muted: false }, music: { volume: 0.16, muted: false } },
      dirty: false,
      error: '',
    },
  };
}

async function assertApprovalAudioUsesOptimisticDrafts() {
  const project = makeApprovalProject();
  const calls = [];
  const commands = createGlobalAudioCommands({
    store: { getState: () => ({ selectedVideoProject: project }) },
    persistEditorState() { calls.push('persist'); },
    isApprovalServiceMode: () => true,
    commitApprovalSnapshotOperations() { calls.push('commit'); throw new Error('service should be debounced'); },
    renderSelectedVideoProject() { calls.push('render'); },
    updateSelectedVideoProjectCompositionPreview() { calls.push('preview'); },
    createSnapshotDraft(operationKey, operation, apply) {
      calls.push(`draft:${operationKey}:${operation.type}:${operation.kind}`);
      project.editor_state.approval_contract_snapshot = apply(project.editor_state.approval_contract_snapshot);
    },
    scheduleApprovalMotionPersistence() { calls.push('schedule'); },
    getSaveTimer: () => null,
    setSaveTimer() {},
    debounceMs: 1,
  });

  await commands.updateGlobalAudio('voice', { volume: 0.35 });

  assertEqual(project._globalAudio.voice.volume, 0.35, 'Expected voice volume to update local preview state immediately');
  assertEqual(project.editor_state.global_audio.voice.volume, 0.35, 'Expected voice volume to update normalized editor state immediately');
  assertEqual(project.editor_state.approval_contract_snapshot.audio.voice.volume, 0.35, 'Expected voice volume to update the local snapshot draft immediately');
  assertEqual(project.editor_state.phase, 'editing_dirty', 'Expected audio draft to mark editor dirty');
  assertEqual(calls.includes('draft:audio:voice:setAudio:voice'), true, 'Expected setAudio draft registration');
  assertEqual(calls.includes('schedule'), true, 'Expected audio persistence to be debounced through snapshot operations');
  assertEqual(calls.includes('preview'), true, 'Expected local composition preview refresh without heavy rerender');
  assertEqual(calls.includes('commit'), false, 'Expected approval audio updates not to synchronously call the service');
  assertEqual(calls.includes('render'), false, 'Expected optimistic audio change not to force full editor rerender');
}

function assertZeroVolumeDoesNotSnapToDefault() {
  const detail = buildEditorDetailRailViewModel({
    row: { id: 'row-1', phrase: 'Fila', startTime: 0, endTime: 1 },
    globalAudio: {
      voice: { volume: 0, muted: false },
      music: { volume: 0, muted: false },
    },
  });

  assertEqual(detail.voiceVolumeValue, 0, 'Expected zero voice volume to remain zero');
  assertEqual(detail.voiceVolumePercent, 0, 'Expected zero voice volume label to remain 0%');
  assertEqual(detail.musicVolumeValue, 0, 'Expected zero music volume to remain zero');
  assertEqual(detail.musicVolumePercent, 0, 'Expected zero music volume label to remain 0%');
}

function assertCanonicalApplyKeepsPendingAudioDraft() {
  const project = makeApprovalProject();
  const operations = createApprovalSnapshotOperations({
    api: {},
    store: { getState: () => ({ settings: {} }) },
    ui: { toast() {} },
    persistEditorState() {},
    renderSelectedVideoProject() {},
  });

  operations.createSnapshotDraft('audio:voice', { type: 'setAudio', kind: 'voice', settings: { volume: 0.25 } }, (snapshot) => ({
    ...snapshot,
    audio: { ...(snapshot.audio || {}), voice: { ...(snapshot.audio?.voice || {}), volume: 0.25 } },
  }));
  operations.applyCanonicalSnapshot(project, {
    ...project.editor_state.approval_contract_snapshot,
    snapshotId: 'snapshot-2',
    snapshotHash: 'hash-2',
    audio: { voice: { volume: 1, muted: false }, music: { volume: 0.16, muted: false } },
  });

  assertEqual(project.editor_state.approval_contract_snapshot.audio.voice.volume, 0.25, 'Expected pending audio snapshot draft to survive canonical apply');
  assertEqual(project._globalAudio.voice.volume, 0.25, 'Expected local global audio to mirror pending snapshot draft');
}

export async function runApprovalAudioDraftCheck() {
  await assertApprovalAudioUsesOptimisticDrafts();
  assertZeroVolumeDoesNotSnapToDefault();
  assertCanonicalApplyKeepsPendingAudioDraft();
  return { ok: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runApprovalAudioDraftCheck()
    .then(() => console.log('approval-audio-draft-check: PASS'))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
