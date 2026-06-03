export const COMPOSITION_LOCAL_OVERLAY_BASE_URL = 'http://127.0.0.1:3042/api/overlays';
export const COMPOSITION_STATIC_ASSET_BASE_URL = './assets';

export const VIDEO_SEGMENT_EFFECT_ASSETS = [
  { assetId: 'effect-layer-01', fileName: 'effect-layer-01.webm', blendMode: 'screen' },
  { assetId: 'effect-layer-02', fileName: 'effect-layer-02.webm', blendMode: 'multiply' },
];

export const DEFAULT_BRAND_CHANNEL = 'pelotazo-ecuador';
export const BRAND_CHANNEL_ASSETS = {
  'pelotazo-ecuador': {
    channel: 'pelotazo-ecuador',
    label: 'Pelotazo Ecuador',
    logo: {
      assetId: 'brand-logo-ecuador',
      previewPath: 'logo-alpha.webm',
      renderPath: 'overlays/logo-alpha.webm',
      source: 'logo-alpha.webm',
    },
    outro: {
      assetId: 'brand-outro-ecuador',
      previewPath: 'final-ecuador.webm',
      renderPath: 'overlays/final-ecuador.mp4',
      durationSeconds: 30.53,
      label: 'Pelotazo Ecuador',
    },
  },
  'pelotazo-colombia': {
    channel: 'pelotazo-colombia',
    label: 'Pelotazo Colombia',
    logo: {
      assetId: 'brand-logo-colombia',
      previewPath: 'logo-colombia.webm',
      renderPath: 'overlays/logo-colombia.mp4',
      source: 'logo-colombia.webm',
    },
    outro: {
      assetId: 'brand-outro-colombia',
      previewPath: 'final-colombia.webm',
      renderPath: 'overlays/final-colombia.mp4',
      durationSeconds: 30.16,
      label: 'Pelotazo Colombia',
    },
  },
  'final-mundial': {
    channel: 'final-mundial',
    label: 'Final Mundial',
    logo: {
      assetId: 'brand-logo-mundial',
      previewPath: 'logo-mundial.png',
      renderPath: 'overlays/logo-mundial.png',
      source: 'logo-mundial.png',
    },
    outro: {
      assetId: 'brand-outro-mundial',
      previewPath: 'final-mundial.webm',
      renderPath: 'overlays/final-mundial.mp4',
      durationSeconds: 29.3,
      label: 'Final Mundial',
    },
  },
};

export function normalizeBrandChannel(value = DEFAULT_BRAND_CHANNEL) {
  const normalized = (value || '').toString().trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(BRAND_CHANNEL_ASSETS, normalized) ? normalized : DEFAULT_BRAND_CHANNEL;
}

export function resolveBrandChannelAssets(channel = DEFAULT_BRAND_CHANNEL) {
  const normalized = normalizeBrandChannel(channel);
  return BRAND_CHANNEL_ASSETS[normalized];
}

export function resolveBrandChannelPreviewAssetUrl({ channel = DEFAULT_BRAND_CHANNEL, kind = 'logo' } = {}) {
  const assets = resolveBrandChannelAssets(channel);
  const asset = kind === 'outro' ? assets.outro : assets.logo;
  return resolveStaticCompositionAssetUrl(asset.previewPath);
}

export function resolveLocalOverlayAssetUrl(fileName = '') {
  const cleanFileName = (fileName || '').toString().trim().replace(/^\/+/, '');
  if (!cleanFileName) return '';
  return `${COMPOSITION_LOCAL_OVERLAY_BASE_URL}/${cleanFileName}`;
}

export function resolveStaticCompositionAssetUrl(fileName = '') {
  const cleanFileName = (fileName || '').toString().trim().replace(/^\/+/, '');
  if (!cleanFileName) return '';
  return `${COMPOSITION_STATIC_ASSET_BASE_URL}/${cleanFileName}`;
}

export function resolveVideoSegmentEffectAsset(assetId = '') {
  const normalized = (assetId || '').toString().trim();
  return VIDEO_SEGMENT_EFFECT_ASSETS.find((asset) => asset.assetId === normalized) || null;
}

export function resolveVideoSegmentEffectUrl(assetId = '') {
  const asset = resolveVideoSegmentEffectAsset(assetId);
  return asset ? resolveStaticCompositionAssetUrl(asset.fileName) : '';
}
