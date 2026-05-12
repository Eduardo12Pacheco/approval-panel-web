import { fileURLToPath } from 'node:url';
export { runVideoProjectsManifestResolutionCheck } from '../features/video-projects/__checks__/video-projects-manifest-resolution.check.mjs';
import { runVideoProjectsManifestResolutionCheck } from '../features/video-projects/__checks__/video-projects-manifest-resolution.check.mjs';

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runVideoProjectsManifestResolutionCheck();
  console.log('PASS video-projects-manifest-resolution.check');
}
