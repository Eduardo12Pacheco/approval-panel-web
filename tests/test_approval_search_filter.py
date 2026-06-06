import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INDEX_HTML_PATH = ROOT / "index.html"
SELECTORS_PATH = ROOT / "js" / "modules" / "shared" / "dom" / "selectors.js"
BOOTSTRAP_PATH = ROOT / "js" / "modules" / "core" / "bootstrap.js"


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


def test_approval_visible_news_filters_expose_order_selector_and_bind_input_events():
    index_source = INDEX_HTML_PATH.read_text(encoding="utf-8")
    selectors_source = SELECTORS_PATH.read_text(encoding="utf-8")
    bootstrap_source = BOOTSTRAP_PATH.read_text(encoding="utf-8")

    approval_view = index_source[index_source.index('id="viewApproval"'):index_source.index('id="viewRadar"')]

    assert 'id="approvalOrderSelect"' in approval_view
    assert '<span class="control-label">Orden</span>' in approval_view
    assert '<option value="relevance" selected>Relevancia</option>' in approval_view
    assert '<option value="recent">Recientes</option>' in approval_view
    assert "approvalOrderSelect: doc.getElementById('approvalOrderSelect')" in selectors_source
    assert '[el.searchInput, el.countryFilter, el.sourcesFilter, el.approvalOrderSelect]' in bootstrap_source


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


def test_approval_recent_order_keeps_priority_groups_and_recency_with_stable_ties():
    script = r"""
import { orderApprovalItemsForNewsView } from './js/modules/features/approval/index.js';

const relevant = [
  { cluster_id: 'normal-new', tema_principal: 'Normal new', avg: 1, published_at: '2026-05-23T12:00:00Z' },
  { cluster_id: 'priority-old', tema_principal: 'Priority old', avg: 2, channel_priority_rank: 11, published_at: '2026-05-20T12:00:00Z' },
  { cluster_id: 'priority-new', tema_principal: 'Priority new', avg: 3, channel_priority_rank: 1, published_at: '2026-05-22T12:00:00Z' },
  { cluster_id: 'normal-created', tema_principal: 'Normal created', avg: 4, published_at: 'not-a-date', fecha_creacion_cluster: '2026-05-24T12:00:00Z' },
  { cluster_id: 'normal-invalid', tema_principal: 'Normal invalid', avg: 5, published_at: 'not-a-date' },
  { cluster_id: 'tie-first', tema_principal: 'Tie A', avg: 6, created_at: '2026-05-21T12:00:00Z' },
  { cluster_id: 'tie-second', tema_principal: 'Tie B', avg: 7, fecha_publicacion: '2026-05-21T12:00:00Z' },
];

const recentIds = orderApprovalItemsForNewsView(relevant, 'recent').map((item) => item.cluster_id);
const expectedRecent = ['priority-new', 'priority-old', 'normal-created', 'normal-new', 'tie-first', 'tie-second', 'normal-invalid'];
if (JSON.stringify(recentIds) !== JSON.stringify(expectedRecent)) {
  throw new Error(`recent order drift: ${JSON.stringify(recentIds)}`);
}

const relevanceIds = orderApprovalItemsForNewsView([...relevant].reverse(), 'relevance').map((item) => item.cluster_id);
const expectedRelevance = ['normal-new', 'priority-old', 'priority-new', 'normal-created', 'normal-invalid', 'tie-first', 'tie-second'];
if (JSON.stringify(relevanceIds) !== JSON.stringify(expectedRelevance)) {
  throw new Error(`relevance order drift: ${JSON.stringify(relevanceIds)}`);
}
"""

    result = _run_node(script)

    assert result.returncode == 0, result.stderr
