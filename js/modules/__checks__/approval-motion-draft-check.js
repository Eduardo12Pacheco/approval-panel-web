import { fileURLToPath } from 'node:url';
export { runApprovalMotionDraftCheck } from '../features/video-projects/__checks__/approval-motion-draft-check.js';
import { runApprovalMotionDraftCheck } from '../features/video-projects/__checks__/approval-motion-draft-check.js';

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await runApprovalMotionDraftCheck();
  console.log('approval-motion-draft-check: ok');
}
