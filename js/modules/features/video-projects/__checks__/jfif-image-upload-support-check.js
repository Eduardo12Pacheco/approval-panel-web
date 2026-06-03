import { fileURLToPath } from 'node:url';
import {
  CUSTOM_IMAGE_MAX_SIZE_BYTES,
  isAllowedCustomImageFile,
  normalizeCustomImageMimeType,
} from '../domain/image-files.js';
import { createCustomImageCommands } from '../data/custom-image-commands.js';
import { createRowImageCommands } from '../data/row-image-commands.js';
import { createSupabaseVideoProjectsClient } from '../data/supabase-client.js';
import { normalizeImageLookupKey } from '../composition/composition-contract.js';
import { buildSetupPhaseContent } from '../render/setup-view.js';
import { buildEditorAssetsPicker } from '../render/editor-assets-picker.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function makeFile({ name, type, size = 1024 }) {
  return { name, type, size };
}

function installImageDimensionStub() {
  const previousUrl = globalThis.URL;
  const previousImage = globalThis.Image;
  globalThis.URL = {
    createObjectURL() { return 'blob:check-image'; },
    revokeObjectURL() {},
  };
  globalThis.Image = class CheckImage {
    constructor() {
      this.naturalWidth = 640;
      this.naturalHeight = 360;
    }

    set src(_value) {
      queueMicrotask(() => this.onload?.());
    }
  };
  return () => {
    globalThis.URL = previousUrl;
    globalThis.Image = previousImage;
  };
}

function runMimeNormalizationCheck() {
  const jpeg = makeFile({ name: 'photo.jpg', type: 'image/jpeg' });
  const progressiveJpeg = makeFile({ name: 'legacy.jfif', type: 'image/pjpeg' });
  const emptyMimeJfif = makeFile({ name: 'camera.JFIF', type: '' });
  const emptyMimeJpeg = makeFile({ name: 'camera.jpg', type: '' });
  const spoofedPngName = makeFile({ name: 'bad.png', type: 'application/octet-stream' });
  const oversizedJfif = makeFile({ name: 'too-large.jfif', type: '', size: CUSTOM_IMAGE_MAX_SIZE_BYTES + 1 });

  assertEqual(CUSTOM_IMAGE_MAX_SIZE_BYTES, 15 * 1024 * 1024, 'Expected custom image max size to remain 15MB');
  assertEqual(normalizeCustomImageMimeType(jpeg), 'image/jpeg', 'Expected normal JPEG to stay image/jpeg');
  assertEqual(normalizeCustomImageMimeType(progressiveJpeg), 'image/jpeg', 'Expected image/pjpeg to normalize to image/jpeg');
  assertEqual(normalizeCustomImageMimeType(emptyMimeJfif), 'image/jpeg', 'Expected empty-MIME .jfif to normalize to image/jpeg');
  assertEqual(normalizeCustomImageMimeType(emptyMimeJpeg), '', 'Expected empty MIME without .jfif not to be broadened');
  assertEqual(normalizeCustomImageMimeType(spoofedPngName), '', 'Expected unsupported MIME to be rejected even with an image-like name');
  assertEqual(isAllowedCustomImageFile(progressiveJpeg), true, 'Expected image/pjpeg to be allowed as JPEG input');
  assertEqual(isAllowedCustomImageFile(emptyMimeJfif), true, 'Expected empty-MIME .jfif to be allowed');
  assertEqual(isAllowedCustomImageFile(spoofedPngName), false, 'Expected unsupported MIME to remain rejected');
  assertEqual(isAllowedCustomImageFile(oversizedJfif), true, 'Expected MIME allowance to stay separate from the unchanged 15MB size gate');
}

function runAcceptMarkupCheck() {
  const viewModel = {
    googleCandidates: [],
    customCandidates: [],
    googleCandidateCount: 0,
    selectedImageCount: 0,
    selectedImageUrls: [],
    segments: [],
    requiredImageCount: 1,
    hasEnoughSelectedImages: false,
    detailPending: false,
    currentStep: 'images',
    voiceAudio: {},
    backgroundAudio: {},
    voiceUploading: false,
    backgroundUploading: false,
    canPreparePreview: false,
    editorState: {},
    editorPhase: '',
    timedRows: [],
  };
  const setupMarkup = buildSetupPhaseContent({ project: {}, viewModel }).mainContent;
  const editorMarkup = buildEditorAssetsPicker({ row: { id: 'row-1' }, assets: [], uploading: false });

  assert(setupMarkup.includes('accept="image/jpeg,image/png,image/webp,.jfif"'), 'Expected setup upload accept attribute to include .jfif');
  assert(setupMarkup.includes('JPG/PNG/WebP/JFIF'), 'Expected setup upload help copy to include JFIF');
  assert(editorMarkup.includes('accept="image/jpeg,image/png,image/webp,.jfif"'), 'Expected editor asset upload accept attribute to include .jfif');
}

async function runCandidateMetadataNormalizationCheck() {
  const restoreImage = installImageDimensionStub();
  try {
    const project = {};
    const customCandidates = [];
    const uploads = [];
    const api = {
      async uploadCustomImageFile({ file }) {
        uploads.push(file);
        return {
          project_storage_key: 'project-key',
          storage_bucket: 'video-candidates-temp',
          storage_path: `custom/${file.name}`,
          storage_public_url: `https://cdn.example.com/${file.name}`,
        };
      },
      async addVideoProjectCustomImages({ customCandidates: candidates }) {
        customCandidates.push(...candidates);
        return { added_count: candidates.length, image_candidates: candidates, selected_images: [] };
      },
    };
    const customCommands = createCustomImageCommands({
      api,
      ui: { toast() {} },
      getProject: () => project,
      resolveProjectKey: () => 'draft-1',
      renderSelectedVideoProject() {},
    });

    await customCommands.uploadCustomImages([
      makeFile({ name: 'legacy.jfif', type: 'image/pjpeg' }),
      makeFile({ name: 'camera.jfif', type: '' }),
    ]);

    assertEqual(customCandidates.length, 2, 'Expected both JFIF variants to be persisted as custom candidates');
    assertEqual(customCandidates[0].mime_type, 'image/jpeg', 'Expected image/pjpeg candidate metadata to persist normalized image/jpeg');
    assertEqual(customCandidates[1].mime_type, 'image/jpeg', 'Expected empty-MIME .jfif candidate metadata to persist normalized image/jpeg');
    assertEqual(uploads.length, 2, 'Expected accepted JFIF files to be sent to upload storage');

    const rowCandidates = [];
    const patches = [];
    const rowCommands = createRowImageCommands({
      api: {
        async uploadCustomImageFile({ file }) {
          return {
            project_storage_key: 'project-key',
            storage_bucket: 'video-candidates-temp',
            storage_path: `row/${file.name}`,
            storage_public_url: `https://cdn.example.com/row/${file.name}`,
          };
        },
        async addVideoProjectCustomImages({ customCandidates: candidates }) {
          rowCandidates.push(...candidates);
          return { added_count: candidates.length, image_candidates: candidates, selected_images: [] };
        },
      },
      ui: { toast() {} },
      getProject: () => project,
      resolveProjectKey: () => 'draft-1',
      renderSelectedVideoProject() {},
      updateRow: async (rowId, patch) => patches.push({ rowId, patch }),
    });

    await rowCommands.uploadAndAssignImage('row-1', makeFile({ name: 'row-upload.jfif', type: 'image/pjpeg' }));
    assertEqual(rowCandidates[0].mime_type, 'image/jpeg', 'Expected row image JFIF metadata to persist normalized image/jpeg');
    assertEqual(patches[0].patch.selectedAssetId, 'https://cdn.example.com/row/row-upload.jfif', 'Expected row upload to still assign the uploaded public URL');
  } finally {
    restoreImage();
  }
}

async function runSupabaseContentTypeCheck() {
  const requests = [];
  const client = createSupabaseVideoProjectsClient({
    fetchImpl: async (url, init = {}) => {
      requests.push({ url, init });
      return { ok: true, text: async () => '{}' };
    },
  });

  await client.uploadCustomImageFile({ draftId: 'draft-1', file: makeFile({ name: 'legacy.jfif', type: 'image/pjpeg' }) });
  await client.uploadCustomImageFile({ draftId: 'draft-1', file: makeFile({ name: 'camera.jfif', type: '' }) });

  assertEqual(requests[0].init.headers['Content-Type'], 'image/jpeg', 'Expected image/pjpeg upload Content-Type to normalize to image/jpeg');
  assertEqual(requests[1].init.headers['Content-Type'], 'image/jpeg', 'Expected empty-MIME .jfif upload Content-Type to normalize to image/jpeg');
}

function runImageLookupKeyCheck() {
  assertEqual(normalizeImageLookupKey('https://cdn.example.com/Foo Bar.jfif?token=1'), 'foo-bar', 'Expected .jfif to be stripped as an image extension');
  assertEqual(normalizeImageLookupKey('https://cdn.example.com/Foo Bar.jpg?token=1'), 'foo-bar', 'Expected existing JPEG stripping behavior to remain unchanged');
}

export async function runJfifImageUploadSupportCheck() {
  runMimeNormalizationCheck();
  runAcceptMarkupCheck();
  await runCandidateMetadataNormalizationCheck();
  await runSupabaseContentTypeCheck();
  runImageLookupKeyCheck();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await runJfifImageUploadSupportCheck();
  console.log('jfif-image-upload-support-check: ok');
}
