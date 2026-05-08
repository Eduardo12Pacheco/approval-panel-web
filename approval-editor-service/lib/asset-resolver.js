function normalizeAsset(asset = {}, fallback = {}) {
  const assetId = asset.assetId || asset.id || fallback.assetId;
  if (!assetId) throw Object.assign(new Error("assetId is required"), { code: "invalid_asset" });
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
    status: asset.status || "ready",
  };
}

function resolveAssetUrl(snapshot = {}, assetId) {
  const asset = snapshot?.assets?.[assetId];
  return asset?.previewUrl || asset?.publicUrl || asset?.renderPath || "";
}

module.exports = { normalizeAsset, resolveAssetUrl };
