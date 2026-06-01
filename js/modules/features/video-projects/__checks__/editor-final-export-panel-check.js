import { fileURLToPath } from 'node:url';
import { buildEditorShell } from '../render/editor-shell-view.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertIncludes(markup, expected, message) {
  assert(markup.includes(expected), `${message}: expected ${JSON.stringify(expected)}`);
}

function assertNotIncludes(markup, unexpected, message) {
  assert(!markup.includes(unexpected), `${message}: unexpected ${JSON.stringify(unexpected)}`);
}

function buildShell(editorState) {
  return buildEditorShell(
    {
      id: 'project-1',
      title: 'Proyecto de prueba',
      selected_images: ['https://example.test/image.jpg'],
      image_candidates: [],
      editor_state: editorState,
    },
    {
      selectedRowId: 'row-1',
      editorRows: [
        {
          id: 'row-1',
          phrase: 'Fila de prueba',
          imageUrl: 'https://example.test/image.jpg',
          startTime: 0,
          endTime: 3,
        },
      ],
      globalAudio: {},
      editorState,
    },
  );
}

function getExportPanel(markup) {
  const marker = '<section class="video-editor-export-panel ';
  const start = markup.indexOf(marker);
  assert(start >= 0, 'Expected bottom final export panel to render');
  const end = markup.indexOf('</section>', start);
  assert(end > start, 'Expected bottom final export panel section to close');
  return markup.slice(start, end + '</section>'.length);
}

function getStatusPanel(markup) {
  const marker = '<div class="video-editor-status-panel ';
  const start = markup.indexOf(marker);
  assert(start < 0, 'Editor status panel must not render in the right rail');
  return '';
}

function runRenderingPanelCheck() {
  const markup = buildShell({ phase: 'final_rendering', export_status: 'rendering' });
  const panel = getExportPanel(markup);
  getStatusPanel(markup);

  assert(markup.indexOf('video-editor-shell__workspace') < markup.indexOf('video-editor-export-panel'), 'Expected export panel below editor workspace');
  assertIncludes(panel, 'Renderizando video final', 'Expected final rendering status copy');
  assertIncludes(panel, 'role="progressbar"', 'Expected accessible progress activity');
  assertIncludes(panel, 'video-editor-export-panel__progress-bar--indeterminate', 'Expected indeterminate progress when no percentage exists');
  assertIncludes(panel, 'data-action="export-final" disabled', 'Expected disabled export button while rendering');
  assertIncludes(panel, 'video-editor-export-panel__download--disabled', 'Rendering panel must show disabled download state');
  assertIncludes(panel, 'aria-disabled="true"', 'Disabled download must be announced as disabled');
  assertIncludes(panel, 'Descargar video final', 'Rendering panel should keep download action visible but disabled');
}

function runReadyPanelCheck() {
  const markup = buildShell({ phase: 'final_ready', export_status: 'ready', final_url: 'https://example.test/final.mp4' });
  const panel = getExportPanel(markup);
  getStatusPanel(markup);

  assertIncludes(panel, 'Exportación lista', 'Expected ready status copy');
  assertIncludes(panel, 'href="https://example.test/final.mp4"', 'Expected final download link inside export panel');
  assertIncludes(panel, 'Descargar video final', 'Expected download action inside export panel');
  assertIncludes(panel, 'video-editor-export-panel__download--active', 'Ready final should make download the primary green action');
  assertIncludes(panel, 'data-action="export-final"', 'Expected stable export action for re-render');
  assertIncludes(panel, 'Volver a renderizar', 'Expected re-render copy for ready final');
  assertIncludes(panel, 'video-project-secondary-action--export', 'Ready final should make re-render a secondary action');
}

function runErrorPanelCheck() {
  const markup = buildShell({ phase: 'error', export_status: 'error', error: 'Falló Remotion' });
  const panel = getExportPanel(markup);
  getStatusPanel(markup);

  assertIncludes(panel, 'Error renderizando', 'Expected export error status copy');
  assertIncludes(panel, 'Falló Remotion', 'Expected backend error message in export panel');
  assertIncludes(panel, 'data-action="export-final"', 'Expected stable export action for retry');
  assertIncludes(panel, 'Reintentar renderizado', 'Expected retry copy in error state');
}

function runDirtyReadyPanelCheck() {
  const markup = buildShell({ phase: 'final_ready', export_status: 'ready', final_url: 'https://example.test/final.mp4', dirty: true });
  const panel = getExportPanel(markup);
  getStatusPanel(markup);

  assertIncludes(panel, 'Cambios pendientes', 'Expected dirty ready state warning');
  assertIncludes(panel, 'volvé a renderizar', 'Expected dirty warning to explain re-render');
  assertIncludes(panel, 'video-editor-export-panel__download--disabled', 'Dirty final should block stale download');
  assertNotIncludes(panel, 'href="https://example.test/final.mp4"', 'Dirty final should not expose stale final download URL');
  assertIncludes(panel, 'video-project-primary-action--export', 'Dirty final should make re-render the primary action');
}

function runDirtyEditingStatusPanelCheck() {
  const markup = buildShell({ phase: 'editing_dirty', export_status: 'idle', dirty: true });
  getStatusPanel(markup);

}

function runIdleStatusPanelCheck() {
  const markup = buildShell({ phase: 'preview_ready', export_status: 'idle', dirty: false });
  const panel = getExportPanel(markup);
  getStatusPanel(markup);

  assertIncludes(panel, 'video-editor-export-panel__download--disabled', 'Idle final should show disabled download action');
  assertIncludes(panel, 'Renderizar video', 'Idle final should make render available');
}

function runLegacyLocalPathDownloadCheck() {
  const markup = buildShell({
    phase: 'final_ready',
    export_status: 'ready',
    final_url: 'file:///C:/renders/project-1/output/video-final.mp4',
    pipeline_base_url: 'http://127.0.0.1:3042',
    remotion_project_id: 'approval-project-export',
  });
  const panel = getExportPanel(markup);

  assertNotIncludes(panel, 'file:///C:/renders', 'Expected legacy local file URL to be hidden from browser download link');
  assertIncludes(panel, 'href="http://127.0.0.1:3042/api/projects/approval-project-export/download/final?download=1"', 'Expected legacy final URL to resolve to browser-safe service download endpoint');
}

export function runEditorFinalExportPanelCheck() {
  runRenderingPanelCheck();
  runReadyPanelCheck();
  runErrorPanelCheck();
  runDirtyReadyPanelCheck();
  runDirtyEditingStatusPanelCheck();
  runIdleStatusPanelCheck();
  runLegacyLocalPathDownloadCheck();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runEditorFinalExportPanelCheck();
  console.log('editor-final-export-panel-check: ok');
}
