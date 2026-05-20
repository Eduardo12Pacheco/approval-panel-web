import { VIDEO_SEGMENT_EFFECT_ASSETS, resolveVideoSegmentEffectUrl } from './overlay-assets.js';

export const FINAL_OUTRO_GAP_SECONDS = 2;

function toSafeObject(value) {
  return value && typeof value === 'object' ? value : {};
}

function toTrimmedString(value = '') {
  return (value || '').toString().trim();
}

function normalizeImageLookupKey(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .split(/[?#]/)[0]
    .split('/')
    .pop()
    .replace(/\.(png|jpe?g|webp|gif|avif)$/i, '')
    .replace(/[^a-z0-9]+/g, '-');
}

const VIDEO_SEGMENT_EFFECTS = VIDEO_SEGMENT_EFFECT_ASSETS.map((asset) => ({
  assetId: asset.assetId,
  mediaUrl: resolveVideoSegmentEffectUrl(asset.assetId),
  blendMode: asset.blendMode,
}));

function resolveLegacyCandidateUrl(candidate = {}) {
  return (
    candidate.image_url
    || candidate.imageUrl
    || candidate.thumbnail_url
    || candidate.thumbnailUrl
    || ''
  ).toString().trim();
}

function resolveSelectedImageEntryUrl(entry = null, resolveCandidateImageUrl = () => '') {
  if (!entry) return '';
  if (typeof entry === 'string') return entry.trim();
  if (typeof entry === 'object') return resolveCandidateImageUrl(entry);
  return '';
}

const LOCALHOST_PATTERN = /^(https?:\/\/)?(localhost|127\.0\.0\.1|\[::1\]|::1)(:\d+)?(\/|$)/i;

function isLocalhostUrl(raw) {
  try {
    return new Set(['localhost', '127.0.0.1', '[::1]', '::1']).has(new URL(raw).hostname);
  } catch {
    return LOCALHOST_PATTERN.test(raw);
  }
}

export function resolvePreparedMediaUrl(rawUrl = '', remotionApiUrl = '') {
  const value = toTrimmedString(rawUrl);
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  const baseUrl = toTrimmedString(remotionApiUrl);
  if (!baseUrl) return value;
  try {
    return new URL(value, `${baseUrl.replace(/\/+$/, '')}/`).toString();
  } catch {
    return value;
  }
}

export function normalizePreviewAssetManifest(project = {}) {
  const canonical = project?.editor_state?.approval_contract_snapshot || project?.approval_contract_snapshot;
  if (canonical?.contractVersion === 'approval-editor-service-v1') {
    const assets = canonical.assets && typeof canonical.assets === 'object' ? canonical.assets : {};
    const rows = Array.isArray(canonical.rows) ? canonical.rows : [];
    const videos = rows.map((row) => {
      if (row?.media?.kind !== 'video-segment') return null;
      const asset = assets[row.media.sourceVideoAssetId] || {};
      return { rowId: row.rowId || row.id, assetId: row.media.sourceVideoAssetId, mediaUrl: asset.previewUrl || asset.publicUrl || asset.renderPath || '' };
    }).filter((item) => item?.assetId);
    return {
      images: rows.map((row) => {
        const asset = assets[row.selectedAssetId] || {};
        return { rowId: row.rowId || row.id, assetId: row.selectedAssetId, mediaUrl: asset.previewUrl || asset.publicUrl || asset.renderPath || '' };
      }).filter((item) => item.assetId),
      videos,
      effects: VIDEO_SEGMENT_EFFECTS,
      audio: {
        voice: { assetId: canonical.audio?.voice?.assetId, mediaUrl: canonical.audio?.voice?.previewUrl || assets[canonical.audio?.voice?.assetId]?.previewUrl || assets[canonical.audio?.voice?.assetId]?.publicUrl || '' },
        music: { assetId: canonical.audio?.music?.assetId, mediaUrl: canonical.audio?.music?.previewUrl || assets[canonical.audio?.music?.assetId]?.previewUrl || assets[canonical.audio?.music?.assetId]?.publicUrl || '' },
      },
      global: {
        logo: { assetId: canonical.globalLayers?.logoAssetId || canonical.globalLayers?.logo?.assetId || '', mediaUrl: assets[canonical.globalLayers?.logoAssetId || canonical.globalLayers?.logo?.assetId]?.previewUrl || '' },
        outro: { assetId: canonical.globalLayers?.outroAssetId || canonical.globalLayers?.outro?.assetId || canonical.outro?.assetId || '', mediaUrl: assets[canonical.globalLayers?.outroAssetId || canonical.globalLayers?.outro?.assetId || canonical.outro?.assetId]?.previewUrl || '' },
      },
      canonical,
    };
  }
  const local = project?._previewAssets;
  const persisted = project?.editor_state?.preview_assets;
  const source = (local && typeof local === 'object') ? local : ((persisted && typeof persisted === 'object') ? persisted : null);
  if (!source) return null;

  const images = Array.isArray(source.images)
    ? source.images.map((item = {}) => ({
      rowId: toTrimmedString(item.rowId || item.row_id),
      assetId: toTrimmedString(item.assetId || item.asset_id),
      mediaUrl: toTrimmedString(item.mediaUrl || item.media_url || item.url),
    }))
    : [];

  const audio = toSafeObject(source.audio);
  const voice = toSafeObject(audio.voice);
  const music = toSafeObject(audio.music);

  return {
    images,
    audio: {
      voice: { mediaUrl: toTrimmedString(voice.mediaUrl || voice.media_url || voice.url) },
      music: { mediaUrl: toTrimmedString(music.mediaUrl || music.media_url || music.url) },
    },
  };
}

function resolveContractTotalDurationSeconds(canonical = {}) {
  const candidates = [
    canonical?.totalDurationSeconds,
    canonical?.audio?.totalDurationSeconds,
    canonical?.audio?.durationSeconds,
  ];
  for (const candidate of candidates) {
    const duration = Number(candidate);
    if (Number.isFinite(duration) && duration > 0) return Number((duration + FINAL_OUTRO_GAP_SECONDS).toFixed(6));
  }
  return null;
}

export function computeEffectiveSegmentTimes(rows = [], totalDurationSeconds = null) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  const officialDuration = Number(totalDurationSeconds);
  return sourceRows.map((row = {}, index) => {
    const startTime = Number(row.startTime) || 0;
    const rawEndTime = Number(row.endTime);
    const ownEndTime = Number.isFinite(rawEndTime) ? rawEndTime : startTime;
    const nextRow = sourceRows[index + 1] || null;
    const nextStartTime = nextRow ? Number(nextRow.startTime) : NaN;
    const hasNextStartAfterCurrent = Number.isFinite(nextStartTime) && nextStartTime > startTime;
    const isLastRow = index === sourceRows.length - 1;
    const effectiveEndTime = hasNextStartAfterCurrent
      ? nextStartTime
      : (isLastRow && Number.isFinite(officialDuration) && officialDuration > ownEndTime ? officialDuration : ownEndTime);
    return {
      ...row,
      startTime,
      endTime: ownEndTime,
      effectiveEndTime,
    };
  });
}

function mergeCanonicalRowsWithLocalRows(canonicalRows = [], localRows = []) {
  const canonical = Array.isArray(canonicalRows) ? canonicalRows : [];
  const local = Array.isArray(localRows) ? localRows : [];
  if (!local.length) return canonical;

  const localById = new Map(local
    .map((row) => [toTrimmedString(row?.rowId || row?.id), row])
    .filter(([rowId]) => rowId));

  const merged = canonical.map((row) => {
    const rowId = toTrimmedString(row?.rowId || row?.id);
    const localRow = localById.get(rowId);
    if (!localRow) return row;
    localById.delete(rowId);
    return { ...row, ...localRow };
  });

  return [...merged, ...localById.values()];
}

export function buildPreviewCompositionContract(project = {}, rows = []) {
  const canonical = project?.editor_state?.approval_contract_snapshot || project?.approval_contract_snapshot;
  if (canonical?.contractVersion === 'approval-editor-service-v1') {
    const totalDurationSeconds = resolveContractTotalDurationSeconds(canonical);
    return {
      remotionApiUrl: toTrimmedString(project?.editor_state?.pipeline_base_url || project?.editor_state?.remotion_api_url),
      manifest: normalizePreviewAssetManifest(project),
      rows: computeEffectiveSegmentTimes(mergeCanonicalRowsWithLocalRows(canonical.rows, rows), totalDurationSeconds),
      canonical,
      snapshotHash: canonical.snapshotHash,
      snapshotId: canonical.snapshotId,
    };
  }
  const manifest = normalizePreviewAssetManifest(project);
  const remotionApiUrl = toTrimmedString(project?.editor_state?.remotion_api_url);
  return {
    remotionApiUrl,
    manifest,
    rows: computeEffectiveSegmentTimes(rows),
  };
}

export function resolvePreviewAudioUrls({ contract = {}, project = {} } = {}) {
  const voiceUrl = resolvePreparedMediaUrl(contract?.manifest?.audio?.voice?.mediaUrl, contract?.remotionApiUrl)
    || toTrimmedString(project?.voice_audio?.public_url);
  const musicUrl = resolvePreparedMediaUrl(contract?.manifest?.audio?.music?.mediaUrl, contract?.remotionApiUrl)
    || toTrimmedString(project?.background_audio?.public_url);
  return { voiceUrl, musicUrl };
}

export function resolveRowImageUrlFromContract({ row = {}, rowIndex = 0, contract = {}, project = {}, resolveCandidateImageUrl = () => '' } = {}) {
  const prepared = Array.isArray(contract?.manifest?.images) ? contract.manifest.images : [];
  const preparedByRow = prepared.find((item) => item?.rowId === row?.id || (item?.assetId && item.assetId === row?.selectedAssetId));
  if (preparedByRow?.mediaUrl) {
    return resolvePreparedMediaUrl(preparedByRow.mediaUrl, contract?.remotionApiUrl);
  }

  const selectedAssetId = toTrimmedString(row?.selectedAssetId);
  if (/^https?:\/\//i.test(selectedAssetId)) return selectedAssetId;

  const selectedImages = Array.isArray(project.selected_images) ? project.selected_images : [];
  const selectedByIndex = resolveSelectedImageEntryUrl(selectedImages[rowIndex], resolveCandidateImageUrl);
  if (selectedByIndex) return selectedByIndex;

  const selectedKey = normalizeImageLookupKey(selectedAssetId);
  const candidates = Array.isArray(project.image_candidates) ? project.image_candidates : [];
  const matchedCandidate = candidates.find((candidate = {}) => {
    const candidateUrl = resolveCandidateImageUrl(candidate);
    return [
      candidate.id,
      candidate.assetId,
      candidate.file_name,
      candidate.title,
      candidate.storage_path,
      candidate.path,
      candidateUrl,
    ].some((value) => normalizeImageLookupKey(value) === selectedKey);
  });

  return matchedCandidate ? resolveCandidateImageUrl(matchedCandidate) : '';
}

function hashString(input) {
  let hash = 2166136261;
  for (const char of String(input)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

export function computeContractHash(contract = {}) {
  return hashString(stableStringify(contract || {}));
}

export function resolveLegacyCandidateUrlForContract(candidate = {}) {
  return resolveLegacyCandidateUrl(candidate);
}
