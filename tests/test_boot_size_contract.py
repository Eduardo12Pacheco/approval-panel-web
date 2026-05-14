"""Tests for boot size contract: eager.css import count, index.html hidden view removal."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX_HTML = ROOT / "index.html"
STYLES_DIR = ROOT / "styles"


class TestEagerCssBootSize:
    """Task 15a: eager.css import count matches expected (only base/tokens/layout/components)."""

    def test_eager_css_import_count(self):
        eager_path = STYLES_DIR / "eager.css"
        assert eager_path.exists(), "eager.css must exist"
        source = eager_path.read_text(encoding="utf-8")
        imports = [line.strip() for line in source.splitlines() if line.strip().startswith("@import")]
        # Expected: tokens, base, layout, buttons, dialogs, cards, forms, toast,
        #   auth, responsive, scrollbars = 11
        assert len(imports) == 11, (
            f"eager.css should have exactly 11 @import statements, found {len(imports)}: {imports}"
        )

    def test_eager_css_only_contains_imports(self):
        """eager.css should be import-only (no inline CSS rules)."""
        eager_path = STYLES_DIR / "eager.css"
        source = eager_path.read_text(encoding="utf-8")
        for line in source.splitlines():
            stripped = line.strip()
            if stripped and not stripped.startswith("@import"):
                # Allow blank lines and @import only
                raise AssertionError(
                    f"eager.css should be import-only, found non-import line: '{stripped}'"
                )


class TestIndexHtmlHiddenViewBootSize:
    """Task 15b: index.html has no hidden view markup beyond containers."""

    def test_index_html_no_scripts_view_markup(self):
        html = INDEX_HTML.read_text(encoding="utf-8")
        # These IDs belong to the scripts/video-projects view and should not be in index.html
        markup_ids = [
            "videoProjectsRefreshBtn",
            "videoProjectsCatalog",
            "videoProjectsMeta",
            "videoProjectsList",
            "videoProjectDetail",
        ]
        for mid in markup_ids:
            assert f'id="{mid}"' not in html, (
                f"index.html must NOT contain scripts view markup '{mid}' (moved to template)"
            )

    def test_index_html_no_audio_view_markup(self):
        html = INDEX_HTML.read_text(encoding="utf-8")
        markup_ids = [
            "audioPresetSelect",
            "audioTextArea",
            "audioWordCount",
            "audioClearBtn",
            "audioRunBtn",
            "audioQueueMeta",
            "audioQueueList",
        ]
        for mid in markup_ids:
            assert f'id="{mid}"' not in html, (
                f"index.html must NOT contain audio view markup '{mid}' (moved to template)"
            )

    def test_index_html_no_radar_view_markup(self):
        html = INDEX_HTML.read_text(encoding="utf-8")
        markup_ids = [
            "radarNewJobBtn",
            "radarHealthStatus",
            "radarHistoryList",
            "radarProgressStatus",
            "radarQueueList",
            "radarNewJobDialog",
            "radarSummaryDialog",
            "radarConfirmDialog",
        ]
        for mid in markup_ids:
            assert f'id="{mid}"' not in html, (
                f"index.html must NOT contain radar view markup '{mid}' (moved to template)"
            )

    def test_index_html_no_subtitles_view_markup(self):
        html = INDEX_HTML.read_text(encoding="utf-8")
        markup_ids = [
            "subtitle2PhaseBar",
            "subtitle2PhaseUpload",
            "subtitle2RowsTable",
            "subtitle2RowsBody",
            "subtitle2PreviewVideo",
            "subtitle2SessionHistory",
        ]
        for mid in markup_ids:
            assert f'id="{mid}"' not in html, (
                f"index.html must NOT contain subtitles view markup '{mid}' (moved to template)"
            )

    def test_index_html_retains_all_containers(self):
        """All view containers must still exist in index.html (empty)."""
        html = INDEX_HTML.read_text(encoding="utf-8")
        container_ids = [
            "viewApproval",    # Default view — keeps markup
            "viewScripts",     # Empty container
            "viewAudio",       # Empty container
            "viewRadar",       # Empty container
            "viewSubtitulos2", # Empty container
        ]
        for cid in container_ids:
            assert f'id="{cid}"' in html, f"View container {cid} must exist in index.html"

    def test_approval_view_has_full_markup_in_index(self):
        """Approval (default view) keeps its complete markup in index.html."""
        html = INDEX_HTML.read_text(encoding="utf-8")
        # Approval-specific IDs that must remain
        approval_ids = [
            "searchInput",
            "countryFilter",
            "sourcesFilter",
            "cardsMeta",
            "cards",
            "scriptEditorTitle",
        ]
        for aid in approval_ids:
            assert f'id="{aid}"' in html, (
                f"Approval markup '{aid}' must stay in index.html (default view)"
            )

    def test_index_html_size_is_reduced(self):
        """After removing hidden views, index.html should be significantly smaller."""
        html = INDEX_HTML.read_text(encoding="utf-8")
        # The 4 hidden views (scripts, audio, radar, subtitles) account for ~33KB
        # After removal, index.html should be under 600 lines (was ~800)
        line_count = len(html.splitlines())
        assert line_count < 600, (
            f"index.html should have fewer than 600 lines after hidden view removal, "
            f"found {line_count}"
        )

    def test_original_styles_css_still_exists(self):
        """styles.css (the full import file) must still exist for reference."""
        styles_css = ROOT / "styles.css"
        assert styles_css.exists(), "styles.css must still exist (reference file)"
