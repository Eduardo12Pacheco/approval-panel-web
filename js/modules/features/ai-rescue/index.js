import { createAiRescueApiClient } from './api-client.js';
import { createAiRescueController } from './controller.js';
import { createAiRescueState } from './state.js';

export function createAiRescueFeature({ getSettings, fetchImpl, selectors, ui, browser } = {}) {
  const state = createAiRescueState();
  const api = createAiRescueApiClient({ getSettings, fetchImpl });
  const controller = createAiRescueController({ state, el: selectors, api, ui, browser });
  return { state, api, controller };
}

export { createAiRescueApiClient } from './api-client.js';
export { createAiRescueController } from './controller.js';
export { createAiRescueState } from './state.js';
