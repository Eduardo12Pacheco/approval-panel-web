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


def test_video_project_detail_prefers_cached_storage_urls_then_legacy_remote_fallbacks():
    script = r"""
import { renderSelectedVideoProjectView } from './js/modules/features/video-projects/render.js';

function makeElement() {
  return {
    innerHTML: '',
    classList: { add() {}, remove() {} },
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };
}

const detail = makeElement();
const catalog = makeElement();
const cachedUrl = 'https://example.supabase.co/storage/v1/object/public/video-candidates-temp/runs/run-1/projects/draft-1/001.webp';
const remoteUrl = 'https://remote.example.com/original.jpg';

renderSelectedVideoProjectView({
  state: {
    selectedVideoProject: {
      draft_id: 'draft-1',
      title: 'Proyecto cacheado',
      status: 'ready',
      image_candidates: [
        {
          order: 1,
          storage_bucket: 'video-candidates-temp',
          storage_path: 'runs/run-1/projects/draft-1/001.webp',
          storage_public_url: cachedUrl,
          original_url: remoteUrl,
          image_url: remoteUrl,
          mime_type: 'image/webp',
          size_bytes: 12345,
          width: 1200,
          height: 800,
        },
        {
          order: 2,
          image_url: 'https://remote.example.com/legacy.jpg',
          thumbnail_url: 'https://remote.example.com/legacy-thumb.jpg',
          width: 640,
          height: 360,
        },
      ],
      segments: [],
    },
    videoProjectDetailLoading: false,
  },
  el: { videoProjectDetail: detail, videoProjectsCatalog: catalog },
  closeVideoProject() {},
});

if (!detail.innerHTML.includes(`src="${cachedUrl}"`)) {
  throw new Error('cached storage URL was not rendered as the image source');
}

if (!detail.innerHTML.includes('src="https://remote.example.com/legacy.jpg"')) {
  throw new Error('legacy remote image_url fallback was not rendered');
}

if (detail.innerHTML.includes('src="https://remote.example.com/legacy-thumb.jpg"')) {
  throw new Error('legacy thumbnail should only be used when image_url is missing');
}
"""
    result = _run_node(script)
    assert result.returncode == 0, result.stderr


def test_video_project_list_uses_database_referenced_first_image_url_without_bucket_listing():
    script = r"""
import { renderVideoProjectsListView } from './js/modules/features/video-projects/render.js';

const list = {
  innerHTML: '',
  querySelectorAll() { return []; },
};
const cachedUrl = 'https://example.supabase.co/storage/v1/object/public/video-candidates-temp/runs/run-1/projects/draft-1/001.webp';

renderVideoProjectsListView({
  state: {
    videoProjectsLoading: false,
    videoProjects: [{ draft_id: 'draft-1', title: 'Proyecto', status: 'ready', first_image_url: cachedUrl, image_count: 1 }],
  },
  el: { videoProjectsList: list, videoProjectsMeta: { textContent: '' } },
  async openVideoProject() {},
});

if (!list.innerHTML.includes(`src="${cachedUrl}"`)) {
  throw new Error('list card did not render the DB-referenced storage URL');
}

if (list.innerHTML.includes('/storage/v1/object/list/')) {
  throw new Error('rendering must not list Supabase Storage buckets');
}
"""
    result = _run_node(script)
    assert result.returncode == 0, result.stderr


def test_video_project_list_can_build_thumbnail_from_cached_first_image_metadata():
    script = r"""
import { renderVideoProjectsListView } from './js/modules/features/video-projects/render.js';

const list = {
  innerHTML: '',
  querySelectorAll() { return []; },
};
const expected = 'https://ulzcthcdakjfretjdakd.supabase.co/storage/v1/object/public/video-candidates-temp/runs/run-1/projects/draft-1/001.webp';

renderVideoProjectsListView({
  state: {
    videoProjectsLoading: false,
    videoProjects: [{
      draft_id: 'draft-1',
      title: 'Proyecto',
      status: 'ready',
      image_count: 1,
      first_image: {
        storage_bucket: 'video-candidates-temp',
        storage_path: 'runs/run-1/projects/draft-1/001.webp',
      },
    }],
  },
  el: { videoProjectsList: list, videoProjectsMeta: { textContent: '' } },
  async openVideoProject() {},
});

if (!list.innerHTML.includes(`src="${expected}"`)) {
  throw new Error('list card did not build a thumbnail from cached first_image metadata');
}
"""
    result = _run_node(script)
    assert result.returncode == 0, result.stderr


def test_video_project_cards_expose_delete_action_without_replacing_open_action():
    script = r"""
import { buildProjectCard } from './js/modules/features/video-projects/render/project-list-markup.js';

const html = buildProjectCard({ draft_id: 'draft 1', title: 'Proyecto peligroso', status: 'ready' });

if (!html.includes('data-action="open-video-project"')) {
  throw new Error('project card must preserve the explicit open action');
}
if (!html.includes('data-action="delete-video-project"')) {
  throw new Error('project card must expose an explicit delete action');
}
if (!html.includes('data-project-id="draft%201"')) {
  throw new Error('delete/open actions must use the encoded project id');
}
if (!html.includes('aria-label="Eliminar proyecto Proyecto peligroso"')) {
  throw new Error('delete action must be accessible by project title');
}
if (!html.includes('<span aria-hidden="true">✕</span>')) {
  throw new Error('delete action should render the destructive icon glyph');
}
if (html.includes('Listo')) {
  throw new Error('ready projects should show workflow phase language, not final-sounding Listo');
}
if (!html.includes('video-project-card__phase') || !html.includes('>Imágenes<')) {
  throw new Error('project phase should render under the metadata as Imágenes');
}
if (html.indexOf('video-project-card__phase') < html.indexOf('imagen')) {
  throw new Error('project phase should render after image count and date metadata');
}
"""
    result = _run_node(script)
    assert result.returncode == 0, result.stderr


def test_video_project_list_rpc_includes_detail_for_card_thumbnails():
    source = (ROOT / "js" / "modules" / "features" / "video-projects" / "data" / "supabase-client.js").read_text(encoding="utf-8")
    assert "listVideoProjects: ({ limit = 50 } = {}) => callVideoProjectsRpc({ limit, includeDetail: true })" in source


def test_composition_preview_image_cache_has_real_eviction_limit():
    source = (ROOT / "js" / "modules" / "features" / "video-projects" / "composition" / "composition-renderer.js").read_text(encoding="utf-8")

    assert "const IMAGE_CACHE_MAX_SIZE" in source
    assert "while (this.#imageCacheOrder.length > IMAGE_CACHE_MAX_SIZE)" in source


def test_video_project_card_delete_and_hero_actions_keep_intended_visual_contract():
    scripts_css = (ROOT / "styles" / "features" / "scripts.css").read_text(encoding="utf-8")
    index_css = (ROOT / "styles" / "features" / "video-projects" / "index.css").read_text(encoding="utf-8")
    card_css = (ROOT / "styles" / "features" / "video-projects" / "project-list.css").read_text(encoding="utf-8")
    layout_css = (ROOT / "styles" / "features" / "video-projects" / "layout.css").read_text(encoding="utf-8")

    assert "./video-projects/index.css" in scripts_css
    assert "./layout.css" in index_css
    assert "./project-list.css" in index_css
    assert ".video-project-card button.video-project-card__delete" in card_css
    assert "#2d2424 !important" in card_css
    assert "color: #ffb7b7 !important" in card_css
    assert "max-width: max-content;" in card_css
    assert "background: var(--accent);" not in card_css.split(".video-project-card button.video-project-card__delete", 1)[1].split("}", 1)[0]
    assert "width: 128px;" in layout_css
    assert "min-height: 48px;" in layout_css
    assert "font-size: 0.8rem;" in layout_css


def test_video_project_phase_labels_cover_workflow_phases():
    script = r"""
import { getProjectPhaseLabel } from './js/modules/features/video-projects/domain/status-labels.js';

const cases = [
  [{ status: 'ready' }, 'Imágenes'],
  [{ status: 'image_search_error' }, 'Imágenes · error'],
  [{ status: 'ready', voice_audio: { public_url: 'https://audio.test/voice.mp3' } }, 'Audio'],
  [{ status: 'ready', editor_state: { phase: 'preview_ready' } }, 'Edición'],
  [{ status: 'ready', editor_state: { phase: 'final_rendering' } }, 'Renderizado'],
  [{ status: 'ready', editor_state: { phase: 'final_ready' } }, 'Renderizado'],
];

for (const [project, expected] of cases) {
  const actual = getProjectPhaseLabel(project);
  if (actual !== expected) throw new Error(`expected ${expected}, got ${actual}`);
}
"""
    result = _run_node(script)
    assert result.returncode == 0, result.stderr


def test_video_project_delete_flow_is_soft_disable_with_confirmation_guards():
    api_source = (ROOT / "js/modules/features/video-projects/data/supabase-client.js").read_text(encoding="utf-8")
    loading_source = (ROOT / "js/modules/features/video-projects/controller/project-loading.js").read_text(encoding="utf-8")
    events_source = (ROOT / "js/modules/features/video-projects/events/project-list-events.js").read_text(encoding="utf-8")

    assert "/rest/v1/rpc/disable_video_edit_project" in api_source
    assert "disableVideoProject({ draftId" in api_source
    assert "state.videoProjects = previousProjects.filter" in loading_source
    assert "state.selectedVideoProject = null" in loading_source
    assert "await api.disableVideoProject({ draftId: id });" in loading_source
    assert "confirmDelete('¿Seguro que querés eliminar este proyecto de edición?" in events_source
    assert "ev.stopPropagation();" in events_source


def test_manual_video_project_form_uses_n8n_country_player_catalog_and_preserves_title_script_fields():
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    catalog = (ROOT / "js/modules/features/video-projects/domain/player-catalog.js").read_text(encoding="utf-8")
    events = (ROOT / "js/modules/app-shell/events/scripts.js").read_text(encoding="utf-8")

    assert 'id="manualVideoProjectTitleInput" type="text"' in html
    assert 'id="manualVideoProjectScriptInput" class="script-area"' in html
    assert '<select id="manualVideoProjectCountryInput">' in html
    assert '<select id="manualVideoProjectPlayerInput" disabled>' in html
    assert 'type="text" placeholder="Luis Díaz"' not in html
    assert 'type="text" placeholder="Colombia"' not in html

    # New contract: the catalog is reshaped to { players, nicknames } and adds México.
    # Asserting the union of NEW entries (not an exact list) keeps the test stable when
    # future maintainers add more players or nicknames.
    required_entries = {
        "Ecuador": ["La Tri"],
        "Colombia": ["Los Cafeteros"],
        "Argentina": ["La Albiceleste"],
        "Uruguay": ["La Celeste"],
        "Paraguay": ["La Albirroja"],
        "México": ["Santiago Giménez", "Guillermo Ochoa", "Edson Álvarez", "El Tri"],
    }

    # Catalog source must mention every required country and entry (cheap, no-JS sanity check).
    for country, entries in required_entries.items():
        assert country in catalog
        for entry in entries:
            assert entry in catalog, f"{entry!r} missing from player-catalog.js source for {country}"

    # Renderer imports the catalog map and uses two optgroups to separate players from nicknames.
    assert "VIDEO_PROJECT_PLAYERS_BY_COUNTRY" in events
    assert '<optgroup label="Jugadores">' in events
    assert '<optgroup label="Selección">' in events

    # Submit handler + the public helper names stay wired to the catalog.
    assert "listVideoProjectCountries" in events
    assert "listVideoProjectPlayers" in events
    assert "populateManualPlayerOptions(el.manualVideoProjectCountryInput.value)" in events

    # Runtime contract: listVideoProjectPlayers(country) flattens {players, nicknames},
    # contains every required entry, and has no duplicates per country. The Node side
    # throws on any failure so the test can rely on returncode/stderr.
    script = r"""
import { listVideoProjectCountries, listVideoProjectPlayers } from './js/modules/features/video-projects/domain/player-catalog.js';

const required = {
  "Ecuador": ["La Tri"],
  "Colombia": ["Los Cafeteros"],
  "Argentina": ["La Albiceleste"],
  "Uruguay": ["La Celeste"],
  "Paraguay": ["La Albirroja"],
  "México": ["Santiago Giménez", "Guillermo Ochoa", "Edson Álvarez", "El Tri"],
};

const countries = listVideoProjectCountries();
for (const country of Object.keys(required)) {
  if (!countries.includes(country)) {
    throw new Error(`country ${country} missing from listVideoProjectCountries()`);
  }
}
for (const [country, requiredEntries] of Object.entries(required)) {
  const union = listVideoProjectPlayers(country);
  if (union.length !== new Set(union).size) {
    throw new Error(`duplicate entries in ${country}: ${union.join(', ')}`);
  }
  for (const entry of requiredEntries) {
    if (!union.includes(entry)) {
      throw new Error(`${entry} missing from listVideoProjectPlayers(${country})`);
    }
  }
}
"""
    result = _run_node(script)
    assert result.returncode == 0, result.stderr


def test_script_event_binding_is_idempotent_for_lazy_loaded_manual_project_form():
    events = (ROOT / "js/modules/app-shell/events/scripts.js").read_text(encoding="utf-8")

    assert "const boundScriptEventKeys = new WeakMap();" in events
    assert "function bindOnce(element, key, eventName, handler)" in events
    assert "bindOnce(el.manualVideoProjectSubmitBtn, 'manual-video-project-submit'" in events
    assert "el.manualVideoProjectSubmitBtn?.addEventListener('click'" not in events
    assert "bindOnce(el.videoProjectsNewBtn, 'manual-video-project-open'" in events
