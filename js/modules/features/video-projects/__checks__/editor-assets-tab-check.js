import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildEditorAssetsViewModel, buildEditorDetailRailViewModel } from '../render/editor-view-model.js';
import { buildEditorAssetsPicker } from '../render/editor-assets-picker.js';
import { EDITOR_EFFECT_TABS, resolveEditorEffectTab } from '../render/editor-effect-tabs.js';
import { buildEditorDetailRail, buildEditorRowsTable } from '../render/editor-markup.js';
import { hydrateEditorPhaseInteractions, hydrateRowImageSwapControls } from '../render/editor-hydration.js';

const currentDir = dirname(fileURLToPath(import.meta.url));
const videoProjectsStylesPath = resolve(currentDir, '../../../../../styles/features/video-projects/index.css');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function readVideoProjectsStyles() {
  return readCssWithImports(videoProjectsStylesPath);
}

function readCssWithImports(filePath, seen = new Set()) {
  if (seen.has(filePath)) return '';
  seen.add(filePath);

  const source = readFileSync(filePath, 'utf8');
  return source.replace(/@import\s+'([^']+)'\s*;/g, (_, importPath) => {
    return readCssWithImports(resolve(dirname(filePath), importPath.split('?')[0]), seen);
  });
}

function getCssRule(styles, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = styles.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));
  return match?.[1] || '';
}

function assertCssDeclaration(rule, property, expectedValue, message) {
  const match = rule.match(new RegExp(`${property}\\s*:\\s*([^;]+);`));
  assertEqual(match?.[1]?.trim(), expectedValue, message);
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
  assertEqual(resolveEditorEffectTab('assets'), 'content', 'Expected legacy Assets state to route to Contenido');
  const detail = buildEditorDetailRailViewModel({ row: { id: 'row-1' }, project: { ...makeProject(), _editorEffectTab: 'assets' } });
  assertEqual(detail.activeEffectTab, 'content', 'Expected detail rail to normalize legacy Assets tab to Contenido');
}

function runAssetsMarkupCheck() {
  const row = { id: 'row-1', selectedAssetId: 'https://cdn.example.com/custom-1.webp' };
  const assets = buildEditorAssetsViewModel({ project: makeProject(), row });
  const markup = buildEditorAssetsPicker({ row, assets, uploading: false });

  assert(markup.includes('data-action="assign-row-asset"'), 'Expected asset cards to assign an existing row asset');
  assert(markup.includes('data-action="upload-assets-image"'), 'Expected Assets tab upload input');
  assert(markup.includes('Imágenes'), 'Expected Assets UI label to be localized as Imágenes');
  assert(markup.includes('video-editor-assets-card is-selected'), 'Expected current row image card to get selected styling class');
  assert(markup.includes('aria-pressed="true"'), 'Expected current row image to be visibly selected');
  assert(markup.includes('https://cdn.example.com/custom-2.png'), 'Expected custom upload asset to render');
}

function runAssetsThumbnailStyleCheck() {
  const styles = readVideoProjectsStyles();
  const mediaRule = getCssRule(styles, '.video-editor-assets-card__media');
  const imageRule = getCssRule(styles, '.video-editor-assets-card__media img');
  const selectedRule = getCssRule(styles, '.video-editor-assets-card.is-selected');

  assertCssDeclaration(mediaRule, 'place-items', 'center', 'Expected asset media wrapper to center thumbnails');
  assertCssDeclaration(imageRule, 'object-fit', 'contain', 'Expected asset thumbnails to preserve full image inside card');
  assertCssDeclaration(imageRule, 'object-position', 'center center', 'Expected asset thumbnails to be visually centered');
  assertCssDeclaration(selectedRule, 'border-color', 'rgba(0, 232, 143, 0.9)', 'Expected selected asset card to use a clear green border');
  assertCssDeclaration(selectedRule, 'box-shadow', '0 0 0 2px rgba(0, 232, 143, 0.28)', 'Expected selected asset card to use a clear green selected halo');
}

function runChangeImageNavigationCheck() {
  const row = { id: 'row-1', startTime: 16.76, endTime: 23.3, phrase: 'Fila de prueba', selectedAssetId: 'https://cdn.example.com/custom-1.webp' };
  const tableMarkup = buildEditorRowsTable([row], { selectedRowId: 'row-1', project: makeProject() });
  const detailMarkup = buildEditorDetailRail({ row, project: makeProject() });

  assert(tableMarkup.includes('data-action="open-assets-tab"'), 'Expected table Cambiar action to open Imágenes tab');
  assert(tableMarkup.includes('data-action="open-newspaper-tab"'), 'Expected table to expose Cambiar a periódico as a first-class row action');
  assert(tableMarkup.includes('Cambiar a periódico'), 'Expected newspaper row action to use the requested visible label');
  assert(!tableMarkup.includes('data-action="upload-row-image"'), 'Expected table Cambiar action not to open file picker');
  assert(!detailMarkup.includes('Cambiar imagen'), 'Expected detail rail image button to be removed');
  assert(detailMarkup.includes('video-editor-detail__summary'), 'Expected detail rail to render phrase/time and image summary');
  assert(detailMarkup.includes('video-editor-detail__image-card'), 'Expected detail rail to render larger right-side image card');
  assert(detailMarkup.includes('video-editor-detail__thumb'), 'Expected detail rail to keep row image as larger context image');
}

async function runNewspaperNavigationHydrationCheck() {
  const listeners = new Map();
  const newspaperButton = {
    dataset: { rowId: 'row-news', startTime: '12.5' },
    addEventListener(type, listener) { listeners.set(type, listener); },
  };
  const project = { _selectedEditorRowId: null, _editorEffectTab: 'layers', _previewSeekTime: 0 };
  const patches = [];
  let renderCount = 0;

  const root = {
    querySelectorAll(selector) {
      if (selector === '[data-action="open-newspaper-tab"]') return [newspaperButton];
      return [];
    },
    querySelector() { return null; },
  };

  hydrateEditorPhaseInteractions({
    root,
    project,
    editorPhase: 'preview_ready',
    editorRows: [],
    updateRow: async (rowId, patch) => patches.push({ rowId, patch }),
    renderSelectedVideoProject: () => { renderCount += 1; },
  });

  await listeners.get('click')();

  assertEqual(project._selectedEditorRowId, 'row-news', 'Expected newspaper action to select the clicked row');
  assertEqual(project._previewSeekTime, 12.5, 'Expected newspaper action to seek to the row start time');
  assertEqual(project._editorEffectTab, 'framing', 'Expected newspaper action to route to newspaper framing controls');
  assertEqual(patches.length, 1, 'Expected newspaper action to persist a row mode patch');
  assertEqual(patches[0].rowId, 'row-news', 'Expected newspaper mode patch to target the clicked row');
  assertEqual(patches[0].patch.mediaMode, 'newspaper', 'Expected newspaper action to persist first-class mediaMode');
  assertEqual(patches[0].patch.media?.kind, 'image', 'Expected newspaper mode to remain image-driven');
  assertEqual(renderCount, 1, 'Expected newspaper action to rerender the selected row editor');
}

function runLayersTabLabelAndSeparationCheck() {
  const layersTab = EDITOR_EFFECT_TABS.find((tab) => tab.id === 'layers');
  assertEqual(layersTab?.label, 'Capas', 'Expected layer section tab to be labeled Capas');

  const row = { id: 'row-1', startTime: 16.76, endTime: 23.3, phrase: 'Fila de prueba', selectedAssetId: 'https://cdn.example.com/custom-1.webp', dust: { enabled: true, type: 'dust-1' } };
  const project = { ...makeProject(), _editorEffectTab: 'global' };
  const detailMarkup = buildEditorDetailRail({ row, project });
  const styles = readVideoProjectsStyles();

  assert(detailMarkup.includes('Proyecto completo'), 'Expected Capas tab to label project-wide controls clearly');
  assert(detailMarkup.includes('Fila seleccionada'), 'Expected Capas tab to label selected-row controls clearly');
  assert(detailMarkup.indexOf('Proyecto completo') < detailMarkup.indexOf('Fila seleccionada'), 'Expected project controls to render before row controls');
  assert(detailMarkup.includes('Aplica a todo el video.'), 'Expected project controls helper copy');
  assert(detailMarkup.includes('Aplica solo a esta fila.'), 'Expected row controls helper copy');
  assert(styles.includes('.video-editor-layer-panel + .video-editor-layer-panel'), 'Expected layer sections to have divider styling');
  assert(styles.includes('border-top: 1px solid rgba(0, 232, 143, 0.45)'), 'Expected layer divider to use the green editorial line');
}

function createSwapThumb(rowId, assetId) {
  const listeners = new Map();
  return {
    dataset: { rowId, assetId },
    classList: { add() {}, remove() {} },
    addEventListener(type, listener) { listeners.set(type, listener); },
    listeners,
  };
}

function createDataTransfer() {
  const data = new Map();
  return {
    effectAllowed: '',
    dropEffect: '',
    setData(type, value) { data.set(type, value); },
    getData(type) { return data.get(type) || ''; },
  };
}

async function runRowImageSwapHydrationCheck() {
  const imageA = createSwapThumb('row-a', 'asset-a.jpg');
  const imageB = createSwapThumb('row-b', 'asset-b.jpg');
  const video = createSwapThumb('row-video', 'video-thumb.jpg');
  const calls = [];
  const swaps = [];
  const hydrated = hydrateRowImageSwapControls({
    root: { querySelectorAll: () => [imageA, imageB, video] },
    editorRows: [
      { id: 'row-a', selectedAssetId: 'asset-a.jpg' },
      { id: 'row-b', selectedAssetId: 'asset-b.jpg' },
      { id: 'row-video', selectedAssetId: 'video-thumb.jpg', media: { kind: 'video-segment' } },
    ],
    updateRow: async (rowId, patch) => calls.push({ rowId, patch }),
    swapRowImages: async (sourceRowId, targetRowId) => swaps.push({ sourceRowId, targetRowId }),
  });
  const transfer = createDataTransfer();

  assertEqual(hydrated, 3, 'Expected every rendered swap thumb to be hydrated');
  imageA.listeners.get('dragstart')({ dataTransfer: transfer, preventDefault() { throw new Error('Image rows should be draggable'); } });
  await imageB.listeners.get('drop')({ dataTransfer: transfer, preventDefault() {} });
  assertEqual(swaps.length, 1, 'Expected an image drop to request one atomic row-image swap');
  assertEqual(swaps[0].sourceRowId, 'row-a', 'Expected swap source row to come from the dragged image');
  assertEqual(swaps[0].targetRowId, 'row-b', 'Expected swap target row to come from the drop target');
  assertEqual(calls.length, 0, 'Expected updateRow fallback not to run when swapRowImages is available');

  video.listeners.get('dragstart')({ dataTransfer: createDataTransfer(), preventDefault() { calls.push({ blocked: true }); } });
  assertEqual(calls.some((call) => call.blocked), true, 'Expected video rows to be blocked from image swap drag');
}

export async function runEditorAssetsTabCheck() {
  runAssetsViewModelCheck();
  runAssetsTabResolutionCheck();
  runAssetsMarkupCheck();
  runAssetsThumbnailStyleCheck();
  runChangeImageNavigationCheck();
  await runNewspaperNavigationHydrationCheck();
  runLayersTabLabelAndSeparationCheck();
  await runRowImageSwapHydrationCheck();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await runEditorAssetsTabCheck();
  console.log('editor-assets-tab-check: ok');
}
