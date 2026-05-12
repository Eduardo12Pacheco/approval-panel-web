import { escapeHtmlCore } from '../../../core/ui/escape-html.js';
import { formatCount } from '../domain/formatters.js';
import { buildEditorShellViewModel } from './editor-view-model.js';
import { buildEditorDetailRail, buildEditorRowsTable, buildPreviewTimeline } from './editor-markup.js';
import { buildPhaseBadge } from './setup-view.js';

function buildPreviewMonitor({ previewUrl, rows = [], selectedRowId = null }) {
  const activeSelectedRowId = selectedRowId || rows[0]?.id || null;
  const hasRows = Array.isArray(rows) && rows.length > 0;
  if (!hasRows) {
    return `
      <div class="video-preview-monitor video-preview-monitor--empty">
        <p>Todavía no hay composición local. Prepará el editor para empezar.</p>
        ${previewUrl ? `<a href="${escapeHtmlCore(previewUrl)}" target="_blank" rel="noopener noreferrer">Abrir preview renderizada</a>` : ''}
      </div>`;
  }
  return `
    <div class="video-preview-monitor video-preview-monitor--composition">
      <div class="video-preview-stage" data-composition-container></div>
      ${buildPreviewTimeline(rows, activeSelectedRowId)}
      <div class="video-preview-monitor__footer"><span>Preview local</span></div>
    </div>`;
}

function buildEditorStatusPanel({ editorState, onExportFinal }) {
  const phase = editorState.phase || 'idle';
  const dirty = Boolean(editorState.dirty);
  const exportStatus = editorState.export_status || 'idle';
  const isRendering = phase === 'preparing' || phase === 'preview_rendering' || phase === 'final_rendering';
  const canExport = !isRendering && (phase === 'preview_ready' || phase === 'editing_dirty' || phase === 'final_ready' || phase === 'error');
  void exportStatus;
  void onExportFinal;
  return `
    <div class="video-editor-status-panel">
      <div class="video-editor-status-panel__header"><span class="video-projects-eyebrow">Acciones</span>${dirty ? '<span class="video-project-dirty-badge" title="Cambios sin exportar">● Sin exportar</span>' : ''}</div>
      <div class="video-editor-actions"><button class="video-project-primary-action video-project-primary-action--export" type="button" data-action="export-final" ${canExport ? '' : 'disabled'} title="Exportar video final 1080p">${phase === 'final_rendering' ? 'Exportando…' : 'Exportar final'}</button></div>
      ${editorState.error ? `<p class="video-projects-empty video-projects-empty--error">${escapeHtmlCore(editorState.error)}</p>` : ''}
      ${editorState.final_url ? `<div class="video-editor-download"><a href="${escapeHtmlCore(editorState.final_url)}" target="_blank" rel="noopener noreferrer" download>Descargar video final</a></div>` : ''}
    </div>`;
}

export function buildEditorShell(project, options = {}) {
  const { editorRows = [], selectedRowId = null, globalAudio = {}, editorState = {}, onRowSelect, onImageReplace, onUploadAssign, onExportFinal, rowImageUploading } = options;
  const shell = buildEditorShellViewModel(project, { editorRows, selectedRowId });
  const { activeSelectedRowId, selectedRow, selectedRowIndex } = shell;
  return `
    <section class="video-editor-shell" data-editor-phase="${escapeHtmlCore((editorState.phase || 'idle').toString())}">
      <section class="video-editor-shell__workspace">
        <div class="video-editor-shell__left">
          <div class="video-editor-shell__card video-editor-shell__card--preview"><div class="video-project-section-heading video-project-section-heading--compact"><div><span class="video-projects-eyebrow">Preview Card — Top</span><h4>Vista previa</h4></div></div>${buildPreviewMonitor({ previewUrl: editorState.preview_url, rows: editorRows, selectedRowId: activeSelectedRowId })}</div>
          <div class="video-editor-shell__card video-editor-shell__card--table"><div class="video-project-section-heading video-project-section-heading--compact"><div><span class="video-projects-eyebrow">Table Card — Bottom</span><h4>${formatCount(editorRows.length, 'fila')}</h4></div></div>${buildEditorRowsTable(editorRows, { selectedRowId: activeSelectedRowId, onRowSelect, onImageReplace, onUploadAssign, rowImageUploading, project })}</div>
        </div>
        <aside class="video-editor-shell__right">${buildEditorDetailRail({ row: selectedRow, globalAudio, project, rowIndex: selectedRowIndex })}${buildEditorStatusPanel({ editorState, onExportFinal })}</aside>
      </section>
    </section>`;
}

export function buildPreviewPreparingPanel(editorState) {
  const phase = editorState.phase || 'idle';
  const isRendering = phase === 'preparing' || phase === 'preview_rendering';
  const hasError = phase === 'error';
  return `
    <div class="video-project-section-heading"><div><span class="video-projects-eyebrow">Fase 3</span><h3>Editor ${buildPhaseBadge(phase, false)}</h3></div></div>
    <div class="video-preview-preparing">
      ${isRendering ? `<div class="video-preview-preparing__card" role="status" aria-live="polite"><div class="video-preview-spinner" aria-hidden="true"></div><p>Preparando editor/timings… Esto puede tardar unos minutos.</p></div>` : hasError ? `<p class="video-projects-empty video-projects-empty--error">${escapeHtmlCore(editorState.error || 'Error preparando editor')}</p>` : `<p>Editor listo. Abrí la edición para ajustar filas y exportar.</p>`}
    </div>`;
}

export function buildEditorPhaseContent({ project, viewModel }) {
  const { editorState, editorPhase, editorRows, globalAudio, editorShellMode } = viewModel;
  const mainContent = (editorPhase === 'preparing' || editorPhase === 'preview_rendering' || (editorPhase === 'error' && !editorRows.length))
    ? buildPreviewPreparingPanel(editorState)
    : buildEditorShell(project, { editorRows, selectedRowId: project._selectedEditorRowId || null, globalAudio, editorState, rowImageUploading: project._rowImageUploading || null });
  const sideContent = editorShellMode ? '' : `
    <div class="video-project-section-heading video-project-section-heading--compact"><div><span class="video-projects-eyebrow">Estado</span><h3>${buildPhaseBadge(editorPhase, editorState.dirty)}</h3></div></div>
    <div class="video-editor-meta"><div><span>Proyecto Remotion</span><strong>${escapeHtmlCore((editorState.remotion_project_id || '—').toString())}</strong></div><div><span>Filas</span><strong>${editorRows.length}</strong></div><div><span>Preview local</span><strong>${editorRows.length ? 'Lista' : 'Pendiente'}</strong></div><div><span>Exportación</span><strong>${editorState.export_status === 'ready' ? 'Lista' : 'Pendiente'}</strong></div></div>
    ${editorState.error ? `<p class="video-projects-empty video-projects-empty--error">${escapeHtmlCore(editorState.error)}</p>` : ''}`;
  return { mainContent, sideContent };
}
