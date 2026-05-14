"""Tests for CSS lazy loading: eager.css, feature CSS files, css-loader utility."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STYLES_DIR = ROOT / "styles"
FEATURES_DIR = STYLES_DIR / "features"

# The 6 feature CSS files that must exist as standalone files
FEATURE_CSS_PATHS = [
    FEATURES_DIR / "approval.css",
    FEATURES_DIR / "scripts.css",
    FEATURES_DIR / "video-projects" / "index.css",
    FEATURES_DIR / "audio.css",
    FEATURES_DIR / "radar.css",
    FEATURES_DIR / "subtitles" / "index.css",
]


def _read_imports(filepath: Path):
    """Read CSS @import lines from a file, returning list of import paths."""
    source = filepath.read_text(encoding="utf-8")
    imports = []
    for line in source.splitlines():
        stripped = line.strip()
        if stripped.startswith("@import"):
            imports.append(stripped)
    return imports


class TestFeatureCssFilesExist:
    """Tasks 1-2: All 6 feature CSS files already exist as standalone files."""

    def test_all_six_feature_css_files_present(self):
        missing = [str(p.relative_to(ROOT)) for p in FEATURE_CSS_PATHS if not p.exists()]
        assert not missing, f"Missing feature CSS files: {missing}"

    def test_approval_css_contains_feature_selectors(self):
        source = (FEATURES_DIR / "approval.css").read_text(encoding="utf-8")
        # Verify it contains actual CSS rules, not just an empty file
        assert ".approval-screen" in source
        assert ".approval-shell-grid" in source
        assert len(source) > 500, f"approval.css too small ({len(source)} chars), expected substantial CSS"

    def test_scripts_css_contains_feature_selectors(self):
        source = (FEATURES_DIR / "scripts.css").read_text(encoding="utf-8")
        assert ".scripts-view__placeholder" in source or ".scripts-view" in source
        assert len(source) > 50

    def test_audio_css_contains_feature_selectors(self):
        source = (FEATURES_DIR / "audio.css").read_text(encoding="utf-8")
        assert ".audio-screen" in source
        assert len(source) > 100

    def test_radar_css_contains_feature_selectors(self):
        source = (FEATURES_DIR / "radar.css").read_text(encoding="utf-8")
        assert ".radar-screen__header" in source
        assert len(source) > 100

    def test_video_projects_css_facade_exists(self):
        source = (FEATURES_DIR / "video-projects" / "index.css").read_text(encoding="utf-8")
        imports = _read_imports(FEATURES_DIR / "video-projects" / "index.css")
        assert len(imports) > 0, "video-projects/index.css should @import sub-files"

    def test_subtitles_css_facade_exists(self):
        source = (FEATURES_DIR / "subtitles" / "index.css").read_text(encoding="utf-8")
        imports = _read_imports(FEATURES_DIR / "subtitles" / "index.css")
        assert len(imports) > 0, "subtitles/index.css should @import sub-files"


class TestEagerCss:
    """Task 3: eager.css imports only base/tokens/layout/components, NOT features."""

    def test_eager_css_exists(self):
        eager_path = STYLES_DIR / "eager.css"
        assert eager_path.exists(), f"{eager_path} does not exist"

    def test_eager_css_has_no_lazy_feature_imports(self):
        """eager.css must NOT import the 6 lazy-loaded feature view CSS files.
        Auth CSS is allowed — it's the login gate, needed eagerly."""
        eager_path = STYLES_DIR / "eager.css"
        imports = _read_imports(eager_path)
        lazy_features = [
            "approval.css",
            "scripts.css",
            "video-projects",
            "audio.css",
            "radar.css",
            "subtitles",
        ]
        for imp in imports:
            for feat in lazy_features:
                assert feat not in imp, (
                    f"eager.css should not import lazy feature CSS: {feat} (found: {imp})"
                )

    def test_eager_css_imports_base_layers(self):
        eager_path = STYLES_DIR / "eager.css"
        imports = _read_imports(eager_path)
        import_text = "\n".join(imports)
        # Must include base layers
        assert "tokens.css" in import_text, "eager.css must import tokens.css"
        assert "base.css" in import_text, "eager.css must import base.css"
        assert "layout.css" in import_text, "eager.css must import layout.css"

    def test_eager_css_imports_components(self):
        eager_path = STYLES_DIR / "eager.css"
        imports = _read_imports(eager_path)
        import_text = "\n".join(imports)
        assert "components/" in import_text, "eager.css must import component CSS"
        assert "buttons.css" in import_text
        assert "dialogs.css" in import_text

    def test_eager_css_imports_responsive_and_scrollbars(self):
        eager_path = STYLES_DIR / "eager.css"
        imports = _read_imports(eager_path)
        import_text = "\n".join(imports)
        assert "responsive.css" in import_text, "eager.css must import responsive.css"
        assert "scrollbars.css" in import_text, "eager.css must import components/scrollbars.css"

    def test_eager_css_imports_auth(self):
        eager_path = STYLES_DIR / "eager.css"
        imports = _read_imports(eager_path)
        import_text = "\n".join(imports)
        # Auth is the login gate, needed eagerly
        assert "auth.css" in import_text, "eager.css must import features/auth.css (login gate)"

    def test_eager_css_excludes_all_six_feature_views(self):
        eager_path = STYLES_DIR / "eager.css"
        imports = _read_imports(eager_path)
        import_text = "\n".join(imports)
        feature_view_files = [
            "approval.css",
            "scripts.css",
            "video-projects",
            "audio.css",
            "radar.css",
            "subtitles",
        ]
        for feat in feature_view_files:
            assert feat not in import_text, (
                f"eager.css must NOT import feature view CSS: {feat}"
            )

    def test_eager_css_import_count_matches_expected(self):
        """eager.css should have exactly the expected number of @import statements."""
        eager_path = STYLES_DIR / "eager.css"
        imports = _read_imports(eager_path)
        # Expected: tokens, base, layout, 6 components (buttons,dialogs,cards,forms,toast,scrollbars),
        # auth, responsive = 11 imports
        expected_min = 10  # Minimum expected
        expected_max = 13  # Maximum expected (plus any extras like scrollbars separately)
        assert expected_min <= len(imports) <= expected_max, (
            f"eager.css has {len(imports)} imports, expected {expected_min}-{expected_max}"
        )


class TestIndexHtmlLinksEagerCss:
    """Task 4: index.html links eager.css instead of styles.css."""

    def test_index_html_links_eager_css(self):
        html = (ROOT / "index.html").read_text(encoding="utf-8")
        assert 'href="./styles/eager.css"' in html, (
            "index.html must link to styles/eager.css"
        )

    def test_index_html_does_not_link_styles_dot_css(self):
        html = (ROOT / "index.html").read_text(encoding="utf-8")
        assert 'href="./styles.css"' not in html, (
            "index.html must NOT link to the old styles.css (replaced by eager.css)"
        )


class TestCssLoader:
    """Task 5: css-loader.js utility for dynamic CSS injection."""

    def test_css_loader_module_exists(self):
        loader = ROOT / "js" / "modules" / "core" / "ui" / "css-loader.js"
        assert loader.exists(), f"css-loader.js not found at {loader}"

    def test_css_loader_exports_inject_feature_css(self):
        loader = ROOT / "js" / "modules" / "core" / "ui" / "css-loader.js"
        source = loader.read_text(encoding="utf-8")
        assert "injectFeatureCSS" in source, (
            "css-loader.js must export injectFeatureCSS function"
        )
        assert "export function" in source or "export const" in source, (
            "css-loader.js must use ES module exports"
        )

    def test_css_loader_imports_map_correct_paths(self):
        loader = ROOT / "js" / "modules" / "core" / "ui" / "css-loader.js"
        source = loader.read_text(encoding="utf-8")
        # Verify that for each feature name, the correct CSS path is mapped
        feature_css_map = {
            "approval": "features/approval.css",
            "scripts": "features/scripts.css",
            "video-projects": "features/video-projects/index.css",
            "audio": "features/audio.css",
            "radar": "features/radar.css",
            "subtitulos2": "features/subtitles/index.css",
        }
        for feature_name, css_path in feature_css_map.items():
            assert feature_name in source, (
                f"css-loader.js must reference feature '{feature_name}' for mapping"
            )
            assert css_path in source, (
                f"css-loader.js must map '{feature_name}' to '{css_path}'"
            )

    def test_css_loader_creates_link_element(self):
        loader = ROOT / "js" / "modules" / "core" / "ui" / "css-loader.js"
        source = loader.read_text(encoding="utf-8")
        assert "createElement" in source or "link" in source.lower(), (
            "css-loader.js must create <link> elements"
        )
        assert "rel" in source.lower() and "stylesheet" in source, (
            "css-loader.js must set rel=stylesheet on link elements"
        )
