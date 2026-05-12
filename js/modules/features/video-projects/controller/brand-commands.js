import { normalizeEditorState, normalizeBrandChannel } from '../domain/editor-state.js';
import { resolveBrandChannelAssets, resolveBrandChannelPreviewAssetUrl } from '../composition/overlay-assets.js';

function buildBrandAssetRecords(channelAssets) {
  return {
    [channelAssets.logo.assetId]: {
      assetId: channelAssets.logo.assetId,
      id: channelAssets.logo.assetId,
      type: 'logo',
      role: 'logo',
      previewUrl: resolveBrandChannelPreviewAssetUrl({ channel: channelAssets.channel, kind: 'logo' }),
      publicUrl: resolveBrandChannelPreviewAssetUrl({ channel: channelAssets.channel, kind: 'logo' }),
      renderPath: channelAssets.logo.renderPath,
      status: 'ready',
    },
    [channelAssets.outro.assetId]: {
      assetId: channelAssets.outro.assetId,
      id: channelAssets.outro.assetId,
      type: 'outro',
      role: 'outro',
      previewUrl: resolveBrandChannelPreviewAssetUrl({ channel: channelAssets.channel, kind: 'outro' }),
      publicUrl: resolveBrandChannelPreviewAssetUrl({ channel: channelAssets.channel, kind: 'outro' }),
      renderPath: channelAssets.outro.renderPath,
      durationSeconds: channelAssets.outro.durationSeconds,
      status: 'ready',
    },
  };
}

function applyLocalBrandChannelSnapshot(snapshot = {}, brandChannel) {
  const channelAssets = resolveBrandChannelAssets(brandChannel);
  const next = {
    ...snapshot,
    brandChannel: channelAssets.channel,
    assets: { ...(snapshot.assets || {}), ...buildBrandAssetRecords(channelAssets) },
    globalLayers: {
      ...(snapshot.globalLayers || {}),
      logoAssetId: channelAssets.logo.assetId,
      outroAssetId: channelAssets.outro.assetId,
      logo: {
        ...(snapshot.globalLayers?.logo || {}),
        enabled: snapshot.globalLayers?.logo?.enabled !== false,
        source: channelAssets.logo.source,
        preferredSource: channelAssets.logo.source,
        assetId: channelAssets.logo.assetId,
      },
      outro: { enabled: snapshot.globalLayers?.outro?.enabled !== false, assetId: channelAssets.outro.assetId },
    },
    outro: {
      ...(snapshot.outro || {}),
      enabled: snapshot.outro?.enabled !== false,
      assetId: channelAssets.outro.assetId,
      durationSeconds: channelAssets.outro.durationSeconds,
      label: channelAssets.outro.label,
    },
  };
  next.rows = Array.isArray(snapshot.rows)
    ? snapshot.rows.map((row) => ({ ...row, logo: { ...(row.logo || {}), enabled: row.logo?.enabled !== false, source: channelAssets.logo.source, assetId: channelAssets.logo.assetId } }))
    : snapshot.rows;
  return next;
}

export function createBrandCommands({
  store,
  persistEditorState,
  isApprovalServiceMode,
  commitApprovalSnapshotOperations,
  createSnapshotDraft,
  scheduleApprovalMotionPersistence,
  updateSelectedVideoProjectCompositionPreview,
  renderSelectedVideoProject,
  getSaveTimer,
  setSaveTimer,
  debounceMs,
}) {
  async function updateBrandChannel(value) {
    const state = store.getState();
    const project = state.selectedVideoProject;
    if (!project) return;
    const brandChannel = normalizeBrandChannel(value);

    if (isApprovalServiceMode(project)) {
      const snapshot = applyLocalBrandChannelSnapshot(project.editor_state?.approval_contract_snapshot || {}, brandChannel);
      project._editorRows = Array.isArray(project._editorRows)
        ? project._editorRows.map((row) => ({ ...row, logo: { ...(row.logo || {}), enabled: row.logo?.enabled !== false, source: snapshot.globalLayers.logo.source, assetId: snapshot.globalLayers.logo.assetId } }))
        : project._editorRows;
      project.editor_state = normalizeEditorState({ ...project.editor_state, approval_contract_snapshot: snapshot, timed_rows: project._editorRows, brandChannel, brand_channel: brandChannel, dirty: true, phase: 'editing_dirty' });
      createSnapshotDraft('brandChannel', { type: 'setBrandChannel', brandChannel }, (canonicalSnapshot) => applyLocalBrandChannelSnapshot(canonicalSnapshot, brandChannel));
      updateSelectedVideoProjectCompositionPreview({ project });
      scheduleApprovalMotionPersistence(project);
      return;
    }

    const snapshot = project.editor_state?.approval_contract_snapshot && typeof project.editor_state.approval_contract_snapshot === 'object'
      ? { ...project.editor_state.approval_contract_snapshot, brandChannel }
      : project.editor_state?.approval_contract_snapshot;

    project.editor_state = normalizeEditorState({ ...project.editor_state, approval_contract_snapshot: snapshot, brandChannel, brand_channel: brandChannel, dirty: true, phase: 'editing_dirty' });
    updateSelectedVideoProjectCompositionPreview({ project });
    renderSelectedVideoProject();

    clearTimeout(getSaveTimer());
    setSaveTimer(setTimeout(() => {
      void persistEditorState(project, { approval_contract_snapshot: snapshot, brandChannel, brand_channel: brandChannel, dirty: true, phase: 'editing_dirty' });
    }, debounceMs));
  }

  return { updateBrandChannel };
}
