from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[1]
WORKSPACE = ROOT.parent


def read(relative_path: str) -> str:
    return (WORKSPACE / relative_path).read_text(encoding="utf-8")


def test_approval_editor_service_lives_under_services_boundary_only():
    new_service = ROOT / "services" / "approval-editor"
    old_service = ROOT / "approval-editor-service"

    assert (new_service / "server.js").is_file()
    assert (new_service / "lib" / "contract-updates.js").is_file()
    assert (new_service / "README.md").is_file()
    assert not any(old_service.rglob("*"))


def test_active_import_consumers_resolve_approval_editor_from_new_boundary():
    consumers = {
        "01-Control-Panel/js/modules/__checks__/approval-editor-service-timings.check.cjs": [
            "../../../services/approval-editor/server.js",
            "../../../services/approval-editor/lib/real-alignment.js",
        ],
        "01-Control-Panel/js/modules/features/video-projects/__checks__/video-segment-picker-ux.check.mjs": [
            "../../../../../services/approval-editor/lib/contract-updates.js",
        ],
        "02-Video-Engine/tests/approval-editor-service-v1.test.js": [
            "../../01-Control-Panel/services/approval-editor/server",
        ],
        "02-Video-Engine/scripts/services/approval-pipeline-local-service.js": [
            "../../01-Control-Panel/services/approval-editor/lib/contract-updates",
        ],
    }

    for relative_path, expected_imports in consumers.items():
        source = read(relative_path)
        for expected_import in expected_imports:
            assert expected_import in source
        assert "01-Control-Panel/approval-editor-service" not in source
        assert "approval-editor-service/server" not in source
        assert "approval-editor-service/lib" not in source


def test_runtime_projects_data_is_ignored_at_new_service_path():
    assert "01-Control-Panel/services/approval-editor/projects/" in read(".gitignore")
    assert "services/approval-editor/projects/" in read("01-Control-Panel/.gitignore")


def test_active_docs_show_new_service_path_and_manual_snapshot_migration():
    control_panel_readme = read("01-Control-Panel/README.md")
    service_readme = read("01-Control-Panel/services/approval-editor/README.md")

    combined = f"{control_panel_readme}\n{service_readme}"
    assert "01-Control-Panel/services/approval-editor/" in combined
    assert "node .\\services\\approval-editor\\server.js" in combined
    assert "01-Control-Panel/approval-editor-service/projects/" in combined
    assert "01-Control-Panel/services/approval-editor/projects/" in combined


def test_approval_editor_docs_require_explicit_python_bin_for_services():
    service_readme = read("01-Control-Panel/services/approval-editor/README.md")

    assert '$env:REMOTION_EDITOR_PYTHON_BIN = "py"' not in service_readme
    assert '$env:REMOTION_EDITOR_PYTHON_BIN = "C:\\Users\\pelot\\AppData\\Local\\Programs\\Python\\Python311\\python.exe"' in service_readme
    assert "NSSM" in service_readme
    assert "LocalSystem" in service_readme


def test_approval_editor_project_audio_previews_are_cacheable_for_editor_reopen():
    script = r"""
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApprovalEditorService } = require('./services/approval-editor/server.js');

(async () => {
  const projectsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'approval-editor-cache-'));
  const projectId = 'cache-project';
  const projectDir = path.join(projectsRoot, projectId);
  fs.mkdirSync(path.join(projectDir, 'audio'), { recursive: true });
  fs.writeFileSync(path.join(projectDir, 'audio', 'voice-preview.mp3'), 'preview-audio');
  fs.writeFileSync(path.join(projectDir, 'snapshots.json'), JSON.stringify([{
    snapshot: { projectId, snapshotId: 's1', snapshotHash: 'h1' },
    snapshotId: 's1',
    snapshotHash: 'h1',
    updatedAt: new Date().toISOString(),
  }], null, 2));

  const server = createApprovalEditorService({ projectsRoot });
  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/projects/${projectId}/files/audio/voice-preview.mp3`);
    const body = await response.text();
    if (!response.ok) throw new Error(`expected 200, got ${response.status}: ${body}`);
    if (body !== 'preview-audio') throw new Error(`body drift: ${body}`);
    const cacheControl = response.headers.get('cache-control') || '';
    if (!cacheControl.includes('public') || !cacheControl.includes('max-age=')) {
      throw new Error(`missing cacheable preview header: ${cacheControl}`);
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(projectsRoot, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
"""
    result = subprocess.run(
        ["node", "-e", script],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr
