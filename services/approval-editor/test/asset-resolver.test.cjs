const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeAsset } = require('../lib/asset-resolver');

test('normalizeAsset preserves available image dimensions without changing render paths', () => {
  const asset = normalizeAsset({
    assetId: 'image-portrait',
    publicUrl: 'https://example.test/image.jpg',
    renderPath: 'imagenes/image-portrait.jpg',
    width: 2400,
    height: 3200,
    metadata: { source: 'approval' },
  });

  assert.equal(asset.renderPath, 'imagenes/image-portrait.jpg');
  assert.equal(asset.publicUrl, 'https://example.test/image.jpg');
  assert.equal(asset.imageWidth, 2400);
  assert.equal(asset.imageHeight, 3200);
  assert.deepEqual(asset.metadata, { source: 'approval', imageWidth: 2400, imageHeight: 3200 });
});

test('normalizeAsset preserves nested image dimensions when top-level values are unavailable', () => {
  const asset = normalizeAsset({
    assetId: 'image-landscape',
    renderPath: 'imagenes/image-landscape.jpg',
    metadata: { width: 4000, height: 2000 },
  });

  assert.equal(asset.imageWidth, 4000);
  assert.equal(asset.imageHeight, 2000);
  assert.deepEqual(asset.metadata, { width: 4000, height: 2000, imageWidth: 4000, imageHeight: 2000 });
});
