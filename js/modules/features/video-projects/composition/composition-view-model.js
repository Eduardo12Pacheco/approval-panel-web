import { resolveCandidateImageUrl } from '../domain/image-candidates.js';
import {
  buildPreviewCompositionContract,
  resolvePreparedMediaUrl,
  resolvePreviewAudioUrls,
  resolveRowImageUrlFromContract,
} from './composition-contract.js';

export const COMPOSITION_DUST_PREVIEW_URL = './assets/dust-preview.webm';
export const COMPOSITION_LOCAL_OVERLAY_BASE_URL = 'http://127.0.0.1:3042/api/overlays';
export const COMPOSITION_DUST_PREVIEW_URLS = {
  'dust-1': `${COMPOSITION_LOCAL_OVERLAY_BASE_URL}/dust-1.mp4`,
  'dust-2': `${COMPOSITION_LOCAL_OVERLAY_BASE_URL}/dust-2.mp4`,
};
export const COMPOSITION_LOCAL_LOGO_URL = './assets/logo-alpha.webm';
export const COMPOSITION_LOCAL_GREEN_LOGO_URL = '../02-Video-Engine/assets/overlays/logo-green.mp4';
const LOCAL_LOGO_SOURCE_ALIASES = new Set(['logo-alpha.webm', './assets/logo-alpha.webm', 'assets/logo-alpha.webm', 'logo-green.mp4', './assets/logo-green.mp4', 'assets/logo-green.mp4']);

export function buildCompositionAssetSignature({ dustWebmUrl, voiceUrl, musicUrl } = {}) {
  return [dustWebmUrl || '', voiceUrl || '', musicUrl || ''].join('::');
}

export function resolveCanonicalPreviewAssetUrl(project = {}, assetId = '') {
  const snapshot = project?.editor_state?.approval_contract_snapshot;
  const asset = snapshot?.assets?.[assetId];
  return (asset?.previewUrl || asset?.publicUrl || asset?.renderPath || '').toString().trim();
}

export function resolveCompositionDustUrl(project = {}, rows = []) {
  const activeDust = rows.find((row) => row?.dust?.enabled && (row?.dust?.assetId || row?.dust?.type));
  const assetId = activeDust?.dust?.assetId || '';
  return resolveCanonicalPreviewAssetUrl(project, assetId) || COMPOSITION_DUST_PREVIEW_URLS[activeDust?.dust?.type] || COMPOSITION_DUST_PREVIEW_URL;
}

export function resolveCompositionDustUrlForRow(project = {}, row = {}) {
  if (!row?.dust?.enabled) return '';
  const assetId = row?.dust?.assetId || '';
  return resolveCanonicalPreviewAssetUrl(project, assetId) || COMPOSITION_DUST_PREVIEW_URLS[row?.dust?.type] || '';
}

function resolveCompositionVideoUrlForRow(project = {}, row = {}, contract = {}) {
  if (row?.media?.kind !== 'video-segment') return '';
  const assetId = row.media.sourceVideoAssetId || '';
  const prepared = Array.isArray(contract?.manifest?.videos) ? contract.manifest.videos : [];
  const preparedByRow = prepared.find((item) => item?.rowId === row?.rowId || item?.rowId === row?.id || item?.assetId === assetId);
  const canonical = preparedByRow?.mediaUrl ? resolvePreparedMediaUrl(preparedByRow.mediaUrl, contract?.remotionApiUrl) : '';
  if (canonical) return canonical;
  const videos = [project.video_assets, project.videos, project.custom_videos, project.editor_state?.video_assets].find((items) => Array.isArray(items)) || [];
  const matched = videos.find((video) => [video.id, video.assetId, video.src, video.public_url, video.storage_public_url].some((value) => value && value === assetId));
  return (matched?.src || matched?.public_url || matched?.storage_public_url || row.media.sourceVideoSrc || '').toString();
}

function resolveCompositionEffectUrl(contract = {}, assetId = '') {
  const effects = Array.isArray(contract?.manifest?.effects) ? contract.manifest.effects : [];
  const effect = effects.find((item) => item?.assetId === assetId);
  return resolvePreparedMediaUrl(effect?.mediaUrl || `/api/overlays/${assetId}.mp4`, contract?.remotionApiUrl);
}

function resolveCompositionVideoMedia(project = {}, row = {}, contract = {}) {
  if (row?.media?.kind !== 'video-segment') return row?.media;
  return {
    ...row.media,
    sourceVideoSrc: resolveCompositionVideoUrlForRow(project, row, contract),
    effect1Src: resolveCompositionEffectUrl(contract, row.media.effect1AssetId || 'effect-layer-01'),
    effect1BlendMode: 'screen',
    effect2Src: resolveCompositionEffectUrl(contract, row.media.effect2AssetId || 'effect-layer-02'),
    effect2BlendMode: 'multiply',
    overlayColor: row.media.overlayColor || '#3835AF',
    overlayOpacity: Number(row.media.overlayOpacity ?? 0.3),
  };
}

export function resolveCompositionLogoUrl(project = {}) {
  const snapshot = project?.editor_state?.approval_contract_snapshot;
  const logo = snapshot?.globalLayers?.logo || {};
  const canonicalUrl = resolveCanonicalPreviewAssetUrl(project, logo.assetId);
  if (canonicalUrl) return canonicalUrl;
  const source = (logo.source || '').toString().trim();
  if (!source || LOCAL_LOGO_SOURCE_ALIASES.has(source)) return COMPOSITION_LOCAL_LOGO_URL;
  return source || '';
}

export function resolveRowImageUrl(row = {}, rowIndex = 0, project = {}) {
  const contract = buildPreviewCompositionContract(project, []);
  return resolveRowImageUrlFromContract({
    row,
    rowIndex,
    contract,
    project,
    resolveCandidateImageUrl,
  });
}

export function buildCompositionRows(rows = [], project = {}) {
  const contract = buildPreviewCompositionContract(project, rows);
  const sourceRows = Array.isArray(contract.rows) ? contract.rows : [];
  return sourceRows.map((row, index) => ({
    ...row,
    media: resolveCompositionVideoMedia(project, row, contract),
    dust: row?.dust
      ? {
          ...row.dust,
          src: resolveCompositionDustUrlForRow(project, row),
          blendMode: row.dust.blendMode || 'screen',
        }
      : row?.dust,
    endTime: row.effectiveEndTime,
    image: row.image || resolveRowImageUrlFromContract({ row, rowIndex: index, contract, project, resolveCandidateImageUrl }),
  }));
}

export function buildCompositionPreviewAssets({ project = {}, rows = [] } = {}) {
  const contract = buildPreviewCompositionContract(project, rows);
  const { voiceUrl, musicUrl } = resolvePreviewAudioUrls({ contract, project });
  const compositionRows = buildCompositionRows(rows, project);
  const dustWebmUrl = resolveCompositionDustUrl(project, compositionRows);
  const logoUrl = resolveCompositionLogoUrl(project);
  const assetSignature = buildCompositionAssetSignature({
    dustWebmUrl,
    voiceUrl,
    musicUrl,
  });

  return {
    contract,
    voiceUrl,
    musicUrl,
    compositionRows,
    dustWebmUrl,
    logoUrl,
    assetSignature,
  };
}

export function resolveVideoProjectPreviewMediaForCheck({ row = {}, rowIndex = 0, project = {} } = {}) {
  const contract = buildPreviewCompositionContract(project, []);
  const { voiceUrl, musicUrl } = resolvePreviewAudioUrls({ contract, project });
  return {
    rowImageUrl: resolveRowImageUrlFromContract({ row, rowIndex, contract, project, resolveCandidateImageUrl }),
    voiceUrl,
    musicUrl,
  };
}

export function resolveVideoProjectCompositionContractForCheck({ project = {}, rows = [] } = {}) {
  const contract = buildPreviewCompositionContract(project, rows);
  const compositionRows = (Array.isArray(contract.rows) ? contract.rows : []).map((row, index) => ({
    ...row,
    media: resolveCompositionVideoMedia(project, row, contract),
    endTime: row.effectiveEndTime,
    image: row.image || resolveRowImageUrlFromContract({ row, rowIndex: index, contract, project, resolveCandidateImageUrl }),
  }));
  return {
    contract,
    compositionRows,
    audio: resolvePreviewAudioUrls({ contract, project }),
  };
}
