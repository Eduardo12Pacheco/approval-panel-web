from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
JS_MODULES = ROOT / "js" / "modules"
VERSION_HELPER = JS_MODULES / "core" / "versioning" / "asset-version.js"
COMPOSITION_PATH = JS_MODULES / "app-shell" / "composition.js"
RUNTIME_PATH = JS_MODULES / "app-shell" / "runtime.js"
CSS_LOADER_PATH = JS_MODULES / "core" / "ui" / "css-loader.js"
INDEX_PATH = ROOT / "index.html"


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _js_and_html_sources():
    yield INDEX_PATH
    yield ROOT / "js" / "main.js"
    yield from JS_MODULES.rglob("*.js")
    yield from (ROOT / "styles").rglob("*.css")


def test_cache_busting_version_helper_is_no_op_without_query_versioning():
    source = _read(VERSION_HELPER)

    assert "export const APP_CACHE_VERSION" in source
    assert "export function versionedModule" in source
    assert "export function versionedAsset" in source
    assert "new URL" in source
    assert "searchParams.set('v'" not in source, (
        "versionedModule/versionedAsset must not append ?v= query versioning; "
        "Cloudflare Pages _headers is the primary freshness mechanism"
    )
    assert "function withAppVersion" not in source, (
        "withAppVersion() wrapper must be removed; functions resolve URLs directly"
    )


def test_no_scattered_manual_version_query_params_remain_in_app_modules_or_html():
    offenders = []
    for path in _js_and_html_sources():
        # The version helper is now a no-op; include it in the scan.
        source = _read(path)
        for line_number, line in enumerate(source.splitlines(), start=1):
            if "?v=" not in line:
                continue
            if any(asset_marker in line for asset_marker in [".js?v=", ".css?v=", "styles/", "./js/main.js?v=", "@import"]):
                offenders.append(f"{path.relative_to(ROOT)}:{line_number}")

    assert offenders == []


def test_lazy_module_boundaries_use_central_versioned_import_helper():
    composition = _read(COMPOSITION_PATH)
    runtime = _read(RUNTIME_PATH)

    assert "versionedModule" in composition
    assert "versionedModule" in runtime

    for lazy_specifier in [
        "../features/video-projects/index.js",
        "../core/http/tts-api.js",
        "../features/audio/controller.js",
        "../features/audio/runtime/index.js",
        "../features/audio/index.js",
        "../features/subtitles/controller.js",
        "../features/subtitles/runtime/index.js",
        "../features/radar/state.js",
        "../features/radar/api-client.js",
        "../features/radar/controller.js",
    ]:
        assert f"import(versionedModule('{lazy_specifier}', import.meta.url))" in composition

    assert "import(versionedModule('../features/video-projects/render.js', import.meta.url))" in runtime
    assert "import(versionedModule('../features/audio/runtime/index.js', import.meta.url))" in runtime


def test_lazy_css_uses_versioned_asset_without_versioning_immutable_webm_assets():
    source = _read(CSS_LOADER_PATH)

    assert "versionedAsset" in source
    assert "link.href = versionedAsset(`./styles/${cssPath}`" in source
    assert "webm" not in source.lower()
