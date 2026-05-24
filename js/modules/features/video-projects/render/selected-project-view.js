import { escapeHtmlCore } from '../../../core/ui/escape-html.js';
import { buildSelectedVideoProjectViewModel } from './view-model.js';
import { buildProjectPhaseText, buildSetupPhaseContent, hydrateSetupPhaseInteractions } from './setup-view.js';
import { buildEditorPhaseContent } from './editor-shell-view.js';
import { captureCompositionPreviewSeekTime, destroyCompositionRenderer } from './preview-lifecycle.js';
import { hydrateEditorPhaseInteractions } from './editor-hydration.js';

export function renderSelectedVideoProjectView({
  state,
  el,
  closeVideoProject,
  toggleImageSelection,
  goToAudioStep,
  goToImagesStep,
  uploadProjectAudio,
  selectDefaultBackgroundMusic,
  uploadCustomImages,
  preparePreview,
  exportFinal,
  updateRow,
  assignExistingImageToRow,
  uploadAndAssignImage,
  uploadVideoToLibrary,
  assignVideoSegmentToRow,
  updateGlobalAudio,
  updateBrandChannel,
  renderSelectedVideoProject,
  updateSelectedVideoProjectCompositionPreview,
  swapRowImages,
  undoEditorChange,
  showToast,
}) {
  if (!el.videoProjectDetail) return;
  const videoProjectsHero = el.viewScripts?.querySelector('.video-projects-hero');
  const project = state.selectedVideoProject;
  if (!project) {
    destroyCompositionRenderer();
    videoProjectsHero?.classList.remove('hidden');
    el.videoProjectsCatalog?.classList.remove('hidden');
    el.videoProjectDetail.classList.add('hidden');
    el.videoProjectDetail.innerHTML = '';
    return;
  }

  videoProjectsHero?.classList.add('hidden');
  el.videoProjectsCatalog?.classList.add('hidden');
  el.videoProjectDetail.classList.remove('hidden');

  const viewModel = buildSelectedVideoProjectViewModel(project, state);
  const { detailPending, currentStep, editorState, editorPhase, editorRows, globalAudio, inEditorPhase, editorShellMode } = viewModel;
  const title = escapeHtmlCore(viewModel.title);
  const player = escapeHtmlCore(viewModel.player);
  const country = escapeHtmlCore(viewModel.country);
  const phaseText = escapeHtmlCore(buildProjectPhaseText({ currentStep, inEditorPhase, editorPhase }));
  const phaseInstruction = !inEditorPhase && currentStep === 'images'
    ? 'Elegí las imágenes que van a cubrir cada segmento del guion. A la derecha tenés el guion pipeado: es el texto dividido en partes para saber cuántas imágenes necesitás y qué representa cada una.'
    : '';
  const { mainContent, sideContent } = inEditorPhase
    ? buildEditorPhaseContent({ project, viewModel })
    : buildSetupPhaseContent({ project, viewModel });
  const shouldRenderSide = Boolean(sideContent && !editorShellMode);

  captureCompositionPreviewSeekTime(project);
  el.videoProjectDetail.innerHTML = `
    <header class="video-project-detail__header">
      <div>
        <button class="video-project-detail__back" type="button" data-action="back-to-video-projects">← Proyectos</button>
        <p class="video-projects-eyebrow">Proyecto · ${country} · ${player}</p>
        <h2>${title}</h2>
        ${phaseInstruction ? `<p class="video-project-detail__instruction">${escapeHtmlCore(phaseInstruction)}</p>` : ''}
      </div>
      <span class="video-project-detail__phase-label">${phaseText}</span>
    </header>
    ${detailPending ? '<p class="video-projects-empty">Cargando imágenes del proyecto…</p>' : ''}
    <section class="video-project-detail__workspace ${editorShellMode ? 'video-project-detail__workspace--editor-shell' : ''} ${shouldRenderSide ? '' : 'video-project-detail__workspace--single-column'}">
      <div class="video-project-detail__main">${mainContent}</div>
      ${shouldRenderSide ? `<aside class="video-project-detail__side">${sideContent}</aside>` : ''}
    </section>`;

  el.videoProjectDetail.querySelector('[data-action="back-to-video-projects"]')?.addEventListener('click', closeVideoProject);
  if (!inEditorPhase) {
    hydrateSetupPhaseInteractions({
      root: el.videoProjectDetail,
      toggleImageSelection,
      goToAudioStep,
      goToImagesStep,
      preparePreview,
      uploadProjectAudio,
      selectDefaultBackgroundMusic,
      uploadCustomImages,
    });
    return;
  }
  hydrateEditorPhaseInteractions({
    root: el.videoProjectDetail,
    project,
    editorPhase,
    editorRows,
    globalAudio,
    assignExistingImageToRow,
    uploadAndAssignImage,
    uploadVideoToLibrary,
    assignVideoSegmentToRow,
    updateGlobalAudio,
    updateBrandChannel,
    updateRow,
    swapRowImages,
    renderSelectedVideoProject,
    updateSelectedVideoProjectCompositionPreview,
    showToast,
    exportFinal,
    preparePreview,
    goToAudioStep,
    undoEditorChange,
  });
}
