import assert from 'node:assert/strict';
import {
  resolveVideoProjectPreviewMediaForCheck,
  resolveVideoProjectCompositionContractForCheck,
} from '../features/video-projects/render.js';

function testResolvesRowImageFromManifestWithRemotionBase() {
  const project = {
    editor_state: {
      remotion_api_url: 'https://remotion-api.example.com/api',
      preview_assets: {
        images: [
          { rowId: 'row-1', mediaUrl: 'renders/row-1.webp' },
        ],
      },
    },
    selected_images: ['https://fallback.example.com/selected.webp'],
    image_candidates: [{ image_url: 'https://fallback.example.com/candidate.webp' }],
  };

  const result = resolveVideoProjectPreviewMediaForCheck({
    row: { id: 'row-1', selectedAssetId: 'anything' },
    rowIndex: 0,
    project,
  });

  assert.equal(result.rowImageUrl, 'https://remotion-api.example.com/api/renders/row-1.webp');
}

function testFallsBackToSelectedImagesAndCandidatesWithoutManifest() {
  const selectedProject = {
    editor_state: { remotion_api_url: 'https://remotion-api.example.com' },
    selected_images: ['https://fallback.example.com/selected.webp'],
    image_candidates: [{ image_url: 'https://fallback.example.com/candidate.webp' }],
  };

  const selectedResult = resolveVideoProjectPreviewMediaForCheck({
    row: { id: 'row-2', selectedAssetId: 'asset-does-not-match' },
    rowIndex: 0,
    project: selectedProject,
  });

  assert.equal(selectedResult.rowImageUrl, 'https://fallback.example.com/selected.webp');

  const candidatesProject = {
    editor_state: { remotion_api_url: 'https://remotion-api.example.com' },
    selected_images: [],
    image_candidates: [
      { id: 'hero-asset', image_url: 'https://fallback.example.com/candidate-from-id.webp' },
    ],
  };

  const candidateResult = resolveVideoProjectPreviewMediaForCheck({
    row: { id: 'row-3', selectedAssetId: 'hero-asset' },
    rowIndex: 0,
    project: candidatesProject,
  });

  assert.equal(candidateResult.rowImageUrl, 'https://fallback.example.com/candidate-from-id.webp');
}

function testResolvesVoiceAndMusicFromManifestWithFallbacks() {
  const manifestProject = {
    editor_state: {
      remotion_api_url: 'https://remotion-api.example.com',
      preview_assets: {
        audio: {
          voice: { mediaUrl: 'audio/voice.mp3' },
          music: { mediaUrl: 'audio/music.mp3' },
        },
      },
    },
    voice_audio: { public_url: 'https://fallback.example.com/voice.mp3' },
    background_audio: { public_url: 'https://fallback.example.com/music.mp3' },
  };

  const manifestResult = resolveVideoProjectPreviewMediaForCheck({
    row: { id: 'row-audio-1' },
    rowIndex: 0,
    project: manifestProject,
  });

  assert.equal(manifestResult.voiceUrl, 'https://remotion-api.example.com/audio/voice.mp3');
  assert.equal(manifestResult.musicUrl, 'https://remotion-api.example.com/audio/music.mp3');

  const fallbackProject = {
    editor_state: { remotion_api_url: 'https://remotion-api.example.com', preview_assets: {} },
    voice_audio: { public_url: 'https://fallback.example.com/voice-fallback.mp3' },
    background_audio: { public_url: 'https://fallback.example.com/music-fallback.mp3' },
  };

  const fallbackResult = resolveVideoProjectPreviewMediaForCheck({
    row: { id: 'row-audio-2' },
    rowIndex: 0,
    project: fallbackProject,
  });

  assert.equal(fallbackResult.voiceUrl, 'https://fallback.example.com/voice-fallback.mp3');
  assert.equal(fallbackResult.musicUrl, 'https://fallback.example.com/music-fallback.mp3');
}

function testComputesGaplessEffectiveEndTimes() {
  const project = { editor_state: {} };
  const rows = [
    { id: 'row-1', startTime: 0, endTime: 5 },
    { id: 'row-2', startTime: 3.2, endTime: 8 },
    { id: 'row-3', startTime: 10, endTime: 12 },
  ];
  const { contract } = resolveVideoProjectCompositionContractForCheck({ project, rows });

  assert.equal(contract.rows[0].effectiveEndTime, 3.2);
  assert.equal(contract.rows[1].effectiveEndTime, 10);
  assert.equal(contract.rows[2].effectiveEndTime, 12);
}

function testContractImageResolutionWinsAndFallbackSurvives() {
  const project = {
    editor_state: {
      remotion_api_url: 'https://remotion-api.example.com/api',
      preview_assets: {
        images: [
          { rowId: 'row-1', assetId: 'asset-1', mediaUrl: 'renders/from-manifest.webp' },
        ],
      },
    },
    selected_images: ['https://fallback.example.com/selected.webp'],
    image_candidates: [{ id: 'asset-1', image_url: 'https://fallback.example.com/candidate.webp' }],
  };

  const { compositionRows } = resolveVideoProjectCompositionContractForCheck({
    project,
    rows: [{ id: 'row-1', startTime: 0, endTime: 1, selectedAssetId: 'asset-1' }],
  });
  const withManifest = compositionRows[0]?.image || '';
  assert.equal(withManifest, 'https://remotion-api.example.com/api/renders/from-manifest.webp');

  const fallbackProject = {
    editor_state: { remotion_api_url: 'https://remotion-api.example.com/api', preview_assets: {} },
    selected_images: ['https://fallback.example.com/selected-only.webp'],
    image_candidates: [{ id: 'asset-fallback', image_url: 'https://fallback.example.com/candidate-only.webp' }],
  };
  const fallback = resolveVideoProjectCompositionContractForCheck({
    project: fallbackProject,
    rows: [{ id: 'row-fallback', startTime: 0, endTime: 1, selectedAssetId: 'asset-fallback' }],
  });
  const withoutManifest = fallback.compositionRows[0]?.image || '';
  assert.equal(withoutManifest, 'https://fallback.example.com/selected-only.webp');
}

function testGeneratedContractKeepsManifestAssetShape() {
  const project = {
    editor_state: {
      remotion_api_url: 'https://remotion-api.example.com',
      preview_assets: {
        images: [{ row_id: 'row-legacy', asset_id: 'asset-legacy', media_url: 'renders/legacy.webp' }],
      },
    },
  };

  const { contract } = resolveVideoProjectCompositionContractForCheck({
    project,
    rows: [{ id: 'row-legacy', startTime: 0, endTime: 1, selectedAssetId: 'asset-legacy' }],
  });
  assert.equal(contract.manifest.images[0].rowId, 'row-legacy');
  assert.equal(contract.manifest.images[0].assetId, 'asset-legacy');
  assert.equal(contract.manifest.images[0].mediaUrl, 'renders/legacy.webp');
}

try {
  testResolvesRowImageFromManifestWithRemotionBase();
  testFallsBackToSelectedImagesAndCandidatesWithoutManifest();
  testResolvesVoiceAndMusicFromManifestWithFallbacks();
  testComputesGaplessEffectiveEndTimes();
  testContractImageResolutionWinsAndFallbackSurvives();
  testGeneratedContractKeepsManifestAssetShape();
  console.log('PASS video-projects-manifest-resolution.check');
} catch (error) {
  console.error('FAIL video-projects-manifest-resolution.check');
  console.error(error);
  process.exitCode = 1;
}
