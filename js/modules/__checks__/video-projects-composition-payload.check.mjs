import { fileURLToPath } from 'node:url';
export { runVideoProjectsCompositionPayloadCheck } from '../features/video-projects/__checks__/video-projects-composition-payload.check.mjs';
import { runVideoProjectsCompositionPayloadCheck } from '../features/video-projects/__checks__/video-projects-composition-payload.check.mjs';

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runVideoProjectsCompositionPayloadCheck();
  console.log('PASS video-projects-composition-payload.check');
}
