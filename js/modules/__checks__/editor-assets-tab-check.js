import { fileURLToPath } from 'node:url';
import { buildEditorAssetsViewModel, buildEditorDetailRailViewModel } from '../features/video-projects/render/editor-view-model.js';
import { buildEditorAssetsPicker } from '../features/video-projects/render/editor-assets-picker.js';
import { resolveEditorEffectTab } from '../features/video-projects/render/editor-effect-tabs.js';
import { buildEditorDetailRail, buildEditorRowsTable } from '../features/video-projects/render/editor-markup.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function makeProject() {
  return {
    selected_images: [
      'https://cdn.example.com/selected-1.jpg',
      { storage_public_url: 'https://cdn.example.com/custom-1.webp', title: 'Custom from selected' },
    ],
    image_candidates: [
      { provider: 'google', image_url: 'https://cdn.example.com/ignored-google.jpg', title: 'Google ignored' },
      { provider: 'user-upload', storage_public_url: 'https://cdn.example.com/custom-1.webp', title: 'Duplicate custom' },
      { source: 'user-upload', storage_public_url: 'https://cdn.example.com/custom-2.png', file_name: 'custom-2.png' },
    ],
  };
}

function runAssetsViewModelCheck() {
  const row = { id: 'row-1', selectedAssetId: 'https://cdn.example.com/custom-1.webp' };
  const assets = buildEditorAssetsViewModel({ project: makeProject(), row });

  assertEqual(assets.length, 3, 'Expected selected images and custom uploads to be deduped into three assets');
  assertEqual(assets[0].url, 'https://cdn.example.com/selected-1.jpg', 'Expected selected image URL to be preserved');
  assertEqual(assets[1].url, 'https://cdn.example.com/custom-1.webp', 'Expected duplicate selected/custom URL once');
  assertEqual(assets[2].url, 'https://cdn.example.com/custom-2.png', 'Expected second custom upload URL');
  assertEqual(assets[1].isSelected, true, 'Expected current row selected asset to be marked selected');
  assertEqual(assets[2].isSelected, false, 'Expected non-current assets not to be selected');
}

function runAssetsTabResolutionCheck() {
  assertEqual(resolveEditorEffectTab('assets'), 'assets', 'Expected Assets to be a valid editor tab');
  const detail = buildEditorDetailRailViewModel({ row: { id: 'row-1' }, project: { ...makeProject(), _editorEffectTab: 'assets' } });
  assertEqual(detail.activeEffectTab, 'assets', 'Expected detail rail to preserve active Assets tab');
}

function runAssetsMarkupCheck() {
  const row = { id: 'row-1', selectedAssetId: 'https://cdn.example.com/custom-1.webp' };
  const assets = buildEditorAssetsViewModel({ project: makeProject(), row });
  const markup = buildEditorAssetsPicker({ row, assets, uploading: false });

  assert(markup.includes('data-action="assign-row-asset"'), 'Expected asset cards to assign an existing row asset');
  assert(markup.includes('data-action="upload-assets-image"'), 'Expected Assets tab upload input');
  assert(markup.includes('Imágenes'), 'Expected Assets UI label to be localized as Imágenes');
  assert(markup.includes('aria-pressed="true"'), 'Expected current row image to be visibly selected');
  assert(markup.includes('https://cdn.example.com/custom-2.png'), 'Expected custom upload asset to render');
}

function runChangeImageNavigationCheck() {
  const row = { id: 'row-1', startTime: 16.76, endTime: 23.3, phrase: 'Fila de prueba' };
  const tableMarkup = buildEditorRowsTable([row], { selectedRowId: 'row-1', project: makeProject() });
  const detailMarkup = buildEditorDetailRail({ row, project: makeProject() });

  assert(tableMarkup.includes('data-action="open-assets-tab"'), 'Expected table Cambiar action to open Imágenes tab');
  assert(!tableMarkup.includes('data-action="upload-row-image"'), 'Expected table Cambiar action not to open file picker');
  assert(!detailMarkup.includes('Cambiar imagen'), 'Expected detail rail image button to be removed');
  assert(!detailMarkup.includes('video-editor-detail__thumb'), 'Expected detail rail mini image to be removed');
}

export function runEditorAssetsTabCheck() {
  runAssetsViewModelCheck();
  runAssetsTabResolutionCheck();
  runAssetsMarkupCheck();
  runChangeImageNavigationCheck();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runEditorAssetsTabCheck();
  console.log('editor-assets-tab-check: ok');
}
