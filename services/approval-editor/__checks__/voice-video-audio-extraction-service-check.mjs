import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  extractVoiceAudioFromMp4,
  resolveVoiceExtractionErrorStatus,
} = require('../lib/voice-video-audio-extraction.js');

async function withTempDir(run) {
  const dir = await mkdtemp(path.join(tmpdir(), 'voice-video-extract-check-'));
  try {
    return await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('extractVoiceAudioFromMp4 writes MP4 video input and stream-copies first audio stream to M4A master', async () => {
  await withTempDir(async (workDir) => {
    const calls = [];
    const result = await extractVoiceAudioFromMp4({
      sourceBytes: Buffer.from('camera-video-bytes'),
      sourceName: 'camera.mp4',
      sourceMimeType: 'video/mp4',
      workDir,
      env: { FFMPEG_PATH: '/usr/bin/ffmpeg-check' },
      runFfmpeg({ ffmpegPath, args }) {
        calls.push({ ffmpegPath, args });
        const outputPath = args.at(-1);
        return writeFile(outputPath, Buffer.from('m4a-master-bytes')).then(() => ({ status: 0, stdout: '', stderr: '' }));
      },
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].ffmpegPath, '/usr/bin/ffmpeg-check');
    assert.deepEqual(calls[0].args.slice(0, 8), ['-y', '-i', path.join(workDir, 'source-camera.mp4'), '-map', '0:a:0', '-vn', '-c:a', 'copy']);
    assert.equal(result.contentType, 'audio/mp4');
    assert.equal(result.fileName, 'camera-voice.m4a');
    assert.equal(result.mode, 'stream-copy');
    assert.deepEqual(await readFile(result.outputPath), Buffer.from('m4a-master-bytes'));
  });
});

test('extractVoiceAudioFromMp4 falls back to high-quality AAC when stream copy cannot mux', async () => {
  await withTempDir(async (workDir) => {
    const calls = [];
    const result = await extractVoiceAudioFromMp4({
      sourceBytes: Buffer.from('camera-video-bytes'),
      sourceName: 'fallback.mp4',
      sourceMimeType: 'video/mp4',
      workDir,
      env: { FFMPEG_PATH: '/usr/bin/ffmpeg-check' },
      async runFfmpeg({ args }) {
        calls.push(args);
        if (calls.length === 1) return { status: 1, stdout: '', stderr: 'Could not write header' };
        await writeFile(args.at(-1), Buffer.from('aac-master-bytes'));
        return { status: 0, stdout: '', stderr: '' };
      },
    });

    assert.equal(calls.length, 2);
    assert.deepEqual(calls[1].slice(-6), ['-vn', '-c:a', 'aac', '-b:a', '256k', path.join(workDir, 'fallback-voice.m4a')]);
    assert.equal(result.contentType, 'audio/mp4');
    assert.equal(result.fileName, 'fallback-voice.m4a');
    assert.equal(result.mode, 'aac-transcode');
    assert.deepEqual(await readFile(result.outputPath), Buffer.from('aac-master-bytes'));
  });
});

test('extractVoiceAudioFromMp4 rejects unsupported video, missing FFmpeg, and missing audio stream with clear statuses', async () => {
  await withTempDir(async (workDir) => {
    await assert.rejects(
      () => extractVoiceAudioFromMp4({ sourceBytes: Buffer.from('mov'), sourceName: 'camera.mov', sourceMimeType: 'video/quicktime', workDir, env: { FFMPEG_PATH: '/usr/bin/ffmpeg-check' } }),
      (error) => error.code === 'unsupported_voice_video' && resolveVoiceExtractionErrorStatus(error) === 415,
    );
    await assert.rejects(
      () => extractVoiceAudioFromMp4({ sourceBytes: Buffer.from('mp4'), sourceName: 'camera.mp4', sourceMimeType: 'video/mp4', workDir, env: {} }),
      (error) => error.code === 'ffmpeg_unavailable' && resolveVoiceExtractionErrorStatus(error) === 503,
    );
    await assert.rejects(
      () => extractVoiceAudioFromMp4({
        sourceBytes: Buffer.from('mp4'),
        sourceName: 'silent.mp4',
        sourceMimeType: 'video/mp4',
        workDir,
        env: { FFMPEG_PATH: '/usr/bin/ffmpeg-check' },
        async runFfmpeg() { return { status: 1, stdout: '', stderr: 'Stream map 0:a:0 matches no streams' }; },
      }),
      (error) => error.code === 'voice_video_no_audio_stream' && resolveVoiceExtractionErrorStatus(error) === 422,
    );
  });
});
