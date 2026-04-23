import subprocess
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INDEX_HTML_PATH = ROOT / "index.html"
APP_SHELL_PATH = ROOT / "js" / "modules" / "app-shell.js"
SUBTITLE_RUNTIME_SERVICES_PATH = ROOT / "js" / "modules" / "features" / "subtitles" / "runtime" / "services.js"
SUBTITLE_CSS_PATH = ROOT / "styles" / "features" / "subtitles.css"


def _subtitle2_scoped_css(css: str) -> str:
    """Return only Subtítulos 2 scoped rule blocks, including responsive overrides."""
    scoped_blocks = []
    for selector, body in re.findall(r"([^{}]+)\{([^{}]*)\}", css):
        if "#viewSubtitulos2" in selector or ".subtitle2-screen" in selector:
            scoped_blocks.append(f"{selector}{{{body}}}")
    return "\n".join(scoped_blocks)


def _border_radius_values(css: str) -> list[str]:
    return re.findall(r"border-radius\s*:\s*([^;]+);", css)


def _run_node(script: str):
    return subprocess.run(
        ["node", "--experimental-default-type=module", "-e", script],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )


def test_subtitle2_preview_runtime_helpers_scale_overlay_and_clamp_timeline_seek():
    script = r"""
import {
  buildSubtitlePreviewPresentationRuntime,
  resolveSubtitleTimelineSeekMsRuntime,
} from './js/modules/features/subtitles/runtime/services.js';

const centered = buildSubtitlePreviewPresentationRuntime({
  activeCue: {
    phrase: 'golazo total',
    color: '#FFF000',
    fontFamily: 'Anton',
    size: '110',
    maxWidthPx: 960,
    align: 'center',
  },
  currentMs: 2500,
  durationMs: 10000,
  stageWidth: 960,
  stageHeight: 540,
});

if (!centered.hasCue) throw new Error('expected active cue presentation');
if (centered.text !== 'GOLAZO TOTAL') throw new Error(`unexpected cue text: ${centered.text}`);
if (centered.justifyContent !== 'center') throw new Error(`unexpected justify: ${centered.justifyContent}`);
if (centered.playheadPercent !== 25) throw new Error(`unexpected playhead: ${centered.playheadPercent}`);
if (centered.fontSizePx !== 55) throw new Error(`expected scaled font size, got ${centered.fontSizePx}`);
if (centered.cueWidthPx !== 480) throw new Error(`expected scaled cue width, got ${centered.cueWidthPx}`);

const rightAligned = buildSubtitlePreviewPresentationRuntime({
  activeCue: {
    phrase: 'cierre',
    color: '#FFFFFF',
    fontFamily: 'Khand',
    size: '90',
    maxWidthPx: 840,
    align: 'right',
  },
  currentMs: 9000,
  durationMs: 10000,
  stageWidth: 480,
  stageHeight: 270,
});

if (rightAligned.justifyContent !== 'flex-end') throw new Error(`right align drift: ${rightAligned.justifyContent}`);
if (rightAligned.playheadPercent !== 90) throw new Error(`expected 90 percent, got ${rightAligned.playheadPercent}`);

const beforeTrack = resolveSubtitleTimelineSeekMsRuntime({ clientX: 10, rectLeft: 100, rectWidth: 400, durationMs: 10000 });
const middleTrack = resolveSubtitleTimelineSeekMsRuntime({ clientX: 300, rectLeft: 100, rectWidth: 400, durationMs: 10000 });
const afterTrack = resolveSubtitleTimelineSeekMsRuntime({ clientX: 800, rectLeft: 100, rectWidth: 400, durationMs: 10000 });

if (beforeTrack != 0) throw new Error(`seek should clamp before track, got ${beforeTrack}`);
if (middleTrack != 5000) throw new Error(`seek should resolve middle point, got ${middleTrack}`);
if (afterTrack != 10000) throw new Error(`seek should clamp after track, got ${afterTrack}`);
"""
    result = _run_node(script)
    assert result.returncode == 0, result.stderr


def test_subtitle2_markup_and_styles_define_custom_preview_controls_and_clean_table_headers():
    index_html = INDEX_HTML_PATH.read_text(encoding="utf-8")
    app_shell = APP_SHELL_PATH.read_text(encoding="utf-8")
    css = SUBTITLE_CSS_PATH.read_text(encoding="utf-8")
    services = SUBTITLE_RUNTIME_SERVICES_PATH.read_text(encoding="utf-8")

    assert 'id="subtitle2PreviewPlayBtn"' in index_html
    assert 'id="subtitle2PreviewEmpty"' in index_html
    assert 'subtitle-table__title' in index_html
    assert 'subtitle-table__hint' in index_html
    assert 'subtitle-row-actions subtitle-row-actions--tight' in app_shell

    for token in [
        '.subtitle-preview-controls',
        '.subtitle-preview-play-btn',
        '.subtitle-preview-empty',
        '.subtitle-table__title',
        '.subtitle-table__hint',
        '.subtitle-row-actions--tight',
        '.subtitle-align-group--compact',
    ]:
        assert token in css

    assert 'buildSubtitlePreviewPresentationRuntime' in services
    assert 'resolveSubtitleTimelineSeekMsRuntime' in services


def test_subtitle2_visual_redesign_recomposes_upload_and_editing_slides_without_contract_drift():
    index_html = INDEX_HTML_PATH.read_text(encoding="utf-8")
    css = SUBTITLE_CSS_PATH.read_text(encoding="utf-8")

    required_ids = [
        "subtitle2ServiceHealthBanner",
        "subtitle2PhaseBar",
        "subtitle2PhaseUpload",
        "subtitle2PhaseProcessing",
        "subtitle2PhaseEdition",
        "subtitle2PhaseDone",
        "subtitle2UploadInput",
        "subtitle2SourceLanguagePicker",
        "subtitle2SourceLanguageEngineHint",
        "subtitle2SessionHistory",
        "subtitle2PreviewStage",
        "subtitle2PreviewVideo",
        "subtitle2PreviewEmpty",
        "subtitle2PreviewOverlay",
        "subtitle2PreviewCue",
        "subtitle2PreviewPlayBtn",
        "subtitle2PreviewTimeline",
        "subtitle2PreviewTimelineTrack",
        "subtitle2PreviewPlayhead",
        "subtitle2PreviewTimecode",
        "subtitle2RowsBody",
        "subtitle2AddRowBtn",
        "subtitle2SaveBtn",
        "subtitle2ReadyBtn",
        "subtitle2DownloadBtn",
        "subtitle2AnotherVideoBtn",
    ]
    for element_id in required_ids:
        assert f'id="{element_id}"' in index_html

    for contract_fragment in [
        'data-action="resume-subtitle-session"',
        'data-session-id',
        'data-row-id',
        'data-field="start"',
        'data-field="end"',
        'data-field="phrase"',
        'data-field="maxWidthPx"',
        'data-field="size"',
        'data-field="fontFamily"',
        'data-field="color"',
        'data-field="align"',
        'data-action="jump-cue"',
        'data-action="insert-row"',
        'data-action="delete-row"',
    ]:
        assert contract_fragment in "\n".join([index_html, css, (ROOT / "js" / "modules" / "app-shell.js").read_text(encoding="utf-8")])

    for expected_fragment in [
        'id="viewSubtitulos2" class="view hidden subtitle2-screen"',
        'class="subtitle2-screen__header"',
        'class="subtitle2-phase-card"',
        'class="subtitle2-workspace"',
        'class="subtitle2-master-card"',
        'class="subtitle2-side-card"',
        'class="subtitle2-upload-source-card"',
        'class="subtitle2-editor-card"',
        'class="subtitle2-history-section"',
    ]:
        assert expected_fragment in index_html

    preview_index = index_html.index('id="subtitle2PreviewStage"')
    history_index = index_html.index('id="subtitle2SessionHistory"')
    edition_index = index_html.index('id="subtitle2PhaseEdition"')
    assert preview_index < history_index
    assert history_index < edition_index

    for expected_rule in [
        '#viewSubtitulos2.subtitle2-screen',
        '#viewSubtitulos2 .subtitle2-workspace',
        'grid-template-columns: minmax(0, 1fr) 520px;',
        '#viewSubtitulos2 .subtitle2-master-card',
        '#viewSubtitulos2 .subtitle2-side-card',
        '#viewSubtitulos2 .subtitle2-upload-source-card',
        '#viewSubtitulos2 .subtitle2-editor-card',
        '#viewSubtitulos2 .subtitle2-history-section',
        '#0C0C0C',
        '#00E88F',
        '#9DB8FF',
        '#F7B955',
    ]:
        assert expected_rule in css


def test_subtitle2_web_pen_fidelity_uses_square_flat_pencil_tokens():
    css = SUBTITLE_CSS_PATH.read_text(encoding="utf-8")
    scoped_css = _subtitle2_scoped_css(css)

    for pencil_color in [
        "#0C0C0C",
        "#070707",
        "#0A0A0A",
        "#0D0D0D",
        "#050505",
        "#151515",
        "#121212",
        "#232323",
        "#262626",
        "#2A2A2A",
        "#353535",
        "#00E88F55",
        "#00FFAA55",
        "#F7B95555",
        "#9DB8FF55",
        "#00FFAA66",
        "#00E88F",
        "#F7B955",
        "#9DB8FF",
        "#FACC15",
        "#F5F7F7",
        "#D8DBDE",
        "#8B8E93",
        "#6E7278",
        "#6B6B6B",
        "#777B80",
        "#03140D",
        "#DADDE0",
    ]:
        assert pencil_color in scoped_css

    for invented_color in ["#F4F4F4", "#A7A7A7", "#EDEDED", "#9C9C9C", "#FFFFFF"]:
        assert invented_color not in scoped_css

    assert "radial-gradient" not in scoped_css
    assert "linear-gradient" not in scoped_css

    radius_values = _border_radius_values(scoped_css)
    assert radius_values
    assert all(value.strip() in {"0", "0px"} for value in radius_values)


def test_subtitle2_web_pen_fidelity_uses_literal_upload_and_editing_layout_tokens():
    css = SUBTITLE_CSS_PATH.read_text(encoding="utf-8")
    scoped_css = _subtitle2_scoped_css(css)

    for expected_rule in [
        "padding: 28px 32px 32px 32px;",
        "grid-template-columns: minmax(0, 1fr) 520px;",
        "gap: 20px;",
        "padding: 24px;",
        "gap: 24px;",
        "gap: 18px;",
        "width: min(700px, 100%);",
        "padding: 28px;",
        "padding: 42px 28px;",
        "font-family: 'JetBrains Mono', monospace;",
        "font-size: 10px;",
        "letter-spacing: 1.2px;",
        "font-family: 'Space Grotesk', sans-serif;",
        "font-size: 38px;",
        "font-size: 24px;",
        "font-family: 'Inter', sans-serif;",
        "font-size: 14px;",
    ]:
        assert expected_rule in scoped_css
