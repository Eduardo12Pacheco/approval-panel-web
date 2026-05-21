import { fileURLToPath } from 'node:url';
import { buildEditorRowsTable } from '../render/editor-markup.js';
import { hydrateEditorPhaseInteractions } from '../render/editor-hydration.js';
import { normalizePreparedContractRows } from '../data/contract-pipeline-client.js';
import { hydrateSelectedProjectState } from '../controller/editor-state-persistence.js';
import { createVideoProjectsFeature } from '../index.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function assertDeepEqual(actual, expected, message) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
}

function runPreparedRowsPreserveBoundaryTransitionMetadataCheck() {
  const [row] = normalizePreparedContractRows([{
    id: 'row-1',
    paragraphBoundaryAfter: true,
    nextRowId: 'row-2',
    transition: 'whip',
    transitionConfig: { type: 'whip', durationSeconds: 0.5, direction: 'left-to-right' },
    sfx: { type: 'whip', assetId: 'whip', src: 'sfx/sound-whosh.wav' },
  }]);

  assertEqual(row.paragraphBoundaryAfter, true, 'Expected client row normalizer to preserve boundary eligibility');
  assertEqual(row.nextRowId, 'row-2', 'Expected client row normalizer to preserve next row target');
  assertEqual(row.transition, 'whip', 'Expected client row normalizer to preserve active transition');
  assertDeepEqual(row.transitionConfig, { type: 'whip', durationSeconds: 0.5, direction: 'left-to-right' }, 'Expected client row normalizer to preserve Whip config');
  assertDeepEqual(row.sfx, { type: 'whip', assetId: 'whip', src: 'sfx/sound-whosh.wav' }, 'Expected client row normalizer to preserve SFX reference');
}

function runBoundaryConnectorMarkupCheck() {
  const rows = [
    { id: 'row-1', startTime: 0, endTime: 1, phrase: 'Uno', paragraphBoundaryAfter: true, nextRowId: 'row-2', transition: 'none' },
    { id: 'row-2', startTime: 1, endTime: 2, phrase: 'Dos', paragraphBoundaryAfter: false, nextRowId: 'row-3', transition: 'none' },
    { id: 'row-3', startTime: 2, endTime: 3, phrase: 'Tres', paragraphBoundaryAfter: true, transition: 'none' },
  ];
  const markup = buildEditorRowsTable(rows, { selectedRowId: 'row-1', project: {} });

  assertEqual((markup.match(/data-action="set-boundary-transition"/g) || []).length, 1, 'Expected connector action only for eligible row with nextRowId');
  assert(markup.includes('data-row-id="row-1"'), 'Expected connector to target the eligible outgoing row');
  assert(markup.includes('data-next-row-id="row-2"'), 'Expected connector to target the next row boundary');
  assert(markup.includes('Activar Whip'), 'Expected inactive eligible connector to offer Whip activation');
  assert(!markup.includes('data-row-id="row-2" data-next-row-id="row-3"'), 'Expected ineligible row not to render connector');
  assert(!markup.includes('data-row-id="row-3" data-next-row-id'), 'Expected missing nextRowId not to render connector');

  const activeMarkup = buildEditorRowsTable([{ ...rows[0], transition: 'whip' }, rows[1]], { selectedRowId: 'row-1', project: {} });
  assert(activeMarkup.includes('Desactivar Whip'), 'Expected active connector to offer Whip deactivation');
  assert(activeMarkup.includes('aria-pressed="true"'), 'Expected active connector to expose pressed state');
}

function runHydratedRowsDeriveBoundaryMetadataFromGuionCheck() {
  const project = {
    guion_piped: 'Intro con pausa\n\n|Cuerpo sin pausa|Cierre',
    editor_state: {
      timed_rows: [
        { id: 'persisted-1', rowId: 'persisted-1', phrase: 'Intro con pausa', startTime: 0, endTime: 1, transition: 'none' },
        { id: 'persisted-2', rowId: 'persisted-2', phrase: 'Cuerpo sin pausa', startTime: 1, endTime: 2, transition: 'none' },
        { id: 'persisted-3', rowId: 'persisted-3', phrase: 'Cierre', startTime: 2, endTime: 3, transition: 'none' },
      ],
      global_audio: {},
    },
  };

  hydrateSelectedProjectState(project);

  assertEqual(project._editorRows[0].paragraphBoundaryAfter, true, 'Expected hydration to derive paragraph boundary eligibility from guion_piped');
  assertEqual(project._editorRows[0].nextRowId, 'persisted-2', 'Expected derived boundary to target the next hydrated row id');
  assertEqual(project._editorRows[0].transition, 'none', 'Expected derived eligibility not to auto-enable Whip');
  assertEqual(project._editorRows[1].paragraphBoundaryAfter, undefined, 'Expected rows without paragraph break to stay ineligible');
}

async function runBoundaryConnectorHydrationCheck() {
  const listeners = new Map();
  const button = {
    dataset: { rowId: 'row-1', nextRowId: 'row-2', transition: 'whip' },
    addEventListener(type, listener) { listeners.set(type, listener); },
  };
  const patches = [];
  let renderCount = 0;
  const root = {
    querySelectorAll(selector) {
      if (selector === '[data-action="set-boundary-transition"]') return [button];
      return [];
    },
    querySelector() { return null; },
  };

  hydrateEditorPhaseInteractions({
    root,
    project: {},
    editorPhase: 'preview_ready',
    editorRows: [],
    updateRow: async (rowId, patch) => patches.push({ rowId, patch }),
    renderSelectedVideoProject: () => { renderCount += 1; },
  });

  await listeners.get('click')();

  assertEqual(patches.length, 1, 'Expected connector click to persist one row patch');
  assertEqual(patches[0].rowId, 'row-1', 'Expected connector patch to target outgoing row only');
  assertDeepEqual(
    patches[0].patch,
    { boundaryTransition: 'whip', nextRowId: 'row-2' },
    'Expected connector patch to use scoped boundary transition fields only',
  );
  assertEqual(renderCount, 1, 'Expected connector click to rerender editor controls after scoped update');
}

async function runApprovalBoundaryTransitionOperationCheck() {
  const updateSnapshotCalls = [];
  const savedEditorStates = [];
  const state = {
    settings: { approvalPipelineBaseUrl: 'http://approval.local' },
    selectedVideoProject: {
      draft_id: 'draft-boundary-1',
      editor_state: {
        pipeline_provider: 'approval',
        pipeline_base_url: 'http://approval.local',
        remotion_project_id: 'remotion-1',
        approval_contract_snapshot: {
          contractVersion: 'approval-editor-service-v1',
          projectId: 'remotion-1',
          snapshotHash: 'hash-base',
          rows: [
            { id: 'row-1', rowId: 'row-1', selectedAssetId: 'asset-a', media: { kind: 'image' }, paragraphBoundaryAfter: true, nextRowId: 'row-2', transition: 'none' },
            { id: 'row-2', rowId: 'row-2', selectedAssetId: 'asset-b', media: { kind: 'image' }, transition: 'none' },
          ],
          assets: {},
        },
        snapshot_hash: 'hash-base',
        phase: 'preview_ready',
      },
      _editorRows: [
        { id: 'row-1', selectedAssetId: 'asset-a', media: { kind: 'image' }, paragraphBoundaryAfter: true, nextRowId: 'row-2', transition: 'none' },
        { id: 'row-2', selectedAssetId: 'asset-b', media: { kind: 'image' }, transition: 'none' },
      ],
    },
  };
  const feature = createVideoProjectsFeature({
    api: {
      createApprovalPipelineClient() {
        return {
          async updateSnapshot(projectId, payload) {
            updateSnapshotCalls.push({ projectId, payload });
            return {
              snapshot: {
                ...state.selectedVideoProject.editor_state.approval_contract_snapshot,
                snapshotId: 'snapshot-2',
                snapshotHash: 'hash-2',
                rows: [
                  { id: 'row-1', rowId: 'row-1', selectedAssetId: 'asset-a', media: { kind: 'image' }, paragraphBoundaryAfter: true, nextRowId: 'row-2', transition: 'whip', transitionConfig: { type: 'whip', durationSeconds: 0.5, direction: 'left-to-right' }, sfx: { type: 'whip', assetId: 'whip', src: 'sfx/sound-whosh.wav' } },
                  { id: 'row-2', rowId: 'row-2', selectedAssetId: 'asset-b', media: { kind: 'image' }, transition: 'none' },
                ],
              },
            };
          },
        };
      },
      async saveVideoProjectEditorState({ editorState }) { savedEditorStates.push(editorState); },
    },
    store: { getState: () => state },
    ui: { toast() {} },
    callbacks: { renderSelectedVideoProject() {}, updateSelectedVideoProjectCompositionPreview() { return true; }, renderVideoProjects() {} },
  });

  await feature.updateRow('row-1', { boundaryTransition: 'whip', nextRowId: 'row-2' });

  assertEqual(updateSnapshotCalls.length, 1, 'Expected boundary activation to persist immediately with one snapshot update');
  assertDeepEqual(
    updateSnapshotCalls[0].payload.operations,
    [{ type: 'setBoundaryTransition', rowId: 'row-1', nextRowId: 'row-2', paragraphBoundaryAfter: true, transition: 'whip', direction: 'left-to-right' }],
    'Expected boundary activation to use the scoped setBoundaryTransition operation only',
  );
  assertEqual(state.selectedVideoProject._editorRows[0].transition, 'whip', 'Expected canonical response to activate Whip locally');
  assertEqual(state.selectedVideoProject._editorRows[0].selectedAssetId, 'asset-a', 'Expected unrelated selected image to remain unchanged');
  assertEqual(state.selectedVideoProject._editorRows[0].media.kind, 'image', 'Expected unrelated media settings to remain unchanged');
  assertEqual(savedEditorStates.at(-1).snapshot_hash, 'hash-2', 'Expected persisted editor state to use updated snapshot hash');
}

export async function runEditorBoundaryTransitionCheck() {
  runPreparedRowsPreserveBoundaryTransitionMetadataCheck();
  runBoundaryConnectorMarkupCheck();
  runHydratedRowsDeriveBoundaryMetadataFromGuionCheck();
  await runBoundaryConnectorHydrationCheck();
  await runApprovalBoundaryTransitionOperationCheck();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await runEditorBoundaryTransitionCheck();
  console.log('editor-boundary-transition-check: ok');
}
