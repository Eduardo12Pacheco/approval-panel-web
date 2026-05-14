/**
 * DOM Injector — dynamically injects view templates into container elements.
 *
 * Usage:
 *   injectViewTemplate(containerId, templateHTML)
 *
 * The function finds the container element by ID and sets its innerHTML.
 * If the container is not found, it logs a warning and returns false.
 */

/**
 * Injects HTML content into a container element identified by its ID.
 *
 * @param {string} containerId - the id of the target container element
 * @param {string} templateHTML - the HTML string to inject
 * @returns {boolean} true if injection succeeded, false if container not found
 */
export function injectViewTemplate(containerId, templateHTML) {
  const container = document.getElementById(containerId);

  if (!container) {
    console.warn(`[dom-injector] Container "#${containerId}" not found. Cannot inject template.`);
    return false;
  }

  container.innerHTML = templateHTML;
  return true;
}
