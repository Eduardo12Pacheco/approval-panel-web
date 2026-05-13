import { buildCompositionPayload, computeCompositionHash } from '../composition/composition-payload.js';
import { prepareVideoCompositionContract, normalizePreparedContractRows } from '../data/contract-pipeline-client.js';
import { normalizeEditorState, sanitizePipelineHealthMetadata } from '../domain/editor-state.js';

function pickDownloadableRenderPath(renderResult) {
  const render = renderResult?.render || {};
  return [render.outputPath, render.finalPath, render.finalUrl, renderResult?.outputPath, renderResult?.finalPath, renderResult?.finalUrl]
    .find((value) => typeof value === 'string' && value.trim())
    ?.trim() || '';
}

function isRenderedWithoutDownloadablePath(renderResult) {
  return renderResult?.render?.status === 'rendered' && !pickDownloadableRenderPath(renderResult);
}

export function createPreviewExportCommands({
  api,
  store,
  ui,
  persistEditorState,
  isApprovalServiceMode,
  createApprovalServiceClient,
  renderSelectedVideoProject,
}) {
  async function preparePreview() {
    const state = store.getState();
    const project = state.selectedVideoProject;
    if (!project) return;

    try {
      await persistEditorState(project, { phase: 'preparing', dirty: false, error: '', remotion_api_url: state.settings?.remotionApiUrl || '', pipeline_base_url: (state.settings?.approvalPipelineBaseUrl || '').toString().trim() });
      renderSelectedVideoProject();

      const preparedContract = await prepareVideoCompositionContract({ project, settings: state.settings, api });
      project._editorRows = preparedContract.timedRows;
      project._previewAssets = preparedContract.previewAssets;
      project._globalAudio = preparedContract.globalAudio;
      if (preparedContract.approvalContractSnapshot) {
        project.editor_state = normalizeEditorState({ ...project.editor_state, approval_contract_snapshot: preparedContract.approvalContractSnapshot, snapshot_id: preparedContract.snapshotId, snapshot_hash: preparedContract.snapshotHash });
      }

      await persistEditorState(project, {
        phase: 'preview_ready',
        remotion_project_id: preparedContract.compositionProjectId,
        pipeline_provider: preparedContract.provider || '',
        pipeline_base_url: preparedContract.providerMetadata?.baseUrl || '',
        pipeline_fallback_from: preparedContract.providerMetadata?.fallbackFrom || '',
        pipeline_health: sanitizePipelineHealthMetadata(preparedContract.providerMetadata?.health),
        timed_rows: preparedContract.timedRows,
        preview_assets: project._previewAssets,
        approval_contract_snapshot: preparedContract.approvalContractSnapshot || null,
        snapshot_id: preparedContract.snapshotId || '',
        snapshot_hash: preparedContract.snapshotHash || '',
        preview_url: '',
      });
      renderSelectedVideoProject();

      const compositionHash = computeCompositionHash(project);
      await persistEditorState(project, {
        phase: 'preview_ready',
        remotion_project_id: preparedContract.compositionProjectId,
        pipeline_provider: preparedContract.provider || '',
        pipeline_base_url: preparedContract.providerMetadata?.baseUrl || '',
        pipeline_fallback_from: preparedContract.providerMetadata?.fallbackFrom || '',
        pipeline_health: sanitizePipelineHealthMetadata(preparedContract.providerMetadata?.health),
        preview_url: '',
        composition_hash: compositionHash,
        last_preview_hash: compositionHash,
        last_rendered_hash: compositionHash,
        approval_contract_snapshot: preparedContract.approvalContractSnapshot || null,
        snapshot_id: preparedContract.snapshotId || '',
        snapshot_hash: preparedContract.snapshotHash || '',
        dirty: false,
        error: '',
        export_status: 'idle',
      });
      ui.toast('Editor preparado');
    } catch (err) {
      console.error(err);
      await persistEditorState(project, { phase: 'error', error: err?.message || 'No se pudo preparar el editor' });
      ui.toast('Error preparando editor');
    } finally {
      renderSelectedVideoProject();
    }
  }

  async function refreshPreview() {
    const state = store.getState();
    const project = state.selectedVideoProject;
    if (!project) return;

    if (isApprovalServiceMode(project)) {
      await persistEditorState(project, { phase: 'preview_ready', dirty: false, error: '', last_preview_hash: project.editor_state.snapshot_hash });
      renderSelectedVideoProject();
      ui.toast('Preview actualizada desde snapshot canónico');
      return;
    }

    const remotion = api.createRemotionClient({ resolveBaseUrl: () => store.getState()?.settings?.remotionApiUrl || '' });
    const remotionProjectId = project.editor_state?.remotion_project_id;
    if (!remotionProjectId) {
      ui.toast('No hay proyecto Remotion vinculado');
      return;
    }

    try {
      if (!Array.isArray(project._editorRows) || !project._editorRows.length) {
        const currentRows = normalizePreparedContractRows(project.editor_state?.timed_rows);
        if (currentRows.length) project._editorRows = currentRows;
        else {
          const currentStatus = await remotion.status(remotionProjectId);
          const recoveredRows = normalizePreparedContractRows(currentStatus?.project?.rows);
          if (recoveredRows.length) {
            project._editorRows = recoveredRows;
            project.editor_state = normalizeEditorState({ ...project.editor_state, timed_rows: recoveredRows, preview_assets: currentStatus?.previewAssets || project.editor_state?.preview_assets || null });
            project._previewAssets = project.editor_state.preview_assets;
          }
        }
      }
      if (!Array.isArray(project._editorRows) || !project._editorRows.length) throw new Error('No hay filas cronometradas para actualizar la preview.');

      await persistEditorState(project, { phase: 'preview_rendering', error: '' });
      renderSelectedVideoProject();
      await remotion.updateComposition(remotionProjectId, buildCompositionPayload(project));
      const preview = await remotion.renderPreview(remotionProjectId);
      const refreshedStatus = await remotion.status(remotionProjectId);
      project._previewAssets = refreshedStatus?.previewAssets || project._previewAssets || null;
      const previewReady = Boolean(refreshedStatus?.preview?.exists || refreshedStatus?.preview?.outputPath);
      if (!previewReady) throw new Error('Remotion no generó el archivo de preview.');
      const previewUrl = remotion.previewDownloadUrl(remotionProjectId);
      const compositionHash = computeCompositionHash(project);
      await persistEditorState(project, { phase: 'preview_ready', preview_url: previewUrl, last_preview_hash: compositionHash, dirty: false, error: '', diagnostics: preview?.diagnostics || refreshedStatus?.diagnostics || null, preview_assets: project._previewAssets });
      ui.toast('Preview actualizada');
    } catch (err) {
      console.error(err);
      await persistEditorState(project, { phase: 'error', error: err?.message || 'No se pudo actualizar preview' });
      ui.toast('Error actualizando preview');
    } finally {
      renderSelectedVideoProject();
    }
  }

  async function exportFinal() {
    const state = store.getState();
    const project = state.selectedVideoProject;
    if (!project) return;
    const editorState = project.editor_state || {};
    if (editorState.dirty && !window.confirm('Hay cambios pendientes de render final. ¿Querés exportar ahora?')) return;

    if (isApprovalServiceMode(project)) {
      const client = createApprovalServiceClient(project);
      const projectId = project.editor_state?.remotion_project_id;
      const snapshotHash = project.editor_state?.snapshot_hash;
      try {
        await persistEditorState(project, { phase: 'final_rendering', export_status: 'rendering', error: '' });
        renderSelectedVideoProject();
        const result = await client.renderFinal(projectId, { snapshotHash });
        let finalUrl = pickDownloadableRenderPath(result);
        if (!finalUrl && isRenderedWithoutDownloadablePath(result)) throw new Error('Approval Editor no devolvió una URL final descargable. Revisá que el render adapter de 02-Video-Engine esté configurado y haya generado outputPath.');
        if (!finalUrl && typeof client.finalDownload === 'function') {
          const download = await client.finalDownload(projectId);
          finalUrl = typeof download?.finalUrl === 'string' ? download.finalUrl.trim() : '';
        }
        if (!finalUrl) throw new Error('Approval Editor no devolvió una URL final descargable. Revisá que el render adapter de 02-Video-Engine esté configurado y haya generado outputPath.');
        await persistEditorState(project, { phase: 'final_ready', final_url: finalUrl, export_status: 'ready', last_rendered_hash: result?.lastRenderedSnapshotHash || snapshotHash, dirty: false, error: '', diagnostics: result?.diagnostics || null });
        ui.toast('Exportación lista. Descargá el video final.');
      } catch (err) {
        console.error(err);
        await persistEditorState(project, { phase: 'error', export_status: 'error', error: err?.message || 'No se pudo exportar el video final' });
        ui.toast('Error exportando video final');
      } finally {
        renderSelectedVideoProject();
      }
      return;
    }

    const remotion = api.createRemotionClient({ resolveBaseUrl: () => store.getState()?.settings?.remotionApiUrl || '' });
    const remotionProjectId = editorState.remotion_project_id;
    if (!remotionProjectId) {
      ui.toast('No hay proyecto Remotion vinculado');
      return;
    }

    try {
      await persistEditorState(project, { phase: 'final_rendering', export_status: 'rendering', error: '' });
      renderSelectedVideoProject();
      await remotion.updateComposition(remotionProjectId, buildCompositionPayload(project));
      const result = await remotion.renderFinal(remotionProjectId);
      const finalUrl = remotion.finalDownloadUrl(remotionProjectId);
      await persistEditorState(project, { phase: 'final_ready', final_url: finalUrl, export_status: 'ready', last_rendered_hash: computeCompositionHash(project), dirty: false, error: '', diagnostics: result?.diagnostics || null });
      ui.toast('Exportación lista. Descargá el video final.');
    } catch (err) {
      console.error(err);
      await persistEditorState(project, { phase: 'error', export_status: 'error', error: err?.message || 'No se pudo exportar el video final' });
      ui.toast('Error exportando video final');
    } finally {
      renderSelectedVideoProject();
    }
  }

  return { preparePreview, refreshPreview, exportFinal };
}
