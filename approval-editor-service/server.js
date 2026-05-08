const http = require("http");
const path = require("path");
const fs = require("fs");
const { buildApprovalContractPipeline } = require("../../shared/approval-contract-pipeline");
const { createContractStore, safeProjectId } = require("./lib/contract-store");
const { applyContractOperations } = require("./lib/contract-updates");
const { resolveAssetUrl } = require("./lib/asset-resolver");

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type,range",
    "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

function ok(response, data, status = 200) {
  sendJson(response, status, { ok: true, data });
}

function fail(response, error, status = 500) {
  sendJson(response, status, { ok: false, error: { code: error.code || "internal_error", message: error.message || String(error), details: error.details } });
}

function errorStatus(error) {
  if (["invalid_json", "missing_audio", "unsupported_operation", "invalid_dust_type", "invalid_asset"].includes(error.code)) return 400;
  if (["unknown_project", "unknown_row", "unknown_asset"].includes(error.code)) return 404;
  if (["stale_snapshot"].includes(error.code)) return 409;
  return 500;
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("error", reject);
    request.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (error) { error.code = "invalid_json"; reject(error); }
    });
  });
}

function normalizeSegments(input = {}) {
  const segments = Array.isArray(input.segments)
    ? input.segments
    : String(input.guion_piped || "").split("|").map((phrase, index) => ({ id: `row-${index + 1}`, phrase: phrase.trim() })).filter((segment) => segment.phrase);
  return segments.map((segment, index) => ({
    id: String(segment.id || `row-${index + 1}`),
    phrase: String(segment.phrase || segment.text || segment.caption || `Segmento ${index + 1}`).trim(),
    startTime: Number.isFinite(Number(segment.startTime)) ? Number(segment.startTime) : index * 1.5,
    endTime: Number.isFinite(Number(segment.endTime)) ? Number(segment.endTime) : index * 1.5 + 1.5,
  }));
}

function buildRowSeeds(segments = []) {
  return segments.map((segment, index) => ({
    id: segment.id,
    index,
    phrase: segment.phrase,
    caption: segment.phrase,
    motion: "slow-zoom-in",
    dust: { enabled: false, type: "dust-1" },
    logo: { enabled: true, source: "logo-alpha.webm" },
    filter: { enabled: true, mode: "cover" },
    transition: "none",
    sfx: null,
  }));
}

function normalizeUrlAsset(item, index, role) {
  const url = typeof item === "string" ? item : (item?.public_url || item?.publicUrl || item?.url || item?.storage_public_url || "");
  const idSeed = (typeof item === "object" && (item.id || item.assetId || item.storage_path)) || url || `${role}-${index + 1}`;
  const id = `${role}-${safeProjectId(idSeed)}`;
  return {
    id,
    type: role === "music" ? "music" : role === "voice" ? "audio" : "image",
    source: { kind: "approval-editor-service" },
    localPath: url,
    publicPath: url,
    previewUrl: url,
    renderPath: url,
    status: "ready",
  };
}

function toResponseSnapshot(record) {
  return { snapshot: record.snapshot, snapshotId: record.snapshotId, snapshotHash: record.snapshotHash };
}

function createApprovalEditorService({ projectsRoot = path.resolve(__dirname, "projects"), renderAdapter = async () => ({}) } = {}) {
  const store = createContractStore({ projectsRoot });

  return http.createServer(async (request, response) => {
    try {
      if (request.method === "OPTIONS") return sendJson(response, 204, null);
      const url = new URL(request.url, "http://127.0.0.1");

      if (request.method === "GET" && url.pathname === "/health") {
        return ok(response, { ok: true, status: "ready", service: "approval-editor-service", contractVersion: "approval-editor-service-v1", capabilities: ["prepare", "snapshot", "update", "final-render", "download"] });
      }

      if (request.method === "POST" && url.pathname === "/api/projects/create-from-approval") {
        const body = await readBody(request);
        if (!body?.voice_audio?.public_url || !body?.background_audio?.public_url) throw Object.assign(new Error("approval payload requires voice and background audio"), { code: "missing_audio" });
        const projectId = safeProjectId(body.project_id || body.draft_id || body.title);
        const segments = normalizeSegments(body);
        const imageAssets = (Array.isArray(body.selected_images) ? body.selected_images : []).map((item, index) => normalizeUrlAsset(item, index, "image"));
        const voiceAsset = normalizeUrlAsset(body.voice_audio, 0, "voice");
        const musicAsset = normalizeUrlAsset(body.background_audio, 0, "music");
        const alignedTimings = { phrases: segments.map((segment) => ({ startTime: segment.startTime, endTime: segment.endTime })) };
        const pipeline = buildApprovalContractPipeline({
          projectId,
          title: body.title || projectId,
          draftId: body.draft_id || null,
          rowsSeed: buildRowSeeds(segments),
          segments,
          alignedTimings,
          alignmentStatus: { status: "ready", source: "approval-editor-service", generatedAt: new Date().toISOString() },
          imageAssets,
          voiceAsset,
          musicAsset,
          nowIso: new Date().toISOString(),
        });
        const record = store.saveSnapshot(pipeline.contract);
        return ok(response, { projectId, ...toResponseSnapshot(record), previewAssets: pipeline.manifest, manifest: pipeline.manifest, alignmentStatus: pipeline.alignmentStatus }, 201);
      }

      const parts = url.pathname.split("/").filter(Boolean);
      if (parts[0] === "api" && parts[1] === "projects" && parts[2]) {
        const projectId = decodeURIComponent(parts[2]);
        const latest = store.latest(projectId);
        if (!latest) throw Object.assign(new Error(`unknown project: ${projectId}`), { code: "unknown_project" });

        if (request.method === "GET" && parts[3] === "snapshot") return ok(response, toResponseSnapshot(latest));
        if (request.method === "PATCH" && parts[3] === "snapshot") {
          const body = await readBody(request);
          if (body.baseSnapshotHash !== latest.snapshotHash) throw Object.assign(new Error("stale baseSnapshotHash"), { code: "stale_snapshot", details: { expected: latest.snapshotHash, received: body.baseSnapshotHash } });
          const nextSnapshot = applyContractOperations(latest.snapshot, Array.isArray(body.operations) ? body.operations : []);
          const record = store.saveSnapshot(nextSnapshot);
          return ok(response, toResponseSnapshot(record));
        }
        if (request.method === "POST" && parts[3] === "render-final") {
          const body = await readBody(request);
          if (body.snapshotHash !== latest.snapshotHash) throw Object.assign(new Error("stale snapshotHash for final render"), { code: "stale_snapshot", details: { expected: latest.snapshotHash, received: body.snapshotHash } });
          const rendered = await renderAdapter({ projectId, snapshot: latest.snapshot, snapshotHash: latest.snapshotHash });
          latest.snapshot.render = { ...(latest.snapshot.render || {}), status: "rendered", lastRenderedSnapshotHash: latest.snapshotHash, outputPath: rendered.finalPath || rendered.outputPath || null, updatedAt: new Date().toISOString() };
          const snapshots = store.readSnapshots(projectId);
          snapshots[snapshots.length - 1] = latest;
          store.writeSnapshots(projectId, snapshots);
          fs.writeFileSync(path.join(store.projectDir(projectId), "latest-snapshot.json"), JSON.stringify(latest, null, 2));
          return ok(response, { projectId, snapshotHash: latest.snapshotHash, lastRenderedSnapshotHash: latest.snapshotHash, render: latest.snapshot.render }, 202);
        }
        if (request.method === "GET" && parts[3] === "status") return ok(response, { projectId, ...toResponseSnapshot(latest), render: latest.snapshot.render || {} });
        if (request.method === "GET" && parts[3] === "download" && parts[4] === "final") return ok(response, { projectId, snapshotHash: latest.snapshotHash, finalUrl: latest.snapshot.render?.outputPath || null });
      }

      if (request.method === "GET" && parts[0] === "api" && parts[1] === "assets" && parts[2]) {
        for (const record of fs.readdirSync(projectsRoot).flatMap((id) => store.readSnapshots(id))) {
          const found = resolveAssetUrl(record.snapshot, decodeURIComponent(parts[2]));
          if (found) return response.writeHead(302, { location: found }).end();
        }
        throw Object.assign(new Error(`unknown asset: ${parts[2]}`), { code: "unknown_asset" });
      }

      throw Object.assign(new Error("Not found"), { code: "not_found" });
    } catch (error) {
      return fail(response, error, errorStatus(error));
    }
  });
}

if (require.main === module) {
  const port = Number(process.env.APPROVAL_EDITOR_SERVICE_PORT || 3042);
  createApprovalEditorService().listen(port, "127.0.0.1", () => {
    console.log(`approval-editor-service listening on http://127.0.0.1:${port}`);
  });
}

module.exports = { createApprovalEditorService };
