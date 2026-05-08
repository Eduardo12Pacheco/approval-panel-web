const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { alignPhrasesToTranscript } = require('../../../RemotionEditor/scripts/lib/phrase-alignment');

const WHISPER_DERIVATIVE_FILE = 'voice-whisper-16khz-mono.wav';
const DEFAULT_DOWNLOAD_TIMEOUT_MS = 30000;
const DEFAULT_TRANSCRIBE_TIMEOUT_MS = 20 * 60 * 1000;
const DEFAULT_LOCAL_WHISPER_MODEL = path.resolve(__dirname, '..', '..', '..', 'models', 'faster-whisper-large-v3');
const REMOTION_EDITOR_ROOT = path.resolve(__dirname, '..', '..', '..', 'RemotionEditor');

function createAlignmentError(code, message, details) {
  const error = new Error(message);
  error.code = code;
  if (details !== undefined) error.details = details;
  return error;
}

function nowIso() {
  return new Date().toISOString();
}

function resolveRemoteUrl(entry) {
  if (!entry) return '';
  if (typeof entry === 'string') return entry.trim();
  return (entry.public_url || entry.publicUrl || entry.url || entry.storage_public_url || entry.file_url || '').toString().trim();
}

function sanitizeAudioExtension(remoteUrl, contentType = '') {
  const content = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (content === 'audio/mpeg') return '.mp3';
  if (content === 'audio/mp4' || content === 'audio/aac') return '.m4a';
  if (content === 'audio/wav' || content === 'audio/x-wav') return '.wav';
  try {
    const ext = path.extname(new URL(remoteUrl).pathname).toLowerCase();
    if (['.wav', '.mp3', '.m4a', '.aac', '.ogg', '.opus', '.webm'].includes(ext)) return ext;
  } catch {}
  return '.wav';
}

async function downloadRemoteBinary(fetchImpl, remoteUrl, { timeoutMs = DEFAULT_DOWNLOAD_TIMEOUT_MS } = {}) {
  let parsed;
  try {
    parsed = new URL(String(remoteUrl || ''));
  } catch {
    throw createAlignmentError('invalid_remote_audio_url', `Invalid voice audio URL: ${remoteUrl || ''}`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw createAlignmentError('invalid_remote_audio_url', `Invalid voice audio URL protocol: ${parsed.protocol}`);
  }
  if (!fetchImpl) throw createAlignmentError('remote_audio_download_failed', 'fetch implementation is required for voice audio download');
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetchImpl(parsed.toString(), controller ? { signal: controller.signal } : {});
    if (!response.ok) throw createAlignmentError('remote_audio_download_failed', `Voice audio download failed with ${response.status}`);
    return {
      bytes: Buffer.from(await response.arrayBuffer()),
      contentType: String(response.headers?.get?.('content-type') || ''),
    };
  } catch (error) {
    if (error.code) throw error;
    throw createAlignmentError('remote_audio_download_failed', `Voice audio download failed: ${error.message}`);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function resolveFfmpegPath({ env = process.env, remotionEditorRoot = REMOTION_EDITOR_ROOT } = {}) {
  if (env.FFMPEG_PATH && fs.existsSync(env.FFMPEG_PATH)) return env.FFMPEG_PATH;
  const candidates = [
    path.join(remotionEditorRoot, 'node_modules', 'ffmpeg-static'),
    'ffmpeg-static',
  ];
  for (const candidate of candidates) {
    try {
      const resolved = require(candidate);
      if (resolved) return resolved;
    } catch {}
  }
  return '';
}

function writeAudioDerivative16kMono({ inputPath, outputPath, env = process.env, remotionEditorRoot = REMOTION_EDITOR_ROOT }) {
  const ffmpegPath = resolveFfmpegPath({ env, remotionEditorRoot });
  if (!ffmpegPath) {
    throw createAlignmentError('ffmpeg_unavailable', 'FFmpeg unavailable. Set FFMPEG_PATH or install ffmpeg-static in RemotionEditor/node_modules.');
  }
  const result = spawnSync(ffmpegPath, ['-y', '-i', inputPath, '-vn', '-ac', '1', '-ar', '16000', outputPath], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.error) throw createAlignmentError('ffmpeg_unavailable', `FFmpeg execution failed: ${result.error.message}`);
  if (result.status !== 0) {
    throw createAlignmentError('audio_derivative_failed', `FFmpeg failed generating Whisper derivative: ${(result.stderr || result.stdout || '').trim()}`);
  }
}

function buildScriptPhrasesForAlignment(segments = []) {
  return segments.map((segment, index) => ({
    id: index + 1,
    phrase: String(segment.phrase || '').trim() || `Segmento ${index + 1}`,
    image: '__APPROVAL_EDITOR_PLACEHOLDER__',
  }));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function resolvePythonBin(env = process.env) {
  return env.REMOTION_EDITOR_PYTHON_BIN || env.APPROVAL_EDITOR_PYTHON_BIN || (process.platform === 'win32' ? 'py' : 'python3');
}

function buildWhisperEnv(env = process.env, overrides = {}) {
  const next = { ...process.env, ...env, ...overrides };
  if (!next.STT_WHISPER_MODEL && fs.existsSync(DEFAULT_LOCAL_WHISPER_MODEL)) next.STT_WHISPER_MODEL = DEFAULT_LOCAL_WHISPER_MODEL;
  if (!next.STT_WHISPER_DEVICE) next.STT_WHISPER_DEVICE = 'cuda';
  if (!next.STT_WHISPER_COMPUTE_TYPE) next.STT_WHISPER_COMPUTE_TYPE = next.STT_WHISPER_DEVICE === 'cuda' ? 'float16' : 'int8';
  return next;
}

function runTranscribeAudio({ whisperPath, transcriptPath, env = process.env, remotionEditorRoot = REMOTION_EDITOR_ROOT }) {
  const pythonBin = resolvePythonBin(env);
  const scriptPath = path.join(remotionEditorRoot, 'scripts', 'transcribe-audio.py');
  const timeout = Number(env.STT_TRANSCRIBE_TIMEOUT_MS || env.APPROVAL_EDITOR_TRANSCRIBE_TIMEOUT_MS || DEFAULT_TRANSCRIBE_TIMEOUT_MS);
  const attempts = [];
  const baseEnv = buildWhisperEnv(env);
  attempts.push({ label: `${baseEnv.STT_WHISPER_DEVICE}/${baseEnv.STT_WHISPER_COMPUTE_TYPE}`, env: baseEnv });
  if (baseEnv.STT_WHISPER_DEVICE === 'cuda') {
    attempts.push({ label: 'cpu/int8 fallback', env: buildWhisperEnv(baseEnv, { STT_WHISPER_DEVICE: 'cpu', STT_WHISPER_COMPUTE_TYPE: 'int8' }) });
  }

  const failures = [];
  for (const attempt of attempts) {
    const result = spawnSync(
      pythonBin,
      [scriptPath, whisperPath, path.join(path.dirname(path.dirname(whisperPath)), 'models', 'vosk-model'), transcriptPath, '--backend=whisper'],
      { cwd: remotionEditorRoot, env: attempt.env, encoding: 'utf8', windowsHide: true, timeout: Number.isFinite(timeout) ? timeout : DEFAULT_TRANSCRIBE_TIMEOUT_MS },
    );
    if (result.error) {
      failures.push(`${attempt.label}: ${result.error.message}`);
      continue;
    }
    if (result.status === 0) return { transcript: readJson(transcriptPath), backendAttempt: attempt.label, stdout: result.stdout || '' };
    failures.push(`${attempt.label}: ${(result.stderr || result.stdout || '').trim()}`);
  }
  throw createAlignmentError('alignment_pipeline_failed', `transcribe-audio.py failed. Attempts: ${failures.join(' | ')}`);
}

function alignSegmentsToTranscript({ segments = [], transcript }) {
  const scriptPhrases = buildScriptPhrasesForAlignment(segments);
  const aligned = alignPhrasesToTranscript(scriptPhrases, transcript);
  if (!aligned?.phrases?.length || aligned.phrases.length < segments.length) {
    throw createAlignmentError('alignment_incomplete', 'Whisper transcript did not produce timings for every phrase');
  }
  return {
    alignedTimings: aligned,
    alignmentStatus: { status: 'ready', source: 'whisper-alignment', generatedAt: nowIso(), transcriptBackend: transcript?.backend || 'unknown' },
    segments: segments.map((segment, index) => ({
      ...segment,
      startTime: aligned.phrases[index].startTime,
      endTime: aligned.phrases[index].endTime,
      alignment: aligned.phrases[index].alignment || null,
      timingSource: 'whisper-alignment',
    })),
  };
}

async function prepareRealVoiceAlignment({ projectDir, projectId, voiceAudio, segments, env = process.env, fetchImpl = globalThis.fetch, transcribeImpl, remotionEditorRoot = REMOTION_EDITOR_ROOT } = {}) {
  const remoteUrl = resolveRemoteUrl(voiceAudio);
  if (!remoteUrl) throw createAlignmentError('missing_voice_audio', 'voice_audio.public_url is required for Whisper alignment');
  const audioDir = path.join(projectDir, 'audio');
  const outputDir = path.join(projectDir, 'output');
  fs.mkdirSync(audioDir, { recursive: true });
  fs.mkdirSync(outputDir, { recursive: true });

  const download = await downloadRemoteBinary(fetchImpl, remoteUrl);
  const voiceExt = sanitizeAudioExtension(remoteUrl, download.contentType);
  const originalPath = path.join(audioDir, `voice-original${voiceExt}`);
  const whisperPath = path.join(audioDir, WHISPER_DERIVATIVE_FILE);
  const transcriptPath = path.join(outputDir, 'transcript.json');
  const phraseTimestampsPath = path.join(outputDir, 'phrase-timestamps.json');
  fs.writeFileSync(originalPath, download.bytes);
  writeAudioDerivative16kMono({ inputPath: originalPath, outputPath: whisperPath, env, remotionEditorRoot });

  const scriptPhrases = { phrases: buildScriptPhrasesForAlignment(segments) };
  writeJson(path.join(outputDir, 'script-phrases.json'), scriptPhrases);
  const transcribeResult = transcribeImpl
    ? { transcript: await transcribeImpl({ whisperPath, transcriptPath, projectDir, projectId, env }) }
    : runTranscribeAudio({ whisperPath, transcriptPath, env, remotionEditorRoot });
  const aligned = alignSegmentsToTranscript({ segments, transcript: transcribeResult.transcript });
  writeJson(phraseTimestampsPath, {
    totalDurationSeconds: aligned.alignedTimings.totalDurationSeconds,
    transcriptBackend: transcribeResult.transcript?.backend || 'unknown',
    diagnostics: aligned.alignedTimings.diagnostics || {},
    phrases: aligned.alignedTimings.phrases,
  });
  return {
    ...aligned,
    paths: {
      originalVoicePath: originalPath,
      whisperPath,
      transcriptPath,
      phraseTimestampsPath,
    },
  };
}

module.exports = {
  WHISPER_DERIVATIVE_FILE,
  DEFAULT_LOCAL_WHISPER_MODEL,
  alignSegmentsToTranscript,
  prepareRealVoiceAlignment,
  resolveFfmpegPath,
  runTranscribeAudio,
  buildWhisperEnv,
};
