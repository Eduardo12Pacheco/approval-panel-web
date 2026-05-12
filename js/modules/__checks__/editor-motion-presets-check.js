import { fileURLToPath } from 'node:url';
export { runEditorMotionPresetsCheck } from '../features/video-projects/__checks__/editor-motion-presets-check.js';
import { runEditorMotionPresetsCheck } from '../features/video-projects/__checks__/editor-motion-presets-check.js';

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runEditorMotionPresetsCheck();
  console.log('editor-motion-presets-check: ok');
}
