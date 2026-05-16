const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { createEditorProject, stableId } = require("../../../../02-Video-Engine/scripts/lib/editor-project");
const { normalizeBrandChannel, resolveBrandChannelAssets, buildBrandAssetRecords } = require("../../../../03-Contracts-Core/approval-contract-pipeline");

const AUTHORITATIVE_DUST_ASSETS = {
  "dust-1": {
    assetId: "dust-1",
    id: "dust-1",
    type: "dust",
    role: "dust",
    source: { kind: "local", bridge: "approval-panel" },
    publicUrl: "./assets/dust-1.webm",
    previewUrl: "./assets/dust-1.webm",
    renderPath: "overlays/dust-1.mp4",
    status: "ready",
  },
  "dust-2": {
    assetId: "dust-2",
    id: "dust-2",
    type: "dust",
    role: "dust",
    source: { kind: "local", bridge: "approval-panel" },
    publicUrl: "./assets/dust-2.webm",
    previewUrl: "./assets/dust-2.webm",
    renderPath: "overlays/dust-2.mp4",
    status: "ready",
  },
};

function nowIso() {
  return new Date().toISOString();
}

function createAdapterError(code, message, details) {
  const error = new Error(message);
  error.code = code;
  if (details !== undefined) error.details = details;
  return error;
}

function resolveProjectId(projectId, snapshot = {}) {
  const id = stableId(snapshot.projectId || projectId || snapshot.draftId || snapshot.title || "approval-render");
  if (!id) throw createAdapterError("invalid_project_id", "Approval Editor render adapter could not resolve a safe Video Engine project id.");
  return id;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, filePath);
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || "").trim());
}

function isUnsafeRenderPath(value) {
  const normalized = String(value || "").trim().replace(/\\/g, "/");
  if (!normalized || normalized.startsWith("/") || /^[a-z][a-z0-9+.-]*:/i.test(normalized)) return true;
  return normalized.split("/").some((part) => part === "..") || normalized.includes("//");
}

function sanitizeAssetId(value, fallback) {
  return String(value || fallback || "asset")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "asset";
}

function extensionFromSource(source, asset = {}) {
  const candidates = [source, asset.renderPath, asset.localPath, asset.publicPath, asset.publicUrl, asset.previewUrl, asset.url];
  for (const candidate of candidates) {
    try {
      const pathname = isHttpUrl(candidate) ? new URL(candidate).pathname : String(candidate || "");
      const ext = path.extname(pathname).toLowerCase();
      if (/^\.[a-z0-9]{1,8}$/.test(ext)) return ext;
    } catch {
      const ext = path.extname(String(candidate || "")).toLowerCase();
      if (/^\.[a-z0-9]{1,8}$/.test(ext)) return ext;
    }
  }
  if ([asset.type, asset.kind].some((entry) => ["audio", "voice", "music"].includes(String(entry || "").toLowerCase()))) return ".wav";
  return ".bin";
}

function generatedFolderForAsset(asset = {}) {
  const type = String(asset.type || asset.kind || "").toLowerCase();
  if (["audio", "voice", "music"].includes(type)) return "audio";
  if (["image", "photo"].includes(type)) return "images";
  if (["logo", "outro", "overlay", "dust", "video", "video-segment"].includes(type)) return "overlays";
  return "assets";
}

function firstRenderableSource(asset = {}) {
  return [asset.renderPath, asset.localPath, asset.publicPath, asset.publicUrl, asset.url, asset.previewUrl]
    .find((entry) => typeof entry === "string" && entry.trim());
}

async function materializeAsset({ source, outputPath, fetchImpl }) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  if (isHttpUrl(source)) {
    if (typeof fetchImpl !== "function") throw createAdapterError("asset_localization_unavailable", `Cannot localize remote render asset without fetch support: ${source}`, { source });
    const response = await fetchImpl(source);
    if (!response?.ok) throw createAdapterError("asset_localization_failed", `Failed to download render asset: ${source}`, { source, status: response?.status });
    const bytes = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(outputPath, bytes);
    return;
  }
  fs.copyFileSync(source, outputPath);
}

function materializeSafeRelativeAsset({ assetSourceRoot, projectRoot, renderPath }) {
  if (!assetSourceRoot || !renderPath || isUnsafeRenderPath(renderPath)) return false;
  const sourcePath = path.resolve(assetSourceRoot, renderPath);
  const resolvedSourceRoot = path.resolve(assetSourceRoot);
  if (sourcePath !== resolvedSourceRoot && !sourcePath.startsWith(`${resolvedSourceRoot}${path.sep}`)) return false;
  if (!fs.existsSync(sourcePath)) return false;
  const outputPath = path.join(projectRoot, "public", renderPath);
  if (fs.statSync(sourcePath).isDirectory()) {
    fs.cpSync(sourcePath, outputPath, { recursive: true });
    return true;
  }
  if (!fs.statSync(sourcePath).isFile()) return false;
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.copyFileSync(sourcePath, outputPath);
  return true;
}

function inferBrandChannel(snapshot = {}) {
  const explicitBrandChannel = String(snapshot?.brandChannel || "").trim();
  if (explicitBrandChannel) return normalizeBrandChannel(explicitBrandChannel);

  const candidates = [
    snapshot?.globalLayers?.logoAssetId,
    snapshot?.globalLayers?.outroAssetId,
    snapshot?.globalLayers?.logo?.assetId,
    snapshot?.globalLayers?.outro?.assetId,
    snapshot?.outro?.assetId,
    ...Object.keys(snapshot?.assets && typeof snapshot.assets === "object" ? snapshot.assets : {}),
  ].map((value) => String(value || "").toLowerCase());

  if (candidates.some((value) => value.includes("colombia"))) return "pelotazo-colombia";
  if (candidates.some((value) => value.includes("ecuador"))) return "pelotazo-ecuador";
  return normalizeBrandChannel(null);
}

async function localizeRenderAssets({ projectRoot, assetSourceRoot, snapshot, fetchImpl = globalThis.fetch } = {}) {
  const contract = { ...(snapshot || {}) };
  const sourceAssets = snapshot?.assets && typeof snapshot.assets === "object" ? snapshot.assets : {};
  const localizedAssets = {};
  for (const [assetId, asset] of Object.entries(sourceAssets)) {
    if (!asset || typeof asset !== "object") {
      localizedAssets[assetId] = asset;
      continue;
    }
    const renderPath = typeof asset.renderPath === "string" ? asset.renderPath.trim() : "";
    const source = firstRenderableSource(asset);
    if (!source || (renderPath && !isUnsafeRenderPath(renderPath))) {
      materializeSafeRelativeAsset({ assetSourceRoot, projectRoot, renderPath });
      localizedAssets[assetId] = asset;
      continue;
    }
    if (!isHttpUrl(source) && !path.isAbsolute(source)) {
      localizedAssets[assetId] = asset;
      continue;
    }
    const folder = generatedFolderForAsset(asset);
    const fileName = `${sanitizeAssetId(asset.id || assetId, assetId)}${extensionFromSource(source, asset)}`;
    const relativePath = path.posix.join("generated", folder, fileName);
    const outputPath = path.join(projectRoot, "public", "generated", folder, fileName);
    await materializeAsset({ source, outputPath, fetchImpl });
    localizedAssets[assetId] = {
      ...asset,
      renderPath: relativePath,
      ...(asset.localPath && isUnsafeRenderPath(asset.localPath) ? { localPath: relativePath } : {}),
      ...(asset.publicPath && isUnsafeRenderPath(asset.publicPath) ? { publicPath: relativePath } : {}),
    };
  }
  return { ...contract, assets: localizedAssets };
}

function readIndex(indexPath) {
  if (!fs.existsSync(indexPath)) return { projects: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(indexPath, "utf8"));
    return { projects: Array.isArray(parsed.projects) ? parsed.projects : [] };
  } catch {
    return { projects: [] };
  }
}

function upsertProjectIndex(projectsRoot, { projectId, title }) {
  const indexPath = path.join(projectsRoot, "index.json");
  const current = readIndex(indexPath);
  const createdAt = nowIso();
  const existing = current.projects.find((entry) => entry.id === projectId) || null;
  const projects = current.projects.filter((entry) => entry.id !== projectId);
  projects.push({
    id: projectId,
    title: title || projectId,
    status: "editing",
    projectPath: `projects/${projectId}`,
    createdAt: existing?.createdAt || createdAt,
    updatedAt: createdAt,
    lastRender: existing?.lastRender || null,
  });
  writeJson(indexPath, { projects });
}

async function persistSnapshotForVideoEngine({ projectsRoot, projectId, snapshot, snapshotHash, fetchImpl, assetSourceRoot }) {
  const projectRoot = path.join(projectsRoot, projectId);
  fs.mkdirSync(path.join(projectRoot, "guion"), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, "output"), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, "public", "generated"), { recursive: true });
  const scriptLines = (Array.isArray(snapshot?.rows) ? snapshot.rows : [])
    .map((row) => String(row?.phrase || row?.caption || row?.text || "").trim())
    .filter(Boolean);
  fs.writeFileSync(path.join(projectRoot, "guion", "guion.txt"), `${scriptLines.join("\n") || snapshot.title || projectId}\n`, "utf8");

  const editorProject = createEditorProject(projectRoot, { projectId, title: snapshot.title || projectId, seedMedia: false });
  writeJson(path.join(projectRoot, "editor-project.json"), {
    ...editorProject,
    title: snapshot.title || editorProject.title,
    phase: "preview_ready",
    preview: { status: "ready", lastGeneratedAt: nowIso() },
  });

  const channelAssets = resolveBrandChannelAssets(inferBrandChannel(snapshot));
  const authoritativeBrandAssets = buildBrandAssetRecords(channelAssets);
  const snapshotWithAuthoritativeBrandAssets = {
    ...(snapshot || {}),
    assets: {
      ...(snapshot?.assets || {}),
      ...AUTHORITATIVE_DUST_ASSETS,
      ...authoritativeBrandAssets,
    },
    globalLayers: {
      ...(snapshot?.globalLayers || {}),
      logoAssetId: channelAssets.logo.assetId,
      outroAssetId: channelAssets.outro.assetId,
      logo: {
        ...(snapshot?.globalLayers?.logo || {}),
        enabled: snapshot?.globalLayers?.logo?.enabled !== false,
        assetId: channelAssets.logo.assetId,
        source: channelAssets.logo.source,
        preferredSource: channelAssets.logo.source,
      },
      outro: {
        ...(snapshot?.globalLayers?.outro || {}),
        enabled: snapshot?.globalLayers?.outro?.enabled !== false,
        assetId: channelAssets.outro.assetId,
      },
    },
    outro: {
      ...(snapshot?.outro || {}),
      enabled: snapshot?.outro?.enabled !== false,
      assetId: channelAssets.outro.assetId,
      durationSeconds: channelAssets.outro.durationSeconds,
      label: channelAssets.outro.label,
    },
  };
  const localizedSnapshot = await localizeRenderAssets({ projectRoot, assetSourceRoot, snapshot: snapshotWithAuthoritativeBrandAssets, fetchImpl });
  const contract = { ...localizedSnapshot, snapshotHash: snapshotHash || snapshot.snapshotHash };
  writeJson(path.join(projectRoot, "composition-contract.json"), {
    version: 1,
    savedAt: nowIso(),
    contract,
    manifest: { assets: contract.assets || {} },
  });
  upsertProjectIndex(projectsRoot, { projectId, title: snapshot.title });
  return projectRoot;
}

function defaultRunCommand(command) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, command.args, {
      cwd: command.cwd,
      env: command.env,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (error) => resolve({ status: "error", exitCode: 1, stdout, stderr: stderr || error.message }));
    child.on("close", (code) => resolve({ status: code === 0 ? "success" : "error", exitCode: code || 0, stdout, stderr }));
  });
}

function createVideoEngineRenderAdapter({
  videoEngineRoot,
  projectsRoot,
  env = process.env,
  runCommand = defaultRunCommand,
  fetchImpl = globalThis.fetch,
} = {}) {
  const resolvedVideoEngineRoot = path.resolve(videoEngineRoot || env.APPROVAL_EDITOR_VIDEO_ENGINE_ROOT || path.join(__dirname, "..", "..", "..", "..", "02-Video-Engine"));
  const resolvedProjectsRoot = path.resolve(projectsRoot || env.APPROVAL_EDITOR_VIDEO_ENGINE_PROJECTS_ROOT || env.REMOTION_EDITOR_PROJECTS_ROOT || path.join(resolvedVideoEngineRoot, "projects"));
  const scriptPath = path.join(resolvedVideoEngineRoot, "scripts", "render-video.js");

  return async function videoEngineRenderAdapter({ projectId, snapshot, snapshotHash }) {
    if (!fs.existsSync(scriptPath)) {
      throw createAdapterError("render_command_missing", `02-Video-Engine render command not found: ${scriptPath}`, { scriptPath });
    }
    const videoProjectId = resolveProjectId(projectId, snapshot);
    const projectRoot = await persistSnapshotForVideoEngine({ projectsRoot: resolvedProjectsRoot, projectId: videoProjectId, snapshot, snapshotHash, fetchImpl, assetSourceRoot: path.join(resolvedVideoEngineRoot, "assets") });
    const outputPath = path.join(projectRoot, "output", "video-final.mp4");
    const command = {
      scriptPath,
      args: [scriptPath, `--project-root=${projectRoot}`, "--profile=final"],
      cwd: resolvedVideoEngineRoot,
      env: { ...process.env, ...env },
      projectRoot,
      outputPath,
    };
    const result = await runCommand(command);
    if (result?.status !== "success" || Number(result.exitCode || 0) !== 0) {
      throw createAdapterError("render_command_failed", `02-Video-Engine final render failed with exit code ${result?.exitCode ?? 1}.`, { ...result, scriptPath, projectRoot });
    }
    if (!fs.existsSync(outputPath) || !fs.statSync(outputPath).isFile()) {
      throw createAdapterError("render_output_missing", `02-Video-Engine render command completed without creating final output: ${outputPath}`, { outputPath, stdout: result.stdout || "", stderr: result.stderr || "" });
    }
    return { finalPath: outputPath, projectRoot, command: { scriptPath, cwd: resolvedVideoEngineRoot } };
  };
}

module.exports = { createVideoEngineRenderAdapter, persistSnapshotForVideoEngine };
