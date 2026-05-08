const { computeApprovalSnapshotHash } = require("./hash");
const { normalizeAsset } = require("./asset-resolver");
const { findMotionPreset } = require("./motion-presets");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function findRow(snapshot, rowId) {
  const row = snapshot.rows.find((candidate) => candidate.rowId === rowId || candidate.id === rowId);
  if (!row) throw Object.assign(new Error(`unknown row: ${rowId}`), { code: "unknown_row" });
  return row;
}

function normalizeDustType(value) {
  if (value === "dust-1" || value === "dust-2") return value;
  throw Object.assign(new Error("dust type must be dust-1 or dust-2"), { code: "invalid_dust_type" });
}

function finalize(next) {
  next.render = { ...(next.render || {}), status: "idle", updatedAt: new Date().toISOString() };
  next.snapshotId = `${next.projectId}:${Date.now()}`;
  next.snapshotHash = computeApprovalSnapshotHash(next);
  return next;
}

function applyContractOperations(snapshot, operations = []) {
  const next = clone(snapshot);
  next.assets = next.assets || {};
  next.rows = Array.isArray(next.rows) ? next.rows : [];

  for (const op of operations) {
    if (!op || typeof op !== "object") continue;
    if (op.type === "setRowImage") {
      const row = findRow(next, op.rowId);
      const asset = normalizeAsset(op.asset || { assetId: op.assetId, previewUrl: op.previewUrl, renderPath: op.renderPath });
      next.assets[asset.assetId] = asset;
      row.selectedAssetId = asset.assetId;
      if (!row.candidates?.some((candidate) => candidate.assetId === asset.assetId)) {
        row.candidates = [...(row.candidates || []), { id: `candidate-${row.rowId}-${asset.assetId}`, assetId: asset.assetId, source: asset.source, publicPath: asset.publicUrl, reason: "row-specific replacement" }];
      }
    } else if (op.type === "setRowMotion") {
      const row = findRow(next, op.rowId);
      const preset = findMotionPreset(op.motionPresetId || op.presetId || op.name);
      row.motionPresetId = op.motionPresetId || op.presetId || preset?.name || row.motionPresetId || "custom";
      row.motion = { ...(preset || {}), ...(op.motion || {}) };
      delete row.motion.category;
      delete row.motion.name;
    } else if (op.type === "setRowDust") {
      const row = findRow(next, op.rowId);
      const type = normalizeDustType(op.dustType || op.type || row.dust?.type || "dust-1");
      row.dust = { enabled: op.enabled !== false, type, assetId: type, opacity: Number(op.opacity ?? row.dust?.opacity ?? 0.36), blendMode: "screen" };
    } else if (op.type === "setLogo") {
      next.globalLayers = next.globalLayers || {};
      next.globalLayers.logo = { enabled: op.enabled !== false, source: op.source || "logo-alpha.webm", preferredSource: "logo-alpha.webm", assetId: op.assetId || null };
      for (const row of next.rows) row.logo = { enabled: op.enabled !== false, source: op.source || "logo-alpha.webm" };
    } else if (op.type === "setAudio") {
      const kind = op.kind === "voice" ? "voice" : "music";
      next.audio = next.audio || {};
      next.audio[kind] = { ...(next.audio[kind] || {}), ...(op.settings || {}) };
      if (Number.isFinite(Number(next.audio[kind].volume))) next.audio[kind].volume = Math.max(0, Math.min(1, Number(next.audio[kind].volume)));
      if (op.asset) {
        const asset = normalizeAsset(op.asset, { type: kind === "music" ? "music" : "audio", role: kind });
        next.assets[asset.assetId] = asset;
        next.audio[kind].assetId = asset.assetId;
        next.audio[`${kind}AssetId`] = asset.assetId;
      }
    } else {
      throw Object.assign(new Error(`unsupported operation: ${op.type}`), { code: "unsupported_operation" });
    }
  }

  return finalize(next);
}

module.exports = { applyContractOperations };
