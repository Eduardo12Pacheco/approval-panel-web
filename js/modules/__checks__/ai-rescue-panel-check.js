import { fileURLToPath } from 'node:url';
export { runAiRescuePanelCheck } from '../features/ai-rescue/__checks__/ai-rescue-panel-check.js';
import { runAiRescuePanelCheck } from '../features/ai-rescue/__checks__/ai-rescue-panel-check.js';

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runAiRescuePanelCheck()
    .then(() => console.log('ai-rescue-panel-check: ok'))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
