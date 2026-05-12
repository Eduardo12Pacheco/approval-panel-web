import { fileURLToPath } from 'node:url';
export { runRadarPanelCheck } from '../features/radar/__checks__/radar-panel-check.js';
import { runRadarPanelCheck } from '../features/radar/__checks__/radar-panel-check.js';

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runRadarPanelCheck()
    .then(() => console.log('radar-panel-check: ok'))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
