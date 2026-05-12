import { fileURLToPath } from 'node:url';
export { runCompositionRendererPreloadWindowCheck } from '../features/video-projects/__checks__/composition-renderer-preload-window.check.mjs';
import { runCompositionRendererPreloadWindowCheck } from '../features/video-projects/__checks__/composition-renderer-preload-window.check.mjs';

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await runCompositionRendererPreloadWindowCheck();
  console.log('PASS composition-renderer-preload-window.check');
}
