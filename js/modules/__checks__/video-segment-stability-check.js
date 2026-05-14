import { fileURLToPath } from 'node:url';
export { runVideoSegmentStabilityCheck } from '../features/video-projects/__checks__/video-segment-stability-check.js';
import { runVideoSegmentStabilityCheck } from '../features/video-projects/__checks__/video-segment-stability-check.js';

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await runVideoSegmentStabilityCheck();
  console.log('video-segment-stability-check: ok');
}
