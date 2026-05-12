import test from 'node:test';
import assert from 'node:assert/strict';

import {
  renderSelectedVideoProjectView,
  renderVideoProjectsListView,
  updateSelectedVideoProjectCompositionPreview,
  resolveMotionScrubValue,
  syncVideoSelectorPreviewLayers,
} from '../render/index.js';
import { renderVideoProjectsListView as renderListFromSplitModule } from '../render/project-list-view.js';
import { hydrateVideoSelectorPreviewControls } from '../render/video-selector-hydration.js';

function makeClassList() {
  const tokens = new Set();
  return {
    add: (token) => tokens.add(token),
    remove: (token) => tokens.delete(token),
    contains: (token) => tokens.has(token),
    toggle: (token, force) => {
      const shouldHave = force ?? !tokens.has(token);
      if (shouldHave) tokens.add(token);
      else tokens.delete(token);
    },
  };
}

test('render facade keeps stable exports while delegating list rendering to the split module', () => {
  assert.equal(typeof renderSelectedVideoProjectView, 'function');
  assert.equal(typeof updateSelectedVideoProjectCompositionPreview, 'function');
  assert.equal(renderVideoProjectsListView, renderListFromSplitModule);
  assert.equal(resolveMotionScrubValue({ startValue: 10, deltaX: 8, kind: 'scalePercent' }), 12);
  assert.equal(typeof syncVideoSelectorPreviewLayers, 'function');
});

test('project list split module preserves empty-state copy and metadata hydration', () => {
  const el = {
    videoProjectsMeta: { textContent: '' },
    videoProjectsList: { innerHTML: '' },
  };

  renderListFromSplitModule({
    state: { videoProjects: [], videoProjectsLoading: false },
    el,
  });

  assert.equal(el.videoProjectsMeta.textContent, '0 proyectos');
  assert.match(el.videoProjectsList.innerHTML, /Todavía no hay proyectos/);
  assert.match(el.videoProjectsList.innerHTML, /video-projects-empty__plus/);
});

test('video selector hydration syncs previews and updates play toggle state', () => {
  const calls = [];
  const listeners = new Map();
  const modal = {
    dataset: {},
    querySelector(selector) {
      if (selector === '[data-video-selector-window]') return { dataset: { sourceIn: '3.5' } };
      if (selector === '[data-action="toggle-video-selector-preview"]') {
        return {
          textContent: '',
          attrs: {},
          setAttribute(name, value) { this.attrs[name] = value; },
          addEventListener(event, handler) { listeners.set(event, handler); },
        };
      }
      return null;
    },
  };

  const hydrated = hydrateVideoSelectorPreviewControls({
    modal,
    syncPreviewLayers: (args) => calls.push(args) || true,
  });

  assert.equal(hydrated, true);
  assert.deepEqual(calls[0], { modal, sourceInSeconds: 3.5, playing: false });

  listeners.get('click')();

  assert.equal(modal.dataset.previewPlaying, 'true');
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1], { modal, sourceInSeconds: 3.5, playing: true });
});

test('video selector hydration can apply to all selector modals under a root', () => {
  const modals = [{ dataset: {}, querySelector: () => null }, { dataset: {}, querySelector: () => null }];
  const root = {
    querySelectorAll(selector) {
      assert.equal(selector, '[data-video-selector-modal]');
      return modals;
    },
  };

  const count = hydrateVideoSelectorPreviewControls({ root, syncPreviewLayers: () => true });

  assert.equal(count, 2);
});
