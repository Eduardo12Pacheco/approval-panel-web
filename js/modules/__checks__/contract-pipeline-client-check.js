import { fileURLToPath } from 'node:url';
export { runContractPipelineClientCheck } from '../features/video-projects/__checks__/contract-pipeline-client-check.js';
import { runContractPipelineClientCheck } from '../features/video-projects/__checks__/contract-pipeline-client-check.js';

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await runContractPipelineClientCheck();
  console.log('contract-pipeline-client-check: PASS');
}
