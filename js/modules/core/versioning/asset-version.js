/**
 * APP_CACHE_VERSION is retained for operational traceability but is no longer
 * appended as a ?v= query parameter. Cloudflare Pages _headers is the primary
 * freshness mechanism for app HTML, JS, and CSS.
 */
export const APP_CACHE_VERSION = '20260525-boundary-glitch-defaults-v14';

export function versionedModule(specifier, baseUrl) {
  return new URL(specifier, baseUrl).href;
}

export function versionedAsset(specifier, baseUrl = globalThis.document?.baseURI || globalThis.location?.href || import.meta.url) {
  return new URL(specifier, baseUrl).href;
}
