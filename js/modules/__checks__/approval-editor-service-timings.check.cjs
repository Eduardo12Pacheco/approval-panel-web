const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApprovalEditorService, normalizeSegments } = require('../../../approval-editor-service/server.js');
const { alignSegmentsToTranscript } = require('../../../approval-editor-service/lib/real-alignment.js');

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

async function postJson(baseUrl, payload) {
  const response = await fetch(`${baseUrl}/api/projects/create-from-approval`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { status: response.status, body: await response.json() };
}

function createSeed() {
  return {
    project_id: `timing-check-${Date.now()}`,
    title: 'Timing Check',
    voice_audio: { public_url: 'https://example.test/voice.wav' },
    background_audio: { public_url: 'https://example.test/music.wav' },
    selected_images: ['https://example.test/1.jpg', 'https://example.test/2.jpg'],
    segments: [
      { id: 'a', phrase: 'uno dos' },
      { id: 'b', phrase: 'tres cuatro' },
    ],
  };
}

function testAlignsSegmentsFromTranscriptWords() {
  const result = alignSegmentsToTranscript({
    segments: [
      { id: 'a', phrase: 'uno dos' },
      { id: 'b', phrase: 'tres cuatro cinco seis' },
    ],
    transcript: {
      backend: 'whisper',
      totalDurationSeconds: 51,
      words: [
        { word: 'uno', start: 0.21, end: 0.42 },
        { word: 'dos', start: 0.43, end: 0.8 },
        { word: 'tres', start: 10.1, end: 10.4 },
        { word: 'cuatro', start: 10.42, end: 10.8 },
        { word: 'cinco', start: 49.1, end: 49.5 },
        { word: 'seis', start: 50.4, end: 50.9 },
      ],
      segments: [
        { id: 1, text: 'uno dos', start: 0.21, end: 0.8 },
        { id: 2, text: 'tres cuatro cinco seis', start: 10.1, end: 50.9 },
      ],
    },
  });

  assert.equal(result.alignmentStatus.status, 'ready');
  assert.deepEqual(
    result.segments.map((segment) => [segment.id, segment.startTime, segment.endTime, segment.timingSource]),
    [['a', 0, 0.8, 'whisper-alignment'], ['b', 10.1, 50.9, 'whisper-alignment']],
  );
}

function testPreservesAlignedSegmentTimes() {
  const segments = normalizeSegments({
    voice_audio: { durationSeconds: 51 },
    segments: [
      { id: 'a', phrase: 'Intro', startTime: 4, endTime: 9 },
      { id: 'b', phrase: 'Cierre', startTime: 9, endTime: 12 },
    ],
  });

  assert.deepEqual(
    segments.map((segment) => [segment.startTime, segment.endTime]),
    [[4, 9], [9, 12]],
  );
}

function testFallbackEstimateCannotBecomeReadyByDefault() {
  const segments = normalizeSegments({
    segments: [
      { id: 'a', phrase: 'uno dos tres cuatro cinco seis' },
      { id: 'b', phrase: 'siete ocho' },
    ],
  });

  assert.deepEqual(
    segments.map((segment) => [segment.startTime, segment.endTime, segment.timingSource]),
    [[undefined, undefined, 'pending_alignment'], [undefined, undefined, 'pending_alignment']],
  );
}

function testEstimatedFallbackRequiresExplicitOptIn() {
  const segments = normalizeSegments({
    allowEstimatedTimings: true,
    segments: [
      { id: 'a', phrase: 'uno dos tres cuatro cinco seis' },
      { id: 'b', phrase: 'siete ocho' },
    ],
  });

  assert.notDeepEqual(
    segments.map((segment) => [segment.startTime, segment.endTime]),
    [[0, 1.5], [1.5, 3]],
  );
  assert.ok(segments[0].endTime - segments[0].startTime > segments[1].endTime - segments[1].startTime);
  assert.deepEqual(segments.map((segment) => segment.timingSource), ['estimated-text-weight', 'estimated-text-weight']);
}

async function testServiceUsesInjectedRealAlignmentTimings() {
  const projectsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'approval-editor-service-timings-'));
  const server = createApprovalEditorService({
    projectsRoot,
    alignVoiceAudio: async ({ segments }) => alignSegmentsToTranscript({
      segments,
      transcript: {
        backend: 'fake-whisper',
        totalDurationSeconds: 8,
        words: [
          { word: 'uno', start: 1, end: 1.2 },
          { word: 'dos', start: 1.21, end: 1.7 },
          { word: 'tres', start: 5, end: 5.4 },
          { word: 'cuatro', start: 5.41, end: 6.2 },
        ],
      },
    }),
  });
  const port = await listen(server);
  try {
    const result = await postJson(`http://127.0.0.1:${port}`, createSeed());
    assert.equal(result.status, 201);
    assert.equal(result.body.data.alignmentStatus.status, 'ready');
    assert.deepEqual(
      result.body.data.snapshot.rows.map((row) => [row.startTime, row.endTime]),
      [[0, 1.7], [5, 6.2]],
    );
  } finally {
    await close(server);
    fs.rmSync(projectsRoot, { recursive: true, force: true });
  }
}

async function testServiceDoesNotMarkFailedAlignmentReadyByDefault() {
  const projectsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'approval-editor-service-timings-'));
  const server = createApprovalEditorService({
    projectsRoot,
    alignVoiceAudio: async () => { throw new Error('fake whisper failure'); },
    env: {},
  });
  const port = await listen(server);
  try {
    const result = await postJson(`http://127.0.0.1:${port}`, createSeed());
    assert.equal(result.status, 202);
    assert.equal(result.body.data.alignmentStatus.status, 'failed');
    assert.notEqual(result.body.data.alignmentStatus.status, 'ready');
  } finally {
    await close(server);
    fs.rmSync(projectsRoot, { recursive: true, force: true });
  }
}

async function main() {
  testAlignsSegmentsFromTranscriptWords();
  testPreservesAlignedSegmentTimes();
  testFallbackEstimateCannotBecomeReadyByDefault();
  testEstimatedFallbackRequiresExplicitOptIn();
  await testServiceUsesInjectedRealAlignmentTimings();
  await testServiceDoesNotMarkFailedAlignmentReadyByDefault();
  console.log('PASS approval-editor-service-timings.check');
}

main().catch((error) => {
  console.error('FAIL approval-editor-service-timings.check');
  console.error(error);
  process.exitCode = 1;
});
