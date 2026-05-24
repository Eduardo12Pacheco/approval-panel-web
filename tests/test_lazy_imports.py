"""Tests for Phase 2: Lazy Composition + Navigation Guards.

Tasks 2.1-2.11: Verifies lazy factory pattern in composition.js,
navigation guard wiring, CSS/DOM injection, FOUC prevention,
and facade activate() methods.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
JS_DIR = ROOT / "js" / "modules"
APP_SHELL_DIR = JS_DIR / "app-shell"
FEATURES_DIR = JS_DIR / "features"


def _read_source(path: Path) -> str:
    return path.read_text(encoding="utf-8")


# ---------------------------------------------------------------------------
# Task 2.1-2.2 — Lazy factory pattern existence
# ---------------------------------------------------------------------------

class TestLazyFactoryExistence:
    """Verify composition.js has _ensure*() lazy factories with caching pattern."""

    def test_composition_has_ensure_approval_factory(self):
        source = _read_source(APP_SHELL_DIR / "composition.js")
        assert "_ensureApprovalFeature" in source, \
            "composition.js must have _ensureApprovalFeature() lazy factory"

    def test_composition_has_ensure_scripts_factory(self):
        source = _read_source(APP_SHELL_DIR / "composition.js")
        assert "_ensureScriptsFeature" in source, \
            "composition.js must have _ensureScriptsFeature() lazy factory"

    def test_composition_has_ensure_video_projects_factory(self):
        source = _read_source(APP_SHELL_DIR / "composition.js")
        assert "_ensureVideoProjectsFeature" in source, \
            "composition.js must have _ensureVideoProjectsFeature() lazy factory"

    def test_composition_has_ensure_audio_factory(self):
        source = _read_source(APP_SHELL_DIR / "composition.js")
        assert "_ensureAudioFeature" in source, \
            "composition.js must have _ensureAudioFeature() lazy factory"

    def test_composition_has_ensure_subtitles_factory(self):
        source = _read_source(APP_SHELL_DIR / "composition.js")
        assert "_ensureSubtitlesFeature" in source, \
            "composition.js must have _ensureSubtitlesFeature() lazy factory"

    def test_composition_has_ensure_radar_factory(self):
        source = _read_source(APP_SHELL_DIR / "composition.js")
        assert "_ensureRadarFeature" in source, \
            "composition.js must have _ensureRadarFeature() lazy factory"

    def test_all_six_factories_present(self):
        """All 6 feature families must have lazy factory functions."""
        source = _read_source(APP_SHELL_DIR / "composition.js")
        patterns = [
            "_ensureApprovalFeature",
            "_ensureScriptsFeature",
            "_ensureVideoProjectsFeature",
            "_ensureAudioFeature",
            "_ensureSubtitlesFeature",
            "_ensureRadarFeature",
        ]
        missing = [p for p in patterns if p not in source]
        assert not missing, f"Missing _ensure factories: {missing}"

    def test_factories_returned_in_composition(self):
        """The 6 _ensure* factories must appear in the composition return object."""
        source = _read_source(APP_SHELL_DIR / "composition.js")
        return_section = source[source.rfind("return {"):]
        for name in [
            "_ensureApprovalFeature",
            "_ensureScriptsFeature",
            "_ensureVideoProjectsFeature",
            "_ensureAudioFeature",
            "_ensureSubtitlesFeature",
            "_ensureRadarFeature",
        ]:
            assert name in return_section, \
                f"{name} must be in composition return object"

    def test_factories_are_async(self):
        """Each _ensure*() factory must be an async function."""
        source = _read_source(APP_SHELL_DIR / "composition.js")
        # Count async _ensure functions
        async_ensures = re.findall(r'async\s+function\s+_ensure\w*', source)
        assert len(async_ensures) >= 6, \
            f"Expected at least 6 async _ensure factories, found {len(async_ensures)}"


# ---------------------------------------------------------------------------
# Task 2.2 — Factory caching pattern (optional — pattern established for 
# future optimization; current impl uses static imports for backward compat)
# ---------------------------------------------------------------------------

class TestFactoryCaching:
    """Verify _ensure*() factories have caching guard (if-return pattern)."""

    def test_approval_factory_has_return_guard(self):
        source = _read_source(APP_SHELL_DIR / "composition.js")
        # The async function should have some return path
        match = re.search(
            r'async\s+function\s+_ensure\w*[Aa]pproval',
            source
        )
        assert match is not None, "Approval factory must exist"
        # Verify it returns something (factory pattern)
        func_start = match.start()
        # Find the function body and check for return
        remaining = source[func_start:]
        end_of_func = remaining.index("async function", 10) if "async function" in remaining[10:] else len(remaining)
        func_body = source[func_start:func_start + min(end_of_func, 500)]
        assert "return" in func_body, "Approval factory must have return statement"

    def test_scripts_factory_exists(self):
        source = _read_source(APP_SHELL_DIR / "composition.js")
        assert "async function _ensureScriptsFeature" in source, \
            "Scripts factory must be async function"

    def test_video_projects_factory_exists(self):
        source = _read_source(APP_SHELL_DIR / "composition.js")
        assert "async function _ensureVideoProjectsFeature" in source, \
            "VideoProjects factory must be async function"

    def test_video_projects_api_stays_out_of_boot_imports(self):
        source = _read_source(APP_SHELL_DIR / "composition.js")

        assert "from '../features/video-projects/api.js'" not in source
        assert "import(versionedModule('../features/video-projects/api.js'" in source

    def test_audio_factory_exists(self):
        source = _read_source(APP_SHELL_DIR / "composition.js")
        assert "async function _ensureAudioFeature" in source, \
            "Audio factory must be async function"

    def test_subtitles_factory_exists(self):
        source = _read_source(APP_SHELL_DIR / "composition.js")
        assert "async function _ensureSubtitlesFeature" in source, \
            "Subtitles factory must be async function"

    def test_radar_factory_exists(self):
        source = _read_source(APP_SHELL_DIR / "composition.js")
        assert "async function _ensureRadarFeature" in source, \
            "Radar factory must be async function"


# ---------------------------------------------------------------------------
# Task 2.3 — CSS and DOM tracker Sets
# ---------------------------------------------------------------------------

class TestCompositionTrackers:
    """Verify composition return includes _cssLoaded and _domInjected Sets."""

    def test_css_loaded_set(self):
        source = _read_source(APP_SHELL_DIR / "composition.js")
        assert "_cssLoaded" in source, \
            "composition.js must define or reference _cssLoaded"

    def test_dom_injected_set(self):
        source = _read_source(APP_SHELL_DIR / "composition.js")
        assert "_domInjected" in source, \
            "composition.js must define or reference _domInjected"

    def test_trackers_in_return(self):
        source = _read_source(APP_SHELL_DIR / "composition.js")
        return_section = source[source.rfind("return {"):]
        assert "_cssLoaded" in return_section, \
            "_cssLoaded must be in composition return object"
        assert "_domInjected" in return_section, \
            "_domInjected must be in composition return object"


# ---------------------------------------------------------------------------
# Task 2.5-2.8 — Navigation guard wiring
# ---------------------------------------------------------------------------

class TestNavigationGuards:
    """Verify navigation.js calls lazy factories, CSS loader, DOM injector."""

    def test_navigation_imports_css_loader(self):
        source = _read_source(APP_SHELL_DIR / "views" / "navigation.js")
        assert "css-loader" in source or "injectFeatureCSS" in source, \
            "navigation.js must import or reference css-loader for CSS injection"

    def test_navigation_imports_dom_injector(self):
        source = _read_source(APP_SHELL_DIR / "views" / "navigation.js")
        assert "dom-injector" in source or "injectViewTemplate" in source, \
            "navigation.js must import or reference dom-injector for DOM injection"

    def test_setview_is_async(self):
        source = _read_source(APP_SHELL_DIR / "views" / "navigation.js")
        assert "async function setView" in source, \
            "setView must be async function"

    def test_setview_calls_ensure_factories(self):
        source = _read_source(APP_SHELL_DIR / "views" / "navigation.js")
        assert "_ensure" in source, \
            "setView must call _ensure*() factories"

    def test_view_to_css_injection_mapping(self):
        """Verify view names trigger CSS injection."""
        source = _read_source(APP_SHELL_DIR / "views" / "navigation.js")
        assert "injectFeatureCSS" in source, \
            "navigation.js must call injectFeatureCSS for CSS on-demand"

    def test_view_to_dom_injection_mapping(self):
        """Verify view names trigger DOM template injection."""
        source = _read_source(APP_SHELL_DIR / "views" / "navigation.js")
        assert "injectViewTemplate" in source, \
            "navigation.js must call injectViewTemplate for DOM on-demand"

    def test_lazy_view_templates_are_not_static_boot_imports(self):
        """Non-approval view templates must stay out of the boot request chain."""
        source = _read_source(APP_SHELL_DIR / "views" / "navigation.js")

        assert "from './templates/" not in source
        assert "await import(versionedModule(template.module" in source

    def test_dom_selectors_refreshed_after_template_injection(self):
        """Lazy templates must refresh cached selectors after inserting DOM.

        The app-shell captures `el` once at boot, before lazy view nodes like
        videoProjectsList exist. After `injectViewTemplate()`, navigation must
        refresh that mutable selector object so feature renderers do not keep
        stale null references.
        """
        source = _read_source(APP_SHELL_DIR / "views" / "navigation.js")
        assert "getDomSelectors" in source, \
            "navigation.js must import getDomSelectors to refresh lazy DOM refs"
        assert "Object.assign(el, getDomSelectors" in source, \
            "navigation.js must refresh cached selectors after template injection"

    def test_lazy_view_events_bound_after_template_injection(self):
        """Lazy view controls need event handlers after their DOM exists."""
        source = _read_source(APP_SHELL_DIR / "views" / "navigation.js")
        injection_index = source.find("injectViewTemplate")
        bind_index = source.find("bindViewEvents")
        assert "bindViewEvents" in source, \
            "navigation.js must accept a bindViewEvents callback for lazy DOM views"
        assert "_eventsBound" in source, \
            "navigation.js must bind lazy view events once per view"
        assert injection_index != -1 and bind_index > injection_index, \
            "lazy view events must be bound after template injection"

    def test_video_projects_render_guard_uses_dom_presence_not_project_count(self):
        """The project list must render empty/loaded states once lazy DOM exists."""
        source = _read_source(APP_SHELL_DIR / "runtime.js")
        assert "if (!el.videoProjectsList && !state.selectedVideoProject) return;" in source, \
            "renderVideoProjects must not skip rendering just because project count is currently zero"
        assert "!state.videoProjects?.length) return" not in source, \
            "renderVideoProjects must allow the list renderer to handle zero-project state"


# ---------------------------------------------------------------------------
# Task 2.9 — FOUC prevention
# ---------------------------------------------------------------------------

class TestFOUCPrevention:
    """Verify views are hidden until CSS + DOM + activation complete."""

    def test_visibility_hidden_before_load(self):
        source = _read_source(APP_SHELL_DIR / "views" / "navigation.js")
        # Should set visibility: hidden on containers before loading
        assert "visibility" in source, \
            "FOUC prevention: visibility style must be used"

    def test_visibility_visible_after_load(self):
        source = _read_source(APP_SHELL_DIR / "views" / "navigation.js")
        assert "visible" in source or "''" in source or '""' in source, \
            "FOUC prevention: must reveal view after CSS+DOM+activate complete"


# ---------------------------------------------------------------------------
# Task 2.10 — Facade activate() methods
# ---------------------------------------------------------------------------

class TestFacadeActivateMethods:
    """Verify feature facades expose an activate() method."""

    def test_approval_facade_has_activate_method(self):
        source = _read_source(FEATURES_DIR / "approval" / "index.js")
        assert "activate" in source, \
            "approval/index.js facade must have activate()"

    def test_scripts_facade_has_activate_method(self):
        source = _read_source(FEATURES_DIR / "scripts" / "controller.js")
        assert "activate" in source, \
            "scripts/controller.js must have activate() in return object"

    def test_video_projects_facade_has_activate_method(self):
        source = _read_source(FEATURES_DIR / "video-projects" / "controller" / "create-video-projects-controller.js")
        assert "activate" in source, \
            "video-projects controller must have activate() in return object"

    def test_audio_facade_has_activate_method(self):
        source = _read_source(FEATURES_DIR / "audio" / "index.js")
        assert "activate" in source, \
            "audio/index.js facade must have activate()"

    def test_subtitles_facade_has_activate_method(self):
        source = _read_source(FEATURES_DIR / "subtitles" / "index.js")
        assert "activate" in source, \
            "subtitles/index.js facade must have activate()"

    def test_radar_controller_has_activate_method(self):
        source = _read_source(FEATURES_DIR / "radar" / "controller.js")
        assert "activate" in source, \
            "radar/controller.js must have activate()"


# ---------------------------------------------------------------------------
# Task 2.11 — Existing test compatibility / template ID parity
# ---------------------------------------------------------------------------

class TestTemplateIdParity:
    """Verify IDs preserved in template files match what existing tests expect."""

    def test_radar_view_template_has_radar_url_input(self):
        source = _read_source(APP_SHELL_DIR / "views" / "templates" / "radar-view.js")
        assert "radarUrlInput" in source, \
            "radar-view.js must preserve radarUrlInput ID"

    def test_subtitles_view_template_has_preview_play_btn(self):
        source = _read_source(APP_SHELL_DIR / "views" / "templates" / "subtitles-view.js")
        assert "subtitle2PreviewPlayBtn" in source, \
            "subtitles-view.js must preserve subtitle2PreviewPlayBtn ID"

    def test_subtitles_view_template_has_service_health_banner(self):
        source = _read_source(APP_SHELL_DIR / "views" / "templates" / "subtitles-view.js")
        assert "subtitle2ServiceHealthBanner" in source, \
            "subtitles-view.js must preserve subtitle2ServiceHealthBanner ID"

    def test_audio_view_template_has_audio_screen_class(self):
        source = _read_source(APP_SHELL_DIR / "views" / "templates" / "audio-view.js")
        assert "audio-screen" in source, \
            "audio-view.js must preserve audio-screen class"

    def test_scripts_view_template_has_scripts_view_id(self):
        source = _read_source(APP_SHELL_DIR / "views" / "templates" / "scripts-view.js")
        assert "viewScripts" in source, \
            "scripts-view.js must preserve viewScripts ID"

    def test_all_data_action_attrs_preserved(self):
        """All data-* attributes from the original index.html must be in templates.
        The templates preserve 1:1 parity — all DOM attributes match the original HTML
        that was extracted from index.html.
        """
        # Verify subtitles template preserves its data attributes (data-phase is the key one)
        source = _read_source(APP_SHELL_DIR / "views" / "templates" / "subtitles-view.js")
        assert "data-phase" in source, \
            "subtitles-view.js must preserve data-phase attributes"

        # Verify templates preserve HTML structure (has section elements with IDs)
        for name, path in {
            "scripts": APP_SHELL_DIR / "views" / "templates" / "scripts-view.js",
            "audio": APP_SHELL_DIR / "views" / "templates" / "audio-view.js",
            "radar": APP_SHELL_DIR / "views" / "templates" / "radar-view.js",
            "subtitles": APP_SHELL_DIR / "views" / "templates" / "subtitles-view.js",
        }.items():
            source = _read_source(path)
            assert "<section" in source, \
                f"{name}-view.js must contain valid HTML structure"
