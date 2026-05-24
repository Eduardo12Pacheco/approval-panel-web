from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
APP_SHELL_PATH = ROOT / "js" / "modules" / "app-shell.js"
COMPOSITION_ROOT_PATH = ROOT / "js" / "modules" / "composition-root.js"
CONTRACT_MATRIX_PATH = ROOT / "docs" / "parity" / "contract-matrix.md"

TTS_API_PATH = ROOT / "js" / "modules" / "core" / "http" / "tts-api.js"
AUDIO_FEATURE_PATH = ROOT / "js" / "modules" / "features" / "audio" / "index.js"
SUBTITLES_FEATURE_PATH = ROOT / "js" / "modules" / "features" / "subtitles" / "index.js"


def test_phase4_modules_exist_for_audio_subtitles_and_tts_api_boundary():
    required = [
        TTS_API_PATH,
        AUDIO_FEATURE_PATH,
        SUBTITLES_FEATURE_PATH,
    ]
    missing = [str(path.relative_to(ROOT)) for path in required if not path.exists()]
    assert not missing, f"Missing Phase-4 modules: {missing}"


def test_tts_api_contract_preserves_gateway_read_headers_and_audio_subtitles_routes():
    source = TTS_API_PATH.read_text(encoding="utf-8")
    assert "createTtsApiClient" in source

    for token in ["resolveTtsSharedReadPath", "resolveSubtitlesSharedReadPath", "buildGatewayReadHeaders"]:
        assert token in source, f"Missing shared read adapter token: {token}"
    for token in ["x-api-key", "Authorization"]:
        assert token not in source, f"TTS client must not send browser service secret header: {token}"
    assert "x-user-email" not in source

    for endpoint in [
        "/api/tts/jobs",
        "/api/tts/jobs/${encodeURIComponent(jobId)}",
        "/api/subtitles/analyze",
        "/api/subtitles/review/snapshots",
        "/api/subtitles/review/approve",
        "/api/subtitles/render",
    ]:
        assert endpoint in source, f"Missing parity endpoint marker in TTS API module: {endpoint}"


def test_app_shell_delegates_audio_subtitles_flows_via_feature_and_tts_modules():
    source = APP_SHELL_PATH.read_text(encoding="utf-8")

    assert "./core/http/tts-api.js" in source
    assert "./features/audio/index.js" in source
    assert "./features/subtitles/runtime/index.js" in source

    for token in ["createTtsApiClient", "createAudioFeature", "resolveSubtitleProgressPercentRuntime", "api", "store", "ui", "selectors"]:
        assert token in source, f"Missing Phase-4 delegation token in app-shell: {token}"


def test_composition_root_centralizes_event_binding_route_map_for_remaining_slices():
    source = COMPOSITION_ROOT_PATH.read_text(encoding="utf-8")
    assert "EVENT_BINDING_ROUTE_MAP" in source
    assert "bindEventRoutingFromCompositionRoot" in source
    assert "audio" in source
    assert "subtitles" in source


def test_phase4_checkpoint_p3_and_rollback_scope_documented_in_contract_matrix():
    source = CONTRACT_MATRIX_PATH.read_text(encoding="utf-8")
    assert "Checkpoint P3" in source
    assert "audio/subtitles" in source
    assert "features/audio" in source
    assert "features/subtitles" in source
    assert "tts-api.js" in source
