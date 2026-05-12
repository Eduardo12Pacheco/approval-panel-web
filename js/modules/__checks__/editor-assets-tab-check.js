import { fileURLToPath } from 'node:url';
export { runEditorAssetsTabCheck } from '../features/video-projects/__checks__/editor-assets-tab-check.js';
import { runEditorAssetsTabCheck } from '../features/video-projects/__checks__/editor-assets-tab-check.js';

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runEditorAssetsTabCheck();
  console.log('editor-assets-tab-check: ok');
}
