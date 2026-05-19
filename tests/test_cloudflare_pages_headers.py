from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
HEADERS_PATH = ROOT / "_headers"


def test_cloudflare_pages_headers_cache_static_webm_preview_assets_without_changing_global_security_headers():
    source = HEADERS_PATH.read_text(encoding="utf-8")

    assert "/*\n  X-Frame-Options: DENY" in source
    assert "/assets/*.webm\n  Cache-Control: public, max-age=31536000, immutable" in source


def test_cloudflare_pages_headers_revalidate_html_and_app_code_without_global_cache_policy():
    source = HEADERS_PATH.read_text(encoding="utf-8")
    global_block = source.split("/assets/*.webm", 1)[0]

    assert "/*\n  X-Frame-Options: DENY" in global_block
    assert "Permissions-Policy: geolocation=(), microphone=(), camera=()" in global_block
    assert "/\n  Cache-Control: no-cache, max-age=0, must-revalidate" in source
    assert "/js/main.js\n  Cache-Control: no-cache, max-age=0, must-revalidate" in source
    assert "/js/modules/**/*.js\n  Cache-Control: no-cache, max-age=0, must-revalidate" in source
    assert "max-age=604800" not in source
