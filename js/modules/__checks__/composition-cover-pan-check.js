import { fileURLToPath } from 'node:url';
export { runCompositionCoverPanCheck } from '../features/video-projects/__checks__/composition-cover-pan-check.js';
import { runCompositionCoverPanCheck } from '../features/video-projects/__checks__/composition-cover-pan-check.js';

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runCompositionCoverPanCheck();
  console.log('composition-cover-pan-check: ok');
}
