"""Tests for DOM lazy rendering: templates, dom-injector, index.html containers."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TEMPLATES_DIR = ROOT / "js" / "modules" / "app-shell" / "views" / "templates"
INDEX_HTML = ROOT / "index.html"


class TestTemplatesDirectory:
    """Task 7: templates directory exists."""

    def test_templates_directory_exists(self):
        assert TEMPLATES_DIR.exists(), f"Templates directory missing: {TEMPLATES_DIR}"
        assert TEMPLATES_DIR.is_dir(), f"Templates path is not a directory: {TEMPLATES_DIR}"


class TestScriptsViewTemplate:
    """Task 8: scripts-view.js template with exact DOM preservation."""

    def test_scripts_template_module_exists(self):
        tmpl = TEMPLATES_DIR / "scripts-view.js"
        assert tmpl.exists(), f"Missing template: {tmpl}"

    def test_scripts_template_exports_html_string(self):
        tmpl = TEMPLATES_DIR / "scripts-view.js"
        source = tmpl.read_text(encoding="utf-8")
        assert "export" in source, "Template must use ES module export"
        assert "scriptsViewHTML" in source or "scriptsHTML" in source, (
            "Template must export an HTML string variable"
        )

    def test_scripts_template_preserves_view_container_id(self):
        tmpl = TEMPLATES_DIR / "scripts-view.js"
        source = tmpl.read_text(encoding="utf-8")
        assert 'id="viewScripts"' in source, "Template must preserve #viewScripts container"

    def test_scripts_template_preserves_key_selectors(self):
        tmpl = TEMPLATES_DIR / "scripts-view.js"
        source = tmpl.read_text(encoding="utf-8")
        # Critical DOM IDs from the original scripts/video-projects view
        key_selectors = [
            'id="videoProjectsRefreshBtn"',
            'id="videoProjectsCatalog"',
            'id="videoProjectsList"',
            'id="videoProjectDetail"',
            'id="videoProjectsMeta"',
        ]
        for sel in key_selectors:
            assert sel in source, f"Template missing key selector: {sel}"

    def test_scripts_template_preserves_aria_attributes(self):
        tmpl = TEMPLATES_DIR / "scripts-view.js"
        source = tmpl.read_text(encoding="utf-8")
        # The scripts view uses aria-live for accessibility, not data-action
        assert 'aria-live' in source, "Template must preserve aria-live attributes"


class TestAudioViewTemplate:
    """Task 9: audio-view.js template."""

    def test_audio_template_module_exists(self):
        tmpl = TEMPLATES_DIR / "audio-view.js"
        assert tmpl.exists(), f"Missing template: {tmpl}"

    def test_audio_template_exports_html_string(self):
        tmpl = TEMPLATES_DIR / "audio-view.js"
        source = tmpl.read_text(encoding="utf-8")
        assert "export" in source

    def test_audio_template_preserves_key_selectors(self):
        tmpl = TEMPLATES_DIR / "audio-view.js"
        source = tmpl.read_text(encoding="utf-8")
        key_selectors = [
            'id="viewAudio"',
            'id="audioPresetSelect"',
            'id="audioTextArea"',
            'id="audioRunBtn"',
            'id="audioQueueList"',
            'id="audioWordCount"',
        ]
        for sel in key_selectors:
            assert sel in source, f"Audio template missing key selector: {sel}"


class TestRadarViewTemplate:
    """Task 10: radar-view.js template."""

    def test_radar_template_module_exists(self):
        tmpl = TEMPLATES_DIR / "radar-view.js"
        assert tmpl.exists(), f"Missing template: {tmpl}"

    def test_radar_template_exports_html_string(self):
        tmpl = TEMPLATES_DIR / "radar-view.js"
        source = tmpl.read_text(encoding="utf-8")
        assert "export" in source

    def test_radar_template_preserves_key_selectors(self):
        tmpl = TEMPLATES_DIR / "radar-view.js"
        source = tmpl.read_text(encoding="utf-8")
        key_selectors = [
            'id="viewRadar"',
            'id="radarNewJobBtn"',
            'id="radarNewJobDialog"',
            'id="radarQueueList"',
            'id="radarHistoryList"',
            'id="radarUrlInput"',
        ]
        for sel in key_selectors:
            assert sel in source, f"Radar template missing key selector: {sel}"


class TestSubtitlesViewTemplate:
    """Task 11: subtitles-view.js template."""

    def test_subtitles_template_module_exists(self):
        tmpl = TEMPLATES_DIR / "subtitles-view.js"
        assert tmpl.exists(), f"Missing template: {tmpl}"

    def test_subtitles_template_exports_html_string(self):
        tmpl = TEMPLATES_DIR / "subtitles-view.js"
        source = tmpl.read_text(encoding="utf-8")
        assert "export" in source

    def test_subtitles_template_preserves_key_selectors(self):
        tmpl = TEMPLATES_DIR / "subtitles-view.js"
        source = tmpl.read_text(encoding="utf-8")
        key_selectors = [
            'id="viewSubtitulos2"',
            'id="subtitle2UploadInput"',
            'id="subtitle2RowsBody"',
            'id="subtitle2PreviewVideo"',
            'id="subtitle2DownloadBtn"',
            'id="subtitle2SessionHistory"',
        ]
        for sel in key_selectors:
            assert sel in source, f"Subtitles template missing key selector: {sel}"

    def test_subtitles_template_preserves_data_action(self):
        tmpl = TEMPLATES_DIR / "subtitles-view.js"
        source = tmpl.read_text(encoding="utf-8")
        # Subtitles view has data-custom-dropdown attributes
        assert 'data-custom-dropdown' in source, "Template must preserve data-custom-dropdown attrs"


class TestDomInjector:
    """Task 12: dom-injector.js utility."""

    def test_dom_injector_module_exists(self):
        injector = ROOT / "js" / "modules" / "core" / "ui" / "dom-injector.js"
        assert injector.exists(), f"dom-injector.js not found at {injector}"

    def test_dom_injector_exports_inject_view_template(self):
        injector = ROOT / "js" / "modules" / "core" / "ui" / "dom-injector.js"
        source = injector.read_text(encoding="utf-8")
        assert "injectViewTemplate" in source, (
            "dom-injector.js must export injectViewTemplate function"
        )
        assert "export function" in source or "export const" in source

    def test_dom_injector_sets_inner_html(self):
        injector = ROOT / "js" / "modules" / "core" / "ui" / "dom-injector.js"
        source = injector.read_text(encoding="utf-8")
        assert "innerHTML" in source, (
            "dom-injector.js must use innerHTML to inject template content"
        )

    def test_dom_injector_handles_missing_container(self):
        injector = ROOT / "js" / "modules" / "core" / "ui" / "dom-injector.js"
        source = injector.read_text(encoding="utf-8")
        # Should have some guard for missing containers
        has_guard = any(token in source for token in ["if (!container", "if (container", "try", "catch"])
        assert has_guard, "dom-injector.js should guard against missing containers"


class TestIndexHtmlHiddenViewContainers:
    """Task 13: index.html has empty containers instead of full hidden views."""

    def test_index_html_has_empty_scripts_container(self):
        html = INDEX_HTML.read_text(encoding="utf-8")
        assert 'id="viewScripts"' in html, "index.html must retain #viewScripts container"
        # The container should be empty (no child markup beyond the section tag itself)
        # We verify the view-specific IDs are NOT in index.html
        assert 'id="videoProjectsRefreshBtn"' not in html, (
            "index.html must NOT contain video-projects DOM markup (moved to template)"
        )
        assert 'id="videoProjectsList"' not in html, (
            "index.html must NOT contain video projects list markup"
        )

    def test_index_html_has_empty_audio_container(self):
        html = INDEX_HTML.read_text(encoding="utf-8")
        assert 'id="viewAudio"' in html, "index.html must retain #viewAudio container"
        assert 'id="audioPresetSelect"' not in html, (
            "index.html must NOT contain audio DOM markup (moved to template)"
        )

    def test_index_html_has_empty_radar_container(self):
        html = INDEX_HTML.read_text(encoding="utf-8")
        assert 'id="viewRadar"' in html, "index.html must retain #viewRadar container"
        assert 'id="radarQueueList"' not in html, (
            "index.html must NOT contain radar DOM markup (moved to template)"
        )

    def test_index_html_has_empty_subtitles_container(self):
        html = INDEX_HTML.read_text(encoding="utf-8")
        assert 'id="viewSubtitulos2"' in html, "index.html must retain #viewSubtitulos2 container"
        assert 'id="subtitle2RowsBody"' not in html, (
            "index.html must NOT contain subtitles DOM markup (moved to template)"
        )

    def test_approval_view_remains_in_index_html(self):
        """Approval is the default view — its markup stays in index.html."""
        html = INDEX_HTML.read_text(encoding="utf-8")
        assert 'id="viewApproval"' in html, "Approval view must stay in index.html"
        assert 'id="searchInput"' in html, "Approval markup must stay in index.html"

    def test_index_html_retains_app_shell_chrome(self):
        html = INDEX_HTML.read_text(encoding="utf-8")
        assert 'id="appShell"' in html
        assert 'id="sidebarNav"' in html
        assert 'id="authGate"' in html
        assert 'id="toast"' in html

    def test_index_html_retains_dialogs(self):
        html = INDEX_HTML.read_text(encoding="utf-8")
        # All dialogs must stay in index.html
        dialog_ids = [
            "queueDialog", "topicDialog", "settingsDialog",
            "scriptEditorDialog", "scriptOriginalDialog",
            "publishConfirmDialog", "voicePresetDialog",
        ]
        for did in dialog_ids:
            assert f'id="{did}"' in html, f"Dialog {did} must stay in index.html"
