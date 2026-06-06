from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def _read(relative_path: str) -> str:
    return (ROOT / relative_path).read_text(encoding="utf-8")


def test_shell_contract_has_no_ai_rescue_view_css_or_lazy_loader():
    checked_files = [
        "index.html",
        "styles.css",
        "js/modules/core/ui/css-loader.js",
        "js/modules/app-shell/composition.js",
        "js/modules/app-shell/runtime.js",
        "js/modules/app-shell/views/navigation.js",
        "js/modules/shared/dom/selectors.js",
        "js/modules/__checks__/manifest.js",
    ]

    for relative_path in checked_files:
        source = _read(relative_path).casefold()
        assert "airescue" not in source, f"legacy AI Rescue camelCase selector remains in {relative_path}"
        assert "ai-rescue" not in source, f"legacy AI Rescue feature reference remains in {relative_path}"


def test_ai_rescue_frontend_modules_and_styles_are_removed_from_disk():
    removed_paths = [
        "js/modules/features/ai-rescue",
        "js/modules/app-shell/views/templates/ai-rescue-view.js",
        "js/modules/__checks__/ai-rescue-panel-check.js",
        "styles/features/ai-rescue.css",
    ]

    for relative_path in removed_paths:
        assert not (ROOT / relative_path).exists(), f"legacy AI Rescue path still exists: {relative_path}"


def test_radar_and_rejected_video_surfaces_remain_declared():
    radar_template_source = _read("js/modules/app-shell/views/templates/radar-view.js")
    selectors_source = _read("js/modules/shared/dom/selectors.js")

    for required in ["viewRadar", "radarBasuraBtn", "radarBasuraDialog", "radarBasuraList"]:
        assert required in radar_template_source or required == "viewRadar"
        assert required in selectors_source
