from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INDEX_PATH = ROOT / "index.html"
STYLES_ENTRY_PATH = ROOT / "styles.css"
BASE_PATH = ROOT / "styles" / "base.css"
LAYOUT_PATH = ROOT / "styles" / "layout.css"
RESPONSIVE_PATH = ROOT / "styles" / "responsive.css"
BUTTONS_PATH = ROOT / "styles" / "components" / "buttons.css"
DIALOGS_PATH = ROOT / "styles" / "components" / "dialogs.css"
CARDS_PATH = ROOT / "styles" / "components" / "cards.css"
FORMS_PATH = ROOT / "styles" / "components" / "forms.css"
TOAST_PATH = ROOT / "styles" / "components" / "toast.css"
APPROVAL_PATH = ROOT / "styles" / "features" / "approval.css"
SCRIPTS_PATH = ROOT / "styles" / "features" / "scripts.css"
AUDIO_PATH = ROOT / "styles" / "features" / "audio.css"
SUBTITLES_PATH = ROOT / "styles" / "features" / "subtitles" / "legacy-base.css"
AUTH_PATH = ROOT / "styles" / "features" / "auth.css"
README_PATH = ROOT / "README.md"


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def test_index_html_adds_readability_block_delimiters_without_contract_drift():
    source = _read(INDEX_PATH)
    for required_comment in [
        "<!-- Slice A: Auth gate -->",
        "<!-- Slice A: App shell -->",
        "<!-- Slice A: Main views -->",
        "<!-- Slice A: Dialogs -->",
    ]:
        assert required_comment in source

    for selector_id in [
        "authGate",
        "appShell",
        "authForm",
        "sidebarNav",
        "viewApproval",
        "viewScripts",
        "viewAudio",
        "viewSubtitulos2",
        "queueDialog",
        "settingsDialog",
    ]:
        assert f'id="{selector_id}"' in source


def test_index_html_keeps_bootstrap_boundary_script_reference():
    source = _read(INDEX_PATH)
    assert '<script src="./js/main.js" type="module"></script>' in source


def test_styles_entry_order_stays_locked_while_rules_move_to_layer_files():
    lines = [line.strip() for line in _read(STYLES_ENTRY_PATH).splitlines() if line.strip()]
    assert lines == [
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
        "@import './styles/features/subtitles/index.css';",
        "@import './styles/features/auth.css';",
        "@import './styles/responsive.css';",
        "@import './styles/components/scrollbars.css';",
    ]


def test_css_redistribution_moves_guarded_selectors_out_of_base_css():
    base = _read(BASE_PATH)
    assert ".sidebar {" not in base
    assert "@media (max-width: 860px)" not in base
    assert ".card {" not in base
    assert ".audio-queue-card {" not in base
    assert ".subtitle-phase-bar {" not in base
    assert ".auth-gate {" not in base

    assert ".sidebar {" in _read(LAYOUT_PATH)
    assert "@media (max-width: 860px)" in _read(RESPONSIVE_PATH)
    assert ".card {" in _read(CARDS_PATH)
    assert ".audio-queue-card {" in _read(AUDIO_PATH)
    assert ".subtitle-phase-bar {" in _read(SUBTITLES_PATH)
    assert ".auth-gate {" in _read(AUTH_PATH)


def test_css_component_layers_receive_expected_rules():
    assert "button.approve" in _read(BUTTONS_PATH)
    assert "dialog::backdrop" in _read(DIALOGS_PATH)
    assert ".script-area" in _read(FORMS_PATH)
    assert ".toast:popover-open" in _read(TOAST_PATH)
    assert ".queue-list" in _read(APPROVAL_PATH)
    assert "#scriptEditorDialog" in _read(SCRIPTS_PATH)


def test_readme_documents_architecture_guardrails_and_slice_workflow_in_spanish():
    source = _read(README_PATH)
    for expected_section in [
        "# Approval Panel Web",
        "## Arquitectura",
        "## Mapa de carpetas",
        "## Guardrails de paridad",
        "## Workflow seguro por slices",
    ]:
        assert expected_section in source

    assert "sin cambios de features, API ni UX" in source


def test_readme_does_not_claim_new_capabilities_for_this_change_set():
    source = _read(README_PATH)
    assert "Próximas mejoras sugeridas" not in source
