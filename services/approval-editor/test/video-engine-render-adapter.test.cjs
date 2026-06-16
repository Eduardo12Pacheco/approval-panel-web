const test = require('node:test');
const assert = require('node:assert/strict');

const { AUTHORITATIVE_DUST_ASSETS } = require('../lib/video-engine-render-adapter');

test('AUTHORITATIVE_DUST_ASSETS exports a non-empty object', () => {
  assert.ok(AUTHORITATIVE_DUST_ASSETS, 'Expected AUTHORITATIVE_DUST_ASSETS to be exported');
  assert.equal(typeof AUTHORITATIVE_DUST_ASSETS, 'object');
  assert.notEqual(AUTHORITATIVE_DUST_ASSETS, null);
});

test('AUTHORITATIVE_DUST_ASSETS still has dust-1 and dust-2 records (backward compatibility)', () => {
  assert.ok(AUTHORITATIVE_DUST_ASSETS['dust-1'], 'Expected dust-1 to remain');
  assert.ok(AUTHORITATIVE_DUST_ASSETS['dust-2'], 'Expected dust-2 to remain');
  assert.equal(AUTHORITATIVE_DUST_ASSETS['dust-1'].previewUrl, './assets/dust-1.webm');
  assert.equal(AUTHORITATIVE_DUST_ASSETS['dust-1'].renderPath, 'overlays/dust-1.mp4');
  assert.equal(AUTHORITATIVE_DUST_ASSETS['dust-2'].previewUrl, './assets/dust-2.webm');
  assert.equal(AUTHORITATIVE_DUST_ASSETS['dust-2'].renderPath, 'overlays/dust-2.mp4');
});

test('AUTHORITATIVE_DUST_ASSETS includes dust-3 record mirroring dust-1/dust-2 shape', () => {
  const record = AUTHORITATIVE_DUST_ASSETS['dust-3'];
  assert.ok(record, 'Expected dust-3 record to exist in AUTHORITATIVE_DUST_ASSETS');
  assert.equal(record.assetId, 'dust-3');
  assert.equal(record.id, 'dust-3');
  assert.equal(record.type, 'dust');
  assert.equal(record.role, 'dust');
  assert.deepEqual(record.source, { kind: 'local', bridge: 'approval-panel' });
  assert.equal(record.previewUrl, './assets/dust-3.webm');
  assert.equal(record.renderPath, 'overlays/dust-3.mp4');
  assert.equal(record.status, 'ready');
});

test('AUTHORITATIVE_DUST_ASSETS includes dust-4 record mirroring dust-1/dust-2 shape', () => {
  const record = AUTHORITATIVE_DUST_ASSETS['dust-4'];
  assert.ok(record, 'Expected dust-4 record to exist in AUTHORITATIVE_DUST_ASSETS');
  assert.equal(record.assetId, 'dust-4');
  assert.equal(record.id, 'dust-4');
  assert.equal(record.type, 'dust');
  assert.equal(record.role, 'dust');
  assert.deepEqual(record.source, { kind: 'local', bridge: 'approval-panel' });
  assert.equal(record.previewUrl, './assets/dust-4.webm');
  assert.equal(record.renderPath, 'overlays/dust-4.mp4');
  assert.equal(record.status, 'ready');
});
