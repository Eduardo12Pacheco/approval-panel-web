const { computeApprovalSnapshotHash } = require("./hash");
const { normalizeAsset } = require("./asset-resolver");
const { findMotionPreset } = require("./motion-presets");
const { normalizeBrandChannel, resolveBrandChannelAssets, buildBrandAssetRecords } = require("../../../../03-Contracts-Core/approval-contract-pipeline");
const { BOUNDARY_TRANSITION_CONFIGS, WHIP_TRANSITION_CONFIG, WHIP_SFX, buildBoundaryTransitionAssetRecord } = require("./boundary-transitions");

function defaultZoom150Motion() {
  const { category, name, ...motion } = findMotionPreset("Zoom 150") || {};
  return Object.keys(motion).length ? motion : { fromScale: 1, toScale: 1.5, fromX: 0, fromY: 0, toX: 0, toY: 0, easing: "linear" };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function findRow(snapshot, rowId) {
  const row = snapshot.rows.find((candidate) => candidate.rowId === rowId || candidate.id === rowId);
  if (!row) throw Object.assign(new Error(`unknown row: ${rowId}`), { code: "unknown_row" });
  return row;
}

function normalizeDustType(value) {
  if (value === "dust-1" || value === "dust-2" || value === "dust-3" || value === "dust-4") return value;
  throw Object.assign(new Error("dust type must be one of: dust-1, dust-2, dust-3, dust-4"), { code: "invalid_dust_type" });
}

function rowPhraseDuration(row) {
  const startTime = Number(row?.startTime || 0);
  const endTime = Number.isFinite(Number(row?.effectiveEndTime)) ? Number(row.effectiveEndTime) : Number(row?.endTime);
  return Number((endTime - startTime).toFixed(6));
}

function normalizeVideoSegmentOperation(row, op = {}) {
  const durationSeconds = Number(op.durationSeconds);
  const phraseDuration = rowPhraseDuration(row);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw Object.assign(new Error("durationSeconds must be a positive number"), { code: "invalid_video_segment" });
  }
  if (!Number.isFinite(phraseDuration) || Math.abs(durationSeconds - phraseDuration) > 0.001) {
    throw Object.assign(new Error("video segment duration must match phrase duration"), {
      code: "invalid_video_segment_duration",
      details: { durationSeconds, phraseDuration },
    });
  }
  const sourceInSeconds = Number(op.sourceInSeconds || 0);
  if (!Number.isFinite(sourceInSeconds) || sourceInSeconds < 0) {
    throw Object.assign(new Error("sourceInSeconds must be non-negative"), { code: "invalid_video_segment" });
  }
  const foregroundTransform = op.foregroundTransform && typeof op.foregroundTransform === "object" ? op.foregroundTransform : null;
  return {
    kind: "video-segment",
    sourceInSeconds,
    durationSeconds,
    overlayColor: "#3835AF",
    overlayOpacity: 0.3,
    effect1AssetId: "effect-layer-01",
    effect2AssetId: "effect-layer-02",
    ...(foregroundTransform ? {
      foregroundTransform: {
        x: Number(foregroundTransform.x || 0),
        y: Number(foregroundTransform.y || 0),
        scale: Math.max(0.1, Number(foregroundTransform.scale || 1)),
      },
    } : {}),
  };
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || "").trim());
}

function resolveVideoSegmentSourceUrl(op = {}) {
  const explicitSource = [op.sourceVideoSrc, op.previewUrl, op.renderPath, op.publicUrl, op.publicPath, op.localPath]
    .find((entry) => typeof entry === "string" && entry.trim());
  if (explicitSource) return explicitSource.trim();
  const assetId = String(op.sourceVideoAssetId || op.assetId || op.asset?.assetId || op.asset?.id || "").trim();
  return isHttpUrl(assetId) ? assetId : "";
}

function normalizeVideoSegmentAssetInput(op = {}) {
  const sourceUrl = resolveVideoSegmentSourceUrl(op);
  const assetInput = op.asset && Object.keys(op.asset).length ? { ...op.asset } : {
    assetId: op.assetId || op.sourceVideoAssetId,
    previewUrl: op.previewUrl || op.sourceVideoSrc,
    renderPath: op.renderPath || op.sourceVideoSrc,
  };
  if (sourceUrl) {
    assetInput.publicUrl = assetInput.publicUrl || assetInput.public_url || sourceUrl;
    assetInput.previewUrl = assetInput.previewUrl || sourceUrl;
    assetInput.renderPath = assetInput.renderPath || assetInput.localPath || sourceUrl;
    assetInput.publicPath = assetInput.publicPath || sourceUrl;
    assetInput.localPath = assetInput.localPath || sourceUrl;
    assetInput.url = assetInput.url || sourceUrl;
  }
  return assetInput;
}

function rowIdOf(row = {}) {
  return (row.rowId || row.id || "").toString();
}

function createInvalidBoundaryTransitionError(message, details) {
  return Object.assign(new Error(message), { code: "invalid_boundary_transition", details });
}

function applyBoundaryTransition(next, op = {}) {
  const row = findRow(next, op.rowId);
  const rowIndex = next.rows.findIndex((candidate) => candidate === row);
  const expectedNextRowId = (op.nextRowId || row.nextRowId || "").toString().trim();
  const adjacentNextRowId = rowIdOf(next.rows[rowIndex + 1]);
  const transition = (op.transition || "none").toString().trim().toLowerCase();

  const boundaryEligible = row.paragraphBoundaryAfter === true || op.paragraphBoundaryAfter === true;
  const rowNextRowId = (row.nextRowId || expectedNextRowId).toString().trim();
  if (!boundaryEligible || !expectedNextRowId || rowNextRowId !== expectedNextRowId || adjacentNextRowId !== expectedNextRowId) {
    throw createInvalidBoundaryTransitionError("boundary transition requires an eligible outgoing paragraph boundary", {
      rowId: rowIdOf(row),
      nextRowId: expectedNextRowId || null,
      paragraphBoundaryAfter: boundaryEligible,
    });
  }
  if (transition !== "none" && transition !== "whip" && !BOUNDARY_TRANSITION_CONFIGS[transition]) {
    throw createInvalidBoundaryTransitionError("boundary transition must be none, whip, glitch-1, glitch-2, or glitch-3", { transition });
  }

  if (transition === "none") {
    row.paragraphBoundaryAfter = true;
    row.nextRowId = expectedNextRowId;
    row.transition = "none";
    row.transitionSource = "manual";
    delete row.transitionConfig;
    row.sfx = null;
    return;
  }

  row.paragraphBoundaryAfter = true;
  row.nextRowId = expectedNextRowId;
  row.transition = transition;
  row.transitionSource = op.transitionSource === "auto" ? "auto" : "manual";
  if (BOUNDARY_TRANSITION_CONFIGS[transition]) {
    row.transitionConfig = { ...BOUNDARY_TRANSITION_CONFIGS[transition] };
    row.sfx = null;
    next.assets[transition] = next.assets[transition] || buildBoundaryTransitionAssetRecord(transition);
    return;
  }
  row.transitionConfig = { ...WHIP_TRANSITION_CONFIG, direction: op.direction || WHIP_TRANSITION_CONFIG.direction };
  row.sfx = { ...WHIP_SFX };
}

function finalize(next) {
  next.render = { ...(next.render || {}), status: "idle", updatedAt: new Date().toISOString() };
  next.snapshotId = `${next.projectId}:${Date.now()}`;
  next.snapshotHash = computeApprovalSnapshotHash(next);
  return next;
}

function applyBrandChannel(next, brandChannel) {
  const channelAssets = resolveBrandChannelAssets(normalizeBrandChannel(brandChannel));
  next.brandChannel = channelAssets.channel;
  next.assets = { ...(next.assets || {}), ...buildBrandAssetRecords(channelAssets) };
  next.globalLayers = next.globalLayers || {};
  next.globalLayers.logoAssetId = channelAssets.logo.assetId;
  next.globalLayers.outroAssetId = channelAssets.outro.assetId;
  next.globalLayers.logo = {
    ...(next.globalLayers.logo || {}),
    enabled: next.globalLayers.logo?.enabled !== false,
    source: channelAssets.logo.source,
    preferredSource: channelAssets.logo.source,
    assetId: channelAssets.logo.assetId,
  };
  next.globalLayers.outro = { enabled: next.globalLayers.outro?.enabled !== false, assetId: channelAssets.outro.assetId };
  next.outro = {
    ...(next.outro || {}),
    enabled: next.outro?.enabled !== false,
    assetId: channelAssets.outro.assetId,
    durationSeconds: channelAssets.outro.durationSeconds,
    label: channelAssets.outro.label,
  };
  for (const row of next.rows || []) {
    row.logo = { ...(row.logo || {}), enabled: row.logo?.enabled !== false, source: channelAssets.logo.source, assetId: channelAssets.logo.assetId };
  }
}

function normalizeNewspaperSettings(value = {}) {
  const settings = value && typeof value === "object" ? value : {};
  const foregroundMotion = settings.foregroundMotion && typeof settings.foregroundMotion === "object"
    ? settings.foregroundMotion
    : null;
  return {
    ...(Object.prototype.hasOwnProperty.call(settings, "labelEnabled") ? { labelEnabled: settings.labelEnabled !== false } : {}),
    ...(foregroundMotion ? {
      foregroundMotion: {
        fromX: Number(foregroundMotion.fromX || 0),
        fromY: Number(foregroundMotion.fromY || 0),
        toX: Number(foregroundMotion.toX || 0),
        toY: Number(foregroundMotion.toY || 0),
        fromScale: Math.max(0.1, Number(foregroundMotion.fromScale || 1)),
        toScale: Math.max(0.1, Number(foregroundMotion.toScale || 1.25)),
        easing: "linear",
      },
    } : {}),
  };
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
      row.media = { kind: "image" };
      if (Object.prototype.hasOwnProperty.call(op, "mediaMode")) row.mediaMode = op.mediaMode === "newspaper" ? "newspaper" : "image";
      if (!row.candidates?.some((candidate) => candidate.assetId === asset.assetId)) {
        row.candidates = [...(row.candidates || []), { id: `candidate-${row.rowId}-${asset.assetId}`, assetId: asset.assetId, source: asset.source, publicPath: asset.publicUrl, reason: "row-specific replacement" }];
      }
    } else if (op.type === "setRowVideoSegment") {
      const row = findRow(next, op.rowId);
      const assetInput = normalizeVideoSegmentAssetInput(op);
      const asset = normalizeAsset(assetInput, { type: "video", role: "video" });
      next.assets[asset.assetId] = { ...assetInput, ...asset, type: "video", role: "video" };
      next.assets["effect-layer-01"] = next.assets["effect-layer-01"] || { assetId: "effect-layer-01", id: "effect-layer-01", type: "video", role: "effect", renderPath: "overlays/effect-layer-01.mp4", previewUrl: "./assets/effect-layer-01.webm", status: "ready" };
      next.assets["effect-layer-02"] = next.assets["effect-layer-02"] || { assetId: "effect-layer-02", id: "effect-layer-02", type: "video", role: "effect", renderPath: "overlays/effect-layer-02.mp4", previewUrl: "./assets/effect-layer-02.webm", status: "ready" };
      row.media = {
        ...normalizeVideoSegmentOperation(row, op),
        sourceVideoAssetId: asset.assetId,
      };
      row.mediaMode = "image";
    } else if (op.type === "setRowMediaMode") {
      const row = findRow(next, op.rowId);
      row.mediaMode = op.mediaMode === "newspaper" ? "newspaper" : "image";
      if (op.media?.kind !== "video-segment") row.media = { kind: "image" };
      if (row.mediaMode === "newspaper") row.newspaper = { labelEnabled: true, ...(row.newspaper || {}) };
      if (row.mediaMode === "newspaper" && (!row.motionPresetId || row.motionPresetId === "Zoom 110" || row.motionPresetId === "slow-zoom-in")) {
        row.motionPresetId = "Zoom 150";
        row.motion = defaultZoom150Motion();
      }
    } else if (op.type === "setRowNewspaper") {
      const row = findRow(next, op.rowId);
      row.newspaper = { labelEnabled: true, ...(row.newspaper || {}), ...normalizeNewspaperSettings(op.newspaper || op.settings || {}) };
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
      const channelAssets = resolveBrandChannelAssets(next.brandChannel);
      next.globalLayers.logoAssetId = op.assetId || channelAssets.logo.assetId;
      next.globalLayers.logo = { enabled: op.enabled !== false, source: op.source || channelAssets.logo.source, preferredSource: channelAssets.logo.source, assetId: op.assetId || channelAssets.logo.assetId };
      for (const row of next.rows) row.logo = { enabled: op.enabled !== false, source: op.source || channelAssets.logo.source, assetId: op.assetId || channelAssets.logo.assetId };
    } else if (op.type === "setBrandChannel") {
      applyBrandChannel(next, op.brandChannel || op.channel || op.value);
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
    } else if (op.type === "setBoundaryTransition") {
      applyBoundaryTransition(next, op);
    } else {
      throw Object.assign(new Error(`unsupported operation: ${op.type}`), { code: "unsupported_operation" });
    }
  }

  return finalize(next);
}

module.exports = { applyContractOperations, normalizeDustType };
