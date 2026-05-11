function normalizeVideoAssetId(video = {}, fallback = '') {
  return (video.id || video.assetId || video.src || video.public_url || video.storage_public_url || video.url || fallback || '').toString();
}

function normalizeVideoAssetSrc(video = {}) {
  return (video.src || video.previewUrl || video.public_url || video.storage_public_url || video.url || '').toString().trim();
}

export function normalizeProjectVideoAsset(video = {}, index = 0) {
  const src = normalizeVideoAssetSrc(video);
  const id = normalizeVideoAssetId(video, src || `video-${index + 1}`);
  return {
    ...video,
    id,
    assetId: video.assetId || id,
    src,
    title: (video.title || video.name || video.file_name || `Video ${index + 1}`).toString(),
    durationSeconds: Number(video.durationSeconds ?? video.duration_seconds ?? 0) || 0,
    duration_seconds: Number(video.duration_seconds ?? video.durationSeconds ?? 0) || 0,
  };
}

export function resolveProjectVideoLibrary(project = {}) {
  const sources = [
    project.video_assets,
    project.videos,
    project.custom_videos,
    project.editor_state?.video_assets,
  ];
  const seen = new Set();
  const videos = [];
  sources.forEach((items) => {
    if (!Array.isArray(items)) return;
    items.forEach((item) => {
      const normalized = normalizeProjectVideoAsset(item, videos.length);
      const key = (normalized.id || normalized.src || '').toString().trim().toLowerCase();
      if (!key || seen.has(key) || !normalized.src) return;
      seen.add(key);
      videos.push(normalized);
    });
  });
  return videos;
}

export function findProjectVideoAsset(project = {}, videoId = '') {
  const id = (videoId || '').toString();
  return resolveProjectVideoLibrary(project).find((video) => [video.id, video.assetId, video.src, video.public_url, video.storage_public_url].some((value) => value && value === id)) || null;
}

export function mergeProjectVideoAsset(project = {}, video = {}) {
  const current = resolveProjectVideoLibrary(project);
  const normalized = normalizeProjectVideoAsset(video, current.length);
  const key = (normalized.id || normalized.src || '').toString().trim().toLowerCase();
  const next = current.filter((item) => (item.id || item.src || '').toString().trim().toLowerCase() !== key);
  next.push(normalized);
  return next;
}
