const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { resolveFfmpegPath } = require('./real-alignment');

const DEFAULT_DOWNLOAD_TIMEOUT_MS = 30000;

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
    throw new Error(`Invalid audio URL: ${remoteUrl || ''}`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(`Invalid audio URL protocol: ${parsed.protocol}`);
  if (!fetchImpl) throw new Error('fetch implementation is required for audio download');
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetchImpl(parsed.toString(), controller ? { signal: controller.signal } : {});
    if (!response.ok) throw new Error(`Audio download failed with ${response.status}`);
    return {
      bytes: Buffer.from(await response.arrayBuffer()),
      contentType: String(response.headers?.get?.('content-type') || ''),
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function resolveInputAudioPath({ projectDir, audio, role, existingInputPath, fetchImpl }) {
  if (existingInputPath && fs.existsSync(existingInputPath)) return existingInputPath;
  const remoteUrl = resolveRemoteUrl(audio);
  if (!remoteUrl) return '';
  const download = await downloadRemoteBinary(fetchImpl, remoteUrl);
  const audioDir = path.join(projectDir, 'audio');
  fs.mkdirSync(audioDir, { recursive: true });
  const inputPath = path.join(audioDir, `${role}-original${sanitizeAudioExtension(remoteUrl, download.contentType)}`);
  fs.writeFileSync(inputPath, download.bytes);
  return inputPath;
}

async function prepareAudioPreviewDerivative({ projectDir, audio, role, outputName = `${role}-preview.mp3`, existingInputPath, env = process.env, fetchImpl = globalThis.fetch, remotionEditorRoot } = {}) {
  const ffmpegPath = resolveFfmpegPath({ env, remotionEditorRoot });
  if (!ffmpegPath) return null;
  const inputPath = await resolveInputAudioPath({ projectDir, audio, role, existingInputPath, fetchImpl });
  if (!inputPath) return null;

  const audioDir = path.join(projectDir, 'audio');
  fs.mkdirSync(audioDir, { recursive: true });
  const outputPath = path.join(audioDir, outputName);
  const result = spawnSync(ffmpegPath, ['-y', '-i', inputPath, '-vn', '-codec:a', 'libmp3lame', '-b:a', '96k', '-ar', '44100', '-ac', '2', outputPath], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.error || result.status !== 0 || !fs.existsSync(outputPath)) return null;
  return { path: outputPath, relativePath: path.join('audio', outputName).replace(/\\/g, '/'), mimeType: 'audio/mpeg' };
}

function audioContentType(filePath = '') {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.mp3') return 'audio/mpeg';
  if (ext === '.wav') return 'audio/wav';
  if (ext === '.opus') return 'audio/ogg; codecs=opus';
  if (ext === '.m4a') return 'audio/mp4';
  if (ext === '.mp4') return 'video/mp4';
  if (ext === '.ogg') return 'audio/ogg';
  if (ext === '.webm') return 'video/webm';
  return 'application/octet-stream';
}

module.exports = { prepareAudioPreviewDerivative, audioContentType };
