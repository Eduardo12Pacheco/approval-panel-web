import { buildPreviewCompositionContract } from './composition-contract.js';
import { normalizePreparedContractRows } from '../data/contract-pipeline-client.js';
import { normalizeGlobalAudioState } from '../domain/editor-state.js';

export function hashString(input) {
  let hash = 2166136261;
  for (const char of String(input)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function computeCompositionHash(project) {
  const contractSnapshot = project?.editor_state?.approval_contract_snapshot;
  if (contractSnapshot?.snapshotHash) return contractSnapshot.snapshotHash;
  const rows = Array.isArray(project._editorRows) ? project._editorRows : (project.editor_state?.timed_rows || []);
  const globalAudio = normalizeGlobalAudioState(project._globalAudio);
  const payload = JSON.stringify({ rows, globalAudio });
  return hashString(payload);
}

export function buildCompositionPayload(project) {
  const contractSnapshot = project?.editor_state?.approval_contract_snapshot;
  if (contractSnapshot?.contractVersion === 'approval-editor-service-v1') {
    return {
      rows: normalizePreparedContractRows(contractSnapshot.rows),
      audio: contractSnapshot.audio,
      contract: contractSnapshot,
      manifest: { version: 1, assets: contractSnapshot.assets || {} },
      snapshotHash: contractSnapshot.snapshotHash,
      snapshotId: contractSnapshot.snapshotId,
    };
  }
  const rows = Array.isArray(project._editorRows) ? project._editorRows : (project.editor_state?.timed_rows || []);
  const globalAudio = normalizeGlobalAudioState(project._globalAudio);
  const legacyPayload = {
    rows: rows.map((row) => ({
      id: row.id,
      selectedAssetId: row.selectedAssetId || null,
      motion: row.motion || 'Zoom 110',
      dust: { enabled: Boolean(row.dust?.enabled) },
      logo: { enabled: row.logo?.enabled !== false },
      filter: { enabled: Boolean(row.filter?.enabled), mode: row.filter?.mode || 'cover' },
      transition: row.transition || 'none',
      startTime: row.startTime,
      endTime: row.endTime,
    })),
    audio: globalAudio,
  };

  const previewContract = buildPreviewCompositionContract(project, rows);
  const manifestImages = Array.isArray(previewContract?.manifest?.images) ? previewContract.manifest.images : [];
  const manifestVideos = Array.isArray(previewContract?.manifest?.videos) ? previewContract.manifest.videos : [];
  const manifestEffects = Array.isArray(previewContract?.manifest?.effects) ? previewContract.manifest.effects : [];
  const hasManifestImages = manifestImages.some((item) => item?.rowId && item?.assetId && item?.mediaUrl);
  const hasManifestAudio = Boolean(previewContract?.manifest?.audio?.voice?.mediaUrl || previewContract?.manifest?.audio?.music?.mediaUrl);
  if (!hasManifestImages && !hasManifestAudio) return legacyPayload;

  const contract = {
    fps: 30,
    renderProfile: { fps: 30 },
    audio: {
      voiceAssetId: previewContract?.manifest?.audio?.voice?.assetId || 'voice-asset',
      musicAssetId: previewContract?.manifest?.audio?.music?.assetId || 'music-asset',
      voice: globalAudio.voice,
      music: {
        ...globalAudio.music,
        loop: true,
        fadeInSeconds: 0.5,
        fadeOutSeconds: 1,
      },
    },
    segments: (Array.isArray(previewContract.rows) ? previewContract.rows : []).map((row, index) => {
      const rowId = row.id || row.rowId;
      const media = row.media?.kind === 'video-segment'
        ? {
          kind: 'video-segment',
          sourceVideoAssetId: row.media.sourceVideoAssetId,
          sourceInSeconds: Number(row.media.sourceInSeconds || 0),
          durationSeconds: Number(row.media.durationSeconds || ((row.effectiveEndTime ?? row.endTime ?? 0) - (row.startTime || 0))),
          overlayColor: '#3835AF',
          overlayOpacity: 0.3,
          effect1AssetId: 'effect-layer-01',
          effect2AssetId: 'effect-layer-02',
        }
        : { kind: 'image' };
      return {
      rowId,
      phrase: row.phrase || '',
      startTime: Number(row.startTime || 0),
      endTime: Number(row.endTime || 0),
      effectiveEndTime: Number(row.effectiveEndTime ?? row.endTime ?? 0),
      selectedAssetId: row.selectedAssetId || manifestImages.find((item) => item?.rowId === rowId)?.assetId || null,
      media,
      motion: row.motion || 'Zoom 110',
      dust: { enabled: Boolean(row.dust?.enabled) },
      logo: { enabled: row.logo?.enabled !== false },
      filter: { enabled: Boolean(row.filter?.enabled), mode: row.filter?.mode || 'cover' },
      transition: row.transition || 'none',
      caption: row.caption || '',
      id: index + 1,
    };
    }),
    globalLayers: {},
    outro: { enabled: true, durationSeconds: 2, label: 'Gracias por mirar' },
  };

  const assets = {};
  for (const item of manifestImages) {
    const assetId = (item?.assetId || '').toString().trim();
    const mediaUrl = (item?.mediaUrl || '').toString().trim();
    if (!assetId || !mediaUrl) continue;
    assets[assetId] = { status: 'ready', renderPath: mediaUrl };
  }
  for (const item of manifestVideos.concat(manifestEffects)) {
    const assetId = (item?.assetId || '').toString().trim();
    const mediaUrl = (item?.mediaUrl || '').toString().trim();
    if (!assetId || !mediaUrl) continue;
    assets[assetId] = { status: 'ready', renderPath: mediaUrl, type: 'video' };
  }
  const voiceMediaUrl = (previewContract?.manifest?.audio?.voice?.mediaUrl || '').toString().trim();
  const musicMediaUrl = (previewContract?.manifest?.audio?.music?.mediaUrl || '').toString().trim();
  if (voiceMediaUrl) assets[contract.audio.voiceAssetId] = { status: 'ready', renderPath: voiceMediaUrl };
  if (musicMediaUrl) assets[contract.audio.musicAssetId] = { status: 'ready', renderPath: musicMediaUrl };

  return {
    ...legacyPayload,
    contract,
    manifest: {
      version: 1,
      assets,
    },
  };
}
