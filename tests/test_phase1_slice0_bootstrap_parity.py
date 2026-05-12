import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CONTRACT_MATRIX_PATH = ROOT / "docs" / "parity" / "contract-matrix.md"
PARITY_CHECKLIST_PATH = ROOT / "js" / "modules" / "__checks__" / "parity-checklist.js"
MAIN_JS_PATH = ROOT / "js" / "main.js"
APP_SHELL_PATH = ROOT / "js" / "modules" / "app-shell.js"

REQUIRED_SELECTOR_IDS = [
    "authGate",
    "appShell",
    "authForm",
    "searchInput",
    "countryFilter",
    "sourcesFilter",
    "cards",
    "queueDialog",
    "settingsDialog",
    "sidebarNav",
    "viewApproval",
    "viewScripts",
    "viewAudio",
    "viewSubtitulos2",
    "audioRunBtn",
    "subtitle2RowsBody",
    "subtitle2ServiceHealthBanner",
    "subtitle2SessionHistory",
    "subtitle2PreviewStage",
    "subtitle2PreviewVideo",
    "subtitle2PreviewOverlay",
    "subtitle2PreviewCue",
    "subtitle2PreviewTimeline",
    "subtitle2AddRowBtn",
    "subtitle2AnotherVideoBtn",
]


def _read_check_implementation_source(facade_path: str) -> str:
    script = r"""
import { readFile } from 'node:fs/promises';
import { CHECK_MANIFEST } from './js/modules/__checks__/manifest.js';

const facadePath = process.argv[1];
const entry = CHECK_MANIFEST.find((candidate) => candidate.facadePath === facadePath);
if (!entry) throw new Error(`missing check manifest entry for ${facadePath}`);
process.stdout.write(await readFile(entry.implementationPath, 'utf8'));
"""
    result = subprocess.run(
        ["node", "--input-type=module", "-e", script, facade_path],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr
    return result.stdout


def test_contract_matrix_exists_for_six_baseline_flows():
    assert CONTRACT_MATRIX_PATH.exists(), (
        "Task 1.1 requires docs/parity/contract-matrix.md with baseline flow checkpoints"
    )


def test_contract_matrix_tracks_all_protected_flows():
    content = CONTRACT_MATRIX_PATH.read_text(encoding="utf-8")
    for flow in ["approval", "scripts", "audio", "subtitles", "auth/session", "settings"]:
        assert flow in content, f"Missing baseline parity row for flow: {flow}"


def test_contract_matrix_freezes_network_contract_columns():
    content = CONTRACT_MATRIX_PATH.read_text(encoding="utf-8")
    for column in ["Endpoint", "Method", "Required Headers", "Payload Keys"]:
        assert column in content, f"Missing contract column in matrix: {column}"


def test_parity_checklist_defines_selector_and_bootstrap_contract_assertions():
    assert PARITY_CHECKLIST_PATH.exists(), "Task 1.2 requires js/modules/__checks__/parity-checklist.js"
    checklist_source = _read_check_implementation_source("js/modules/__checks__/parity-checklist.js")

    for selector_id in REQUIRED_SELECTOR_IDS:
        assert selector_id in checklist_source, f"Missing selector contract assertion for #{selector_id}"

    assert "./modules/composition-root.js" in checklist_source
    assert "bootCompositionRoot" in checklist_source
    assert "subtitleModeSelect" not in checklist_source


def test_main_bootstrap_boundary_routes_through_composition_root():
    source = MAIN_JS_PATH.read_text(encoding="utf-8")
    assert "./modules/composition-root.js" in source
    assert "bootCompositionRoot" in source


def test_app_shell_keeps_boot_entrypoint_signature():
    source = APP_SHELL_PATH.read_text(encoding="utf-8")
    assert "export function bootApp()" in source


def test_app_shell_keeps_existing_test_hooks_contract():
    source = APP_SHELL_PATH.read_text(encoding="utf-8")
    required_hooks = [
        "setTtsGetMock",
        "setToastMock",
        "clearMocksForTesting",
    ]
    for hook_name in required_hooks:
        assert hook_name in source, f"Missing app-shell __testHooks contract: {hook_name}"


def test_composition_root_delegates_to_compat_shell_bootstrap():
    source = (ROOT / "js" / "modules" / "composition-root.js").read_text(encoding="utf-8")
    assert "bootApp" in source
    assert "bootCompositionRoot" in source


def test_p0_checkpoint_documents_rollback_scope_for_slice0_wiring():
    content = CONTRACT_MATRIX_PATH.read_text(encoding="utf-8")
    assert "Rollback" in content
    assert "main.js" in content
    assert "composition-root.js" in content
