export const APP_CACHE_VERSION = '20260525-approval-fallback-v5';

function withAppVersion(url) {
  const resolved = new URL(url, globalThis.location?.href || import.meta.url);
  resolved.searchParams.set('v', APP_CACHE_VERSION);
  return resolved.href;
}

export function versionedModule(specifier, baseUrl) {
  return withAppVersion(new URL(specifier, baseUrl));
}

export function versionedAsset(specifier, baseUrl = globalThis.document?.baseURI || globalThis.location?.href || import.meta.url) {
  return withAppVersion(new URL(specifier, baseUrl));
}
