function finitePositiveDimension(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function resolveImageDimensions(asset = {}, fallback = {}) {
  const width = finitePositiveDimension(asset.imageWidth ?? asset.width ?? asset.metadata?.imageWidth ?? asset.metadata?.width ?? fallback.imageWidth ?? fallback.width ?? fallback.metadata?.imageWidth ?? fallback.metadata?.width);
  const height = finitePositiveDimension(asset.imageHeight ?? asset.height ?? asset.metadata?.imageHeight ?? asset.metadata?.height ?? fallback.imageHeight ?? fallback.height ?? fallback.metadata?.imageHeight ?? fallback.metadata?.height);
  if (!width || !height) return {};
  return { imageWidth: width, imageHeight: height };
}

function normalizeAsset(asset = {}, fallback = {}) {
  const assetId = asset.assetId || asset.id || fallback.assetId;
  if (!assetId) throw Object.assign(new Error("assetId is required"), { code: "invalid_asset" });
  const dimensions = resolveImageDimensions(asset, fallback);
  const metadata = { ...(fallback.metadata || {}), ...(asset.metadata || {}) };
  if (dimensions.imageWidth && dimensions.imageHeight) {
    metadata.imageWidth = dimensions.imageWidth;
    metadata.imageHeight = dimensions.imageHeight;
  }
  return {
    assetId,
    id: assetId,
    type: asset.type || fallback.type || "image",
    role: asset.role || fallback.role || "image",
    source: asset.source || { kind: "approval-editor-service" },
    publicUrl: asset.publicUrl || asset.public_url || asset.previewUrl || asset.url || null,
    previewUrl: asset.previewUrl || asset.publicUrl || asset.public_url || asset.url || null,
    renderPath: asset.renderPath || asset.localPath || asset.previewUrl || asset.publicUrl || asset.public_url || asset.url || null,
    storageBucket: asset.storageBucket || asset.storage_bucket || null,
    storagePath: asset.storagePath || asset.storage_path || null,
    mimeType: asset.mimeType || asset.mime_type || null,
    ...(dimensions.imageWidth && dimensions.imageHeight ? dimensions : {}),
    metadata,
    status: asset.status || "ready",
  };
}

function resolveAssetUrl(snapshot = {}, assetId) {
  const asset = snapshot?.assets?.[assetId];
  return asset?.previewUrl || asset?.publicUrl || asset?.renderPath || "";
}

module.exports = { normalizeAsset, resolveAssetUrl };
