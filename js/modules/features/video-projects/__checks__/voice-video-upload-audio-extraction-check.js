import { pathToFileURL } from 'node:url';

import { createAudioSetupCommands } from '../audio/commands.js';
import { createApprovalPipelineClient } from '../data/approval-pipeline-client.js';
import { createSupabaseVideoProjectsClient } from '../data/supabase-client.js';
import { buildSetupPhaseContent } from '../render/setup-view.js';
import { isVoiceVideoAudioInput } from '../audio/voice-video-extraction.js';
import { createVideoProjectsController } from '../controller/create-video-projects-controller.js';

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
  assert(markup.includes('Agregar voz o video'), 'Expected voice upload CTA to clarify that MP4 video is accepted');
  assert(markup.includes('Subí audio de voz o un MP4 de cámara; extraemos el audio automáticamente.'), 'Expected voice upload help text to explain automatic audio extraction');
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

async function assertVoiceMp4ExtractsThenUsesResumableSourceUploadAndSave() {
  const project = { voice_audio: {}, background_audio: { name: 'music.wav', public_url: 'https://cdn.example.com/music.wav' } };
  const calls = [];
  const commands = createAudioSetupCommands({
    api: {
      async uploadProjectVideoFile() {
        calls.push('standard-video-upload');
        throw new Error('voice MP4 source upload must not use the standard video upload path');
      },
      async uploadVoiceSourceVideoFile({ draftId, file }) {
        calls.push(`voice-source-upload:${draftId}:${file.name}:${file.type}`);
        return { public_url: `https://storage.example.com/${file.name}`, storage_path: `projects/draft-video/videos/${file.name}`, bucket: 'video-project-videos', name: file.name, size: file.size, mime_type: file.type };
      },
      async extractVoiceAudioFromVideo({ source }) {
        calls.push(`extract-source:${source.publicUrl}:${source.name}:${source.mimeType}:${source.size}`);
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

  assertEqual(calls.includes('standard-video-upload'), false, 'Expected voice MP4 source not to use standard Supabase object upload');
  assert(calls.includes('voice-source-upload:draft-video:camera.mp4:video/mp4'), 'Expected voice MP4 source to upload through the dedicated resumable storage API before extraction');
  assert(calls.includes('extract-source:https://storage.example.com/camera.mp4:camera.mp4:video/mp4:5'), 'Expected extraction to receive source storage metadata instead of the MP4 binary body');
  assert(calls.includes('upload:draft-video:voice:camera-voice.m4a:audio/mp4'), 'Expected extracted M4A master to use existing audio upload path');
  assert(calls.includes('save:camera-voice.m4a:music.wav'), 'Expected extracted audio metadata to be saved through existing audio RPC path');
  assertEqual(project.voice_audio.mime_type, 'audio/mp4', 'Expected project voice audio to remain normal audio metadata');
}

async function assertVoiceSourceUploadUsesSupabaseTusResumableChunks() {
  const requests = [];
  const uploadLocation = 'https://ulzcthcdakjfretjdakd.storage.supabase.co/storage/v1/upload/resumable/upload-id-1';
  const sourceFile = makeFile({
    name: 'large-camera.mp4',
    type: 'video/mp4',
    content: new Uint8Array((6 * 1024 * 1024) + 17),
  });
  const client = createSupabaseVideoProjectsClient({
    fetchImpl: async (url, init = {}) => {
      const bodySize = init.body ? (await init.body.arrayBuffer()).byteLength : 0;
      requests.push({ url: String(url), init, bodySize });

      if (init.method === 'POST') {
        return {
          ok: true,
          status: 201,
          headers: { get: (name) => (String(name).toLowerCase() === 'location' ? uploadLocation : '') },
          text: async () => '',
        };
      }

      const currentOffset = Number(init.headers['Upload-Offset']);
      return {
        ok: true,
        status: 204,
        headers: { get: (name) => (String(name).toLowerCase() === 'upload-offset' ? String(currentOffset + bodySize) : '') },
        text: async () => '',
      };
    },
  });

  const metadata = await client.uploadVoiceSourceVideoFile({ draftId: 'draft-resumable', file: sourceFile });
  const createRequest = requests[0];
  const firstPatch = requests[1];
  const secondPatch = requests[2];
  const decodedMetadata = Object.fromEntries(
    createRequest.init.headers['Upload-Metadata'].split(',').map((part) => {
      const [key, value] = part.trim().split(' ');
      return [key, Buffer.from(value, 'base64').toString('utf8')];
    }),
  );

  assertEqual(createRequest.url, 'https://ulzcthcdakjfretjdakd.storage.supabase.co/storage/v1/upload/resumable', 'Expected voice source upload to create TUS upload on direct Supabase Storage hostname');
  assertEqual(createRequest.init.method, 'POST', 'Expected TUS create request to use POST');
  assertEqual(createRequest.init.headers['Tus-Resumable'], '1.0.0', 'Expected TUS create request to include protocol version');
  assertEqual(createRequest.init.headers['Upload-Length'], String(sourceFile.size), 'Expected TUS create request to declare file size');
  assertEqual(createRequest.init.headers.apikey, 'sb_publishable_RDUiyePyvXCkdU5k17Ue6g_nmxgSsQf', 'Expected TUS create request to include Supabase apikey header');
  assertEqual(createRequest.init.headers.Authorization, 'Bearer sb_publishable_RDUiyePyvXCkdU5k17Ue6g_nmxgSsQf', 'Expected TUS create request to include bearer publishable key');
  assertEqual(createRequest.init.headers['x-upsert'], 'false', 'Expected TUS create request to preserve no-upsert behavior');
  assertEqual(decodedMetadata.bucketName, 'video-project-videos', 'Expected TUS metadata to target the video project videos bucket');
  assert(decodedMetadata.objectName.startsWith('projects/'), 'Expected TUS metadata to include the generated storage path');
  assert(decodedMetadata.objectName.endsWith('-large-camera.mp4'), 'Expected TUS metadata to preserve the sanitized source file name');
  assertEqual(decodedMetadata.contentType, 'video/mp4', 'Expected TUS metadata to preserve MP4 content type');
  assertEqual(decodedMetadata.cacheControl, '3600', 'Expected TUS metadata to include cache control');
  assertEqual(firstPatch.url, uploadLocation, 'Expected first chunk to PATCH the returned TUS upload URL');
  assertEqual(firstPatch.init.method, 'PATCH', 'Expected chunks to upload with PATCH');
  assertEqual(firstPatch.init.headers['Upload-Offset'], '0', 'Expected first chunk offset to start at zero');
  assertEqual(firstPatch.init.headers['Content-Type'], 'application/offset+octet-stream', 'Expected chunks to use TUS octet-stream content type');
  assertEqual(firstPatch.bodySize, 6 * 1024 * 1024, 'Expected first chunk size to be exactly 6 MiB');
  assertEqual(secondPatch.init.headers['Upload-Offset'], String(6 * 1024 * 1024), 'Expected second chunk to continue from the first chunk offset');
  assertEqual(secondPatch.bodySize, 17, 'Expected final chunk to contain remaining bytes');
  assertEqual(metadata.bucket, 'video-project-videos', 'Expected voice source upload to return existing video upload metadata shape');
  assertEqual(metadata.storage_path, decodedMetadata.objectName, 'Expected returned metadata path to match uploaded TUS objectName');
  assertEqual(metadata.duration_seconds, 0, 'Expected source voice MP4 metadata duration to remain zero');
}

async function assertEditorVideoUploadKeepsStandardStorageObjectPath() {
  const requests = [];
  const client = createSupabaseVideoProjectsClient({
    fetchImpl: async (url, init = {}) => {
      requests.push({ url: String(url), init });
      return { ok: true, status: 200, text: async () => '{}' };
    },
  });
  const file = makeFile({ name: 'library-video.mp4', type: 'video/mp4' });

  const metadata = await client.uploadProjectVideoFile({ draftId: 'draft-editor-video', file, durationSeconds: 12 });

  assertEqual(requests.length, 1, 'Expected regular editor video upload to perform a single standard storage request');
  assert(requests[0].url.includes('/storage/v1/object/video-project-videos/'), 'Expected regular editor video upload to keep Supabase standard object endpoint');
  assertEqual(requests[0].init.method, 'POST', 'Expected regular editor video upload to keep POST method');
  assertEqual(requests[0].init.body, file, 'Expected regular editor video upload to send the original file body');
  assertEqual(metadata.duration_seconds, 12, 'Expected regular editor video upload metadata to preserve duration seconds');
}

async function assertExtractionClientPostsStorageMetadataAndReturnsAudioFile() {
  const requests = [];
  const client = createApprovalPipelineClient({
    resolveBaseUrl: () => 'http://approval.test',
    fetchImpl: async (url, init = {}) => {
      requests.push({ url, init });
      return {
        ok: true,
        status: 200,
        headers: { get: (name) => ({ 'content-type': 'audio/mp4', 'x-audio-filename': 'voice-from-storage.m4a' }[String(name).toLowerCase()] || '') },
        blob: async () => new Blob(['m4a-bytes'], { type: 'audio/mp4' }),
      };
    },
  });

  const extracted = await client.extractVoiceAudioFromVideo({
    source: {
      publicUrl: 'https://storage.example.com/projects/draft/videos/camera.mp4',
      name: 'camera.mp4',
      mimeType: 'video/mp4',
      size: 129610226,
      bucket: 'video-project-videos',
      storagePath: 'projects/draft/videos/camera.mp4',
    },
  });

  const body = JSON.parse(requests[0].init.body);
  assertEqual(requests[0].url, 'http://approval.test/api/audio/extract-voice', 'Expected extraction client endpoint to use Approval Editor /api route');
  assertEqual(requests[0].init.method, 'POST', 'Expected extraction client to POST source metadata');
  assertEqual(requests[0].init.headers['Content-Type'], 'application/json', 'Expected storage-backed extraction to send JSON, not MP4 binary');
  assertEqual(body.source.publicUrl, 'https://storage.example.com/projects/draft/videos/camera.mp4', 'Expected JSON body to include source public URL');
  assertEqual(body.source.size, 129610226, 'Expected JSON body to include source size metadata for diagnostics');
  assertEqual(extracted.name, 'voice-from-storage.m4a', 'Expected extracted file name to come from server header');
  assertEqual(extracted.type, 'audio/mp4', 'Expected extracted master to be audio/mp4');
}

async function assertExtractionClientRetainsBinaryBackCompatAndReturnsAudioFile() {
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

async function assertControllerWiresVoiceVideoExtractionClient() {
  const calls = [];
  const project = {
    draft_id: 'draft-controller',
    voice_audio: {},
    background_audio: { name: 'music.wav', public_url: 'https://cdn.example.com/music.wav' },
    editor_state: { pipeline_base_url: 'http://approval.from-project' },
  };
  const controller = createVideoProjectsController({
    api: {
      createApprovalPipelineClient({ resolveBaseUrl }) {
        calls.push(`client:${resolveBaseUrl()}`);
        return {
          async extractVoiceAudioFromVideo({ source }) {
            calls.push(`extract-source:${source.publicUrl}:${source.name}:${source.mimeType}`);
            return new File(['m4a-bytes'], 'controller-voice.m4a', { type: 'audio/mp4' });
          },
        };
      },
      async uploadProjectVideoFile() {
        calls.push('standard-video-upload');
        throw new Error('voice MP4 source upload must not use standard video upload');
      },
      async uploadVoiceSourceVideoFile({ draftId, file }) {
        calls.push(`voice-source-upload:${draftId}:${file.name}:${file.type}`);
        return { public_url: `https://storage.example.com/${file.name}`, storage_path: `projects/draft-controller/videos/${file.name}`, bucket: 'video-project-videos', name: file.name, size: file.size, mime_type: file.type };
      },
      async uploadAudioFile({ draftId, kind, file }) {
        calls.push(`upload:${draftId}:${kind}:${file.name}:${file.type}`);
        return { kind, public_url: `https://cdn.example.com/${file.name}`, name: file.name, mime_type: file.type };
      },
      async saveVideoProjectAudio({ voiceAudio, backgroundAudio }) {
        calls.push(`save:${voiceAudio.name}:${backgroundAudio.name}`);
        return { voice_audio: voiceAudio, background_audio: backgroundAudio };
      },
    },
    store: { getState: () => ({ selectedVideoProject: project, settings: { approvalPipelineBaseUrl: 'http://approval.from-settings' } }) },
    ui: { toast(message) { calls.push(`toast:${message}`); } },
    callbacks: { renderVideoProjects() {}, renderSelectedVideoProject() {}, updateSelectedVideoProjectCompositionPreview() { return true; } },
  });

  await controller.uploadProjectAudio('voice', makeFile({ name: 'camera.mp4', type: 'video/mp4' }));

  assert(calls.includes('client:http://approval.from-project'), 'Expected controller to resolve Approval Pipeline client for voice MP4 extraction');
  assertEqual(calls.includes('standard-video-upload'), false, 'Expected controller not to use standard video upload for voice MP4 source');
  assert(calls.includes('voice-source-upload:draft-controller:camera.mp4:video/mp4'), 'Expected controller to upload source MP4 through dedicated resumable lower-level storage API');
  assert(calls.includes('extract-source:https://storage.example.com/camera.mp4:camera.mp4:video/mp4'), 'Expected controller audio API to pass storage metadata to extraction method');
  assert(calls.includes('upload:draft-controller:voice:controller-voice.m4a:audio/mp4'), 'Expected controller to upload extracted master through existing audio path');
  assert(calls.includes('save:controller-voice.m4a:music.wav'), 'Expected controller to save extracted voice audio metadata normally');
}

export async function runVoiceVideoUploadAudioExtractionCheck() {
  assertVoiceAcceptsMp4ButBackgroundStaysAudioOnly();
  assertVoiceVideoInputDetectionIsVoiceOnlyMp4();
  await assertRegularAudioUploadPathRemainsUnchanged();
  await assertVoiceMp4ExtractsThenUsesResumableSourceUploadAndSave();
  await assertVoiceSourceUploadUsesSupabaseTusResumableChunks();
  await assertEditorVideoUploadKeepsStandardStorageObjectPath();
  await assertExtractionClientPostsStorageMetadataAndReturnsAudioFile();
  await assertExtractionClientRetainsBinaryBackCompatAndReturnsAudioFile();
  await assertControllerWiresVoiceVideoExtractionClient();
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
