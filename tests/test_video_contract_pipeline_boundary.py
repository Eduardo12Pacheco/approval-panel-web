import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def _run_node(script: str):
    return subprocess.run(
        ["node", "--experimental-default-type=module", "-e", script],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )


def test_contract_pipeline_boundary_uses_adapter_and_preserves_fallback_behaviors():
    script = r"""
import { runContractPipelineClientCheck } from './js/modules/__checks__/contract-pipeline-client-check.js';

const result = await runContractPipelineClientCheck();
if (!result?.ok) {
  throw new Error('contract pipeline boundary check failed');
}
"""
    result = _run_node(script)
    assert result.returncode == 0, result.stderr
