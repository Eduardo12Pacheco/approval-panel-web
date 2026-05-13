const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { createEditorProject, stableId } = require("../../../../02-Video-Engine/scripts/lib/editor-project");

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

function persistSnapshotForVideoEngine({ projectsRoot, projectId, snapshot, snapshotHash }) {
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

  const contract = { ...snapshot, snapshotHash: snapshotHash || snapshot.snapshotHash };
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
} = {}) {
  const resolvedVideoEngineRoot = path.resolve(videoEngineRoot || env.APPROVAL_EDITOR_VIDEO_ENGINE_ROOT || path.join(__dirname, "..", "..", "..", "..", "02-Video-Engine"));
  const resolvedProjectsRoot = path.resolve(projectsRoot || env.APPROVAL_EDITOR_VIDEO_ENGINE_PROJECTS_ROOT || env.REMOTION_EDITOR_PROJECTS_ROOT || path.join(resolvedVideoEngineRoot, "projects"));
  const scriptPath = path.join(resolvedVideoEngineRoot, "scripts", "render-video.js");

  return async function videoEngineRenderAdapter({ projectId, snapshot, snapshotHash }) {
    if (!fs.existsSync(scriptPath)) {
      throw createAdapterError("render_command_missing", `02-Video-Engine render command not found: ${scriptPath}`, { scriptPath });
    }
    const videoProjectId = resolveProjectId(projectId, snapshot);
    const projectRoot = persistSnapshotForVideoEngine({ projectsRoot: resolvedProjectsRoot, projectId: videoProjectId, snapshot, snapshotHash });
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
