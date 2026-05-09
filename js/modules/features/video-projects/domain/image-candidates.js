const BLOCKED_IMAGE_DOMAIN_PARTS = ['tiktok.com', 'tiktokcdn.com', 'tiktokv.com', 'facebook.com', 'fbcdn.net', 'instagram.com', 'cdninstagram.com'];
const VIDEO_CANDIDATES_TEMP_BUCKET = 'video-candidates-temp';
const VIDEO_CANDIDATES_TEMP_PUBLIC_BASE = 'https://ulzcthcdakjfretjdakd.supabase.co/storage/v1/object/public/video-candidates-temp';

export function isBlockedImageCandidate(candidate = {}) {
  const haystack = [
    candidate.domain,
    candidate.source,
    candidate.link,
    candidate.google_url,
    candidate.image_url,
    candidate.thumbnail_url,
  ]
    .map((part) => (part || '').toString().toLowerCase())
    .join(' ');

  return BLOCKED_IMAGE_DOMAIN_PARTS.some((blocked) => haystack.includes(blocked));
}

export function toPositiveNumber(value) {
  const next = Number(value);
  return Number.isFinite(next) && next > 0 ? next : 0;
}

export function parseGoogleImageDimensions(candidate = {}) {
  const googleUrl = (candidate.google_url || candidate.googleUrl || '').toString();
  if (!googleUrl) return null;

  try {
    const url = new URL(googleUrl);
    const width = toPositiveNumber(url.searchParams.get('w'));
    const height = toPositiveNumber(url.searchParams.get('h'));
    if (width && height) return { width, height, source: 'google_url' };
  } catch {}

  return null;
}

export function resolveCandidateDimensionInfo(candidate = {}) {
  const imageWidth = toPositiveNumber(candidate.image_width || candidate.imageWidth || candidate.width);
  const imageHeight = toPositiveNumber(candidate.image_height || candidate.imageHeight || candidate.height);
  if (imageWidth && imageHeight) return { width: imageWidth, height: imageHeight, source: 'image' };

  const googleDimensions = parseGoogleImageDimensions(candidate);
  if (googleDimensions) return googleDimensions;

  const thumbnailWidth = toPositiveNumber(candidate.thumbnail_width || candidate.thumbnailWidth);
  const thumbnailHeight = toPositiveNumber(candidate.thumbnail_height || candidate.thumbnailHeight);
  if (thumbnailWidth && thumbnailHeight) return { width: thumbnailWidth, height: thumbnailHeight, source: 'thumbnail' };

  return null;
}

export function resolveCandidateDimensions(candidate = {}) {
  const dimensions = resolveCandidateDimensionInfo(candidate);
  if (!dimensions) return '';
  return `${Math.round(dimensions.width)} × ${Math.round(dimensions.height)} px`;
}

export function resolveStoragePublicUrl(candidate = {}) {
  const directUrl = (
    candidate.storage_public_url
    || candidate.public_url
    || candidate.storage_url
    || candidate.cached_url
    || ''
  ).toString().trim();
  if (directUrl) return directUrl;

  const bucket = (candidate.storage_bucket || candidate.bucket || VIDEO_CANDIDATES_TEMP_BUCKET).toString().trim();
  const path = (candidate.storage_path || candidate.path || '').toString().trim().replace(/^\/+/, '');
  if (bucket === VIDEO_CANDIDATES_TEMP_BUCKET && path) {
    return `${VIDEO_CANDIDATES_TEMP_PUBLIC_BASE}/${path.split('/').map(encodeURIComponent).join('/')}`;
  }

  return '';
}

export function resolveLegacyCandidateUrl(candidate = {}) {
  return (
    candidate.image_url
    || candidate.imageUrl
    || candidate.thumbnail_url
    || candidate.thumbnailUrl
    || ''
  ).toString().trim();
}

export function resolveCandidateImageUrl(candidate = {}) {
  return resolveStoragePublicUrl(candidate) || resolveLegacyCandidateUrl(candidate);
}

export function resolveCandidateFallbackUrl(candidate = {}, primaryUrl = '') {
  const legacyUrl = resolveLegacyCandidateUrl(candidate);
  if (!legacyUrl || legacyUrl === primaryUrl) return '';
  return legacyUrl;
}

export function getCandidateQualityScore(candidate = {}) {
  const dimensions = resolveCandidateDimensionInfo(candidate);
  if (!dimensions) return 0;

  const area = dimensions.width * dimensions.height;
  const longestSide = Math.max(dimensions.width, dimensions.height);
  const sourceWeight = dimensions.source === 'thumbnail' ? 0.12 : 1;
  return (area + longestSide) * sourceWeight;
}

export function getImageNaturalQualityScore(img) {
  const width = toPositiveNumber(img?.naturalWidth);
  const height = toPositiveNumber(img?.naturalHeight);
  if (!width || !height) return 0;

  return width * height + Math.max(width, height);
}

export function orderCandidatesByQuality(candidates = []) {
  return [...candidates]
    .map((candidate, index) => ({
      candidate,
      index,
      score: getCandidateQualityScore(candidate),
      position: Number(candidate.position || candidate.order || index + 1),
    }))
    .sort((a, b) => {
      if (a.position !== b.position) return a.position - b.position;
      return a.index - b.index;
    })
    .map(({ candidate }) => candidate);
}
