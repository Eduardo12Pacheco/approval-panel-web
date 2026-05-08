# Approval Editor Service

Local service for Approval-owned editor snapshots. It now requires real Whisper alignment by default; estimated timings only run when `ALLOW_ESTIMATED_TIMINGS=true` is explicitly set.

## RTX 4060 / faster-whisper large-v3

```powershell
$env:APPROVAL_EDITOR_SERVICE_PORT = "3042"
$env:STT_WHISPER_MODEL = "C:\Users\pelot\Desktop\n8n\models\faster-whisper-large-v3"
$env:STT_WHISPER_DEVICE = "cuda"
$env:STT_WHISPER_COMPUTE_TYPE = "float16"
$env:REMOTION_EDITOR_PYTHON_BIN = "py"
# Optional only if ffmpeg-static is not available from RemotionEditor/node_modules:
# $env:FFMPEG_PATH = "C:\path\to\ffmpeg.exe"
node .\server.js
```

If CUDA transcription fails, the service retries `cpu/int8` once. If real alignment still fails, `/api/projects/create-from-approval` returns `alignmentStatus.status = "failed"` and the browser client refuses to enter the editor with fake ready timings.
