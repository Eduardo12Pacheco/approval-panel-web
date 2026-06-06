import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INDEX_HTML_PATH = ROOT / "index.html"


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


def test_approval_visible_news_filters_do_not_show_prensa_order_selector():
    index_source = INDEX_HTML_PATH.read_text(encoding="utf-8")

    approval_view = index_source[index_source.index('id="viewApproval"'):index_source.index('id="viewRadar"')]
    assert 'id="approvalOrderSelect"' not in approval_view
    assert '<span class="control-label">Orden</span>' not in approval_view


def test_approval_search_matches_channel_and_source_fields():
    script = r"""
import { approvalItemMatchesSearch } from './js/modules/app-shell/search-filter.js';

const item = {
  seleccion: 'Ecuador',
  jugador: 'Piero Hincapié',
  tema_principal: 'Defensa recibe elogios tras la fecha europea',
  channel_label: 'Mundo Maldini',
  source_name: 'Canal Plus Deportes',
};

if (!approvalItemMatchesSearch(item, 'mundo maldini')) {
  throw new Error('expected search to match channel label even when title does not include it');
}

if (!approvalItemMatchesSearch(item, 'canal plus')) {
  throw new Error('expected search to match source name even when title does not include it');
}

if (approvalItemMatchesSearch(item, 'mundo argentina')) {
  throw new Error('expected multi-term search to require all terms across searchable fields');
}
"""

    result = _run_node(script)

    assert result.returncode == 0, result.stderr


def test_approval_search_matches_nested_source_channel_fields():
    script = r"""
import { approvalItemMatchesSearch } from './js/modules/app-shell/search-filter.js';

const item = {
  seleccion: 'Uruguay',
  jugador: 'Federico Valverde',
  tema_principal: 'El volante mantiene su nivel en Europa',
  sources: [
    { titular: 'Nota táctica', fuente_origen: 'Mundo Maldini', channel_name: 'La Pizarra TV' },
  ],
};

if (!approvalItemMatchesSearch(item, 'mundo maldini')) {
  throw new Error('expected search to match nested source origin');
}

if (!approvalItemMatchesSearch(item, 'pizarra tv')) {
  throw new Error('expected search to match nested source channel name');
}

if (approvalItemMatchesSearch(item, 'maldini colombia')) {
  throw new Error('expected nested source search to still require all terms');
}
"""

    result = _run_node(script)

    assert result.returncode == 0, result.stderr
