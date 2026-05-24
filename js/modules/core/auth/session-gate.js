const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
const DEFAULT_SESSION_ENDPOINT = '/panel/session';
const DEFAULT_LOGIN_ENDPOINT = '/panel/login';
const DEFAULT_LOGOUT_ENDPOINT = '/panel/logout';

function safeJsonParse(raw) {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return { raw };
  }
}

function normalizeGatewaySession(data = {}) {
  const roles = Array.isArray(data.roles) ? data.roles.map((role) => String(role)) : [];
  return {
    status: 'ok',
    user: data.user && typeof data.user === 'object' ? data.user : {},
    roles,
    session_id: String(data.session_id || ''),
  };
}

function readCookieValue({ cookieJar, sessionKey }) {
  if (!cookieJar?.cookie) return null;
  const encodedKey = encodeURIComponent(sessionKey);
  const parts = cookieJar.cookie.split(';').map((part) => part.trim());
  const match = parts.find((part) => part.startsWith(`${encodedKey}=`));
  if (!match) return null;
  return decodeURIComponent(match.slice(encodedKey.length + 1));
}

function writeCookie({ cookieJar, sessionKey, value, maxAgeSeconds }) {
  if (!cookieJar) return;
  const cookieValue = `${encodeURIComponent(sessionKey)}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax`;
  if (typeof cookieJar.setCookie === 'function') {
    cookieJar.setCookie(cookieValue);
    return;
  }
  cookieJar.cookie = cookieValue;
}

export function readSessionStatus({ storage, cookieJar, sessionKey }) {
  if (globalThis.__CONTROL_PANEL_SESSION__?.status === 'ok') return 'ok';
  try {
    const storedSession = storage.getItem(sessionKey);
    if (storedSession) return storedSession;
  } catch {
    // Fall through to the cookie backup when browser storage is blocked/unavailable.
  }
  return readCookieValue({ cookieJar, sessionKey });
}

export function persistSessionStatus({ storage, cookieJar, sessionKey, value = 'ok' }) {
  try {
    storage.setItem(sessionKey, value);
  } catch {
    // Keep login persistence alive through the cookie backup if localStorage fails.
  }
  writeCookie({ cookieJar, sessionKey, value, maxAgeSeconds: SESSION_COOKIE_MAX_AGE_SECONDS });
}

export function clearSessionStatus({ storage, cookieJar, sessionKey }) {
  try {
    storage.removeItem(sessionKey);
  } catch {
    // Logout should still clear the cookie backup even if localStorage is unavailable.
  }
  writeCookie({ cookieJar, sessionKey, value: '', maxAgeSeconds: 0 });
}

export function isValidCredentials({ user, pass, authUser, authPass }) {
  return user === authUser && pass === authPass;
}

export async function hydrateGatewaySession({ fetchImpl = fetch, endpoint = DEFAULT_SESSION_ENDPOINT } = {}) {
  const response = await fetchImpl(endpoint, { credentials: 'include' });
  const raw = await response.text();
  const data = safeJsonParse(raw);
  if (!response.ok) {
    globalThis.__CONTROL_PANEL_SESSION__ = null;
    return { status: 'anonymous', error: data?.error || data?.message || `GET ${endpoint} ${response.status}` };
  }
  const session = normalizeGatewaySession(data);
  globalThis.__CONTROL_PANEL_SESSION__ = session;
  return session;
}

export async function loginGatewaySession({ fetchImpl = fetch, endpoint = DEFAULT_LOGIN_ENDPOINT, user, pass } = {}) {
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user, pass }),
  });
  const raw = await response.text();
  const data = safeJsonParse(raw);
  if (!response.ok) {
    globalThis.__CONTROL_PANEL_SESSION__ = null;
    throw new Error(data?.message || data?.error || `POST ${endpoint} ${response.status}`);
  }
  const session = normalizeGatewaySession(data);
  globalThis.__CONTROL_PANEL_SESSION__ = session;
  return session;
}

export async function logoutGatewaySession({ fetchImpl = fetch, endpoint = DEFAULT_LOGOUT_ENDPOINT } = {}) {
  const response = await fetchImpl(endpoint, { method: 'POST', credentials: 'include' });
  globalThis.__CONTROL_PANEL_SESSION__ = null;
  if (!response.ok) {
    const raw = await response.text();
    const data = safeJsonParse(raw);
    throw new Error(data?.message || data?.error || `POST ${endpoint} ${response.status}`);
  }
  return { ok: true };
}
