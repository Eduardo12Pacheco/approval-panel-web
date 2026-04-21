from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
APP_SHELL_PATH = ROOT / "js" / "modules" / "app-shell.js"
CONTRACT_MATRIX_PATH = ROOT / "docs" / "parity" / "contract-matrix.md"

APPROVAL_API_PATH = ROOT / "js" / "modules" / "core" / "http" / "approval-api.js"
APPROVAL_FEATURE_PATH = ROOT / "js" / "modules" / "features" / "approval" / "index.js"
SCRIPTS_FEATURE_PATH = ROOT / "js" / "modules" / "features" / "scripts" / "index.js"
SELECTORS_FACADE_PATH = ROOT / "js" / "modules" / "shared" / "dom" / "selectors.js"


def test_phase3_modules_exist_for_approval_scripts_and_selector_facade():
    required = [
        APPROVAL_API_PATH,
        APPROVAL_FEATURE_PATH,
        SCRIPTS_FEATURE_PATH,
        SELECTORS_FACADE_PATH,
    ]
    missing = [str(path.relative_to(ROOT)) for path in required if not path.exists()]
    assert not missing, f"Missing Phase-3 modules: {missing}"


def test_approval_api_contract_preserves_secret_header_and_webhook_routes():
    source = APPROVAL_API_PATH.read_text(encoding="utf-8")

    assert "x-approval-secret" in source
    assert "createApprovalApiClient" in source
    assert "get(" in source
    assert "post(" in source

    for endpoint in [
        "/webhook/approval/pending/v1",
        "/webhook/approval/queue/v2",
        "/webhook/approval/decision/v2",
        "/webhook/mvp-script-drafts-pending-v2",
        "/webhook/mvp-script-draft-save-v2",
        "/webhook/mvp-script-publish-v2",
    ]:
        assert endpoint in source, f"Missing parity endpoint marker in approval API module: {endpoint}"


def test_app_shell_delegates_approval_scripts_flows_to_feature_modules_with_di():
    source = APP_SHELL_PATH.read_text(encoding="utf-8")

    assert "./features/approval/index.js" in source
    assert "./features/scripts/index.js" in source
    assert "./core/http/approval-api.js" in source
    assert "createApprovalFeature" in source
    assert "createScriptsFeature" in source
    assert "createApprovalApiClient" in source

    for dependency_token in ["api", "store", "ui", "selectors"]:
        assert dependency_token in source, f"Missing DI token for feature extraction: {dependency_token}"


def test_selector_facade_owns_dom_query_contract_for_approval_and_scripts_views():
    selectors_source = SELECTORS_FACADE_PATH.read_text(encoding="utf-8")
    app_shell_source = APP_SHELL_PATH.read_text(encoding="utf-8")

    assert "getDomSelectors" in selectors_source
    for selector_id in [
        "stats",
        "cards",
        "searchInput",
        "countryFilter",
        "sourcesFilter",
        "scriptStats",
        "scriptCards",
        "scriptEditorDialog",
        "scriptEditedArea",
        "saveDraftBtn",
        "publishDraftBtn",
    ]:
        assert selector_id in selectors_source, f"Missing selector in facade: {selector_id}"

    assert "getDomSelectors(document)" in app_shell_source
    assert "document.getElementById" not in app_shell_source


def test_phase3_checkpoint_p2_and_rollback_scope_documented_in_contract_matrix():
    source = CONTRACT_MATRIX_PATH.read_text(encoding="utf-8")
    assert "Checkpoint P2" in source
    assert "approval/scripts" in source
    assert "features/approval" in source
    assert "features/scripts" in source
    assert "approval-api.js" in source
