import subprocess
from pathlib import Path

import pytest


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
ROOT_GITIGNORE_PATH = ROOT.parent / ".gitignore"
CONTROL_PANEL_GITIGNORE_PATH = ROOT / ".gitignore"
VIDEO_PROJECTS_README_PATH = ROOT / "js" / "modules" / "features" / "video-projects" / "README.md"
VIDEO_PROJECTS_PLAN_PATH = ROOT / "docs" / "video-projects-refactor-plan.md"


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _run_node(script: str):
    return subprocess.run(
        ["node", "--experimental-default-type=module", "-e", script],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )


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
        "@import './styles/features/video-projects/index.css';",
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


def test_readme_documents_current_docs_hygiene_paths_and_no_build_validation():
    source = _read(README_PATH)
    for expected in [
        "assets/",
        "services/approval-editor/",
        "services/approval-editor/projects/",
        "video-projects/controller/*",
        "video-projects/__checks__/*",
        "fachadas de compatibilidad",
        "pytest tests/test_phase8_html_css_readme_structure_refactor.py",
        "No correr builds",
    ]:
        assert expected in source

    assert "servicio local activo" in source


def test_video_projects_module_readme_maps_controller_checks_and_split_clients():
    source = _read(VIDEO_PROJECTS_README_PATH)
    for expected in [
        "controller/",
        "__checks__/",
        "data/supabase-client.js",
        "data/remotion-client.js",
        "data/approval-pipeline-client.js",
        "composition/renderer/",
        "domain/image-files.js",
    ]:
        assert expected in source

    assert "Compatibility facades remain at root" in source


def test_video_projects_refactor_plan_is_marked_historical_before_old_plan_details():
    source = _read(VIDEO_PROJECTS_PLAN_PATH)
    historical_note = "## Historical status"
    assert historical_note in source
    assert source.index(historical_note) < source.index("## Goal")
    assert "partially completed" in source
    assert "js/modules/features/video-projects/README.md" in source


def test_control_panel_and_workspace_ignores_protect_runtime_and_python_caches():
    control_panel_ignore = _read(CONTROL_PANEL_GITIGNORE_PATH)
    root_ignore = _read(ROOT_GITIGNORE_PATH)

    for expected in [
        "services/approval-editor/projects/",
        "__pycache__/",
        "*.py[cod]",
        ".pytest_cache/",
    ]:
        assert expected in control_panel_ignore

    for expected in [
        "01-Control-Panel/services/approval-editor/projects/",
        "__pycache__/",
        "*.py[cod]",
        ".pytest_cache/",
    ]:
        assert expected in root_ignore


def test_approval_pipeline_settings_placeholder_and_help_match_local_service_contract():
    source = _read(INDEX_PATH)
    assert 'id="approvalPipelineBaseUrlInput" placeholder="http://127.0.0.1:3042"' in source
    assert "Approval Pipeline URL (opcional, solo preparación)" in source
    assert "Si lo dejás vacío, sigue el fallback a Remotion" in source


def test_approval_pipeline_unhealthy_service_still_falls_back_to_remotion():
    script = r"""
import { prepareVideoCompositionContract } from './js/modules/features/video-projects/contract-pipeline-client.js';

const api = {
  createApprovalPipelineClient() {
    return {
      async health() {
        return { ok: false, status: 'degraded' };
      },
    };
  },
  createRemotionClient() {
    return {
      async createFromApproval() {
        return {
          alignmentStatus: { status: 'ready' },
          projectId: 'remotion-123',
          snapshot: { project: { rows: [{ id: 'row-1', phrase: 'fallback', startTime: 0, endTime: 2 }] } },
        };
      },
      async status() {
        return { project: { rows: [{ id: 'row-1', phrase: 'fallback', startTime: 0, endTime: 2 }] } };
      },
    };
  },
};

const result = await prepareVideoCompositionContract({
  project: {
    draft_id: 'draft-1',
    title: 'Proyecto de fallback',
    guion_piped: 'una|dos',
    selected_images: [],
    voice_audio: { public_url: 'https://cdn.example.com/voice.mp3' },
    background_audio: { public_url: 'https://cdn.example.com/music.mp3' },
  },
  settings: { remotionApiUrl: 'https://remotion.local', approvalPipelineBaseUrl: 'https://approval.local' },
  api,
});

if (result.provider !== 'remotion') {
  throw new Error(`expected remotion fallback, got ${result.provider}`);
}
if (result.providerMetadata?.fallbackFrom !== 'approval') {
  throw new Error('expected fallback metadata to preserve approval origin');
}
if (result.providerMetadata?.health?.ok !== false) {
  throw new Error('expected unhealthy approval health to be preserved in metadata');
}
"""
    result = _run_node(script)
    assert result.returncode == 0, result.stderr


@pytest.mark.parametrize(
    "approval_base_url",
    [None, '   '],
    ids=['absent', 'blank'],
)
def test_approval_pipeline_blank_or_absent_setting_uses_remotion_fallback_without_health_probe(approval_base_url):
    script = rf"""
import {{ prepareVideoCompositionContract }} from './js/modules/features/video-projects/contract-pipeline-client.js';

const calls = [];
const api = {{
  createApprovalPipelineClient() {{
    calls.push({{ type: 'approval-adapter' }});
    throw new Error('approval provider health should not be probed when the setting is blank or absent');
  }},
  createRemotionClient({{ resolveBaseUrl }}) {{
    calls.push({{ type: 'remotion-adapter', baseUrl: resolveBaseUrl() }});
    return {{
      async createFromApproval() {{
        return {{
          alignmentStatus: {{ status: 'ready' }},
          projectId: 'remotion-123',
          snapshot: {{ project: {{ rows: [{{ id: 'row-1', phrase: 'fallback', startTime: 0, endTime: 2 }}] }} }},
        }};
      }},
      async status() {{
        return {{ project: {{ rows: [{{ id: 'row-1', phrase: 'fallback', startTime: 0, endTime: 2 }}] }} }};
      }},
    }};
  }},
}};

const result = await prepareVideoCompositionContract({{
  project: {{
    draft_id: 'draft-blank',
    title: 'Proyecto fallback',
    guion_piped: 'una|dos',
    selected_images: [],
    voice_audio: {{ public_url: 'https://cdn.example.com/voice.mp3' }},
    background_audio: {{ public_url: 'https://cdn.example.com/music.mp3' }},
  }},
  settings: {{ remotionApiUrl: 'https://remotion.local'{'' if approval_base_url is None else f", approvalPipelineBaseUrl: '{approval_base_url}'"} }},
  api,
}});

if (result.provider !== 'remotion') {{
  throw new Error(`expected remotion fallback, got ${{result.provider}}`);
}}
if (result.providerMetadata?.baseUrl !== 'https://remotion.local') {{
  throw new Error('expected remotion baseUrl to be preserved in provider metadata');
}}
if (result.providerMetadata?.fallbackFrom !== '') {{
  throw new Error('expected no approval fallback origin when the approval setting is blank or absent');
}}
if (result.providerMetadata?.health !== null) {{
  throw new Error('expected no approval health probe metadata when the setting is blank or absent');
}}
if (calls.some((entry) => entry.type === 'approval-adapter')) {{
  throw new Error('expected approval provider client not to be created when the setting is blank or absent');
}}
if (!calls.some((entry) => entry.type === 'remotion-adapter' && entry.baseUrl === 'https://remotion.local')) {{
  throw new Error('expected remotion client to be used directly as the fallback path');
}}
"""
    result = _run_node(script)
    assert result.returncode == 0, result.stderr


def test_styles_entry_order_reflects_current_feature_layer_stack():
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
        "@import './styles/features/video-projects/index.css';",
        "@import './styles/features/audio.css';",
        "@import './styles/features/subtitles/index.css';",
        "@import './styles/features/auth.css';",
        "@import './styles/responsive.css';",
        "@import './styles/components/scrollbars.css';",
    ]
