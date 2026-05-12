export function createAudioControllerContext({ state, el, api, ui, helpers, browser = globalThis, runtime }) {
  const fetchImpl = browser.fetchImpl || browser.fetch || globalThis.fetch;

  function ttsGet(path) {
    return helpers.resolveTtsGet()(path);
  }

  function ttsPost(path, payload) {
    return api.post(path, payload);
  }

  function ttsGetBlob(path) {
    return helpers.getBlob(path);
  }

  function getFriendlyAudioErrorMessage(message, fallback = 'El job de audio falló') {
    const raw = (message || '').toString().trim();
    if (!raw) return fallback;

    const lower = raw.toLowerCase();
    if (lower.includes('sox') && (lower.includes('could not be found') || lower.includes('no se reconoce'))) {
      return 'Falta SoX en el servidor de audio. Instalalo y reiniciá el worker TTS.';
    }

    return raw.length > 220 ? `${raw.slice(0, 217)}...` : raw;
  }

  return {
    state,
    el,
    api,
    toast: ui.toast,
    escapeHtml: helpers.escapeHtml,
    getErrorMessage: helpers.getErrorMessage,
    ttsGet,
    ttsPost,
    ttsGetBlob,
    getFriendlyAudioErrorMessage,
    fetchImpl,
    URLImpl: browser.URL || globalThis.URL,
    documentRef: browser.document || globalThis.document,
    AbortControllerImpl: browser.AbortController || globalThis.AbortController,
    TextDecoderImpl: browser.TextDecoder || globalThis.TextDecoder,
    setIntervalImpl: browser.setInterval || globalThis.setInterval,
    clearIntervalImpl: browser.clearInterval || globalThis.clearInterval,
    ...runtime,
  };
}
