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


def test_approval_editor_creation_canonically_defaults_boundary_transitions():
    script = r"""
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApprovalEditorService } = require('./services/approval-editor/server.js');

(async () => {
  const projectsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'approval-editor-boundary-defaults-'));
  const server = createApprovalEditorService({
    projectsRoot,
    alignVoiceAudio: async ({ segments }) => ({
      segments: segments.map((segment, index) => ({ ...segment, startTime: index, endTime: index + 1 })),
      alignedTimings: { phrases: segments.map((_segment, index) => ({ startTime: index, endTime: index + 1 })) },
      alignmentStatus: { status: 'ready', source: 'test', generatedAt: '2026-05-25T00:00:00.000Z' },
      paths: null,
    }),
    prepareAudioPreview: async () => null,
  });
  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/projects/create-from-approval`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        project_id: 'boundary-defaults-project',
        title: 'Boundary Defaults Project',
        voice_audio: { public_url: 'https://example.test/voice.wav' },
        background_audio: { public_url: 'https://example.test/music.wav' },
        selected_images: ['https://example.test/1.jpg', 'https://example.test/2.jpg', 'https://example.test/3.jpg', 'https://example.test/4.jpg', 'https://example.test/5.jpg'],
        segments: [
          { id: 'row-1', phrase: 'Intro', paragraphBoundaryAfter: true },
          { id: 'row-2', phrase: 'Middle', paragraphBoundaryAfter: true, transition: 'fade' },
          { id: 'row-3', phrase: 'Manual whip', paragraphBoundaryAfter: true, transition: 'whip', transitionConfig: { type: 'whip', durationSeconds: 0.5, direction: 'left-to-right' }, sfx: 'whip' },
          { id: 'row-4', phrase: 'Manual glitch', paragraphBoundaryAfter: true, transition: 'glitch-1', transitionConfig: { type: 'overlay-video', assetId: 'custom-glitch-1' } },
          { id: 'row-5', phrase: 'Manual none', paragraphBoundaryAfter: true, transition: 'none', transitionSource: 'manual' },
          { id: 'row-6', phrase: 'Close' },
        ],
      }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(`expected create success, got ${response.status}: ${JSON.stringify(payload)}`);
    const snapshot = payload.data.snapshot;
    if (snapshot.rows[0].transition !== 'glitch-1') throw new Error(`expected first eligible boundary to default glitch-1, got ${snapshot.rows[0].transition}`);
    if (snapshot.rows[0].transitionSource !== 'auto') throw new Error(`expected first default provenance auto, got ${snapshot.rows[0].transitionSource}`);
    if (snapshot.rows[0].transitionConfig?.assetId !== 'glitch-1') throw new Error(`expected glitch-1 config, got ${JSON.stringify(snapshot.rows[0].transitionConfig)}`);
    if (snapshot.rows[1].transition !== 'glitch-2') throw new Error(`expected second eligible boundary to default glitch-2, got ${snapshot.rows[1].transition}`);
    if (snapshot.rows[1].transitionSource !== 'auto') throw new Error(`expected second default provenance auto, got ${snapshot.rows[1].transitionSource}`);
    if (snapshot.rows[1].transitionConfig?.assetId !== 'glitch-2') throw new Error(`expected glitch-2 config, got ${JSON.stringify(snapshot.rows[1].transitionConfig)}`);
    if (snapshot.rows[2].transition !== 'whip') throw new Error(`expected explicit whip preserved, got ${snapshot.rows[2].transition}`);
    if (snapshot.rows[3].transition !== 'glitch-1') throw new Error(`expected explicit glitch-1 preserved, got ${snapshot.rows[3].transition}`);
    if (snapshot.rows[3].transitionConfig?.assetId !== 'custom-glitch-1') throw new Error(`expected explicit transitionConfig preserved, got ${JSON.stringify(snapshot.rows[3].transitionConfig)}`);
    if (snapshot.rows[4].transition !== 'none') throw new Error(`expected explicit manual none preserved, got ${snapshot.rows[4].transition}`);
    if (snapshot.rows[4].transitionSource !== 'manual') throw new Error(`expected manual none provenance preserved, got ${snapshot.rows[4].transitionSource}`);
    if (snapshot.rows[4].transitionConfig) throw new Error(`expected manual none to clear transitionConfig, got ${JSON.stringify(snapshot.rows[4].transitionConfig)}`);
    if (!snapshot.assets?.['glitch-1'] || !snapshot.assets?.['glitch-2']) throw new Error(`expected canonical glitch assets, got ${JSON.stringify(snapshot.assets)}`);
    if (payload.data.snapshotHash !== snapshot.snapshotHash) throw new Error('expected response snapshotHash to match canonical snapshot hash');
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


def test_video_engine_render_scaffold_preserves_boundary_transition_metadata():
    script = r"""
const { buildMinimalRenderScaffold } = require('./services/approval-editor/lib/video-engine-render-adapter.js');

const scaffold = buildMinimalRenderScaffold({
  projectId: 'render-boundary-project',
  title: 'Render Boundary Project',
  snapshot: {
    rows: [
      { id: 'row-1', phrase: 'Intro', paragraphBoundaryAfter: true, nextRowId: 'row-2', transition: 'glitch-1', transitionSource: 'auto', transitionConfig: { type: 'overlay-video', assetId: 'glitch-1', renderPath: 'overlays/GLITCH 1 NUEVO.mp4' }, sfx: null },
      { id: 'row-2', phrase: 'Close' },
    ],
  },
});

const row = scaffold.rows[0];
if (row.paragraphBoundaryAfter !== true || row.nextRowId !== 'row-2') throw new Error(`expected boundary metadata preserved, got ${JSON.stringify(row)}`);
if (row.transition !== 'glitch-1') throw new Error(`expected transition preserved, got ${row.transition}`);
if (row.transitionSource !== 'auto') throw new Error(`expected transition provenance preserved, got ${row.transitionSource}`);
if (row.transitionConfig?.assetId !== 'glitch-1') throw new Error(`expected transitionConfig preserved, got ${JSON.stringify(row.transitionConfig)}`);
"""
    result = subprocess.run(
        ["node", "-e", script],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr


def test_approval_editor_set_boundary_transition_none_preserves_manual_removal():
    script = r"""
const { applyContractOperations } = require('./services/approval-editor/lib/contract-updates.js');

const snapshot = {
  projectId: 'boundary-none-project',
  snapshotId: 's1',
  snapshotHash: 'h1',
  rows: [
    { id: 'row-1', rowId: 'row-1', startTime: 0, endTime: 1, paragraphBoundaryAfter: true, nextRowId: 'row-2', transition: 'glitch-1', transitionSource: 'auto', transitionConfig: { type: 'overlay-video', assetId: 'glitch-1' }, sfx: null },
    { id: 'row-2', rowId: 'row-2', startTime: 1, endTime: 2, transition: 'none' },
  ],
  assets: { 'glitch-1': { assetId: 'glitch-1', type: 'video' } },
};

const next = applyContractOperations(snapshot, [
  { type: 'setBoundaryTransition', rowId: 'row-1', nextRowId: 'row-2', paragraphBoundaryAfter: true, transition: 'none' },
]);
const row = next.rows[0];
if (row.transition !== 'none') throw new Error(`expected manual none, got ${row.transition}`);
if (row.transitionSource !== 'manual') throw new Error(`expected manual provenance, got ${row.transitionSource}`);
if (row.transitionConfig) throw new Error(`expected transitionConfig removed, got ${JSON.stringify(row.transitionConfig)}`);
if (row.sfx !== null) throw new Error(`expected sfx null, got ${JSON.stringify(row.sfx)}`);
if (next.snapshotHash === 'h1') throw new Error('expected snapshot hash to change after manual removal');
"""
    result = subprocess.run(
        ["node", "-e", script],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr
