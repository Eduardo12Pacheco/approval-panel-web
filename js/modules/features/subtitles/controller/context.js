export function buildSubtitleControllerContext({ state, el, api, ui, helpers, customDropdowns, browser = globalThis, renderCallbacks = {} }) {
  const URLImpl = browser.URL || globalThis.URL;
  const windowRef = browser.window || globalThis;
  const createTimerInvoker = (methodName) => {
    const fn = browser?.[methodName] || globalThis[methodName];
    const fallbackFn = globalThis[methodName];
    return (...args) => {
      try {
        return fn.call(browser?.[methodName] ? browser : globalThis, ...args);
      } catch (error) {
        if (!(error instanceof TypeError) || typeof fallbackFn !== 'function') throw error;
        return fallbackFn.call(globalThis, ...args);
      }
    };
  };
  const setTimeoutImpl = createTimerInvoker('setTimeout');
  const setIntervalImpl = createTimerInvoker('setInterval');
  const clearTimeoutImpl = createTimerInvoker('clearTimeout');
  const clearIntervalImpl = createTimerInvoker('clearInterval');

  return {
    state,
    el,
    api,
    ui,
    helpers,
    customDropdowns,
    browser,
    timers: {
      setTimeout: setTimeoutImpl,
      setInterval: setIntervalImpl,
      clearTimeout: clearTimeoutImpl,
      clearInterval: clearIntervalImpl,
    },
    URLImpl,
    windowRef,
    renderCallbacks,
  };
}
