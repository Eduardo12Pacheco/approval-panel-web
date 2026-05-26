from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
HEADERS_PATH = ROOT / "_headers"


def test_cloudflare_pages_headers_cache_static_webm_preview_assets_without_changing_global_security_headers():
    source = HEADERS_PATH.read_text(encoding="utf-8")

    assert "/*\n  X-Frame-Options: DENY" in source  # Cloudflare glob, NOT a comment
    assert (
        "/assets/*.webm\n  Cache-Control: public, max-age=31536000, immutable" in source
    )
    assert (
        "/favicon.svg\n  Cache-Control: public, max-age=31536000, immutable" in source
    )


def test_cloudflare_pages_headers_revalidate_html_and_app_code_without_global_cache_policy():
    source = HEADERS_PATH.read_text(encoding="utf-8")
    global_block = source.split("/assets/*.webm", 1)[0]
    app_code_policy = "Cache-Control: no-store, max-age=0"

    assert "/*\n  X-Frame-Options: DENY" in global_block
    assert (
        "Permissions-Policy: geolocation=(), microphone=(), camera=()" in global_block
    )
    assert f"/\n  {app_code_policy}" in source
    assert f"/index.html\n  {app_code_policy}" in source
    assert f"/js/main.js\n  {app_code_policy}" in source
    assert f"/js/modules/**/*.js\n  {app_code_policy}" in source
    assert f"/js/modules/**/*.mjs\n  {app_code_policy}" in source
    assert f"/styles.css\n  {app_code_policy}" in source
    assert f"/styles/**/*.css\n  {app_code_policy}" in source
    assert "max-age=604800" not in source
