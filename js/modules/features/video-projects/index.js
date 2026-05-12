import { createVideoProjectsController } from './controller/create-video-projects-controller.js';

export { resolveVideoProjectKey, resolveVideoProjectTitle } from './domain/project-identity.js';
export { normalizeVideoProjectRows } from './data/video-project-rows.js';
export {
  applyPendingMotionDrafts,
  mergeLocalEditorRowPatch,
  patchLocalEditorRows,
  shouldFallbackApprovalSnapshotOperationError,
} from './controller/row-commands.js';
export { buildCompositionPayloadForCheck } from './controller/create-video-projects-controller.js';

export function createVideoProjectsFeature({ api, store, ui, callbacks }) {
  return createVideoProjectsController({ api, store, ui, callbacks });
}
