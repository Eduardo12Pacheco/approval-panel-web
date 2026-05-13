import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCompositionDOM } from '../composition/renderer/dom.js';
import { syncManagedVideoElement } from '../composition/renderer/video-layers.js';
import { createVideoProjectDetailCache } from '../data/detail-cache.js';
import { createRowVideoCommands } from '../data/row-video-commands.js';
import { resolveProjectVideoLibrary } from '../domain/video-assets.js';

function installDocumentStub() {
  const previousDocument = globalThis.document;
  globalThis.document = {
    createElement(tagName) {
      return {
        tagName,
        className: '',
        style: {},
        children: [],
        muted: false,
        appendChild(child) {
          this.children.push(child);
        },
      };
    },
  };
  return () => {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  };
}

test('preview country outro is audible while managed effect videos remain muted', () => {
  const restoreDocument = installDocumentStub();
  try {
    const container = { children: [], appendChild(child) { this.children.push(child); } };
    const { layers } = buildCompositionDOM(container);

    assert.equal(layers.outroVideo.muted, false, 'country outro preview video must not be force-muted');
    assert.equal(layers.videoBackground.muted, true, 'background video segment must remain muted');
    assert.equal(layers.videoEffect1.muted, true, 'effect layer 01 must remain muted');
    assert.equal(layers.videoEffect2.muted, true, 'effect layer 02 must remain muted');
    assert.equal(layers.videoForeground.muted, true, 'foreground video segment must remain muted');
    assert.equal(layers.dust.muted, true, 'dust overlay must remain muted');
    assert.equal(layers.logoVideo.muted, true, 'logo overlay must remain muted');
  } finally {
    restoreDocument();
  }
});

test('managed preview sync can preserve audible country outro policy without unmuting effect layers', () => {
  const outroVideo = { muted: false, playsInline: false, currentTime: 0, paused: true, pause() {} };
  const effectVideo = { muted: false, playsInline: false, currentTime: 0, paused: true, pause() {} };

  syncManagedVideoElement({ video: outroVideo, currentTimeSeconds: 1.25, playing: false, muted: false });
  syncManagedVideoElement({ video: effectVideo, currentTimeSeconds: 1.25, playing: false });

  assert.equal(outroVideo.muted, false, 'outro sync must preserve audible embedded audio');
  assert.equal(outroVideo.playsInline, true);
  assert.equal(outroVideo.currentTime, 1.25);
  assert.equal(effectVideo.muted, true, 'managed effect layers remain muted by default');
}
);

test('persisted editor video assets hydrate into a usable library after reopen', () => {
  const project = {
    draft_id: 'draft-1',
    editor_state: {
      video_assets: [
        {
          id: 'asset-1',
          title: 'Persisted video',
          public_url: 'https://cdn.example.com/video.mp4',
          storage_bucket: 'video-project-videos',
          storage_path: 'draft-1/video.mp4',
          durationSeconds: 12.5,
          mime_type: 'video/mp4',
          file_size: 1024,
        },
      ],
    },
  };

  const [video] = resolveProjectVideoLibrary(project);

  assert.equal(video.id, 'asset-1');
  assert.equal(video.src, 'https://cdn.example.com/video.mp4');
  assert.equal(video.storage_bucket, 'video-project-videos');
  assert.equal(video.storage_path, 'draft-1/video.mp4');
  assert.equal(video.durationSeconds, 12.5);
});

test('detail cache editor-state merge keeps newly uploaded video assets visible on reopen', () => {
  const cache = createVideoProjectDetailCache({
    api: { async getVideoProject() { return []; } },
    store: { getState: () => ({ videoProjects: [] }) },
    normalizeRows: (rows) => rows,
    resolveProjectKey: (project) => project.draft_id,
  });
  cache.setCachedProjectDetail('draft-1', { draft_id: 'draft-1', editor_state: { video_assets: [] } });

  cache.mergeCachedProjectEditorState('draft-1', {
    video_assets: [{ id: 'asset-1', src: 'https://cdn.example.com/video.mp4' }],
  });

  const cached = cache.getCachedProjectDetail('draft-1');
  assert.equal(cached.editor_state.video_assets.length, 1);
  assert.equal(cached.video_assets[0].src, 'https://cdn.example.com/video.mp4');
});

test('uploadVideoToLibrary persists complete video asset metadata and refreshes detail cache', async () => {
  const project = { draft_id: 'draft-1', editor_state: {} };
  let savedEditorState = null;
  let cachedEditorState = null;
  const commands = createRowVideoCommands({
    api: {
      async uploadProjectVideoFile() {
        return {
          assetId: 'asset-1',
          public_url: 'https://cdn.example.com/uploaded.mp4',
          bucket: 'video-project-videos',
          storage_path: 'draft-1/uploaded.mp4',
        };
      },
      async saveVideoProjectEditorState({ editorState }) {
        savedEditorState = editorState;
      },
    },
    ui: { toast() {} },
    getProject: () => project,
    resolveProjectKey: (item) => item.draft_id,
    renderSelectedVideoProject() {},
    updateRow() {},
    mergeCachedProjectEditorState(_draftId, editorState) {
      cachedEditorState = editorState;
    },
  });

  const result = await commands.uploadVideoToLibrary('row-1', {
    name: 'uploaded.mp4',
    type: 'video/mp4',
    size: 1024,
  });

  assert.equal(result.public_url, 'https://cdn.example.com/uploaded.mp4');
  assert.equal(savedEditorState.video_assets[0].public_url, 'https://cdn.example.com/uploaded.mp4');
  assert.equal(savedEditorState.video_assets[0].storage_bucket, 'video-project-videos');
  assert.equal(savedEditorState.video_assets[0].storage_path, 'draft-1/uploaded.mp4');
  assert.equal(savedEditorState.video_assets[0].mime_type, 'video/mp4');
  assert.equal(savedEditorState.video_assets[0].file_size, 1024);
  assert.equal(cachedEditorState.video_assets[0].src, 'https://cdn.example.com/uploaded.mp4');
});
