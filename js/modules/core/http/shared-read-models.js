function trimSlashes(value = '') {
  return (value || '').toString().replace(/^\/+|\/+$/g, '');
}

const DEFAULT_API_ORIGIN = 'https://api.automatizacionedun8n.me';

function isRemoteBrowserContext(locationLike = globalThis.location) {
  const hostname = (locationLike?.hostname || '').toString().toLowerCase();
  if (!hostname) return false;
  return !new Set(['localhost', '127.0.0.1', '::1']).has(hostname);
}

export function getShellVersion() {
  return (globalThis.__CONTROL_PANEL_BOOTSTRAP__?.app_version || '').toString().trim();
}

export function resolveGatewayBaseUrl(settings = {}) {
  if (isRemoteBrowserContext()) {
    return (globalThis.__CONTROL_PANEL_BOOTSTRAP__?.api_origin || DEFAULT_API_ORIGIN).toString().trim().replace(/\/+$/, '');
  }

  return (
    settings?.apiOrigin
    || globalThis.__CONTROL_PANEL_BOOTSTRAP__?.api_origin
    || ''
  ).toString().trim().replace(/\/+$/, '');
}

export function buildGatewayReadHeaders(extra = {}) {
  const headers = { ...extra };
  const shellVersion = getShellVersion();
  if (shellVersion) headers['x-control-panel-shell-version'] = shellVersion;
  return headers;
}

export function resolveSharedReadModelUrl(path, settings = {}) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${resolveGatewayBaseUrl(settings)}${normalizedPath}`;
}

export function resolveApprovalSharedReadPath(path = '') {
  const value = (path || '').toString();
  if (value === '/webhook/approval/pending/supabase/v2') return '/panel/read-models/approval/pending';
  if (value === '/webhook/approval/queue/supabase/v2') return '/panel/read-models/approval/queue';
  if (value.startsWith('/webhook/approval/topic/supabase/v2')) {
    const query = value.includes('?') ? value.slice(value.indexOf('?')) : '';
    return `/panel/read-models/approval/topic${query}`;
  }
  if (value === '/webhook/mvp-script-drafts-pending/supabase/v2') return '/panel/read-models/scripts/drafts';
  if (value === '/webhook/approval/search-refresh/status/supabase/v1') return '/panel/read-models/approval/search-refresh/status';
  return '';
}

export function resolveTtsSharedReadPath(path = '') {
  const value = (path || '').toString();
  if (value === '/api/tts/jobs') return '/panel/read-models/audio/jobs';
  const jobMatch = value.match(/^\/api\/tts\/jobs\/([^/]+)$/);
  if (jobMatch?.[1]) return `/panel/read-models/audio/jobs/${jobMatch[1]}`;
  return '';
}

export function resolveSubtitlesSharedReadPath(path = '') {
  const value = (path || '').toString();
  if (value === '/api/subtitles/health') return '/panel/read-models/subtitles/health';
  if (value.startsWith('/api/subtitles/sessions?')) {
    return `/panel/read-models/subtitles/sessions${value.slice(value.indexOf('?'))}`;
  }
  const sessionMatch = value.match(/^\/api\/subtitles\/sessions\/([^/]+)(?:\/(segments|render|download))?$/);
  if (sessionMatch?.[1]) {
    const suffix = sessionMatch[2] ? `/${sessionMatch[2]}` : '';
    return `/panel/read-models/subtitles/sessions/${sessionMatch[1]}${suffix}`;
  }
  return '';
}

export function resolveVideoProjectsSharedReadPath({ draftId = '', limit = 50 } = {}) {
  const id = (draftId || '').toString().trim();
  if (id) return `/panel/read-models/video-projects?draft_id=${encodeURIComponent(id)}`;
  return `/panel/read-models/video-projects?limit=${encodeURIComponent(limit)}`;
}
