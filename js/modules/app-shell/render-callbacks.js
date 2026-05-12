import { renderApprovalTopicDetail } from '../features/approval/detail-dialog.js';
import { renderScriptCardsView, renderScriptStatsView, renderSelectedScriptEditorView } from '../features/scripts/render.js';
import {
  renderSelectedVideoProjectView,
  renderVideoProjectsListView,
  updateSelectedVideoProjectCompositionPreview as updateSelectedVideoProjectCompositionPreviewView,
} from '../features/video-projects/render.js';

export function createRenderCallbackRegistry(callbacks) {
  return callbacks;
}

export const __renderCallbackContracts = {
  renderApprovalTopicDetail,
  renderScriptCardsView,
  renderScriptStatsView,
  renderSelectedScriptEditorView,
  renderSelectedVideoProjectView,
  renderVideoProjectsListView,
  updateSelectedVideoProjectCompositionPreviewView,
};
