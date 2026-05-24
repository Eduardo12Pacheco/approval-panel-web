const fs = require("fs");
const path = require("path");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function safeProjectId(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || `approval-${Date.now()}`;
}

function createContractStore({ projectsRoot }) {
  ensureDir(projectsRoot);
  const projectDir = (projectId) => path.join(projectsRoot, safeProjectId(projectId));
  const snapshotsPath = (projectId) => path.join(projectDir(projectId), "snapshots.json");
  const leasePath = (projectId) => path.join(projectDir(projectId), "lease.json");

  function readSnapshots(projectId) {
    const file = snapshotsPath(projectId);
    if (!fs.existsSync(file)) return [];
    return JSON.parse(fs.readFileSync(file, "utf8"));
  }

  function writeSnapshots(projectId, snapshots) {
    ensureDir(projectDir(projectId));
    fs.writeFileSync(snapshotsPath(projectId), JSON.stringify(snapshots, null, 2));
  }

  function saveSnapshot(snapshot, extra = {}) {
    const projectId = safeProjectId(snapshot.projectId);
    const snapshots = readSnapshots(projectId);
    const version = snapshots.length + 1;
    const record = { snapshot, snapshotHash: snapshot.snapshotHash, snapshotId: snapshot.snapshotId, version, updatedAt: new Date().toISOString(), render: extra.render || snapshot.render || {}, audit: extra.audit || null };
    snapshots.push(record);
    writeSnapshots(projectId, snapshots);
    fs.writeFileSync(path.join(projectDir(projectId), "latest-snapshot.json"), JSON.stringify(record, null, 2));
    return record;
  }

  function readLease(projectId) {
    const file = leasePath(projectId);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  }

  function writeLease(projectId, lease) {
    ensureDir(projectDir(projectId));
    fs.writeFileSync(leasePath(projectId), JSON.stringify(lease, null, 2));
    return lease;
  }

  function latest(projectId) {
    const snapshots = readSnapshots(projectId);
    return snapshots[snapshots.length - 1] || null;
  }

  return { safeProjectId, projectDir, saveSnapshot, latest, readSnapshots, writeSnapshots, readLease, writeLease };
}

module.exports = { createContractStore, safeProjectId };
