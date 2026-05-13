from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
HEADERS_PATH = ROOT / "_headers"


def test_cloudflare_pages_headers_cache_static_webm_preview_assets_without_changing_global_security_headers():
    source = HEADERS_PATH.read_text(encoding="utf-8")

    assert "/*\n  X-Frame-Options: DENY" in source
    assert "/assets/*.webm\n  Cache-Control: public, max-age=31536000, immutable" in source


def test_cloudflare_pages_headers_do_not_add_global_cache_policy_to_html_shell():
    source = HEADERS_PATH.read_text(encoding="utf-8")
    global_block = source.split("/assets/*.webm", 1)[0]

    assert "Cache-Control" not in global_block
    assert "Permissions-Policy: geolocation=(), microphone=(), camera=()" in global_block
