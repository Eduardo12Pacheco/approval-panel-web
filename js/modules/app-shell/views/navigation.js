import { normalizeShellView } from '../navigation.js';
import { injectFeatureCSS, isFeatureCSSInjected } from '../../core/ui/css-loader.js';
import { injectViewTemplate } from '../../core/ui/dom-injector.js';
import { getDomSelectors } from '../../shared/dom/selectors.js';
import { scriptsViewHTML } from './templates/scripts-view.js';
import { audioViewHTML } from './templates/audio-view.js';
import { radarViewHTML } from './templates/radar-view.js';
import { subtitlesViewHTML } from './templates/subtitles-view.js';

/**
 * Map of normalized view names to their container element IDs and template HTML.
 * These are the views whose DOM was extracted from index.html in Phase 1.
 */
const VIEW_TO_TEMPLATE = Object.freeze({
  scripts: { containerId: 'viewScripts', html: scriptsViewHTML },
  audio: { containerId: 'viewAudio', html: audioViewHTML },
  radar: { containerId: 'viewRadar', html: radarViewHTML },
  subtitulos2: { containerId: 'viewSubtitulos2', html: subtitlesViewHTML },
});

/**
 * Map of view names to their feature CSS name (must match FEATURE_CSS_MAP in css-loader.js).
 */
const VIEW_TO_CSS = Object.freeze({
  approval: 'approval',
  scripts: 'scripts',
  audio: 'audio',
  radar: 'radar',
  subtitulos2: 'subtitulos2',
});

/**
 * CSS cascade dependencies. Some feature CSS files depend on earlier entries
 * in the cascade. radar.css uses audio.css layout classes. subtitles uses
 * its own standalone styles.
 */
const VIEW_TO_CSS_DEPS = Object.freeze({
  radar: ['audio'],
});

export function createShellNavigationController({
  documentRef = globalThis.document,
  state,
  el,
  audioFeature,
  subtitlesController,
  radarController,
  approvalFeature,
  scriptsFeature,
  videoProjectsFeature,
  ensureApprovalAutoRefresh,
  refreshVideoProjects,
  renderSelectedVideoProject,
  _ensureApprovalFeature,
  _ensureScriptsFeature,
  _ensureVideoProjectsFeature,
  _ensureAudioFeature,
  _ensureSubtitlesFeature,
  _ensureRadarFeature,
  _cssLoaded,
  _domInjected,
  _visited,
  bindViewEvents = () => {},
}) {
  const _eventsBound = new Set();

  /**
   * Lazy-load a feature view: ensure factory, inject CSS, inject DOM,
   * activate feature, reveal view. Uses tracking Sets to prevent
   * redundant work on subsequent navigations.
   */
  async function _lazyLoadView(nextView) {
    // 1. Ensure feature module is loaded (memoized async factory)
    await _ensureFeatureForView(nextView);

    // 2. Inject feature CSS if not already loaded.
    //    Some views depend on earlier cascade entries: radar needs audio layout classes.
    const cssDeps = VIEW_TO_CSS_DEPS[nextView] || [];
    for (const dep of cssDeps) {
      if (!_cssLoaded.has(dep)) {
        injectFeatureCSS(dep);
        _cssLoaded.add(dep);
      }
    }
    if (!_cssLoaded.has(VIEW_TO_CSS[nextView] || nextView)) {
      injectFeatureCSS(VIEW_TO_CSS[nextView] || nextView);
      _cssLoaded.add(VIEW_TO_CSS[nextView] || nextView);
    }

    // 3. Inject DOM template if applicable (approval view DOM stays in index.html)
    const template = VIEW_TO_TEMPLATE[nextView];
    if (template && !_domInjected.has(nextView)) {
      injectViewTemplate(template.containerId, template.html);
      Object.assign(el, getDomSelectors(documentRef));
      _domInjected.add(nextView);
    }

    // 3b. Bind view-specific events after lazy DOM exists. Boot-time binders
    // may have skipped these handlers because selectors were null before the
    // template was injected.
    if (!_eventsBound.has(nextView)) {
      bindViewEvents(nextView);
      _eventsBound.add(nextView);
    }

    // 4. Activate the feature controller
    _activateFeatureForView(nextView);
  }

  /**
   * Call the appropriate _ensure*() factory for the view.
   */
  async function _ensureFeatureForView(viewName) {
    switch (viewName) {
      case 'approval':
        await _ensureApprovalFeature();
        break;
      case 'scripts':
        await _ensureScriptsFeature();
        break;
      case 'audio':
        await _ensureAudioFeature();
        break;
      case 'radar':
        await _ensureRadarFeature();
        break;
      case 'subtitulos2':
        await _ensureSubtitlesFeature();
        break;
      default:
        break;
    }
  }

  /**
   * Call activate() on the feature controller after DOM is injected.
   */
  function _activateFeatureForView(viewName) {
    const elMap = {
      approval: el.viewApproval,
      scripts: el.viewScripts,
      audio: el.viewAudio,
      radar: el.viewRadar,
      subtitulos2: el.viewSubtitulos2,
    };
    const container = elMap[viewName];
    if (!container) return;

    switch (viewName) {
      case 'approval':
        // No-op: approval is already booted (first view)
        break;
      case 'scripts':
        // No-op: scripts feature doesn't need explicit activation
        break;
      case 'audio':
        // Audio feature handles its own state; activate is no-op
        break;
      case 'radar':
        if (radarController.activate) radarController.activate(container);
        break;
      case 'subtitulos2':
        if (subtitlesController.activate) subtitlesController.activate(container);
        break;
      default:
        break;
    }
  }

  async function setView(view) {
    const nextView = normalizeShellView(view);
    const previousView = state.currentView;
    state.currentView = nextView;

    // FOUC prevention: hide all views before lazy loading
    if (el.viewApproval) el.viewApproval.style.visibility = 'hidden';
    if (el.viewScripts) el.viewScripts.style.visibility = 'hidden';
    if (el.viewAudio) el.viewAudio.style.visibility = 'hidden';
    if (el.viewRadar) el.viewRadar.style.visibility = 'hidden';
    if (el.viewSubtitulos2) el.viewSubtitulos2.style.visibility = 'hidden';

    // Lazy load CSS + DOM + feature for the target view
    try {
      await _lazyLoadView(nextView);
    } catch (err) {
      console.warn('Control Panel lazy load failed for view:', nextView, err);
      // Show approval view as fallback if target view fails to load
      if (el.viewApproval) el.viewApproval.style.visibility = 'visible';
      el.viewApproval?.classList.remove('hidden');
      return;
    }

    // Mark view as visited — enables deferred API calls on subsequent navigations
    _visited.add(nextView);

    const isApproval = nextView === 'approval';
    const isScripts = nextView === 'scripts';
    const isAudio = nextView === 'audio';
    const isRadar = nextView === 'radar';
    const isSubtitulos2 = nextView === 'subtitulos2';

    // Only auto-refresh approval/queue monitor when on approval or scripts views.
    ensureApprovalAutoRefresh(isApproval || isScripts);

    // Batch DOM reads before writes to avoid forced reflows.
    const navItems = el.sidebarNav.querySelectorAll('.nav-item');

    // Show/hide views via CSS class toggle
    el.viewApproval.classList.toggle('hidden', !isApproval);
    el.viewScripts.classList.toggle('hidden', !isScripts);
    el.viewAudio.classList.toggle('hidden', !isAudio);
    el.viewRadar?.classList.toggle('hidden', !isRadar);
    el.viewSubtitulos2?.classList.toggle('hidden', !isSubtitulos2);

    // Reveal the active view (FOUC prevention complete)
    const activeEls = {
      approval: el.viewApproval,
      scripts: el.viewScripts,
      audio: el.viewAudio,
      radar: el.viewRadar,
      subtitulos2: el.viewSubtitulos2,
    };
    const activeEl = activeEls[nextView];
    if (activeEl) {
      activeEl.style.visibility = 'visible';
    }

    navItems.forEach((btn) => {
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
      if (radarController.activate?.() !== false) {
        radarController.render();
        void radarController.refreshMonitor?.();
        void radarController.refreshHealth();
        void radarController.refreshHistory();
      }
    } else {
      radarController.stopPolling();
    }
  }

  return { setView };
}
