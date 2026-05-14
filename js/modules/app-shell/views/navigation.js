import { normalizeShellView } from '../navigation.js';

export function createShellNavigationController({
  state,
  el,
  audioFeature,
  subtitlesController,
  radarController,
  ensureApprovalAutoRefresh,
  refreshVideoProjects,
  renderSelectedVideoProject,
  lazyPreload,
}) {
  function setView(view) {
    const nextView = normalizeShellView(view);

    state.currentView = nextView;
    const isApproval = nextView === 'approval';
    const isScripts = nextView === 'scripts';
    const isAudio = nextView === 'audio';
    const isRadar = nextView === 'radar';
    const isSubtitulos2 = nextView === 'subtitulos2';

    // Only auto-refresh approval/queue monitor when on approval or scripts views.
    ensureApprovalAutoRefresh(isApproval || isScripts);

    // Preload feature modules in background before the view renders.
    if (isScripts) lazyPreload('video-projects');
    if (isAudio) lazyPreload('audio');
    if (isSubtitulos2) lazyPreload('subtitles');
    if (isRadar) lazyPreload('radar');
    el.viewApproval.classList.toggle('hidden', !isApproval);
    el.viewScripts.classList.toggle('hidden', !isScripts);
    el.viewAudio.classList.toggle('hidden', !isAudio);
    el.viewRadar?.classList.toggle('hidden', !isRadar);
    el.viewSubtitulos2?.classList.toggle('hidden', !isSubtitulos2);
    el.sidebarNav.querySelectorAll('.nav-item').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.view === nextView);
    });

    if (isAudio && !state.audioPollingTimer && !state.audioStreamController) {
      const nextTrack = audioFeature.getLatestTrackedJobId();
      if (nextTrack) {
        audioFeature.startAudioTracking(nextTrack);
      }
    }

    if (isAudio) {
      audioFeature.startAudioQueueSync();
    } else {
      audioFeature.stopAudioQueueSync();
    }

    if (isScripts) {
      void refreshVideoProjects({ silent: true });
      renderSelectedVideoProject();
    }

    if (isSubtitulos2) {
      void subtitlesController.refreshRemoteStatus();
      subtitlesController.renderWorkflow();
    }

    if (isRadar) {
      radarController.render();
      void radarController.refreshHealth();
      void radarController.refreshHistory();
    } else {
      radarController.stopPolling();
    }
  }

  return { setView };
}
