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


def test_prepared_contract_rows_default_dust_1_for_images_only():
    script = r"""
import { normalizePreparedContractRows } from './js/modules/features/video-projects/data/contract-pipeline-client.js';

const rows = normalizePreparedContractRows([
  { id: 'image-missing-dust', selectedAssetId: 'asset-1' },
  { id: 'image-explicit-disabled', selectedAssetId: 'asset-2', dust: { enabled: false, type: 'dust-2' } },
  { id: 'video-row', selectedAssetId: 'asset-3', media: { kind: 'video-segment', sourceVideoAssetId: 'video-1' }, dust: { enabled: true, type: 'dust-1' } },
]);

if (rows[0].dust.enabled !== true || rows[0].dust.type !== 'dust-1' || rows[0].dust.assetId !== 'dust-1') {
  throw new Error(`expected image rows to default to real dust-1 state, got ${JSON.stringify(rows[0].dust)}`);
}
if (rows[1].dust.enabled !== false || rows[1].dust.assetId !== null) {
  throw new Error(`expected explicit image dust disable to be preserved, got ${JSON.stringify(rows[1].dust)}`);
}
if (rows[2].dust.enabled !== false || rows[2].dust.assetId !== null || rows[2].selectedAssetId !== null) {
  throw new Error(`expected video segment rows to avoid default dust/image selection, got ${JSON.stringify(rows[2])}`);
}
"""
    result = _run_node(script)
    assert result.returncode == 0, result.stderr
