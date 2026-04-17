export function readSessionStatus({ storage, sessionKey }) {
  return storage.getItem(sessionKey);
}

export function persistSessionStatus({ storage, sessionKey, value = 'ok' }) {
  storage.setItem(sessionKey, value);
}

export function clearSessionStatus({ storage, sessionKey }) {
  storage.removeItem(sessionKey);
}

export function isValidCredentials({ user, pass, authUser, authPass }) {
  return user === authUser && pass === authPass;
}
