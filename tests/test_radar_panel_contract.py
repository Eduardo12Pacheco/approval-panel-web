import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INDEX_HTML_PATH = ROOT / "index.html"
RADAR_TEMPLATE_PATH = ROOT / "js" / "modules" / "app-shell" / "views" / "templates" / "radar-view.js"
APP_SHELL_PATH = ROOT / "js" / "modules" / "app-shell.js"
BOOTSTRAP_PATH = ROOT / "js" / "modules" / "core" / "bootstrap.js"
SELECTORS_PATH = ROOT / "js" / "modules" / "shared" / "dom" / "selectors.js"
APP_STORE_PATH = ROOT / "js" / "modules" / "core" / "state" / "app-store.js"
RADAR_CHECK_PATH = ROOT / "js" / "modules" / "features" / "radar" / "__checks__" / "radar-panel-check.js"
RADAR_CSS_PATH = ROOT / "styles" / "features" / "radar.css"


def _run_node_file(path: Path):
    return subprocess.run(
        ["node", "--experimental-default-type=module", str(path)],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )


def test_radar_static_shell_contract_adds_view_navigation_settings_and_selectors():
    index_source = INDEX_HTML_PATH.read_text(encoding="utf-8") + "\n" + RADAR_TEMPLATE_PATH.read_text(encoding="utf-8")
    selectors_source = SELECTORS_PATH.read_text(encoding="utf-8")
    app_store_source = APP_STORE_PATH.read_text(encoding="utf-8")
    bootstrap_source = BOOTSTRAP_PATH.read_text(encoding="utf-8")
    app_shell_source = APP_SHELL_PATH.read_text(encoding="utf-8")

    for expected in [
        'data-view="radar"',
        'id="viewRadar"',
        'id="radarUrlInput"',
        'id="radarNewJobBtn"',
        'id="radarNewJobDialog"',
        'id="radarCountryColombia"',
        'id="radarCountryEcuador"',
        'id="radarCountryArgentina"',
        'id="radarExtraKeywordsInput"',
        'id="radarQueueList"',
        'id="radarSummaryDialog"',
        'id="radarConfirmDialog"',
        'id="radarSubmitBtn"',
        'id="radarHistoryList"',
        'id="radarMonitorStatus"',
        'id="radarMonitorRefreshBtn"',
        'id="radarCountryFilter"',
        'id="radarMonitorList"',
        'id="transcriptServiceBaseUrlInput"',
        'id="channelMonitorBaseUrlInput"',
    ]:
        assert expected in index_source

    assert '<option value="manual">Manual</option>' not in index_source

    for expected in [
        "viewRadar",
        "radarUrlInput",
        "radarNewJobBtn",
        "radarNewJobDialog",
        "radarCountryColombia",
        "radarQueueList",
        "radarSummaryDialog",
        "radarConfirmDialog",
        "transcriptServiceBaseUrlInput",
        "radarMonitorStatus",
        "radarMonitorRefreshBtn",
        "radarCountryFilter",
        "radarMonitorList",
        "channelMonitorBaseUrlInput",
    ]:
        assert expected in selectors_source

    assert "transcriptServiceBaseUrl" in app_store_source
    assert "transcriptServiceApiKey" in app_store_source
    assert "channelMonitorBaseUrl" in app_store_source
    assert "channelMonitorApiKey" in app_store_source
    assert "http://127.0.0.1:8765" in app_store_source
    assert "http://127.0.0.1:8775" in app_store_source
    assert "http://127.0.0.1:8091" not in app_store_source
    assert 'placeholder="http://127.0.0.1:8765"' in index_source
    assert 'placeholder="http://127.0.0.1:8775"' in index_source
    assert "transcriptServiceApiKeyInput.value" not in app_store_source
    assert "transcriptServiceApiKey: ''" in bootstrap_source
    assert "channelMonitorApiKey: ''" in bootstrap_source
    assert "./features/radar/api-client.js" in app_shell_source
    assert "./features/radar/controller.js" in app_shell_source
    assert "setView('radar')" not in app_shell_source
    assert "'radar'" in app_shell_source


def test_radar_runtime_contract_uses_injected_fetch_clipboard_and_thin_client_modules():
    result = _run_node_file(RADAR_CHECK_PATH)
    assert result.returncode == 0, result.stderr


def test_radar_new_job_dialog_uses_compact_single_panel_layout():
    source = RADAR_CSS_PATH.read_text(encoding="utf-8")

    assert "#viewRadar #radarNewJobDialog {" in source
    assert "width: min(760px, calc(100vw - 48px));" in source
    assert "#viewRadar #radarNewJobDialog article" in source
    assert "width: auto;" in source
    assert "box-sizing: border-box;" in source
    assert "#viewRadar dialog article {" not in source


def test_radar_monitor_card_layout_has_wide_cards_filters_and_mention_columns():
    source = RADAR_CSS_PATH.read_text(encoding="utf-8")

    for expected in [
        ".radar-monitor-toolbar",
        ".radar-monitor-card",
        "grid-template-columns: minmax(0, 1fr) minmax(260px, 36%);",
        ".radar-monitor-card__meta",
        ".radar-monitor-card__mentions",
        ".radar-mention-column",
        ".radar-monitor-empty",
        ".radar-monitor-error",
    ]:
        assert expected in source
