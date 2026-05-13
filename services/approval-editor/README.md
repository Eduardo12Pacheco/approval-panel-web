# Approval Editor Service

Local service for Approval-owned editor snapshots. The active service boundary is `01-Control-Panel/services/approval-editor/` and it keeps the runtime contract `approval-editor-service-v1`, default port `3042`, `/health`, `/api/*`, and `/api/overlays/*` unchanged.

Review path: start the service from `01-Control-Panel/`, run the focused checks below, and only then inspect path/import/docs diffs. Do not run a build for this boundary cleanup.

It requires real Whisper alignment by default; estimated timings only run when `ALLOW_ESTIMATED_TIMINGS=true` is explicitly set.

## RTX 4060 / faster-whisper large-v3

```powershell
$env:APPROVAL_EDITOR_SERVICE_PORT = "3042"
$env:STT_WHISPER_MODEL = "C:\Users\pelot\Desktop\n8n\local\models\faster-whisper-large-v3"
$env:STT_WHISPER_DEVICE = "cuda"
$env:STT_WHISPER_COMPUTE_TYPE = "float16"
$env:REMOTION_EDITOR_PYTHON_BIN = "C:\Users\pelot\AppData\Local\Programs\Python\Python311\python.exe"
# Optional only if ffmpeg-static is not available from 02-Video-Engine/node_modules:
# $env:FFMPEG_PATH = "C:\path\to\ffmpeg.exe"
node .\services\approval-editor\server.js
```

For NSSM/service usage, do not rely on the Windows `py` launcher. Services can run as `LocalSystem` or another non-interactive account that cannot see the current user's Python launcher registry. Configure `REMOTION_EDITOR_PYTHON_BIN` or `APPROVAL_EDITOR_PYTHON_BIN` with the full Python 3.11 `python.exe` path, then restart the Approval Editor service so the environment is reloaded.

If CUDA transcription fails, the service retries `cpu/int8` once. If real alignment still fails, `/api/projects/create-from-approval` returns `alignmentStatus.status = "failed"` and the browser client refuses to enter the editor with fake ready timings.

## Focused checks

From `01-Control-Panel/`:

```powershell
node --check .\services\approval-editor\server.js
node --check .\services\approval-editor\lib\asset-resolver.js
node --check .\services\approval-editor\lib\audio-preview.js
node --check .\services\approval-editor\lib\contract-store.js
node --check .\services\approval-editor\lib\contract-updates.js
node --check .\services\approval-editor\lib\hash.js
node --check .\services\approval-editor\lib\motion-presets.js
node --check .\services\approval-editor\lib\real-alignment.js
node .\js\modules\__checks__\approval-editor-service-timings.check.cjs
pytest .\tests\test_approval_editor_service_boundary_cleanup.py
```

From `02-Video-Engine/`:

```powershell
node --test .\tests\approval-editor-service-v1.test.js
```

## Runtime projects data

`01-Control-Panel/services/approval-editor/projects/` is local runtime data and remains ignored by git. If you still have snapshots in `01-Control-Panel/approval-editor-service/projects/`, move them manually to `01-Control-Panel/services/approval-editor/projects/` or keep a backup before starting the service from the new boundary.
