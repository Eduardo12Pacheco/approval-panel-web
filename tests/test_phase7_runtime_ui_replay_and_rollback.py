import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CONTRACT_MATRIX_PATH = ROOT / "docs" / "parity" / "contract-matrix.md"
APP_SHELL_PATH = ROOT / "js" / "modules" / "app-shell.js"
SUBTITLES_RUNTIME_SERVICES_PATH = ROOT / "js" / "modules" / "features" / "subtitles" / "runtime" / "services.js"
SUBTITLES_RUNTIME_CONTROLLERS_PATH = ROOT / "js" / "modules" / "features" / "subtitles" / "runtime" / "controllers.js"
AUDIO_RUNTIME_SERVICES_PATH = ROOT / "js" / "modules" / "features" / "audio" / "runtime" / "services.js"
AUDIO_RUNTIME_CONTROLLERS_PATH = ROOT / "js" / "modules" / "features" / "audio" / "runtime" / "controllers.js"


def _run_node(script: str):
    return subprocess.run(
        ["node", "--experimental-default-type=module", "-e", script],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )


def test_contract_matrix_contains_executable_ui_state_replay_reference_for_protected_flows():
    source = CONTRACT_MATRIX_PATH.read_text(encoding="utf-8")
    assert "Executable UI-State Replay" in source
    for flow in ["approval", "scripts", "audio", "subtitles", "auth/session", "settings"]:
        assert flow in source


def test_runtime_ui_state_replay_executes_all_protected_flows():
    script = r"""
import { runProtectedFlowsReplay } from './js/modules/__checks__/runtime-ui-parity-replay.js';

const result = await runProtectedFlowsReplay();
if (!result.ok) {
  throw new Error(`replay failed: ${JSON.stringify(result.failures)}`);
}
if (result.passed.length !== 6) {
  throw new Error(`expected 6 protected scenarios, got ${result.passed.length}`);
}
"""
    result = _run_node(script)
    assert result.returncode == 0, result.stderr


def test_rollback_scope_validator_enforces_checkpoint_failure_boundaries():
    script = r"""
import { evaluateRollbackPlan } from './js/modules/__checks__/rollback-scope-validator.js';

const okPlan = evaluateRollbackPlan({
  checkpoint: 'P3',
  changedFiles: [
    'js/modules/features/audio/index.js',
    'js/modules/features/subtitles/index.js',
    'js/modules/core/http/tts-api.js',
  ],
});
if (!okPlan.allowed || okPlan.offendingFiles.length) {
  throw new Error('expected allowed rollback plan for P3');
}

const badPlan = evaluateRollbackPlan({
  checkpoint: 'P3',
  changedFiles: [
    'js/modules/features/audio/index.js',
    'js/modules/features/approval/index.js',
  ],
});
if (badPlan.allowed) {
  throw new Error('expected rejection for out-of-scope rollback file');
}
if (!badPlan.offendingFiles.includes('js/modules/features/approval/index.js')) {
  throw new Error('missing offending file evidence');
}
"""
    result = _run_node(script)
    assert result.returncode == 0, result.stderr


def test_dependency_boundary_validator_detects_mutated_cross_feature_import_edge():
    script = r"""
import { validateDependencyBoundaries } from './js/modules/__checks__/dependency-boundary-validator.js';

const importGraph = {
  'features/approval': ['core/http/approval-api'],
  'features/scripts': ['core/http/approval-api'],
  'features/audio': ['core/http/tts-api'],
  'features/subtitles': ['core/http/tts-api'],
};

const rules = {
  'features/approval': ['features/scripts', 'features/audio', 'features/subtitles', 'core/http/tts-api'],
  'features/scripts': ['features/approval', 'features/audio', 'features/subtitles', 'core/http/tts-api'],
  'features/audio': ['features/approval', 'features/scripts', 'features/subtitles', 'core/http/approval-api'],
  'features/subtitles': ['features/approval', 'features/scripts', 'features/audio', 'core/http/approval-api'],
};

const baseline = validateDependencyBoundaries(importGraph, rules);
if (!baseline.ok) {
  throw new Error(`baseline graph should pass: ${JSON.stringify(baseline.violations)}`);
}

const mutatedGraph = {
  ...importGraph,
  'features/audio': [...importGraph['features/audio'], 'features/approval'],
};

const mutated = validateDependencyBoundaries(mutatedGraph, rules);
if (mutated.ok) {
  throw new Error('mutated graph should fail boundary validation');
}
if (!mutated.violations.some((v) => v.from === 'features/audio' && v.to === 'features/approval')) {
  throw new Error('missing explicit mutated-edge violation evidence');
}
"""
    result = _run_node(script)
    assert result.returncode == 0, result.stderr


def test_runtime_ui_replay_guardrails_expect_pure_helpers_to_live_in_runtime_services():
    app_shell_source = APP_SHELL_PATH.read_text(encoding="utf-8")
    subtitles_services_source = SUBTITLES_RUNTIME_SERVICES_PATH.read_text(encoding="utf-8")
    subtitles_controllers_source = SUBTITLES_RUNTIME_CONTROLLERS_PATH.read_text(encoding="utf-8")
    audio_services_source = AUDIO_RUNTIME_SERVICES_PATH.read_text(encoding="utf-8")
    audio_controllers_source = AUDIO_RUNTIME_CONTROLLERS_PATH.read_text(encoding="utf-8")

    assert "extractSubtitleProgressPercentRuntime" in subtitles_services_source
    assert "extractSubtitleAnalyzeMetadataRuntime" in subtitles_services_source
    assert "extractSubtitleProgressPercentRuntime" in subtitles_controllers_source

    assert "normalizeAudioProgressPercent" in audio_services_source
    assert "getAudioStatusLabelRuntime" in audio_services_source
    assert "normalizeAudioProgressPercent" in audio_controllers_source

    assert "normalizeAudioProgressPercent" in app_shell_source
    assert "resolveSubtitleProgressPercentRuntime" in app_shell_source


def test_app_shell_declares_single_timer_auto_refresh_for_queue_and_drafts():
    app_shell_source = APP_SHELL_PATH.read_text(encoding="utf-8")

    assert "APPROVAL_AUTO_REFRESH_INTERVAL_MS" in app_shell_source
    assert "approvalAutoRefreshTimer" in app_shell_source
    assert "createSingleFlightRunner" in app_shell_source
    assert "refreshQueue({ silent: true })" in app_shell_source
    assert "refreshScriptDrafts({ silent: true })" in app_shell_source
