/**
 * CSS Loader — dynamically injects feature CSS as <link> elements.
 *
 * Maintains the cascade order from the original styles.css @import chain:
 *   approval → scripts → video-projects → audio → subtitles → radar
 *
 * Each feature CSS is loaded once (tracked by a Set). On subsequent calls
 * for the same feature, the function returns the existing link element
 * without creating a duplicate.
 */

import { versionedAsset } from '../versioning/asset-version.js';

/**
 * Map of feature view names to their CSS file paths relative to styles/.
 * Cascade order MUST match the original styles.css feature import order.
 */
const FEATURE_CSS_MAP = Object.freeze({
  approval: "features/approval.css",
  scripts: "features/scripts.css",
  "video-projects": "features/video-projects/index.css",
  audio: "features/audio.css",
  subtitulos2: "features/subtitles/index.css",
  radar: "features/radar.css",
  "ai-rescue": "features/ai-rescue.css",
  "errors-audit": "features/errors-audit.css",
  "active-users": "features/active-users.css",
});

/** @type {Set<string>} Tracks which feature CSS link elements exist in <head>. */
const _injectedCSS = new Set();

/**
 * Injects a <link rel="stylesheet"> for the given feature into <head>.
 * Each feature CSS is injected only once per session.
 *
 * @param {string} featureName - the feature view name (e.g. "scripts", "radar")
 * @returns {HTMLLinkElement|null} the created link element, or null if already injected / unknown feature
 */
export function injectFeatureCSS(featureName) {
  if (_injectedCSS.has(featureName)) {
    return document.querySelector(`link[data-feature-css="${featureName}"]`);
  }

  const cssPath = FEATURE_CSS_MAP[featureName];
  if (!cssPath) {
    console.warn(`[css-loader] Unknown feature: "${featureName}". No CSS to inject.`);
    return null;
  }

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = versionedAsset(`./styles/${cssPath}`);
  link.setAttribute("data-feature-css", featureName);

  document.head.appendChild(link);
  _injectedCSS.add(featureName);

  return link;
}

/**
 * Returns whether a feature's CSS has already been injected.
 * @param {string} featureName
 * @returns {boolean}
 */
export function isFeatureCSSInjected(featureName) {
  return _injectedCSS.has(featureName);
}
