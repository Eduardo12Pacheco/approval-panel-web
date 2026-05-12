export function buildSubtitleControllerContext({ state, el, api, ui, helpers, customDropdowns, browser = globalThis, renderCallbacks = {} }) {
  const URLImpl = browser.URL || globalThis.URL;
  const windowRef = browser.window || globalThis;

  return {
    state,
    el,
    api,
    ui,
    helpers,
    customDropdowns,
    browser,
    timers: {
      setTimeout: browser.setTimeout || globalThis.setTimeout,
      clearTimeout: browser.clearTimeout || globalThis.clearTimeout,
      clearInterval: browser.clearInterval || globalThis.clearInterval,
    },
    URLImpl,
    windowRef,
    renderCallbacks,
  };
}
