const DETAIL_CACHE_TTL_MS = 2 * 60 * 1000;
const DETAIL_CACHE_MAX_ENTRIES = 24;
const DETAIL_PREFETCH_VISIBLE_LIMIT = 6;
const DETAIL_PRELOAD_MAX_IMAGES = 32;

export function createVideoProjectDetailCache({ api, store, normalizeRows, resolveProjectKey }) {
  const detailCache = new Map();
  const detailInFlight = new Map();

  function getCachedProjectDetail(projectId) {
    const key = (projectId || '').toString();
    if (!key) return null;
    const cached = detailCache.get(key);
    if (!cached) return null;
    if (Date.now() - cached.cachedAt > DETAIL_CACHE_TTL_MS) {
      detailCache.delete(key);
      return null;
    }
    return cached.detail;
  }

  function setCachedProjectDetail(projectId, detail) {
    const key = (projectId || '').toString();
    if (!key || !detail || typeof detail !== 'object') return;
    if (detailCache.size >= DETAIL_CACHE_MAX_ENTRIES) {
      const oldestKey = detailCache.keys().next().value;
      if (oldestKey) detailCache.delete(oldestKey);
    }
    detailCache.set(key, { detail, cachedAt: Date.now() });
  }

  function mergeCachedProjectEditorState(projectId, editorState = {}) {
    const key = (projectId || '').toString();
    if (!key || !editorState || typeof editorState !== 'object') return;
    const cached = detailCache.get(key);
    if (!cached?.detail) return;

    const mergedEditorState = {
      ...(cached.detail.editor_state || {}),
      ...editorState,
    };
    const detail = {
      ...cached.detail,
      editor_state: mergedEditorState,
    };
    if (Array.isArray(mergedEditorState.video_assets)) {
      detail.video_assets = mergedEditorState.video_assets;
    }
    detailCache.set(key, { detail, cachedAt: Date.now() });
  }

  function collectCandidateUrls(project = {}) {
    const candidates = Array.isArray(project.image_candidates) ? project.image_candidates : [];
    const urls = [];
    for (const candidate of candidates) {
      const url = (
        candidate?.storage_public_url
        || candidate?.public_url
        || candidate?.storage_url
        || candidate?.cached_url
        || candidate?.image_url
        || candidate?.imageUrl
        || candidate?.thumbnail_url
        || candidate?.thumbnailUrl
        || ''
      ).toString().trim();
      if (!url || urls.includes(url)) continue;
      urls.push(url);
    }
    return urls;
  }

  async function preloadProjectCandidateImages(project = {}, { max = DETAIL_PRELOAD_MAX_IMAGES } = {}) {
    const urls = collectCandidateUrls(project).slice(0, Math.max(0, Number(max || 0)));
    if (!urls.length) return;

    await Promise.allSettled(urls.map((url) => new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = () => resolve();
      img.src = url;
    })));
  }

  async function fetchAndCacheProjectDetail(projectId, { preloadImages = true } = {}) {
    const id = (projectId || '').toString();
    if (!id) return null;

    if (detailInFlight.has(id)) return detailInFlight.get(id);

    const request = (async () => {
      const data = await api.getVideoProject(id);
      const [detail] = normalizeRows(data);
      if (!detail) return null;
      setCachedProjectDetail(id, detail);
      if (preloadImages) await preloadProjectCandidateImages(detail);
      return detail;
    })();

    detailInFlight.set(id, request);
    try {
      return await request;
    } finally {
      detailInFlight.delete(id);
    }
  }

  function prefetchProjectDetail(projectId) {
    const id = (projectId || '').toString();
    if (!id || getCachedProjectDetail(id) || detailInFlight.has(id)) return;
    void fetchAndCacheProjectDetail(id, { preloadImages: true }).catch(() => {});
  }

  function prefetchListedVideoProjects() {
    const projects = Array.isArray(store.getState()?.videoProjects) ? store.getState().videoProjects : [];
    projects
      .slice(0, DETAIL_PREFETCH_VISIBLE_LIMIT)
      .map((project) => resolveProjectKey(project))
      .filter(Boolean)
      .forEach((projectId) => prefetchProjectDetail(projectId));
  }

  return {
    getCachedProjectDetail,
    setCachedProjectDetail,
    mergeCachedProjectEditorState,
    collectCandidateUrls,
    preloadProjectCandidateImages,
    fetchAndCacheProjectDetail,
    prefetchProjectDetail,
    prefetchListedVideoProjects,
  };
}
