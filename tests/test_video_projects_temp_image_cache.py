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
