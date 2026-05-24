import subprocess
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INDEX_HTML_PATH = ROOT / "index.html"
SUBTITLES_TEMPLATE_PATH = ROOT / "js" / "modules" / "app-shell" / "views" / "templates" / "subtitles-view.js"
APP_SHELL_PATH = ROOT / "js" / "modules" / "app-shell.js"
SUBTITLE_WORKFLOW_PATH = ROOT / "js" / "modules" / "subtitles-workflow.mjs"
SUBTITLE_RUNTIME_SERVICES_PATH = ROOT / "js" / "modules" / "features" / "subtitles" / "runtime" / "services.js"
SUBTITLE_RUNTIME_PRESENTATION_PATH = ROOT / "js" / "modules" / "features" / "subtitles" / "runtime" / "presentation.js"
SUBTITLE_CONTROLLER_PATH = ROOT / "js" / "modules" / "features" / "subtitles" / "controller.js"
SUBTITLE_CONTROLLER_SUPPORT_PATHS = [
    ROOT / "js" / "modules" / "features" / "subtitles" / "controller" / file_name
    for file_name in [
        "context.js",
        "session.js",
        "render-workflow.js",
        "table-editor.js",
        "preview-player.js",
        "render-commands.js",
    ]
]
SUBTITLE_CSS_DIR = ROOT / "styles" / "features" / "subtitles"


def _read_subtitle_css() -> str:
    return "\n".join(
        (SUBTITLE_CSS_DIR / file_name).read_text(encoding="utf-8")
        for file_name in [
            "legacy-base.css",
            "tokens.css",
            "layout.css",
            "upload.css",
            "preview.css",
            "history.css",
            "phases.css",
            "table.css",
            "responsive.css",
        ]
    )


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


def _read_subtitle_controller_sources() -> str:
    return "\n".join(
        [SUBTITLE_CONTROLLER_PATH.read_text(encoding="utf-8")]
        + [path.read_text(encoding="utf-8") for path in SUBTITLE_CONTROLLER_SUPPORT_PATHS]
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
if (centered.fontWeight !== 'normal') throw new Error(`expected Anton normal weight, got ${centered.fontWeight}`);

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
if (rightAligned.fontWeight !== 'Bold') throw new Error(`expected Khand Bold export weight, got ${rightAligned.fontWeight}`);

const beforeTrack = resolveSubtitleTimelineSeekMsRuntime({ clientX: 10, rectLeft: 100, rectWidth: 400, durationMs: 10000 });
const middleTrack = resolveSubtitleTimelineSeekMsRuntime({ clientX: 300, rectLeft: 100, rectWidth: 400, durationMs: 10000 });
const afterTrack = resolveSubtitleTimelineSeekMsRuntime({ clientX: 800, rectLeft: 100, rectWidth: 400, durationMs: 10000 });

if (beforeTrack != 0) throw new Error(`seek should clamp before track, got ${beforeTrack}`);
if (middleTrack != 5000) throw new Error(`seek should resolve middle point, got ${middleTrack}`);
if (afterTrack != 10000) throw new Error(`seek should clamp after track, got ${afterTrack}`);
"""
    result = _run_node(script)
    assert result.returncode == 0, result.stderr


def test_subtitle2_preview_playback_state_is_available_to_app_shell_events():
    script = r"""
import { createSubtitlePreviewPlayer } from './js/modules/features/subtitles/controller/preview-player.js';

const state = { subtitles2: { previewPlaying: false, rows: [], previewCurrentMs: 0 } };
const playButton = {
  textContent: '',
  attributes: {},
  setAttribute(name, value) { this.attributes[name] = value; },
};
const player = createSubtitlePreviewPlayer({
  state,
  el: { subtitle2PreviewPlayBtn: playButton },
  api: {},
  URLImpl: { revokeObjectURL() {}, createObjectURL() { return ''; } },
  windowRef: { addEventListener() {}, removeEventListener() {} },
});

player.renderPreviewPlaybackState();
if (playButton.textContent !== '▶') {
  throw new Error(`expected paused icon, got ${playButton.textContent}`);
}
if (playButton.attributes['aria-label'] !== 'Reproducir preview') {
  throw new Error(`paused aria-label drift: ${playButton.attributes['aria-label']}`);
}

state.subtitles2.previewPlaying = true;
player.renderPreviewPlaybackState();
if (playButton.textContent !== '❚❚') {
  throw new Error(`expected playing icon, got ${playButton.textContent}`);
}
if (playButton.attributes.title !== 'Pausar') {
  throw new Error(`playing title drift: ${playButton.attributes.title}`);
}
"""
    result = _run_node(script)
    assert result.returncode == 0, result.stderr


def test_app_shell_runtime_defines_subtitle_preview_playback_bridge_before_binding_events():
    runtime = (ROOT / "js" / "modules" / "app-shell" / "runtime.js").read_text(encoding="utf-8")

    assert "function renderSubtitle2PreviewPlaybackState()" in runtime
    assert "subtitlesController.renderPreviewPlaybackState?.()" in runtime
    assert runtime.index("function renderSubtitle2PreviewPlaybackState()") < runtime.index("function bindEvents()")


def test_subtitle2_markup_and_styles_define_custom_preview_controls_and_clean_table_headers():
    index_html = INDEX_HTML_PATH.read_text(encoding="utf-8") + "\n" + SUBTITLES_TEMPLATE_PATH.read_text(encoding="utf-8")
    app_shell = APP_SHELL_PATH.read_text(encoding="utf-8")
    workflow = SUBTITLE_WORKFLOW_PATH.read_text(encoding="utf-8")
    css = _read_subtitle_css()
    services = SUBTITLE_RUNTIME_SERVICES_PATH.read_text(encoding="utf-8")
    presentation = SUBTITLE_RUNTIME_PRESENTATION_PATH.read_text(encoding="utf-8")
    controller = _read_subtitle_controller_sources()
    subtitle_runtime_source = "\n".join([app_shell, controller, presentation])

    assert 'id="subtitle2PreviewPlayBtn"' in index_html
    assert 'id="subtitle2PreviewEmpty"' in index_html
    assert 'subtitle-table__col--time-range' in index_html
    assert 'subtitle-table__col--delete' in index_html
    assert 'id="subtitle2PreviewVideo" playsinline preload="auto"' in index_html
    assert 'Start / End' in index_html
    assert '<th aria-label="Eliminar"></th>' in index_html
    assert '<span class="subtitle-table__title">Eliminar</span>' not in index_html
    assert 'Agregar subt' in index_html
    assert 'subtitle-table__title' in index_html
    assert 'subtitle-table__hint' in index_html
    assert 'subtitle-row-actions subtitle-row-actions--tight' not in app_shell

    for token in [
        '.subtitle-preview-controls',
        '.subtitle-preview-play-btn',
        '.subtitle-preview-empty',
        '.subtitle-table__title',
        '.subtitle-table__hint',
        '.subtitle-time-range',
        '.subtitle-time-row',
        '.subtitle-time-nudge',
        '.subtitle-time-range__line',
        '.subtitle-align-group--compact',
        'button.selected-green',
        '.subtitle-history-item--editing',
        '.subtitle-history-item--done',
        '.subtitle-history-item--active',
        '.subtitle-history-item__resume',
        '.subtitle-history-item__delete',
        '.subtitle-row-delete',
        '.subtitle-row--draft',
        '.is-drop-before',
        '.is-dragging',
    ]:
        assert token in css

    for runtime_token in [
        'setSubtitles2PhaseFromRemoteStatus',
        'forceSubtitles2Phase',
        'buildSubtitleSessionHistoryMarkupRuntime',
        'resolveSubtitleHistoryToneRuntime',
        'deleteSubtitle2HistorySession',
        'delete-subtitle-session',
        'deleteSubtitle2Row',
        'delete-subtitle-row',
        'nudgeSubtitle2TimingBoundary',
        'nudge-subtitle-time',
        'onSubtitle2PreviewLoadedMetadata',
        'ensureSubtitle2RowsCoverDuration',
        'applySubtitle2VideoDuration',
        'loadSubtitle2PreviewVideoBlob',
        'previewVideoObjectUrl',
        "state.subtitles2.renderStatus = 'queued'",
        "state.subtitles2.renderArtifactReady = false",
        'data-field="start" data-direction="up"',
        'data-field="end" data-direction="down"',
        'getLastSubtitle2NonDraftRowIndex',
        'El END de la última frase debe durar hasta el final del video',
        'Soltá el subtítulo entre dos frases intermedias',
        'SUBTITLE_TIME_NUDGE_MS = 100',
        'SUBTITLE_TIMING_GAP_MS = 60',
        'SUBTITLE_DRAFT_INSERT_DURATION_MS = 1000',
        'const draftStartMs = nextStartMs',
        'const adjustedNextStartMs = draftEndMs + SUBTITLE_TIMING_GAP_MS',
        'No hay margen suficiente para mover el START',
        'No hay margen suficiente para mover el END',
        'La primera frase no se puede eliminar',
        'onSubtitle2DraftDragStart',
        'placeSubtitle2DraftBetweenRows',
        'Ubicá el subtítulo fantasma antes de guardar',
        'Ya hay un subtítulo fantasma para ubicar',
        'data-draft=',
        'aria-current=',
        'subtitle-history-item--${tone}',
    ]:
        assert runtime_token in subtitle_runtime_source

    assert "DEFAULT_SUBTITLE_SIZE = '110'" in workflow

    assert 'buildSubtitlePreviewPresentationRuntime' in services
    assert 'resolveSubtitleTimelineSeekMsRuntime' in services


def test_subtitle2_remote_style_presets_match_backend_contracts():
    workflow = (ROOT / "js" / "modules" / "subtitles-workflow.mjs").read_text(encoding="utf-8")
    controller = _read_subtitle_controller_sources()
    presentation = SUBTITLE_RUNTIME_PRESENTATION_PATH.read_text(encoding="utf-8")

    assert "Object.freeze(['90', '95', '100', '105', '110', '115', '120', '125', '130', '135', '140', '150', '160', '170', '180', '190', '200'])" in workflow
    assert "Object.freeze(['Khand', 'Anton', 'Impact', 'League Gothic', 'Oswald'])" in workflow
    assert "Object.freeze(['#FFFFFF', '#FFF000', '#00FF5A', '#0CC3F2'])" in workflow
    assert "Object.freeze(['Khand Bold'" not in workflow
    assert "font_weight" in controller
    assert "style.fontWeight = presentation.fontWeight" in controller


def test_subtitle2_visual_redesign_recomposes_upload_and_editing_slides_without_contract_drift():
    index_html = INDEX_HTML_PATH.read_text(encoding="utf-8") + "\n" + SUBTITLES_TEMPLATE_PATH.read_text(encoding="utf-8")
    css = _read_subtitle_css()
    subtitle_runtime_source = "\n".join([
        APP_SHELL_PATH.read_text(encoding="utf-8"),
        _read_subtitle_controller_sources(),
        SUBTITLE_RUNTIME_PRESENTATION_PATH.read_text(encoding="utf-8"),
    ])

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
    ]:
        assert contract_fragment in "\n".join([index_html, css, subtitle_runtime_source])

    for removed_fragment in [
        'data-action="jump-cue"',
        'data-action="insert-row"',
        'data-action="delete-row"',
        'subtitle-table__col--actions',
        'Acciones',
    ]:
        assert removed_fragment not in "\n".join([index_html, css, subtitle_runtime_source])

    for expected_fragment in [
        'id="viewSubtitulos2" class="view hidden subtitle2-screen"',
        'class="subtitle2-screen__header"',
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
    master_index = index_html.index('class="subtitle2-master-card"')
    side_index = index_html.index('class="subtitle2-side-card"')
    assert master_index < side_index
    assert edition_index < side_index
    assert preview_index < history_index
    assert side_index < preview_index

    for expected_rule in [
        '#viewSubtitulos2.subtitle2-screen',
        '#viewSubtitulos2 .subtitle2-workspace',
        'grid-template-columns: minmax(0, 0.7fr) minmax(320px, 0.3fr);',
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
    css = _read_subtitle_css()
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
    css = _read_subtitle_css()
    scoped_css = _subtitle2_scoped_css(css)

    for expected_rule in [
        "padding: 28px 5px 32px 5px;",
        "grid-template-columns: minmax(0, 0.7fr) minmax(320px, 0.3fr);",
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


def test_subtitle2_upload_slide_keeps_header_health_and_phases_inside_left_card():
    index_html = INDEX_HTML_PATH.read_text(encoding="utf-8") + "\n" + SUBTITLES_TEMPLATE_PATH.read_text(encoding="utf-8")
    css = _read_subtitle_css()
    scoped_css = _subtitle2_scoped_css(css)

    workspace_start = index_html.index('class="subtitle2-workspace"')
    master_start = index_html.index('class="subtitle2-master-card"', workspace_start)
    side_start = index_html.index('class="subtitle2-side-card"', workspace_start)

    assert master_start < side_start
    assert workspace_start < master_start

    master_end = index_html.index('id="subtitle2PhaseUpload"', master_start)
    master_header = index_html[master_start:master_end]
    assert 'class="subtitle2-screen__header"' in master_header
    assert 'id="subtitle2ServiceHealthBanner"' in master_header
    assert 'id="subtitle2PhaseBar"' in master_header

    pre_workspace_html = index_html[index_html.index('id="viewSubtitulos2"'):workspace_start]
    assert 'id="subtitle2ServiceHealthBanner"' not in pre_workspace_html
    assert 'id="subtitle2PhaseBar"' not in pre_workspace_html
    assert 'Estado del flujo' not in index_html
    assert '<h3>Fases</h3>' not in index_html[index_html.index('id="viewSubtitulos2"'):index_html.index('</section>', workspace_start)]

    assert 'grid-template-columns: minmax(0, 0.7fr) minmax(320px, 0.3fr);' in scoped_css
    assert '#viewSubtitulos2 .subtitle2-master-card .subtitle2-screen__header' in scoped_css
    assert 'justify-self: end;' in scoped_css
    assert 'min-width: 0;' in scoped_css


def test_subtitle2_health_runtime_outputs_compact_remote_online_offline_chip_contract():
    script = r"""
import { buildSubtitleHealthRuntime } from './js/modules/features/subtitles/runtime/services.js';

const online = buildSubtitleHealthRuntime({ status: 'online', message: 'Servicio remoto disponible.' }, 'remote-core');
if (online.banner !== 'Servidor conectado') throw new Error(`online chip drift: ${online.banner}`);
if (online.status !== 'online') throw new Error(`online status drift: ${online.status}`);
if (online.tone !== 'online') throw new Error(`online tone drift: ${online.tone}`);

const healthy = buildSubtitleHealthRuntime({ status: 'healthy', message: 'OK' }, 'remote-core');
if (healthy.banner !== 'Servidor conectado') throw new Error(`healthy chip drift: ${healthy.banner}`);
if (healthy.tone !== 'online') throw new Error(`healthy tone drift: ${healthy.tone}`);

for (const status of ['offline', 'degraded', 'unavailable', 'failed', 'pending']) {
  const resolved = buildSubtitleHealthRuntime({ status, message: 'Una oración larga que no debe agrandar el chip.' }, 'remote-core');
  if (resolved.banner !== 'Servidor desconectado') throw new Error(`${status} chip drift: ${resolved.banner}`);
  if (resolved.tone !== 'offline') throw new Error(`${status} tone drift: ${resolved.tone}`);
}
"""
    result = _run_node(script)
    assert result.returncode == 0, result.stderr


def test_subtitle2_hydrated_render_state_preserves_finished_downloadable_sessions():
    script = r"""
import { resolveHydratedSubtitleRenderStateRuntime } from './js/modules/features/subtitles/runtime/services.js';

const readyFromDownload = resolveHydratedSubtitleRenderStateRuntime({ status: 'editing', download: { ready: true } });
if (readyFromDownload.status !== 'succeeded') throw new Error(`download-ready status drift: ${readyFromDownload.status}`);
if (readyFromDownload.artifactReady !== true) throw new Error('download-ready artifact drift');

const readyFromSession = resolveHydratedSubtitleRenderStateRuntime({ status: 'succeeded', download: { ready: false } });
if (readyFromSession.status !== 'succeeded') throw new Error(`session-succeeded status drift: ${readyFromSession.status}`);
if (readyFromSession.artifactReady !== true) throw new Error('session-succeeded artifact drift');

const explicitRunning = resolveHydratedSubtitleRenderStateRuntime({ status: 'editing', render: { status: 'running' }, download: { ready: false } });
if (explicitRunning.status !== 'running') throw new Error(`explicit running drift: ${explicitRunning.status}`);
if (explicitRunning.artifactReady !== false) throw new Error('explicit running artifact drift');

const empty = resolveHydratedSubtitleRenderStateRuntime({ status: 'editing', download: { ready: false } });
if (empty.status !== '') throw new Error(`editing status drift: ${empty.status}`);
if (empty.artifactReady !== false) throw new Error('editing artifact drift');
"""
    result = _run_node(script)
    assert result.returncode == 0, result.stderr


def test_subtitle2_reset_preserves_remote_health_history_and_language_context():
    script = r"""
import { createSubtitlesController } from './js/modules/features/subtitles/controller.js';

let revokedUrl = '';
const state = {
  subtitles2: {
    previewVideoObjectUrl: 'blob:previous-preview',
    serviceHealth: { status: 'online', message: 'Servicio remoto disponible.' },
    sessionHistory: [{ id: 'session-1', status: 'succeeded' }],
    sourceLanguage: 'en',
  },
};

const controller = createSubtitlesController({
  state,
  el: {},
  api: {},
  ui: { toast() {} },
  helpers: {
    getErrorMessage(error, fallback) { return fallback; },
    downloadBlob() {},
    escapeHtml(value) { return (value ?? '').toString(); },
  },
  customDropdowns: { refreshAll() {} },
  browser: {
    URL: { revokeObjectURL(url) { revokedUrl = url; } },
    window: {},
    setTimeout() {},
    clearTimeout() {},
    clearInterval() {},
  },
});

controller.resetRunState();

if (revokedUrl !== 'blob:previous-preview') throw new Error(`preview object URL was not revoked: ${revokedUrl}`);
if (state.subtitles2.serviceHealth.status !== 'online') throw new Error(`health was not preserved: ${state.subtitles2.serviceHealth.status}`);
if (state.subtitles2.sessionHistory.length !== 1) throw new Error(`history was not preserved: ${state.subtitles2.sessionHistory.length}`);
if (state.subtitles2.sourceLanguage !== 'en') throw new Error(`source language was not preserved: ${state.subtitles2.sourceLanguage}`);
if (state.subtitles2.sessionId !== null) throw new Error('active session should be cleared');
"""
    result = _run_node(script)
    assert result.returncode == 0, result.stderr
