from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
APP_SHELL_PATH = ROOT / "js" / "modules" / "app-shell.js"
CONTRACT_MATRIX_PATH = ROOT / "docs" / "parity" / "contract-matrix.md"

TOAST_MODULE_PATH = ROOT / "js" / "modules" / "core" / "ui" / "toast.js"
ESCAPE_HTML_MODULE_PATH = ROOT / "js" / "modules" / "core" / "ui" / "escape-html.js"
WORD_COUNT_MODULE_PATH = ROOT / "js" / "modules" / "core" / "ui" / "word-count.js"
APP_STORE_MODULE_PATH = ROOT / "js" / "modules" / "core" / "state" / "app-store.js"
SESSION_GATE_MODULE_PATH = ROOT / "js" / "modules" / "core" / "auth" / "session-gate.js"
BOOTSTRAP_MODULE_PATH = ROOT / "js" / "modules" / "core" / "bootstrap.js"


def test_slice1_core_modules_exist_for_ui_state_and_auth_parity():
    required = [
        TOAST_MODULE_PATH,
        ESCAPE_HTML_MODULE_PATH,
        WORD_COUNT_MODULE_PATH,
        APP_STORE_MODULE_PATH,
        SESSION_GATE_MODULE_PATH,
    ]
    missing = [str(path.relative_to(ROOT)) for path in required if not path.exists()]
    assert not missing, f"Missing Slice-1 core modules: {missing}"


def test_app_shell_delegates_ui_utils_to_core_modules():
    source = APP_SHELL_PATH.read_text(encoding="utf-8")

    assert "./core/ui/toast.js" in source
    assert "./core/ui/escape-html.js" in source
    assert "./core/ui/word-count.js" in source

    assert "renderToast" in source
    assert "escapeHtmlCore" in source
    assert "updateWordCounterCore" in source


def test_settings_defaults_and_hydration_contract_stay_frozen_in_app_store_module():
    source = APP_STORE_MODULE_PATH.read_text(encoding="utf-8")

    for required_key in [
        "baseUrl",
        "secret",
        "ttsBaseUrl",
        "sharedApiKey",
        "sharedBasicUser",
        "sharedBasicPass",
    ]:
        assert required_key in source, f"Missing settings key contract in app store module: {required_key}"

    assert "hydrateSettingsFormValues" in source


def test_auth_session_gate_keeps_session_and_credential_contracts():
    source = SESSION_GATE_MODULE_PATH.read_text(encoding="utf-8")
    assert "readSessionStatus" in source
    assert "persistSessionStatus" in source
    assert "clearSessionStatus" in source
    assert "isValidCredentials" in source


def test_slice1_bootstrap_skeleton_exists_for_event_wiring_refactor():
    assert BOOTSTRAP_MODULE_PATH.exists(), "Task 2.3 requires core/bootstrap.js event binding skeleton"
    source = BOOTSTRAP_MODULE_PATH.read_text(encoding="utf-8")
    assert "bindCoreEvents" in source


def test_p1_checkpoint_and_rollback_scope_are_documented_in_contract_matrix():
    source = CONTRACT_MATRIX_PATH.read_text(encoding="utf-8")
    assert "Checkpoint P1" in source
    assert "parity checklist" in source
    assert "auth/settings smoke" in source
    assert "core/*" in source
