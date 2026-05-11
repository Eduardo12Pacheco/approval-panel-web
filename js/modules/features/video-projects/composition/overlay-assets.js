export const COMPOSITION_LOCAL_OVERLAY_BASE_URL = 'http://127.0.0.1:3042/api/overlays';

export const VIDEO_SEGMENT_EFFECT_ASSETS = [
  { assetId: 'effect-layer-01', fileName: 'effect-layer-01.mp4', blendMode: 'screen' },
  { assetId: 'effect-layer-02', fileName: 'effect-layer-02.mp4', blendMode: 'multiply' },
];

export function resolveLocalOverlayAssetUrl(fileName = '') {
  const cleanFileName = (fileName || '').toString().trim().replace(/^\/+/, '');
  if (!cleanFileName) return '';
  return `${COMPOSITION_LOCAL_OVERLAY_BASE_URL}/${cleanFileName}`;
}

export function resolveVideoSegmentEffectAsset(assetId = '') {
  const normalized = (assetId || '').toString().trim();
  return VIDEO_SEGMENT_EFFECT_ASSETS.find((asset) => asset.assetId === normalized) || null;
}

export function resolveVideoSegmentEffectUrl(assetId = '') {
  const asset = resolveVideoSegmentEffectAsset(assetId);
  return asset ? resolveLocalOverlayAssetUrl(asset.fileName) : '';
}
