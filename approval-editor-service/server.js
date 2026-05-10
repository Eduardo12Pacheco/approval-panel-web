const http = require("http");
const path = require("path");
const fs = require("fs");
const { buildApprovalContractPipeline, computeApprovalSnapshotHash } = require("../../03-Contracts-Core/approval-contract-pipeline");
const { createContractStore, safeProjectId } = require("./lib/contract-store");
const { applyContractOperations } = require("./lib/contract-updates");
const { resolveAssetUrl } = require("./lib/asset-resolver");
const { prepareRealVoiceAlignment } = require("./lib/real-alignment");
const { prepareAudioPreviewDerivative, audioContentType } = require("./lib/audio-preview");
const { parseGuionSegments } = require("../../02-Video-Engine/scripts/lib/guion-parsing");

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
  if (["invalid_json", "missing_audio", "unsupported_operation", "invalid_dust_type", "invalid_asset", "missing_voice_audio", "invalid_remote_audio_url"].includes(error.code)) return 400;
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

const ESTIMATED_SECONDS_PER_WORD = 0.55;
const MIN_ESTIMATED_SEGMENT_SECONDS = 1.2;
const WAV_DURATION_FETCH_TIMEOUT_MS = 2500;
const REMOTION_OVERLAYS_DIR = path.resolve(__dirname, "..", "..", "02-Video-Engine", "assets", "overlays");
const PUBLIC_OVERLAY_FILES = new Set(["dust-1.mp4", "dust-2.mp4", "logo-alpha.webm"]);

function toFinitePositiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function countWords(text) {
  const words = String(text || '').trim().match(/\S+/g);
  return words ? words.length : 1;
}

function pickAudioDurationSeconds(audio = {}) {
  if (!audio || typeof audio !== "object") return 0;
  return [
    audio.durationSeconds,
    audio.duration_seconds,
    audio.duration,
    audio.metadata?.durationSeconds,
    audio.metadata?.duration_seconds,
    audio.metadata?.duration,
  ].map(toFinitePositiveNumber).find(Boolean) || 0;
}

function pickAudioUrl(audio = {}) {
  return (audio?.public_url || audio?.publicUrl || audio?.url || audio?.storage_public_url || "").toString().trim();
}

function hasAlignedTimes(segment) {
  const start = Number(segment?.startTime ?? segment?.start_time ?? segment?.start);
  const end = Number(segment?.endTime ?? segment?.end_time ?? segment?.end);
  return Number.isFinite(start) && Number.isFinite(end) && end > start;
}

function getSegmentStart(segment) {
  return Number(segment?.startTime ?? segment?.start_time ?? segment?.start);
}

function getSegmentEnd(segment) {
  return Number(segment?.endTime ?? segment?.end_time ?? segment?.end);
}

function distributeSegmentsByTextWeight(segments, totalDuration) {
  const weights = segments.map((segment) => Math.max(1, countWords(segment.phrase)));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || segments.length || 1;
  const effectiveDuration = toFinitePositiveNumber(totalDuration)
    || weights.reduce((sum, weight) => sum + Math.max(MIN_ESTIMATED_SEGMENT_SECONDS, weight * ESTIMATED_SECONDS_PER_WORD), 0);

  let cursor = 0;
  return segments.map((segment, index) => {
    const isLast = index === segments.length - 1;
    const rawDuration = effectiveDuration * (weights[index] / totalWeight);
    const endTime = isLast ? effectiveDuration : cursor + rawDuration;
    const timed = {
      ...segment,
      startTime: Number(cursor.toFixed(3)),
      endTime: Number(endTime.toFixed(3)),
    };
    cursor = endTime;
    return timed;
  });
}

function normalizeSegments(input = {}) {
  const segments = Array.isArray(input.segments)
    ? input.segments
    : parseGuionSegments(input.guion_piped || "").map((segment, index) => ({ id: `row-${index + 1}`, phrase: segment.phrase }));
  const normalized = segments.map((segment, index) => ({
    id: String(segment.id || `row-${index + 1}`),
    phrase: String(segment.phrase || segment.text || segment.caption || `Segmento ${index + 1}`).trim(),
  }));
  if (segments.length && segments.every(hasAlignedTimes)) {
    return normalized.map((segment, index) => ({
      ...segment,
      startTime: getSegmentStart(segments[index]),
      endTime: getSegmentEnd(segments[index]),
      timingSource: "aligned",
    }));
  }

  if (!input.allowEstimatedTimings) {
    return normalized.map((segment) => ({
      ...segment,
      timingSource: "pending_alignment",
    }));
  }

  const voiceDurationSeconds = pickAudioDurationSeconds(input.voice_audio || input.voiceAudio || input.audio?.voice || {});
  return distributeSegmentsByTextWeight(normalized, voiceDurationSeconds).map((segment) => ({
    ...segment,
    timingSource: voiceDurationSeconds ? "voice-duration-weighted-text" : "estimated-text-weight",
  }));
}

function parseWavDurationSeconds(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 44) return 0;
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") return 0;
  let offset = 12;
  let byteRate = 0;
  let dataSize = 0;
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkDataStart = offset + 8;
    if (chunkId === "fmt " && chunkDataStart + 12 <= buffer.length) byteRate = buffer.readUInt32LE(chunkDataStart + 8);
    if (chunkId === "data") {
      dataSize = chunkSize;
      break;
    }
    offset = chunkDataStart + chunkSize + (chunkSize % 2);
  }
  return byteRate > 0 && dataSize > 0 ? dataSize / byteRate : 0;
}

async function resolveRemoteWavDurationSeconds(url) {
  if (!/^https?:\/\//i.test(url || "") || !/\.wav(?:$|[?#])/i.test(url)) return 0;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WAV_DURATION_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { headers: { range: "bytes=0-4095" }, signal: controller.signal });
    if (!response.ok && response.status !== 206) return 0;
    const buffer = Buffer.from(await response.arrayBuffer());
    return toFinitePositiveNumber(parseWavDurationSeconds(buffer));
  } catch {
    return 0;
  } finally {
    clearTimeout(timer);
  }
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

function previewFileUrl(projectId, relativePath) {
  if (!relativePath) return "";
  return `/api/projects/${encodeURIComponent(safeProjectId(projectId))}/files/${String(relativePath).replace(/^\/+/, "")}`;
}

function withAudioPreview(asset, previewUrl) {
  if (!asset || !previewUrl) return asset;
  return { ...asset, previewUrl };
}

function applyAudioPreviewUrls(pipeline, { voicePreviewUrl, musicPreviewUrl } = {}) {
  const assets = pipeline?.contract?.assets || {};
  const voiceAssetId = pipeline?.contract?.audio?.voice?.assetId;
  const musicAssetId = pipeline?.contract?.audio?.music?.assetId;
  if (voicePreviewUrl) {
    if (assets[voiceAssetId]) assets[voiceAssetId].previewUrl = voicePreviewUrl;
    if (pipeline.contract.audio?.voice) pipeline.contract.audio.voice.previewUrl = voicePreviewUrl;
    if (pipeline.manifest?.assets?.[voiceAssetId]) pipeline.manifest.assets[voiceAssetId].previewUrl = voicePreviewUrl;
  }
  if (musicPreviewUrl) {
    if (assets[musicAssetId]) assets[musicAssetId].previewUrl = musicPreviewUrl;
    if (pipeline.contract.audio?.music) pipeline.contract.audio.music.previewUrl = musicPreviewUrl;
    if (pipeline.manifest?.assets?.[musicAssetId]) pipeline.manifest.assets[musicAssetId].previewUrl = musicPreviewUrl;
  }
  if (voicePreviewUrl || musicPreviewUrl) pipeline.contract.snapshotHash = computeApprovalSnapshotHash(pipeline.contract);
  return pipeline;
}

function resolveSafeProjectFile(projectDir, relativePath) {
  const normalized = path.normalize(String(relativePath || "").replace(/^[/\\]+/, ""));
  if (!normalized || normalized.startsWith("..") || path.isAbsolute(normalized)) return "";
  const filePath = path.resolve(projectDir, normalized);
  const projectRoot = path.resolve(projectDir);
  if (filePath !== projectRoot && !filePath.startsWith(`${projectRoot}${path.sep}`)) return "";
  return filePath;
}

function sendFile(request, response, filePath) {
  const stat = fs.statSync(filePath);
  const headers = {
    "access-control-allow-origin": "*",
    "accept-ranges": "bytes",
    "content-type": audioContentType(filePath),
  };
  const range = request.headers.range;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (match) {
      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Number(match[2]) : stat.size - 1;
      if (Number.isFinite(start) && Number.isFinite(end) && start <= end && start < stat.size) {
        const cappedEnd = Math.min(end, stat.size - 1);
        response.writeHead(206, { ...headers, "content-length": cappedEnd - start + 1, "content-range": `bytes ${start}-${cappedEnd}/${stat.size}` });
        return fs.createReadStream(filePath, { start, end: cappedEnd }).pipe(response);
      }
    }
    response.writeHead(416, { ...headers, "content-range": `bytes */${stat.size}` });
    return response.end();
  }
  response.writeHead(200, { ...headers, "content-length": stat.size });
  return fs.createReadStream(filePath).pipe(response);
}

function resolvePublicOverlayFile(fileName = '') {
  const safeName = path.basename(String(fileName || ''));
  if (!PUBLIC_OVERLAY_FILES.has(safeName)) return '';
  const filePath = path.join(REMOTION_OVERLAYS_DIR, safeName);
  return fs.existsSync(filePath) && fs.statSync(filePath).isFile() ? filePath : '';
}

async function tryPrepareAudioPreview(prepareAudioPreview, options) {
  try {
    return await prepareAudioPreview(options);
  } catch {
    return null;
  }
}

function toResponseSnapshot(record) {
  return { snapshot: record.snapshot, snapshotId: record.snapshotId, snapshotHash: record.snapshotHash };
}

function createApprovalEditorService({ projectsRoot = path.resolve(__dirname, "projects"), renderAdapter = async () => ({}), alignVoiceAudio = prepareRealVoiceAlignment, prepareAudioPreview = prepareAudioPreviewDerivative, env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const store = createContractStore({ projectsRoot });

  return http.createServer(async (request, response) => {
    try {
      if (request.method === "OPTIONS") return sendJson(response, 204, null);
      const url = new URL(request.url, "http://127.0.0.1");

      if (request.method === "GET" && url.pathname === "/health") {
        return ok(response, { ok: true, status: "ready", service: "approval-editor-service", contractVersion: "approval-editor-service-v1", capabilities: ["prepare", "snapshot", "update", "final-render", "download"] });
      }

      if (request.method === "GET" && url.pathname.startsWith("/api/overlays/")) {
        const filePath = resolvePublicOverlayFile(decodeURIComponent(url.pathname.split("/").pop() || ""));
        if (!filePath) throw Object.assign(new Error("unknown overlay"), { code: "unknown_asset" });
        return sendFile(request, response, filePath);
      }

      if (request.method === "POST" && url.pathname === "/api/projects/create-from-approval") {
        const body = await readBody(request);
        if (!body?.voice_audio?.public_url || !body?.background_audio?.public_url) throw Object.assign(new Error("approval payload requires voice and background audio"), { code: "missing_audio" });
        const projectId = safeProjectId(body.project_id || body.draft_id || body.title);
        const allowEstimatedTimings = String(env.ALLOW_ESTIMATED_TIMINGS || body.allowEstimatedTimings || "").toLowerCase() === "true";
        let segments = normalizeSegments({ ...body, allowEstimatedTimings: false });
        let alignedTimings = null;
        let alignmentPaths = null;
        let alignmentStatus = {
          status: "pending_alignment",
          source: "whisper-alignment",
          details: "Whisper alignment has not completed yet",
          generatedAt: null,
        };
        try {
          const projectDir = store.projectDir(projectId);
          const aligned = await alignVoiceAudio({ projectDir, projectId, voiceAudio: body.voice_audio, segments, env, fetchImpl });
          segments = aligned.segments;
          alignedTimings = aligned.alignedTimings;
          alignmentStatus = aligned.alignmentStatus;
          alignmentPaths = aligned.paths || null;
        } catch (error) {
          alignmentStatus = {
            status: allowEstimatedTimings ? "ready" : "failed",
            source: allowEstimatedTimings ? "estimated-text-weight" : "whisper-alignment",
            warning: allowEstimatedTimings ? "ALLOW_ESTIMATED_TIMINGS=true; timings are not Whisper aligned" : "timing_fallback_not_whisper_aligned",
            details: error.message,
            generatedAt: new Date().toISOString(),
          };
          if (allowEstimatedTimings) {
            const wavDurationSeconds = pickAudioDurationSeconds(body.voice_audio) || await resolveRemoteWavDurationSeconds(pickAudioUrl(body.voice_audio));
            segments = normalizeSegments({ ...body, allowEstimatedTimings: true, voice_audio: { ...(body.voice_audio || {}), durationSeconds: wavDurationSeconds || body.voice_audio?.durationSeconds } });
            alignedTimings = { phrases: segments.map((segment) => ({ startTime: segment.startTime, endTime: segment.endTime })) };
          }
        }
        const projectDir = store.projectDir(projectId);
        const [voicePreview, musicPreview] = await Promise.all([
          tryPrepareAudioPreview(prepareAudioPreview, { projectDir, projectId, audio: body.voice_audio, role: "voice", outputName: "voice-preview.mp3", existingInputPath: alignmentPaths?.originalVoicePath, env, fetchImpl }),
          tryPrepareAudioPreview(prepareAudioPreview, { projectDir, projectId, audio: body.background_audio, role: "music", outputName: "music-preview.mp3", env, fetchImpl }),
        ]);
        const voicePreviewUrl = previewFileUrl(projectId, voicePreview?.relativePath);
        const musicPreviewUrl = previewFileUrl(projectId, musicPreview?.relativePath);
        const imageAssets = (Array.isArray(body.selected_images) ? body.selected_images : []).map((item, index) => normalizeUrlAsset(item, index, "image"));
        const voiceAsset = withAudioPreview(normalizeUrlAsset(body.voice_audio, 0, "voice"), voicePreviewUrl);
        const musicAsset = withAudioPreview(normalizeUrlAsset(body.background_audio, 0, "music"), musicPreviewUrl);
        const pipeline = buildApprovalContractPipeline({
          projectId,
          title: body.title || projectId,
          draftId: body.draft_id || null,
          rowsSeed: buildRowSeeds(segments),
          segments,
          alignedTimings,
          alignmentStatus,
          imageAssets,
          voiceAsset,
          musicAsset,
          nowIso: new Date().toISOString(),
        });
        applyAudioPreviewUrls(pipeline, { voicePreviewUrl, musicPreviewUrl });
        const record = store.saveSnapshot(pipeline.contract);
        return ok(response, { projectId, ...toResponseSnapshot(record), previewAssets: pipeline.manifest, manifest: pipeline.manifest, alignmentStatus: pipeline.alignmentStatus }, alignmentStatus.status === "ready" ? 201 : 202);
      }

      const parts = url.pathname.split("/").filter(Boolean);
      if (parts[0] === "api" && parts[1] === "projects" && parts[2]) {
        const projectId = decodeURIComponent(parts[2]);
        const latest = store.latest(projectId);
        if (!latest) throw Object.assign(new Error(`unknown project: ${projectId}`), { code: "unknown_project" });

        if (request.method === "GET" && parts[3] === "snapshot") return ok(response, toResponseSnapshot(latest));
        if (request.method === "GET" && parts[3] === "files") {
          const relativePath = parts.slice(4).map(decodeURIComponent).join("/");
          const filePath = resolveSafeProjectFile(store.projectDir(projectId), relativePath);
          if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) throw Object.assign(new Error(`unknown project file: ${relativePath}`), { code: "unknown_asset" });
          return sendFile(request, response, filePath);
        }
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

module.exports = { createApprovalEditorService, normalizeSegments, pickAudioDurationSeconds, parseWavDurationSeconds };
