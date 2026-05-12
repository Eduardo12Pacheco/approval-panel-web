import { fileURLToPath } from 'node:url';
export { runApprovalAudioDraftCheck } from '../features/video-projects/__checks__/approval-audio-draft-check.js';
import { runApprovalAudioDraftCheck } from '../features/video-projects/__checks__/approval-audio-draft-check.js';

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await runApprovalAudioDraftCheck();
  console.log('approval-audio-draft-check: PASS');
}
