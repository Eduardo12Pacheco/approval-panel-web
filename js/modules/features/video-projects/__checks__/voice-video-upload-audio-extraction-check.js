import { pathToFileURL } from 'node:url';

import { createAudioSetupCommands } from '../audio/commands.js';
import { createApprovalPipelineClient } from '../data/approval-pipeline-client.js';
import { buildSetupPhaseContent } from '../render/setup-view.js';
import { isVoiceVideoAudioInput } from '../audio/voice-video-extraction.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${JSON.stringify(expected)}; got ${JSON.stringify(actual)}`);
  }
}

function makeFile({ name, type, size = 1024, content = 'bytes' }) {
  return new File([content], name, { type, lastModified: 1, endings: 'transparent' });
}

function makeAudioStepViewModel() {
  return {
    googleCandidates: [],
    customCandidates: [],
    googleCandidateCount: 0,
    selectedImageCount: 1,
    selectedImageUrls: ['image-1'],
    segments: [{ order: 1, text: 'Segmento' }],
    requiredImageCount: 1,
    hasEnoughSelectedImages: true,
    detailPending: false,
    currentStep: 'audio',
    voiceAudio: {},
    backgroundAudio: {},
    voiceUploading: false,
    backgroundUploading: false,
    canPreparePreview: false,
    editorState: {},
    editorPhase: '',
    timedRows: [],
  };
}

function extractAcceptForKind(markup, kind) {
  const match = markup.match(new RegExp(`<input[^>]+data-audio-kind="${kind}"[^>]+>`));
  return match?.[0]?.match(/accept="([^"]+)"/)?.[1] || '';
}

function assertVoiceAcceptsMp4ButBackgroundStaysAudioOnly() {
  const markup = buildSetupPhaseContent({ project: {}, viewModel: makeAudioStepViewModel() }).mainContent;

  const voiceAccept = extractAcceptForKind(markup, 'voice');
  const backgroundAccept = extractAcceptForKind(markup, 'background');

  assert(voiceAccept.includes('audio/*'), 'Expected voice upload to preserve normal audio accept support');
  assert(voiceAccept.includes('video/mp4'), 'Expected voice upload to accept MP4 camera video containers');
  assertEqual(backgroundAccept, 'audio/*', 'Expected background music upload to remain audio-only');
}

function assertVoiceVideoInputDetectionIsVoiceOnlyMp4() {
  assertEqual(isVoiceVideoAudioInput('voice', makeFile({ name: 'camera.mp4', type: 'video/mp4' })), true, 'Expected voice MP4 to require extraction');
  assertEqual(isVoiceVideoAudioInput('voice', makeFile({ name: 'camera.MP4', type: '' })), true, 'Expected empty-MIME .mp4 voice file to require extraction');
  assertEqual(isVoiceVideoAudioInput('voice', makeFile({ name: 'voice.m4a', type: 'audio/mp4' })), false, 'Expected normal M4A audio to keep existing upload path');
  assertEqual(isVoiceVideoAudioInput('background', makeFile({ name: 'camera.mp4', type: 'video/mp4' })), false, 'Expected background MP4 not to use voice extraction');
  assertEqual(isVoiceVideoAudioInput('voice', makeFile({ name: 'movie.mov', type: 'video/quicktime' })), false, 'Expected non-MP4 videos not to enter the extraction branch');
}

async function assertRegularAudioUploadPathRemainsUnchanged() {
  const project = { voice_audio: {}, background_audio: {} };
  const calls = [];
  const commands = createAudioSetupCommands({
    api: {
      async extractVoiceAudioFromVideo() { calls.push('extract'); throw new Error('audio files must not extract'); },
      async uploadAudioFile({ draftId, kind, file }) {
        calls.push(`upload:${draftId}:${kind}:${file.name}:${file.type}`);
        return { kind, public_url: `https://cdn.example.com/${file.name}`, name: file.name, mime_type: file.type };
      },
      async saveVideoProjectAudio({ voiceAudio, backgroundAudio }) {
        calls.push(`save:${voiceAudio.name || ''}:${backgroundAudio.name || ''}`);
        return { voice_audio: voiceAudio, background_audio: backgroundAudio };
      },
    },
    ui: { toast(message) { calls.push(`toast:${message}`); } },
    getProject: () => project,
    resolveProjectKey: () => 'draft-audio',
    renderSelectedVideoProject() { calls.push('render'); },
  });

  await commands.uploadProjectAudio('voice', makeFile({ name: 'voice.wav', type: 'audio/wav' }));

  assertEqual(calls.includes('extract'), false, 'Expected normal audio upload not to call extraction');
  assert(calls.includes('upload:draft-audio:voice:voice.wav:audio/wav'), 'Expected normal audio upload to use original file');
  assertEqual(project.voice_audio.name, 'voice.wav', 'Expected normal audio metadata to remain from original upload');
}

async function assertVoiceMp4ExtractsThenUsesExistingUploadAndSave() {
  const project = { voice_audio: {}, background_audio: { name: 'music.wav', public_url: 'https://cdn.example.com/music.wav' } };
  const calls = [];
  const commands = createAudioSetupCommands({
    api: {
      async extractVoiceAudioFromVideo({ file }) {
        calls.push(`extract:${file.name}:${file.type}`);
        return new File(['m4a-bytes'], 'camera-voice.m4a', { type: 'audio/mp4' });
      },
      async uploadAudioFile({ draftId, kind, file }) {
        calls.push(`upload:${draftId}:${kind}:${file.name}:${file.type}`);
        return { kind, public_url: `https://cdn.example.com/${file.name}`, name: file.name, size: file.size, mime_type: file.type };
      },
      async saveVideoProjectAudio({ voiceAudio, backgroundAudio }) {
        calls.push(`save:${voiceAudio.name}:${backgroundAudio.name}`);
        return { voice_audio: voiceAudio, background_audio: backgroundAudio };
      },
    },
    ui: { toast(message) { calls.push(`toast:${message}`); } },
    getProject: () => project,
    resolveProjectKey: () => 'draft-video',
    renderSelectedVideoProject() { calls.push('render'); },
  });

  await commands.uploadProjectAudio('voice', makeFile({ name: 'camera.mp4', type: 'video/mp4' }));

  assert(calls.includes('extract:camera.mp4:video/mp4'), 'Expected voice MP4 to be sent to extraction endpoint before upload');
  assert(calls.includes('upload:draft-video:voice:camera-voice.m4a:audio/mp4'), 'Expected extracted M4A master to use existing audio upload path');
  assert(calls.includes('save:camera-voice.m4a:music.wav'), 'Expected extracted audio metadata to be saved through existing audio RPC path');
  assertEqual(project.voice_audio.mime_type, 'audio/mp4', 'Expected project voice audio to remain normal audio metadata');
}

async function assertExtractionClientPostsBinaryAndReturnsAudioFile() {
  const requests = [];
  const client = createApprovalPipelineClient({
    resolveBaseUrl: () => 'http://approval.test',
    fetchImpl: async (url, init = {}) => {
      requests.push({ url, init });
      return {
        ok: true,
        status: 200,
        headers: { get: (name) => ({ 'content-type': 'audio/mp4', 'x-audio-filename': 'voice-from-camera.m4a' }[String(name).toLowerCase()] || '') },
        blob: async () => new Blob(['m4a-bytes'], { type: 'audio/mp4' }),
      };
    },
  });

  const extracted = await client.extractVoiceAudioFromVideo(makeFile({ name: 'camera.mp4', type: 'video/mp4' }));

  assertEqual(requests[0].url, 'http://approval.test/api/audio/extract-voice', 'Expected extraction client endpoint to use Approval Editor /api route');
  assertEqual(requests[0].init.method, 'POST', 'Expected extraction client to POST binary input');
  assertEqual(requests[0].init.body.name, 'camera.mp4', 'Expected extraction client to send original video file body');
  assertEqual(requests[0].init.headers['Content-Type'], 'video/mp4', 'Expected extraction client to preserve MP4 content type');
  assertEqual(extracted.name, 'voice-from-camera.m4a', 'Expected extracted file name to come from server header');
  assertEqual(extracted.type, 'audio/mp4', 'Expected extracted master to be audio/mp4');
}

export async function runVoiceVideoUploadAudioExtractionCheck() {
  assertVoiceAcceptsMp4ButBackgroundStaysAudioOnly();
  assertVoiceVideoInputDetectionIsVoiceOnlyMp4();
  await assertRegularAudioUploadPathRemainsUnchanged();
  await assertVoiceMp4ExtractsThenUsesExistingUploadAndSave();
  await assertExtractionClientPostsBinaryAndReturnsAudioFile();
  return { ok: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runVoiceVideoUploadAudioExtractionCheck()
    .then(() => console.log('voice-video-upload-audio-extraction-check: PASS'))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
