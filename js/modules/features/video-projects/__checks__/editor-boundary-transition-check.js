import { fileURLToPath } from 'node:url';
import { buildEditorRowsTable } from '../render/editor-markup.js';
import { hydrateEditorPhaseInteractions } from '../render/editor-hydration.js';
import { normalizePreparedContractRows } from '../data/contract-pipeline-client.js';
import { hydrateSelectedProjectState } from '../controller/editor-state-persistence.js';
import { applyAlternatingBoundaryTransitionDefaults } from '../domain/boundary-transitions.js';
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
    transition: 'glitch-1',
    transitionSource: 'manual',
    transitionConfig: { type: 'overlay-video', assetId: 'glitch-1', src: './assets/boundary-transitions/GLITCH 1 NUEVO.mp4', renderPath: 'overlays/GLITCH 1 NUEVO.mp4', previewUrl: './assets/boundary-transitions/GLITCH 1 NUEVO.mp4', blendMode: 'screen', durationSeconds: 0.833333, audio: true },
    sfx: null,
  }]);

  assertEqual(row.paragraphBoundaryAfter, true, 'Expected client row normalizer to preserve boundary eligibility');
  assertEqual(row.nextRowId, 'row-2', 'Expected client row normalizer to preserve next row target');
  assertEqual(row.transition, 'glitch-1', 'Expected client row normalizer to preserve active transition');
  assertEqual(row.transitionSource, 'manual', 'Expected client row normalizer to preserve transition provenance');
  assertDeepEqual(row.transitionConfig, { type: 'overlay-video', assetId: 'glitch-1', src: './assets/boundary-transitions/GLITCH 1 NUEVO.mp4', renderPath: 'overlays/GLITCH 1 NUEVO.mp4', previewUrl: './assets/boundary-transitions/GLITCH 1 NUEVO.mp4', blendMode: 'screen', durationSeconds: 0.833333, audio: true }, 'Expected client row normalizer to preserve Glitch config');
  assertDeepEqual(row.sfx, null, 'Expected client row normalizer to preserve disabled SFX reference');
}

function runBoundaryConnectorMarkupCheck() {
  const rows = [
    { id: 'row-1', startTime: 0, endTime: 1, phrase: 'Uno', paragraphBoundaryAfter: true, nextRowId: 'row-2', transition: 'none' },
    { id: 'row-2', startTime: 1, endTime: 2, phrase: 'Dos', paragraphBoundaryAfter: false, nextRowId: 'row-3', transition: 'none' },
    { id: 'row-3', startTime: 2, endTime: 3, phrase: 'Tres', paragraphBoundaryAfter: true, transition: 'none' },
  ];
  const markup = buildEditorRowsTable(rows, { selectedRowId: 'row-1', project: {} });

  assertEqual((markup.match(/data-action="set-boundary-transition"/g) || []).length, 2, 'Expected Glitch connector actions only for eligible row with nextRowId');
  assert(markup.includes('data-row-id="row-1"'), 'Expected connector to target the eligible outgoing row');
  assert(markup.includes('data-next-row-id="row-2"'), 'Expected connector to target the next row boundary');
  assert(markup.includes('Glitch 1'), 'Expected inactive eligible connector to offer Glitch 1 activation');
  assert(markup.includes('Glitch 2'), 'Expected inactive eligible connector to offer Glitch 2 activation');
  assert(!markup.includes('data-row-id="row-2" data-next-row-id="row-3"'), 'Expected ineligible row not to render connector');
  assert(!markup.includes('data-row-id="row-3" data-next-row-id'), 'Expected missing nextRowId not to render connector');

  const activeMarkup = buildEditorRowsTable([{ ...rows[0], transition: 'glitch-1' }, rows[1]], { selectedRowId: 'row-1', project: {} });
  assert(activeMarkup.includes('Quitar'), 'Expected active connector to offer Glitch deactivation');
  assert(activeMarkup.includes('aria-pressed="true"'), 'Expected active connector to expose pressed state');
}

function runAutomaticBoundaryTransitionDefaultsCheck() {
  const rows = applyAlternatingBoundaryTransitionDefaults([
    { id: 'row-1', paragraphBoundaryAfter: true, nextRowId: 'row-2', transition: 'none' },
    { id: 'row-2', paragraphBoundaryAfter: true, nextRowId: 'row-3', transition: '' },
    { id: 'row-3', paragraphBoundaryAfter: true, nextRowId: 'row-4' },
    { id: 'row-4', paragraphBoundaryAfter: true, nextRowId: 'row-5', transition: 'fade' },
    { id: 'row-5', paragraphBoundaryAfter: true, nextRowId: 'row-6', transition: 'none', transitionSource: 'manual' },
    { id: 'row-6', paragraphBoundaryAfter: false, nextRowId: 'row-7', transition: 'none' },
    { id: 'row-7', paragraphBoundaryAfter: true, transition: 'none' },
  ]);

  assertEqual(rows[0].transition, 'glitch-1', 'Expected first eligible boundary to default to Glitch 1');
  assertEqual(rows[0].transitionConfig.assetId, 'glitch-1', 'Expected first eligible boundary to receive Glitch 1 config');
  assertEqual(rows[1].transition, 'glitch-2', 'Expected second eligible boundary to default to Glitch 2');
  assertEqual(rows[1].transitionConfig.assetId, 'glitch-2', 'Expected second eligible boundary to receive Glitch 2 config');
  assertEqual(rows[2].transition, 'glitch-1', 'Expected third eligible boundary to default back to Glitch 1');
  assertEqual(rows[3].transition, 'glitch-2', 'Expected unsupported default transition to receive the next alternating Glitch default');
  assertEqual(rows[0].transitionSource, 'auto', 'Expected automatic Glitch 1 default to carry auto provenance');
  assertEqual(rows[1].transitionSource, 'auto', 'Expected automatic Glitch 2 default to carry auto provenance');
  assertEqual(rows[4].transition, 'none', 'Expected explicit manual none to remain untouched');
  assertEqual(rows[4].transitionSource, 'manual', 'Expected explicit manual none provenance to be preserved');
  assertEqual(rows[5].transition, 'none', 'Expected non-boundary row to remain untouched');
  assertEqual(rows[6].transition, 'none', 'Expected boundary without nextRowId to remain untouched');
}

function runManualBoundaryTransitionPreservationCheck() {
  const rows = applyAlternatingBoundaryTransitionDefaults([
    { id: 'row-1', paragraphBoundaryAfter: true, nextRowId: 'row-2', transition: 'glitch-2', transitionConfig: { type: 'overlay-video', assetId: 'custom-glitch-2' } },
    { id: 'row-2', paragraphBoundaryAfter: true, nextRowId: 'row-3', transition: 'whip', transitionConfig: { type: 'whip', durationSeconds: 0.5 }, sfx: 'whip' },
    { id: 'row-3', paragraphBoundaryAfter: true, nextRowId: 'row-4', transition: 'glitch-1', transitionConfig: { type: 'overlay-video', assetId: 'custom-glitch-1' } },
    { id: 'row-4', paragraphBoundaryAfter: true, nextRowId: 'row-5', transition: 'none', transitionSource: 'manual' },
  ]);

  assertEqual(rows[0].transition, 'glitch-2', 'Expected explicit Glitch 2 to be preserved');
  assertEqual(rows[0].transitionConfig.assetId, 'custom-glitch-2', 'Expected explicit Glitch 2 config to be preserved');
  assertEqual(rows[1].transition, 'whip', 'Expected explicit Whip compatibility transition to be preserved');
  assertEqual(rows[1].sfx, 'whip', 'Expected explicit Whip SFX to be preserved');
  assertEqual(rows[2].transition, 'glitch-1', 'Expected explicit Glitch 1 to be preserved');
  assertEqual(rows[2].transitionConfig.assetId, 'custom-glitch-1', 'Expected explicit Glitch 1 config to be preserved');
  assertEqual(rows[3].transition, 'none', 'Expected explicit user-selected none to be preserved');
  assertEqual(rows[3].transitionSource, 'manual', 'Expected explicit user-selected none provenance to be preserved');
}

function runHydratedRowsDeriveBoundaryMetadataFromGuionCheck() {
  const project = {
    guion_piped: 'Intro con pausa\n\n|Cuerpo sin pausa|Cierre',
    editor_state: {
      timed_rows: [
        { id: 'persisted-1', rowId: 'persisted-1', phrase: 'Intro con pausa', startTime: 0, endTime: 1, transition: 'none', nextRowId: 'persisted-2' },
        { id: 'persisted-2', rowId: 'persisted-2', phrase: 'Cuerpo sin pausa', startTime: 1, endTime: 2, transition: 'none' },
        { id: 'persisted-3', rowId: 'persisted-3', phrase: 'Cierre', startTime: 2, endTime: 3, transition: 'none' },
      ],
      global_audio: {},
    },
  };

  hydrateSelectedProjectState(project);

  assertEqual(project._editorRows[0].paragraphBoundaryAfter, true, 'Expected hydration to derive paragraph boundary eligibility from guion_piped');
  assertEqual(project._editorRows[0].nextRowId, 'persisted-2', 'Expected derived boundary to target the next hydrated row id');
  assertEqual(project._editorRows[0].transition, 'glitch-1', 'Expected derived eligibility to receive the first automatic boundary transition');
  assertEqual(project._editorRows[1].paragraphBoundaryAfter, undefined, 'Expected rows without paragraph break to stay ineligible');
}

function runHydratedThreeParagraphAutoBoundaryMarkupCheck() {
  const timedRows = Array.from({ length: 15 }, (_, index) => {
    const rowNumber = index + 1;
    const rowId = `seg-${String(rowNumber).padStart(3, '0')}`;
    return { id: rowId, rowId, phrase: `Fila ${rowNumber}`, startTime: index, endTime: index + 1, transition: 'none' };
  });
  const guionBlocks = timedRows.map((row, index) => `${row.phrase}${index === 6 || index === 13 ? '\n\n' : ''}`);
  const project = {
    guion_piped: guionBlocks.join('|'),
    editor_state: { timed_rows: timedRows, global_audio: {} },
  };

  hydrateSelectedProjectState(project);

  assertEqual(project._editorRows[6].paragraphBoundaryAfter, true, 'Expected first paragraph boundary at row 7 to be derived');
  assertEqual(project._editorRows[6].nextRowId, 'seg-008', 'Expected row 7 boundary to target row 8');
  assertEqual(project._editorRows[6].transition, 'glitch-1', 'Expected row 7 boundary to receive automatic Glitch 1');
  assertEqual(project._editorRows[6].transitionSource, 'auto', 'Expected row 7 automatic Glitch 1 provenance');
  assertEqual(project._editorRows[13].paragraphBoundaryAfter, true, 'Expected second paragraph boundary at row 14 to be derived');
  assertEqual(project._editorRows[13].nextRowId, 'seg-015', 'Expected row 14 boundary to target row 15');
  assertEqual(project._editorRows[13].transition, 'glitch-2', 'Expected row 14 boundary to receive automatic Glitch 2');
  assertEqual(project._editorRows[13].transitionSource, 'auto', 'Expected row 14 automatic Glitch 2 provenance');

  const markup = buildEditorRowsTable(project._editorRows, { selectedRowId: 'seg-007', project });
  assert(markup.includes('data-row-id="seg-007"'), 'Expected row 7 connector controls to render');
  assert(markup.includes('data-row-id="seg-014"'), 'Expected row 14 connector controls to render');
  assert(markup.includes('data-row-id="seg-007" data-next-row-id="seg-008" data-transition="glitch-1" aria-pressed="true"'), 'Expected automatic row 7 Glitch 1 button to be active');
  assert(markup.includes('data-row-id="seg-014" data-next-row-id="seg-015" data-transition="glitch-2" aria-pressed="true"'), 'Expected automatic row 14 Glitch 2 button to be active');
}

function runHydratedPipeOwnLineAutoBoundaryMarkupCheck() {
  const timedRows = [
    { id: 'seg-001', rowId: 'seg-001', phrase: 'Primer párrafo', startTime: 0, endTime: 1, transition: 'none' },
    { id: 'seg-002', rowId: 'seg-002', phrase: 'Segundo párrafo', startTime: 1, endTime: 2, transition: 'none' },
    { id: 'seg-003', rowId: 'seg-003', phrase: 'Tercer párrafo', startTime: 2, endTime: 3, transition: 'none' },
  ];
  const project = {
    guion_piped: 'Primer párrafo \n|\n Segundo párrafo \n|\n Tercer párrafo',
    editor_state: { timed_rows: timedRows, global_audio: {} },
  };

  hydrateSelectedProjectState(project);

  assertEqual(project._editorRows[0].paragraphBoundaryAfter, true, 'Expected pipe alone on a line to derive first paragraph boundary');
  assertEqual(project._editorRows[0].transition, 'glitch-1', 'Expected first pipe-line boundary to receive automatic Glitch 1');
  assertEqual(project._editorRows[1].paragraphBoundaryAfter, true, 'Expected second pipe alone on a line to derive second paragraph boundary');
  assertEqual(project._editorRows[1].transition, 'glitch-2', 'Expected second pipe-line boundary to receive automatic Glitch 2');
}

async function runBoundaryConnectorHydrationCheck() {
  const listeners = new Map();
  const button = {
    dataset: { rowId: 'row-1', nextRowId: 'row-2', transition: 'glitch-1' },
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
    { boundaryTransition: 'glitch-1', nextRowId: 'row-2' },
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
            { id: 'row-1', rowId: 'row-1', selectedAssetId: 'asset-a', media: { kind: 'image' }, paragraphBoundaryAfter: true, nextRowId: 'row-2', transition: 'none', transitionSource: 'manual', sfx: null },
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

  await feature.updateRow('row-1', { boundaryTransition: 'none', nextRowId: 'row-2' });

  assertEqual(updateSnapshotCalls.length, 1, 'Expected boundary activation to persist immediately with one snapshot update');
  assertDeepEqual(
    updateSnapshotCalls[0].payload.operations,
    [{ type: 'setBoundaryTransition', rowId: 'row-1', nextRowId: 'row-2', paragraphBoundaryAfter: true, transition: 'none', transitionSource: 'manual' }],
    'Expected boundary removal to use the scoped setBoundaryTransition operation with manual provenance',
  );
  assertEqual(state.selectedVideoProject._editorRows[0].transition, 'none', 'Expected canonical response to preserve removed boundary transition locally');
  assertEqual(state.selectedVideoProject._editorRows[0].transitionSource, 'manual', 'Expected canonical response to preserve manual none provenance locally');
  assertEqual(state.selectedVideoProject._editorRows[0].selectedAssetId, 'asset-a', 'Expected unrelated selected image to remain unchanged');
  assertEqual(state.selectedVideoProject._editorRows[0].media.kind, 'image', 'Expected unrelated media settings to remain unchanged');
  assertEqual(savedEditorStates.at(-1).snapshot_hash, 'hash-2', 'Expected persisted editor state to use updated snapshot hash');
}

export async function runEditorBoundaryTransitionCheck() {
  runPreparedRowsPreserveBoundaryTransitionMetadataCheck();
  runBoundaryConnectorMarkupCheck();
  runAutomaticBoundaryTransitionDefaultsCheck();
  runManualBoundaryTransitionPreservationCheck();
  runHydratedRowsDeriveBoundaryMetadataFromGuionCheck();
  runHydratedThreeParagraphAutoBoundaryMarkupCheck();
  runHydratedPipeOwnLineAutoBoundaryMarkupCheck();
  await runBoundaryConnectorHydrationCheck();
  await runApprovalBoundaryTransitionOperationCheck();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await runEditorBoundaryTransitionCheck();
  console.log('editor-boundary-transition-check: ok');
}
