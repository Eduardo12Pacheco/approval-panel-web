export const SUPABASE_URL = 'https://ulzcthcdakjfretjdakd.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_RDUiyePyvXCkdU5k17Ue6g_nmxgSsQf';
export const VIDEO_PROJECT_AUDIO_BUCKET = 'video-project-audio';
export const VIDEO_CANDIDATES_TEMP_BUCKET = 'video-candidates-temp';
export const VIDEO_PROJECT_VIDEO_BUCKET = 'video-project-videos';

function sanitizePathPart(value = '') {
  return (value || '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || 'audio';
}

export function md5ProjectStorageKey(value = '') {
  const input = unescape(encodeURIComponent((value || '').toString()));
  const rotateLeft = (x, c) => (x << c) | (x >>> (32 - c));
  const add = (x, y) => ((x || 0) + (y || 0)) | 0;
  const cmn = (q, a, b, x, s, t) => add(rotateLeft(add(add(a, q), add(x, t)), s), b);
  const ff = (a, b, c, d, x, s, t) => cmn((b & c) | (~b & d), a, b, x, s, t);
  const gg = (a, b, c, d, x, s, t) => cmn((b & d) | (c & ~d), a, b, x, s, t);
  const hh = (a, b, c, d, x, s, t) => cmn(b ^ c ^ d, a, b, x, s, t);
  const ii = (a, b, c, d, x, s, t) => cmn(c ^ (b | ~d), a, b, x, s, t);

  const words = [];
  for (let i = 0; i < input.length; i += 1) {
    words[i >> 2] |= input.charCodeAt(i) << ((i % 4) * 8);
  }
  const bitLength = input.length * 8;
  words[bitLength >> 5] |= 0x80 << (bitLength % 32);
  words[(((bitLength + 64) >>> 9) << 4) + 14] = bitLength;

  let a = 1732584193;
  let b = -271733879;
  let c = -1732584194;
  let d = 271733878;

  for (let i = 0; i < words.length; i += 16) {
    const olda = a;
    const oldb = b;
    const oldc = c;
    const oldd = d;

    a = ff(a, b, c, d, words[i], 7, -680876936);
    d = ff(d, a, b, c, words[i + 1], 12, -389564586);
    c = ff(c, d, a, b, words[i + 2], 17, 606105819);
    b = ff(b, c, d, a, words[i + 3], 22, -1044525330);
    a = ff(a, b, c, d, words[i + 4], 7, -176418897);
    d = ff(d, a, b, c, words[i + 5], 12, 1200080426);
    c = ff(c, d, a, b, words[i + 6], 17, -1473231341);
    b = ff(b, c, d, a, words[i + 7], 22, -45705983);
    a = ff(a, b, c, d, words[i + 8], 7, 1770035416);
    d = ff(d, a, b, c, words[i + 9], 12, -1958414417);
    c = ff(c, d, a, b, words[i + 10], 17, -42063);
    b = ff(b, c, d, a, words[i + 11], 22, -1990404162);
    a = ff(a, b, c, d, words[i + 12], 7, 1804603682);
    d = ff(d, a, b, c, words[i + 13], 12, -40341101);
    c = ff(c, d, a, b, words[i + 14], 17, -1502002290);
    b = ff(b, c, d, a, words[i + 15], 22, 1236535329);

    a = gg(a, b, c, d, words[i + 1], 5, -165796510);
    d = gg(d, a, b, c, words[i + 6], 9, -1069501632);
    c = gg(c, d, a, b, words[i + 11], 14, 643717713);
    b = gg(b, c, d, a, words[i], 20, -373897302);
    a = gg(a, b, c, d, words[i + 5], 5, -701558691);
    d = gg(d, a, b, c, words[i + 10], 9, 38016083);
    c = gg(c, d, a, b, words[i + 15], 14, -660478335);
    b = gg(b, c, d, a, words[i + 4], 20, -405537848);
    a = gg(a, b, c, d, words[i + 9], 5, 568446438);
    d = gg(d, a, b, c, words[i + 14], 9, -1019803690);
    c = gg(c, d, a, b, words[i + 3], 14, -187363961);
    b = gg(b, c, d, a, words[i + 8], 20, 1163531501);
    a = gg(a, b, c, d, words[i + 13], 5, -1444681467);
    d = gg(d, a, b, c, words[i + 2], 9, -51403784);
    c = gg(c, d, a, b, words[i + 7], 14, 1735328473);
    b = gg(b, c, d, a, words[i + 12], 20, -1926607734);

    a = hh(a, b, c, d, words[i + 5], 4, -378558);
    d = hh(d, a, b, c, words[i + 8], 11, -2022574463);
    c = hh(c, d, a, b, words[i + 11], 16, 1839030562);
    b = hh(b, c, d, a, words[i + 14], 23, -35309556);
    a = hh(a, b, c, d, words[i + 1], 4, -1530992060);
    d = hh(d, a, b, c, words[i + 4], 11, 1272893353);
    c = hh(c, d, a, b, words[i + 7], 16, -155497632);
    b = hh(b, c, d, a, words[i + 10], 23, -1094730640);
    a = hh(a, b, c, d, words[i + 13], 4, 681279174);
    d = hh(d, a, b, c, words[i], 11, -358537222);
    c = hh(c, d, a, b, words[i + 3], 16, -722521979);
    b = hh(b, c, d, a, words[i + 6], 23, 76029189);
    a = hh(a, b, c, d, words[i + 9], 4, -640364487);
    d = hh(d, a, b, c, words[i + 12], 11, -421815835);
    c = hh(c, d, a, b, words[i + 15], 16, 530742520);
    b = hh(b, c, d, a, words[i + 2], 23, -995338651);

    a = ii(a, b, c, d, words[i], 6, -198630844);
    d = ii(d, a, b, c, words[i + 7], 10, 1126891415);
    c = ii(c, d, a, b, words[i + 14], 15, -1416354905);
    b = ii(b, c, d, a, words[i + 5], 21, -57434055);
    a = ii(a, b, c, d, words[i + 12], 6, 1700485571);
    d = ii(d, a, b, c, words[i + 3], 10, -1894986606);
    c = ii(c, d, a, b, words[i + 10], 15, -1051523);
    b = ii(b, c, d, a, words[i + 1], 21, -2054922799);
    a = ii(a, b, c, d, words[i + 8], 6, 1873313359);
    d = ii(d, a, b, c, words[i + 15], 10, -30611744);
    c = ii(c, d, a, b, words[i + 6], 15, -1560198380);
    b = ii(b, c, d, a, words[i + 13], 21, 1309151649);
    a = ii(a, b, c, d, words[i + 4], 6, -145523070);
    d = ii(d, a, b, c, words[i + 11], 10, -1120210379);
    c = ii(c, d, a, b, words[i + 2], 15, 718787259);
    b = ii(b, c, d, a, words[i + 9], 21, -343485551);

    a = add(a, olda);
    b = add(b, oldb);
    c = add(c, oldc);
    d = add(d, oldd);
  }

  const toHex = (num) => Array.from({ length: 4 }, (_, i) => ((num >> (i * 8)) & 0xff).toString(16).padStart(2, '0')).join('');
  return `${toHex(a)}${toHex(b)}${toHex(c)}${toHex(d)}`;
}

export function encodeStoragePath(path = '') {
  return path.split('/').map(encodeURIComponent).join('/');
}

export function buildAudioPath({ draftId, kind, file }) {
  const safeDraftId = md5ProjectStorageKey(draftId);
  const safeKind = kind === 'background' ? 'background' : 'voice';
  const safeName = sanitizePathPart(file?.name || `${safeKind}-audio`);
  return `projects/${safeDraftId}/${safeKind}/${Date.now()}-${safeName}`;
}

export function buildCustomImagePath({ draftId, file }) {
  const safeDraftId = md5ProjectStorageKey(draftId);
  const safeName = sanitizePathPart(file?.name || 'custom-image');
  return `projects/${safeDraftId}/custom/${Date.now()}-${safeName}`;
}

export function buildVideoUploadPath({ draftId, file }) {
  const safeDraftId = md5ProjectStorageKey(draftId);
  const safeName = sanitizePathPart(file?.name || 'source-video');
  return `projects/${safeDraftId}/videos/${Date.now()}-${safeName}`;
}

export function buildPublicStorageUrl(bucket, path) {
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${encodeStoragePath(path)}`;
}

export function buildAudioMetadata({ path, kind, file }) {
  return {
    kind,
    bucket: VIDEO_PROJECT_AUDIO_BUCKET,
    storage_path: path,
    public_url: buildPublicStorageUrl(VIDEO_PROJECT_AUDIO_BUCKET, path),
    name: file?.name || '',
    size: Number(file?.size || 0),
    mime_type: file?.type || 'application/octet-stream',
    uploaded_at: new Date().toISOString(),
  };
}

export function buildVideoUploadMetadata({ path, file, durationSeconds = 0 }) {
  return {
    bucket: VIDEO_PROJECT_VIDEO_BUCKET,
    storage_path: path,
    public_url: buildPublicStorageUrl(VIDEO_PROJECT_VIDEO_BUCKET, path),
    name: file?.name || '',
    size: Number(file?.size || 0),
    mime_type: file?.type || 'application/octet-stream',
    duration_seconds: Number(durationSeconds || 0),
    uploaded_at: new Date().toISOString(),
  };
}
