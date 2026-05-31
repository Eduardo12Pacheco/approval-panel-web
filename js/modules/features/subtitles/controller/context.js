export function buildSubtitleControllerContext({ state, el, api, ui, helpers, customDropdowns, browser = globalThis, renderCallbacks = {} }) {
  const URLImpl = browser.URL || globalThis.URL;
  const windowRef = browser.window || globalThis;
  const timeoutHost = browser.setTimeout ? browser : globalThis;
  const intervalHost = browser.setInterval ? browser : globalThis;
  const clearTimeoutHost = browser.clearTimeout ? browser : globalThis;
  const clearIntervalHost = browser.clearInterval ? browser : globalThis;

  return {
    state,
    el,
    api,
    ui,
    helpers,
    customDropdowns,
    browser,
    timers: {
      setTimeout: (...args) => timeoutHost.setTimeout(...args),
      setInterval: (...args) => intervalHost.setInterval(...args),
      clearTimeout: (...args) => clearTimeoutHost.clearTimeout(...args),
      clearInterval: (...args) => clearIntervalHost.clearInterval(...args),
    },
    URLImpl,
    windowRef,
    renderCallbacks,
  };
}
