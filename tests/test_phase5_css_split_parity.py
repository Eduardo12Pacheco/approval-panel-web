from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
STYLE_GUARDS_PATH = ROOT / "docs" / "parity" / "style-guards.md"
STYLE_ENTRY_PATH = ROOT / "styles.css"
CONTRACT_MATRIX_PATH = ROOT / "docs" / "parity" / "contract-matrix.md"
APP_SHELL_PATH = ROOT / "js" / "modules" / "app-shell.js"

STYLE_FILES = [
    ROOT / "styles" / "tokens.css",
    ROOT / "styles" / "base.css",
    ROOT / "styles" / "layout.css",
    ROOT / "styles" / "components" / "buttons.css",
    ROOT / "styles" / "components" / "dialogs.css",
    ROOT / "styles" / "components" / "cards.css",
    ROOT / "styles" / "components" / "forms.css",
    ROOT / "styles" / "components" / "toast.css",
    ROOT / "styles" / "features" / "approval.css",
    ROOT / "styles" / "features" / "scripts.css",
    ROOT / "styles" / "features" / "audio.css",
    ROOT / "styles" / "features" / "subtitles.css",
    ROOT / "styles" / "features" / "auth.css",
    ROOT / "styles" / "responsive.css",
]


def test_style_guards_baseline_exists_for_protected_views_and_selectors():
    assert STYLE_GUARDS_PATH.exists(), "Task 5.1 requires docs/parity/style-guards.md"
    source = STYLE_GUARDS_PATH.read_text(encoding="utf-8")
    for protected_token in [
        "#authGate",
        "#appShell",
        "#viewApproval",
        "#viewScripts",
        "#viewAudio",
        "#viewSubtitulos",
        ".sidebar",
        ".topbar",
        ".card",
        ".audio-queue-card",
        ".subtitle-phase-bar",
    ]:
        assert protected_token in source, f"Missing protected style guard token: {protected_token}"


def test_css_split_files_exist_for_locked_layered_architecture():
    missing = [str(path.relative_to(ROOT)) for path in STYLE_FILES if not path.exists()]
    assert not missing, f"Missing CSS split files: {missing}"


def test_styles_entry_is_import_only_with_locked_order():
    source = STYLE_ENTRY_PATH.read_text(encoding="utf-8")
    expected_lines = [
        "@import './styles/tokens.css';",
        "@import './styles/base.css';",
        "@import './styles/layout.css';",
        "@import './styles/components/buttons.css';",
        "@import './styles/components/dialogs.css';",
        "@import './styles/components/cards.css';",
        "@import './styles/components/forms.css';",
        "@import './styles/components/toast.css';",
        "@import './styles/features/approval.css';",
        "@import './styles/features/scripts.css';",
        "@import './styles/features/audio.css';",
        "@import './styles/features/subtitles.css';",
        "@import './styles/features/auth.css';",
        "@import './styles/responsive.css';",
    ]
    lines = [line.strip() for line in source.splitlines() if line.strip()]
    assert lines == expected_lines


def test_app_shell_removes_obsolete_approval_api_delegate_wrappers_after_extraction():
    source = APP_SHELL_PATH.read_text(encoding="utf-8")
    assert "async function apiGet(" not in source
    assert "async function apiPost(" not in source


def test_p4_checkpoint_and_css_rollback_scope_documented():
    source = CONTRACT_MATRIX_PATH.read_text(encoding="utf-8")
    assert "Checkpoint P4" in source
    assert "style guards" in source
    assert "styles.css" in source
    assert "CSS split" in source
