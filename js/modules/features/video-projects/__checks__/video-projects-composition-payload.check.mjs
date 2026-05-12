import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { buildCompositionPayloadForCheck } from '../index.js';

function testBuildPayloadKeepsLegacyAndAddsContractWhenManifestExists() {
  const project = {
    _editorRows: [{
      id: 'row-1',
      phrase: 'Intro',
      selectedAssetId: 'asset-1',
      startTime: 0,
      endTime: 1.5,
      motion: 'pan-right',
      dust: { enabled: true },
      logo: { enabled: true },
      filter: { enabled: true, mode: 'cover' },
      transition: 'fade',
    }],
    _globalAudio: {
      voice: { volume: 1, muted: false },
      music: { volume: 0.2, muted: false },
    },
    _previewAssets: {
      images: [{ rowId: 'row-1', assetId: 'asset-1', mediaUrl: '/api/projects/p/media?assetId=asset-1' }],
      audio: {
        voice: { assetId: 'voice-asset', mediaUrl: '/api/projects/p/media?assetId=voice-asset' },
        music: { assetId: 'music-asset', mediaUrl: '/api/projects/p/media?assetId=music-asset' },
      },
    },
    editor_state: {},
  };

  const payload = buildCompositionPayloadForCheck(project);

  assert.equal(Array.isArray(payload.rows), true);
  assert.equal(payload.rows[0].id, 'row-1');
  assert.equal(payload.audio.music.volume, 0.2);
  assert.equal(payload.contract.segments[0].selectedAssetId, 'asset-1');
  assert.equal(payload.manifest.assets['asset-1'].renderPath, '/api/projects/p/media?assetId=asset-1');
  assert.equal(payload.manifest.assets['voice-asset'].renderPath, '/api/projects/p/media?assetId=voice-asset');
}

function testBuildPayloadFallsBackToLegacyWhenNoManifest() {
  const project = {
    _editorRows: [{ id: 'row-1', selectedAssetId: null, startTime: 0, endTime: 1 }],
    _globalAudio: { voice: { volume: 1, muted: false }, music: { volume: 0.16, muted: false } },
    editor_state: {},
  };

  const payload = buildCompositionPayloadForCheck(project);
  assert.equal(Boolean(payload.contract), false);
  assert.equal(Boolean(payload.manifest), false);
  assert.equal(Array.isArray(payload.rows), true);
}

export function runVideoProjectsCompositionPayloadCheck() {
  testBuildPayloadKeepsLegacyAndAddsContractWhenManifestExists();
  testBuildPayloadFallsBackToLegacyWhenNoManifest();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
try {
  runVideoProjectsCompositionPayloadCheck();
  console.log('PASS video-projects-composition-payload.check');
} catch (error) {
  console.error('FAIL video-projects-composition-payload.check');
  console.error(error);
  process.exitCode = 1;
}
}
