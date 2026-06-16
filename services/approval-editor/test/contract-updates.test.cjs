const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeDustType } = require('../lib/contract-updates');

test('normalizeDustType accepts dust-1 unchanged (existing behavior preserved)', () => {
  assert.equal(normalizeDustType('dust-1'), 'dust-1');
});

test('normalizeDustType accepts dust-2 unchanged (existing behavior preserved)', () => {
  assert.equal(normalizeDustType('dust-2'), 'dust-2');
});

test('normalizeDustType accepts dust-3 unchanged', () => {
  assert.equal(normalizeDustType('dust-3'), 'dust-3');
});

test('normalizeDustType accepts dust-4 unchanged', () => {
  assert.equal(normalizeDustType('dust-4'), 'dust-4');
});

test('normalizeDustType still rejects unknown dust types with invalid_dust_type code', () => {
  assert.throws(
    () => normalizeDustType('dust-5'),
    (err) => err.code === 'invalid_dust_type',
    'Expected dust-5 to throw with code invalid_dust_type',
  );
});

test('normalizeDustType error message lists all four valid identifiers', () => {
  assert.throws(
    () => normalizeDustType('dust-99'),
    (err) => /dust-1/.test(err.message) && /dust-2/.test(err.message) && /dust-3/.test(err.message) && /dust-4/.test(err.message),
    'Expected error message to list dust-1, dust-2, dust-3 and dust-4',
  );
});
