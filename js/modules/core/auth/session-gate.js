const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

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
