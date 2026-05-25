import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def _run_node(script: str):
    return subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )


def test_approval_search_is_accent_insensitive_case_insensitive_and_multi_term():
    script = r"""
import { approvalItemMatchesSearch } from './js/modules/app-shell/search-filter.js';

const item = {
  seleccion: 'Colombia',
  jugador: 'Luis Díaz',
  tema_principal: 'Bayern Múnich conquista la Pokal con asistencia del colombiano',
};

const matchingQueries = [
  'luis diaz',
  'LUIS DIAZ',
  'munich diaz',
  'colombia pokal',
];

for (const query of matchingQueries) {
  if (!approvalItemMatchesSearch(item, query)) {
    throw new Error(`expected query to match: ${query}`);
  }
}

if (approvalItemMatchesSearch(item, 'messi')) {
  throw new Error('unexpected match for unrelated player');
}
"""

    result = _run_node(script)

    assert result.returncode == 0, result.stderr
