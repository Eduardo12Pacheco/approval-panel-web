const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { resolveFfmpegPath } = require('./real-alignment');

function createExtractionError(code, message, details) {
  const error = new Error(message);
  error.code = code;
  if (details !== undefined) error.details = details;
  return error;
}

function resolveVoiceExtractionErrorStatus(error = {}) {
  if (error.code === 'unsupported_voice_video') return 415;
  if (error.code === 'voice_video_no_audio_stream') return 422;
  if (error.code === 'voice_video_too_large' || error.code === 'voice_audio_output_too_large') return 413;
  if (error.code === 'ffmpeg_unavailable') return 503;
  if (error.code === 'voice_audio_extraction_failed') return 500;
  return 500;
}

function sanitizeBaseName(name = '') {
  const base = path.basename(String(name || 'camera')).replace(/\.[^.]+$/, '') || 'camera';
  return base.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'camera';
}

function isSupportedMp4Source({ sourceName = '', sourceMimeType = '' } = {}) {
  const type = String(sourceMimeType || '').split(';')[0].trim().toLowerCase();
  const name = String(sourceName || '').toLowerCase();
  return type === 'video/mp4' || (!type && name.endsWith('.mp4'));
}

function defaultRunFfmpeg({ ffmpegPath, args }) {
  const result = spawnSync(ffmpegPath, args, { encoding: 'utf8', windowsHide: true });
  return { status: result.status, stdout: result.stdout || '', stderr: result.stderr || '', error: result.error || null };
}

function ffmpegOutputIndicatesMissingAudio(output = '') {
  return /matches no streams|stream map .*no streams|audio stream.*not found|does not contain any stream/i.test(String(output || ''));
}

async function runFfmpegStep({ runFfmpeg, ffmpegPath, args }) {
  const result = await runFfmpeg({ ffmpegPath, args });
  if (result?.error) throw createExtractionError('ffmpeg_unavailable', `FFmpeg execution failed: ${result.error.message || result.error}`);
  return result || { status: 1, stdout: '', stderr: '' };
}

async function extractVoiceAudioFromMp4({
  sourceBytes,
  sourceName = 'camera.mp4',
  sourceMimeType = 'video/mp4',
  workDir,
  env = process.env,
  runFfmpeg,
  maxOutputBytes = 50 * 1024 * 1024,
} = {}) {
  if (!isSupportedMp4Source({ sourceName, sourceMimeType })) {
    throw createExtractionError('unsupported_voice_video', 'Solo se admite MP4 de cámara para extraer audio de voz. Para música de fondo usá un archivo de audio.');
  }
  if (!Buffer.isBuffer(sourceBytes) || sourceBytes.length === 0) {
    throw createExtractionError('voice_audio_extraction_failed', 'El MP4 recibido está vacío.');
  }
  if (!workDir) throw createExtractionError('voice_audio_extraction_failed', 'Extraction workDir is required.');
  fs.mkdirSync(workDir, { recursive: true });

  const ffmpegPath = (runFfmpeg && env.FFMPEG_PATH) || (Object.keys(env || {}).length ? resolveFfmpegPath({ env }) : '');
  if (!ffmpegPath) {
    throw createExtractionError('ffmpeg_unavailable', 'FFmpeg unavailable. Set FFMPEG_PATH or install ffmpeg-static in 02-Video-Engine/node_modules.');
  }

  const safeBaseName = sanitizeBaseName(sourceName);
  const sourcePath = path.join(workDir, `source-${safeBaseName}.mp4`);
  const outputPath = path.join(workDir, `${safeBaseName}-voice.m4a`);
  fs.writeFileSync(sourcePath, sourceBytes);

  const runner = runFfmpeg || defaultRunFfmpeg;
  const copyArgs = ['-y', '-i', sourcePath, '-map', '0:a:0', '-vn', '-c:a', 'copy', outputPath];
  const copyResult = await runFfmpegStep({ runFfmpeg: runner, ffmpegPath, args: copyArgs });
  if (copyResult.status === 0 && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
    const outputSize = fs.statSync(outputPath).size;
    if (outputSize > maxOutputBytes) throw createExtractionError('voice_audio_output_too_large', 'El audio extraído supera el límite de tamaño permitido.', { size: outputSize, maxOutputBytes });
    return { outputPath, fileName: `${safeBaseName}-voice.m4a`, contentType: 'audio/mp4', mode: 'stream-copy' };
  }

  const copyOutput = `${copyResult.stderr || ''}\n${copyResult.stdout || ''}`;
  if (ffmpegOutputIndicatesMissingAudio(copyOutput)) {
    throw createExtractionError('voice_video_no_audio_stream', 'El MP4 no contiene una pista de audio para usar como voz.');
  }
  if (fs.existsSync(outputPath)) fs.rmSync(outputPath, { force: true });

  const fallbackArgs = ['-y', '-i', sourcePath, '-map', '0:a:0', '-vn', '-c:a', 'aac', '-b:a', '256k', outputPath];
  const fallbackResult = await runFfmpegStep({ runFfmpeg: runner, ffmpegPath, args: fallbackArgs });
  const fallbackOutput = `${fallbackResult.stderr || ''}\n${fallbackResult.stdout || ''}`;
  if (ffmpegOutputIndicatesMissingAudio(fallbackOutput)) {
    throw createExtractionError('voice_video_no_audio_stream', 'El MP4 no contiene una pista de audio para usar como voz.');
  }
  if (fallbackResult.status !== 0 || !fs.existsSync(outputPath) || fs.statSync(outputPath).size <= 0) {
    throw createExtractionError('voice_audio_extraction_failed', `No se pudo extraer audio del MP4: ${fallbackOutput.trim() || 'FFmpeg failed'}`);
  }
  const outputSize = fs.statSync(outputPath).size;
  if (outputSize > maxOutputBytes) throw createExtractionError('voice_audio_output_too_large', 'El audio extraído supera el límite de tamaño permitido.', { size: outputSize, maxOutputBytes });
  return { outputPath, fileName: `${safeBaseName}-voice.m4a`, contentType: 'audio/mp4', mode: 'aac-transcode' };
}

module.exports = {
  extractVoiceAudioFromMp4,
  isSupportedMp4Source,
  resolveVoiceExtractionErrorStatus,
};
