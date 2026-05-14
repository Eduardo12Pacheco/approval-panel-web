import { resolveCandidateImageUrl } from '../domain/image-candidates.js';
import { findProjectVideoAsset } from '../domain/video-assets.js';
import {
  COMPOSITION_LOCAL_OVERLAY_BASE_URL,
  resolveBrandChannelAssets,
  resolveBrandChannelPreviewAssetUrl,
  resolveVideoSegmentEffectAsset,
  resolveVideoSegmentEffectUrl,
} from './overlay-assets.js';
import {
  buildPreviewCompositionContract,
  resolvePreparedMediaUrl,
  resolvePreviewAudioUrls,
  resolveRowImageUrlFromContract,
} from './composition-contract.js';

export const COMPOSITION_DUST_PREVIEW_URL = './assets/dust-1.webm';
export const COMPOSITION_DUST_PREVIEW_URLS = {
  'dust-1': './assets/dust-1.webm',
  'dust-2': './assets/dust-2.webm',
};
export const COMPOSITION_LOCAL_LOGO_URL = './assets/logo-alpha.webm';
export const COMPOSITION_LOCAL_GREEN_LOGO_URL = '../02-Video-Engine/assets/overlays/logo-green.mp4';
const LOCAL_LOGO_SOURCE_ALIASES = new Set(['logo-alpha.webm', './assets/logo-alpha.webm', 'assets/logo-alpha.webm', 'logo-green.mp4', './assets/logo-green.mp4', 'assets/logo-green.mp4']);

export function buildCompositionAssetSignature({ dustWebmUrl, logoUrl, outroUrl, voiceUrl, musicUrl } = {}) {
  return [dustWebmUrl || '', logoUrl || '', outroUrl || '', voiceUrl || '', musicUrl || ''].join('::');
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
  const matched = findProjectVideoAsset(project, assetId);
  return (matched?.src || matched?.public_url || matched?.storage_public_url || row.media.sourceVideoSrc || '').toString();
}

function resolveCompositionEffectUrl(contract = {}, assetId = '') {
  const effects = Array.isArray(contract?.manifest?.effects) ? contract.manifest.effects : [];
  const effect = effects.find((item) => item?.assetId === assetId);
  // Effect assets are served statically from the CDN origin.
  // Never resolve against localhost remotionApiUrl — browser ORB blocks
  // video from http://127.0.0.1 on https:// pages.
  if (effect?.mediaUrl && /^https?:\/\//i.test(effect.mediaUrl)) return effect.mediaUrl;
  const localEffect = resolveVideoSegmentEffectAsset(assetId);
  return localEffect ? resolveVideoSegmentEffectUrl(assetId) : '';
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
  const brandChannel = snapshot?.brandChannel || project?.editor_state?.brandChannel || project?.editor_state?.brand_channel;
  const logo = snapshot?.globalLayers?.logo || {};
  const channelAssetId = logo.assetId || snapshot?.globalLayers?.logoAssetId || resolveBrandChannelAssets(brandChannel).logo.assetId;
  const canonicalUrl = resolveCanonicalPreviewAssetUrl(project, channelAssetId);
  if (canonicalUrl) return canonicalUrl;
  const source = (logo.source || '').toString().trim();
  if (!source || LOCAL_LOGO_SOURCE_ALIASES.has(source)) return COMPOSITION_LOCAL_LOGO_URL;
  return source || '';
}

export function resolveCompositionOutroUrl(project = {}) {
  const snapshot = project?.editor_state?.approval_contract_snapshot;
  const brandChannel = snapshot?.brandChannel || project?.editor_state?.brandChannel || project?.editor_state?.brand_channel;
  const outro = snapshot?.globalLayers?.outro || snapshot?.outro || {};
  const channelAssetId = outro.assetId || snapshot?.globalLayers?.outroAssetId || resolveBrandChannelAssets(brandChannel).outro.assetId;
  const canonicalUrl = resolveCanonicalPreviewAssetUrl(project, channelAssetId);
  if (canonicalUrl) return canonicalUrl;
  return resolveBrandChannelPreviewAssetUrl({ channel: brandChannel, kind: 'outro' });
}

export function resolveCompositionOutroDurationSeconds(project = {}) {
  const snapshot = project?.editor_state?.approval_contract_snapshot;
  const brandChannel = snapshot?.brandChannel || project?.editor_state?.brandChannel || project?.editor_state?.brand_channel;
  const assetId = snapshot?.globalLayers?.outroAssetId || snapshot?.globalLayers?.outro?.assetId || snapshot?.outro?.assetId;
  const assetDuration = Number(snapshot?.assets?.[assetId]?.durationSeconds);
  if (Number.isFinite(assetDuration) && assetDuration > 0) return assetDuration;
  const outroDuration = Number(snapshot?.outro?.durationSeconds);
  if (Number.isFinite(outroDuration) && outroDuration > 0) return outroDuration;
  return resolveBrandChannelAssets(brandChannel).outro.durationSeconds;
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
  const logoUrl = resolveCompositionLogoUrl(project);
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
    logo: row?.logo ? { ...row.logo, source: logoUrl } : row?.logo,
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
  const outroUrl = resolveCompositionOutroUrl(project);
  const outroDurationSeconds = resolveCompositionOutroDurationSeconds(project);
  const assetSignature = buildCompositionAssetSignature({
    dustWebmUrl,
    logoUrl,
    outroUrl,
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
    outroUrl,
    outroDurationSeconds,
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
