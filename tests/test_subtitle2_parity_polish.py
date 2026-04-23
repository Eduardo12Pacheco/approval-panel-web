import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INDEX_HTML_PATH = ROOT / "index.html"
APP_SHELL_PATH = ROOT / "js" / "modules" / "app-shell.js"
SUBTITLE_RUNTIME_SERVICES_PATH = ROOT / "js" / "modules" / "features" / "subtitles" / "runtime" / "services.js"
SUBTITLE_CSS_PATH = ROOT / "styles" / "features" / "subtitles.css"


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
