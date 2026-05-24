from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WORKSPACE = ROOT.parent
ROLLOUT_CHECKLIST = ROOT / "docs" / "collaboration-boundary-rollout-checklist.md"


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def test_rollout_checklist_documents_cloudflare_and_tunnel_verification_without_guessing_settings():
    source = _read(ROLLOUT_CHECKLIST)

    for expected in [
        "Cloudflare Pages",
        "Cloudflare Tunnel",
        "do not guess deployed settings",
        "verify the deployed Pages project environment",
        "verify tunnel ingress points to the gateway",
        "api.automatizacionedun8n.me",
        "http://127.0.0.1:8099",
        "two-browser smoke",
    ]:
        assert expected in source

    for forbidden in ["cloudflared tunnel token", "-----BEGIN", "secret=", "x-api-key="]:
        assert forbidden not in source.lower()


def test_readmes_and_agent_notes_pin_authenticated_boundary_and_voice_tts_no_drift():
    control_panel_readme = _read(ROOT / "README.md")
    gateway_readme = _read(WORKSPACE / "10-Api-Gateway" / "README.md")
    agents = _read(ROOT / "AGENTS.md")

    for source in [control_panel_readme, gateway_readme, agents]:
        assert "authenticated gateway" in source.lower()
        assert "Cloudflare" in source
        assert "do not guess" in source.lower()

    assert "Do not change Voice TTS behavior" in agents
    assert "presets, refs, segmentation, sample rate, artifacts" in agents


def test_rollout_checklist_records_manual_two_browser_smoke_plan():
    source = _read(ROLLOUT_CHECKLIST)

    for expected in [
        "Browser A",
        "Browser B",
        "same app version",
        "same settings source",
        "unauthenticated direct local service calls are denied",
        "no secrets, stack traces, or filesystem paths",
    ]:
        assert expected in source
