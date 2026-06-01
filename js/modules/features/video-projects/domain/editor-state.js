export const DEFAULT_MUSIC_VOLUME = 0.8;

export function sanitizePipelineHealthMetadata(healthPayload) {
  if (!healthPayload || typeof healthPayload !== 'object') return null;
  const sanitized = {};
  if (typeof healthPayload.ok === 'boolean') sanitized.ok = healthPayload.ok;
  const status = (healthPayload.status || '').toString().trim();
  if (status) sanitized.status = status;
  return Object.keys(sanitized).length ? sanitized : null;
}

export function normalizeEditorState(editorState = {}) {
  if (!editorState || typeof editorState !== 'object') return {};
  const globalAudio = normalizeGlobalAudioState(editorState.global_audio);
  const brandChannel = normalizeBrandChannel(editorState.brandChannel || editorState.brand_channel || editorState.approval_contract_snapshot?.brandChannel);
  return {
    phase: editorState.phase || 'idle',
    remotion_project_id: editorState.remotion_project_id || '',
    remotion_api_url: editorState.remotion_api_url || '',
    pipeline_provider: editorState.pipeline_provider || '',
    pipeline_base_url: editorState.pipeline_base_url || '',
    pipeline_fallback_from: editorState.pipeline_fallback_from || '',
    pipeline_health: sanitizePipelineHealthMetadata(editorState.pipeline_health),
    preview_url: editorState.preview_url || '',
    final_url: editorState.final_url || '',
    composition_hash: editorState.composition_hash || '',
    last_preview_hash: editorState.last_preview_hash || '',
    last_rendered_hash: editorState.last_rendered_hash || '',
    snapshot_id: editorState.snapshot_id || editorState.snapshotId || '',
    snapshot_hash: editorState.snapshot_hash || editorState.snapshotHash || '',
    approval_contract_snapshot: editorState.approval_contract_snapshot && typeof editorState.approval_contract_snapshot === 'object' ? editorState.approval_contract_snapshot : null,
    brandChannel,
    brand_channel: brandChannel,
    dirty: Boolean(editorState.dirty),
    export_status: editorState.export_status || 'idle',
    error: editorState.error || '',
    conflict: editorState.conflict && typeof editorState.conflict === 'object' ? editorState.conflict : null,
    timed_rows: Array.isArray(editorState.timed_rows) ? editorState.timed_rows : [],
    video_assets: Array.isArray(editorState.video_assets) ? editorState.video_assets : [],
    preview_assets: editorState.preview_assets && typeof editorState.preview_assets === 'object' ? editorState.preview_assets : null,
    global_audio: globalAudio,
    updated_at: editorState.updated_at || new Date().toISOString(),
  };
}

export function normalizeBrandChannel(value = 'pelotazo-ecuador') {
  return (value || '').toString().trim().toLowerCase() === 'pelotazo-colombia' ? 'pelotazo-colombia' : 'pelotazo-ecuador';
}

export function normalizeGlobalAudioState(globalAudio = {}) {
  const voiceVolume = Number(globalAudio?.voice?.volume);
  const musicVolume = Number(globalAudio?.music?.volume);
  return {
    voice: {
      volume: Number.isFinite(voiceVolume) ? Math.max(0, Math.min(1, voiceVolume)) : 1,
      muted: Boolean(globalAudio?.voice?.muted),
    },
    music: {
      volume: Number.isFinite(musicVolume) ? Math.max(0, Math.min(1, musicVolume)) : DEFAULT_MUSIC_VOLUME,
      muted: Boolean(globalAudio?.music?.muted),
    },
  };
}
