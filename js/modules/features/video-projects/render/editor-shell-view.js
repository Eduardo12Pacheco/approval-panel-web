import { escapeHtmlCore } from '../../../core/ui/escape-html.js';
import { buildCompositionPreviewAssets } from '../composition/composition-view-model.js';
import { formatCount } from '../domain/formatters.js';
import { buildEditorShellViewModel } from './editor-view-model.js';
import { buildEditorDetailRail, buildEditorRowsTable, buildPreviewTimeline } from './editor-markup.js';
import { buildPhaseBadge } from './setup-view.js';

function buildPreviewMonitor({ project = {}, previewUrl, rows = [], selectedRowId = null }) {
  const activeSelectedRowId = selectedRowId || rows[0]?.id || null;
  const hasRows = Array.isArray(rows) && rows.length > 0;
  if (!hasRows) {
    return `
      <div class="video-preview-monitor video-preview-monitor--empty">
        <p>Todavía no hay composición local. Prepará el editor para empezar.</p>
        ${previewUrl ? `<a href="${escapeHtmlCore(previewUrl)}" target="_blank" rel="noopener noreferrer">Abrir preview renderizada</a>` : ''}
      </div>`;
  }
  const { compositionRows, outroDurationSeconds } = buildCompositionPreviewAssets({ project, rows });
  const latestCompositionEnd = Math.max(...compositionRows.map((row) => Number(row.endTime || 0)), 0);
  const totalDurationSeconds = latestCompositionEnd + Math.max(0, Number(outroDurationSeconds || 0));
  return `
    <div class="video-preview-monitor video-preview-monitor--composition">
      <div class="video-preview-stage" data-composition-container></div>
      ${buildPreviewTimeline(compositionRows, activeSelectedRowId, { totalDurationSeconds })}
      <div class="video-preview-monitor__footer"><span>Preview local</span></div>
    </div>`;
}

function resolveFinalExportPanelState(editorState = {}) {
  const phase = editorState.phase || 'idle';
  const dirty = Boolean(editorState.dirty);
  const exportStatus = editorState.export_status || 'idle';
  const isRendering = phase === 'final_rendering' || exportStatus === 'rendering';
  const isReady = phase === 'final_ready' || exportStatus === 'ready';
  const hasError = phase === 'error' || exportStatus === 'error';
  if (isRendering) {
    return {
      tone: 'rendering',
      title: 'Exportando video final',
      detail: 'Estamos renderizando el MP4 final. Podés revisar el editor mientras termina.',
      buttonLabel: 'Exportando…',
      buttonDisabled: true,
      showProgress: true,
      downloadEnabled: false,
      renderButtonTone: 'primary',
    };
  }
  if (hasError) {
    return {
      tone: 'error',
      title: 'Error exportando',
      detail: editorState.error || 'No se pudo exportar el video final.',
      buttonLabel: 'Reintentar exportación',
      buttonDisabled: false,
      showProgress: false,
      downloadEnabled: false,
      renderButtonTone: 'primary',
    };
  }
  if (isReady) {
    return {
      tone: dirty ? 'dirty' : 'ready',
      title: 'Exportación lista',
      detail: dirty
        ? 'Cambios pendientes: modificaste el proyecto después del último final; volvé a exportar para actualizar el video.'
        : 'El final está listo. Si detectás un error, corregí el proyecto y volvé a renderizar.',
      buttonLabel: 'Volver a renderizar',
      buttonDisabled: false,
      showProgress: false,
      downloadEnabled: Boolean(editorState.final_url) && !dirty,
      renderButtonTone: dirty ? 'primary' : 'secondary',
    };
  }
  return {
    tone: 'idle',
    title: 'Exportación pendiente',
    detail: dirty ? 'Cambios sin exportar. Renderizá el final cuando termines de revisar.' : 'Cuando el editor esté correcto, generá el video final.',
    buttonLabel: 'Exportar final',
    buttonDisabled: false,
    showProgress: false,
    downloadEnabled: false,
    renderButtonTone: 'primary',
  };
}

function isLocalFileDownloadUrl(value = '') {
  const url = String(value || '').trim();
  return /^file:\/\//i.test(url) || /^[a-z]:[\\/]/i.test(url);
}

function buildApprovalFinalDownloadUrl(project = {}, editorState = {}) {
  const baseUrl = String(editorState.pipeline_base_url || project?.editor_state?.pipeline_base_url || '').trim().replace(/\/+$/, '');
  const projectId = String(editorState.remotion_project_id || project?.editor_state?.remotion_project_id || '').trim();
  if (!baseUrl || !projectId) return '';
  return `${baseUrl}/api/projects/${encodeURIComponent(projectId)}/download/final?download=1`;
}

function resolveBrowserFinalUrl({ project = {}, editorState = {} } = {}) {
  const finalUrl = String(editorState.final_url || '').trim();
  if (!finalUrl) return '';
  if (isLocalFileDownloadUrl(finalUrl)) return buildApprovalFinalDownloadUrl(project, editorState) || finalUrl;
  return finalUrl;
}

function buildFinalExportPanel({ project, editorState }) {
  const state = resolveFinalExportPanelState(editorState);
  const finalUrl = resolveBrowserFinalUrl({ project, editorState });
  const escapedFinalUrl = finalUrl ? escapeHtmlCore(finalUrl) : '';
  const downloadLabel = 'Descargar video final';
  const downloadControl = state.downloadEnabled
    ? `<a class="video-editor-export-panel__download video-editor-export-panel__download--active" href="${escapedFinalUrl}" target="_blank" rel="noopener noreferrer" download>${downloadLabel}</a>`
    : `<span class="video-editor-export-panel__download video-editor-export-panel__download--disabled" aria-disabled="true" title="Renderizá el final actualizado para habilitar la descarga">${downloadLabel}</span>`;
  const exportButtonClass = state.renderButtonTone === 'secondary'
    ? 'video-project-secondary-action video-project-secondary-action--export'
    : 'video-project-primary-action video-project-primary-action--export';
  return `
    <section class="video-editor-export-panel video-editor-export-panel--${state.tone}" aria-label="Exportación final">
      <div class="video-editor-export-panel__copy">
        <span class="video-projects-eyebrow">Exportación final</span>
        <h4>${escapeHtmlCore(state.title)}</h4>
        <p>${escapeHtmlCore(state.detail)}</p>
        ${state.showProgress ? '<div class="video-editor-export-panel__progress" role="progressbar" aria-label="Exportando video final"><span class="video-editor-export-panel__progress-bar video-editor-export-panel__progress-bar--indeterminate"></span></div>' : ''}
      </div>
      <div class="video-editor-export-panel__actions">
        ${downloadControl}
        <button class="${exportButtonClass}" type="button" data-action="export-final" ${state.buttonDisabled ? 'disabled' : ''} title="Exportar video final 1080p">${escapeHtmlCore(state.buttonLabel)}</button>
      </div>
    </section>`;
}

export function buildEditorShell(project, options = {}) {
  const { editorRows = [], selectedRowId = null, globalAudio = {}, editorState = {}, onRowSelect, onImageReplace, onUploadAssign, onExportFinal, rowImageUploading } = options;
  const shell = buildEditorShellViewModel(project, { editorRows, selectedRowId });
  const { activeSelectedRowId, selectedRow, selectedRowIndex } = shell;
  return `
    <section class="video-editor-shell" data-editor-phase="${escapeHtmlCore((editorState.phase || 'idle').toString())}">
      <section class="video-editor-shell__workspace">
        <div class="video-editor-shell__left">
          <div class="video-editor-shell__card video-editor-shell__card--preview"><div class="video-project-section-heading video-project-section-heading--compact"><div><span class="video-projects-eyebrow">Preview Card — Top</span><h4>Vista previa</h4></div></div>${buildPreviewMonitor({ project, previewUrl: editorState.preview_url, rows: editorRows, selectedRowId: activeSelectedRowId })}</div>
          <div class="video-editor-shell__card video-editor-shell__card--table"><div class="video-project-section-heading video-project-section-heading--compact"><div><span class="video-projects-eyebrow">Table Card — Bottom</span><h4>${formatCount(editorRows.length, 'fila')}</h4></div></div>${buildEditorRowsTable(editorRows, { selectedRowId: activeSelectedRowId, onRowSelect, onImageReplace, onUploadAssign, rowImageUploading, project })}</div>
        </div>
        <aside class="video-editor-shell__right">${buildEditorDetailRail({ row: selectedRow, globalAudio, project, rowIndex: selectedRowIndex })}</aside>
      </section>
      ${buildFinalExportPanel({ project, editorState })}
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
  const sideContent = editorShellMode || !editorState.error ? '' : `<p class="video-projects-empty video-projects-empty--error">${escapeHtmlCore(editorState.error)}</p>`;
  return { mainContent, sideContent };
}
