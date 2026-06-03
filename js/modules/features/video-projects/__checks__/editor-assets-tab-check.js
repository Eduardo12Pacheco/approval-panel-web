import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildEditorAssetsViewModel, buildEditorDetailRailViewModel, buildEditorShellViewModel } from '../render/editor-view-model.js';
import { buildEditorAssetsPicker } from '../render/editor-assets-picker.js';
import { buildEditorVideoPicker } from '../render/editor-video-picker.js';
import { EDITOR_EFFECT_TABS, resolveEditorEffectTab } from '../render/editor-effect-tabs.js';
import { buildEditorDetailRail, buildEditorRowsTable } from '../render/editor-markup.js';
import { hydrateEditorPhaseInteractions, hydrateEffectAndAudioControls, hydrateRowImageSwapControls } from '../render/editor-hydration.js';
import { hydrateVideoSelectorControls, lockVideoSelectorPageScroll, unlockVideoSelectorPageScroll } from '../render/video-selector-hydration.js';
import { createRowImageCommands } from '../data/row-image-commands.js';
import { createRowCommands } from '../controller/row-commands.js';

const currentDir = dirname(fileURLToPath(import.meta.url));
const videoProjectsStylesPath = resolve(currentDir, '../../../../../styles/features/video-projects/index.css');
const selectedProjectViewPath = resolve(currentDir, '../render/selected-project-view.js');

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

function getCssRules(styles, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return Array.from(styles.matchAll(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, 'g')), (match) => match?.[1] || '');
}

function assertCssDeclaration(rule, property, expectedValue, message) {
  const match = rule.match(new RegExp(`${property}\\s*:\\s*([^;]+);`));
  assertEqual(match?.[1]?.trim(), expectedValue, message);
}

function assertAnyCssDeclaration(rules, property, expectedValue, message) {
  const found = rules.some((rule) => {
    const match = rule.match(new RegExp(`${property}\\s*:\\s*([^;]+);`));
    return match?.[1]?.trim() === expectedValue;
  });
  assert(found, `${message}: expected at least one rule with ${property}: ${expectedValue}`);
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
  const detailCardRule = getCssRule(styles, '.video-editor-detail__image-card');
  const detailThumbRule = getCssRule(styles, '.video-editor-detail__thumb');

  assertCssDeclaration(mediaRule, 'place-items', 'center', 'Expected asset media wrapper to center thumbnails');
  assertCssDeclaration(imageRule, 'object-fit', 'contain', 'Expected asset thumbnails to preserve full image inside card');
  assertCssDeclaration(imageRule, 'object-position', 'center center', 'Expected asset thumbnails to be visually centered');
  assertCssDeclaration(selectedRule, 'border-color', 'rgba(0, 232, 143, 0.9)', 'Expected selected asset card to use a clear green border');
  assertCssDeclaration(selectedRule, 'box-shadow', '0 0 0 2px rgba(0, 232, 143, 0.28)', 'Expected selected asset card to use a clear green selected halo');
  assertCssDeclaration(detailCardRule, 'max-height', '142px', 'Expected detail rail image card to cap vertical thumbnails');
  assertCssDeclaration(detailCardRule, 'overflow', 'hidden', 'Expected detail rail image card to prevent tall assets pushing tabs down');
  assertCssDeclaration(detailThumbRule, 'object-fit', 'contain', 'Expected detail rail thumbnail to preserve vertical asset aspect ratio');
  assertCssDeclaration(detailThumbRule, 'max-height', '142px', 'Expected detail rail thumbnail to stay compact above settings tabs');
}

function runProjectCardBottomAnchoringStyleCheck() {
  const styles = readVideoProjectsStyles();
  const cardRules = getCssRules(styles, '.video-project-card');
  const bodyRules = getCssRules(styles, '.video-project-card__body');

  assertAnyCssDeclaration(cardRules, 'grid-template-rows', 'auto 1fr auto', 'Expected project cards to reserve flexible space between long titles and bottom actions');
  assertAnyCssDeclaration(cardRules, 'align-content', 'stretch', 'Expected project cards to stretch rows so metadata/actions can anchor to the bottom');
  assertAnyCssDeclaration(bodyRules, 'align-self', 'end', 'Expected project card image/info block to stay attached to the bottom action area');
}

function runPreviewSeekCaptureGuardSourceCheck() {
  const source = readFileSync(selectedProjectViewPath, 'utf8');
  assert(source.includes('_skipNextPreviewSeekCapture'), 'Expected selected project rerender to support skipping stale preview seek capture');
  assert(source.includes('delete project._skipNextPreviewSeekCapture'), 'Expected stale preview seek capture guard to be one-shot');
  assert(source.includes('captureCompositionPreviewSeekTime(project)'), 'Expected normal rerenders to keep capturing the live preview seek time');
}

function runEditorShellSelectionFallsBackToPreviewTimeCheck() {
  const editorRows = [
    { id: 'row-1', startTime: 0, endTime: 4, effectiveEndTime: 4, phrase: 'Primera fila' },
    { id: 'row-9', startTime: 43.78, endTime: 47.36, effectiveEndTime: 47.36, phrase: 'Fila nueve' },
  ];
  const shell = buildEditorShellViewModel(
    { _previewSeekTime: 45.25 },
    { editorRows, selectedRowId: null },
  );

  assertEqual(shell.activeSelectedRowId, 'row-9', 'Expected editor shell rerender to select the row containing the preserved preview time');
  assertEqual(shell.selectedRow?.phrase, 'Fila nueve', 'Expected editor shell detail rail not to fall back to the first row when preview time points elsewhere');
  assertEqual(shell.selectedRowIndex, 1, 'Expected editor shell selected index to match the preview-time row');

  const invalidSelectionShell = buildEditorShellViewModel(
    { _previewSeekTime: 45.25 },
    { editorRows, selectedRowId: 'missing-row' },
  );
  assertEqual(invalidSelectionShell.activeSelectedRowId, 'row-9', 'Expected invalid selected row ids to recover from the preserved preview time instead of falling back to row one');

  const explicitSelectionShell = buildEditorShellViewModel(
    { _previewSeekTime: 45.25 },
    { editorRows, selectedRowId: 'row-1' },
  );
  assertEqual(explicitSelectionShell.activeSelectedRowId, 'row-1', 'Expected a valid explicit selected row to win over preview-time fallback');
}

function runVideoSelectorViewportModalCheck() {
  const row = { id: 'row-video', startTime: 1025, endTime: 1030, effectiveEndTime: 1030, phrase: 'Fila con scroll' };
  const markup = buildEditorVideoPicker({
    row,
    videos: [{ id: 'video-a', src: 'https://cdn.example.com/a.mp4', title: 'Video A', durationSeconds: 8 }],
    selector: { videoId: 'video-a', sourceInSeconds: 0, durationSeconds: 5, sourceOutSeconds: 5, windowLeftPercent: 0, windowWidthPercent: 62.5 },
  });
  const modalOpenTag = markup.match(/<section class="video-editor-video-selector"[^>]*>/)?.[0] || '';
  const styles = readVideoProjectsStyles();
  const backdropRule = getCssRule(styles, '.video-editor-video-selector__backdrop');
  const modalRule = getCssRule(styles, '.video-editor-video-selector');
  const scrollLockRule = getCssRule(styles, '.video-editor-video-selector--scroll-locked');

  assert(modalOpenTag, 'Expected video selector modal markup to render');
  assert(!/style=/.test(modalOpenTag), 'Expected fixed modal position not to be calculated inline from document scroll');
  assertCssDeclaration(backdropRule, 'position', 'fixed', 'Expected video selector backdrop to be fixed to the viewport');
  assertCssDeclaration(backdropRule, 'inset', '0', 'Expected video selector backdrop to cover the viewport');
  assertCssDeclaration(backdropRule, 'height', '100dvh', 'Expected video selector backdrop to use viewport height');
  assertCssDeclaration(modalRule, 'position', 'fixed', 'Expected video selector modal to be fixed to the viewport');
  assertCssDeclaration(modalRule, 'top', '50% !important', 'Expected video selector modal top to be viewport-centered');
  assertCssDeclaration(modalRule, 'left', '50% !important', 'Expected video selector modal left to be viewport-centered');
  assertCssDeclaration(modalRule, 'transform', 'translate(-50%, -50%) !important', 'Expected video selector modal transform to center in viewport');
  assertCssDeclaration(modalRule, 'max-height', 'calc(100dvh - 36px)', 'Expected video selector modal to stay within visible viewport height');
  assertCssDeclaration(modalRule, 'overflow-y', 'auto', 'Expected video selector modal content to scroll internally when constrained');
  assertCssDeclaration(scrollLockRule, 'overflow', 'hidden !important', 'Expected video selector scroll lock class to prevent page scroll');
}

function createClassList() {
  const values = new Set();
  return {
    add(value) { values.add(value); },
    remove(value) { values.delete(value); },
    contains(value) { return values.has(value); },
  };
}

function createScrollLockDocument() {
  const doc = {
    documentElement: { style: {}, dataset: {}, classList: createClassList(), scrollTop: 0 },
    body: { style: {}, dataset: {}, classList: createClassList(), scrollTop: 0 },
    defaultView: {
      scrollY: 728,
      restoredScroll: null,
      scrollTo(x, y) { this.restoredScroll = { x, y }; },
    },
  };
  return doc;
}

function runVideoSelectorScrollLockLifecycleCheck() {
  const doc = createScrollLockDocument();

  assertEqual(lockVideoSelectorPageScroll(doc), true, 'Expected selector open to apply a page scroll lock');
  assert(doc.documentElement.classList.contains('video-editor-video-selector--scroll-locked'), 'Expected html element to receive the selector scroll lock class');
  assert(doc.body.classList.contains('video-editor-video-selector--scroll-locked'), 'Expected body element to receive the selector scroll lock class');
  assertEqual(doc.documentElement.style.overflow, 'hidden', 'Expected html overflow to be hidden while selector is open');
  assertEqual(doc.body.style.overflow, 'hidden', 'Expected body overflow to be hidden while selector is open');
  assertEqual(doc.body.style.position, 'fixed', 'Expected body position lock to keep the page from moving behind the selector');
  assertEqual(doc.body.style.top, '-728px', 'Expected body lock to preserve the current scroll offset');

  assertEqual(unlockVideoSelectorPageScroll(doc), true, 'Expected selector close to remove a page scroll lock');
  assertEqual(doc.documentElement.classList.contains('video-editor-video-selector--scroll-locked'), false, 'Expected html scroll lock class to be removed on close');
  assertEqual(doc.body.classList.contains('video-editor-video-selector--scroll-locked'), false, 'Expected body scroll lock class to be removed on close');
  assertEqual(doc.documentElement.style.overflow, '', 'Expected html overflow to be restored on close');
  assertEqual(doc.body.style.overflow, '', 'Expected body overflow to be restored on close');
  assertEqual(doc.body.style.position, '', 'Expected body position to be restored on close');
  assertEqual(doc.body.style.top, '', 'Expected body top offset to be restored on close');
  assertEqual(doc.defaultView.restoredScroll.y, 728, 'Expected close to restore the pre-modal scroll position');
}

function runChangeImageNavigationCheck() {
  const row = { id: 'row-1', startTime: 16.76, endTime: 23.3, phrase: 'Fila de prueba', selectedAssetId: 'https://cdn.example.com/custom-1.webp' };
  const tableMarkup = buildEditorRowsTable([row], { selectedRowId: 'row-1', project: makeProject() });
  const detailMarkup = buildEditorDetailRail({ row, project: makeProject() });

  assert(tableMarkup.includes('data-action="open-assets-tab"'), 'Expected table Cambiar action to open Imágenes tab');
  assert(tableMarkup.includes('data-content-type-switch="image"'), 'Expected table Imagen action to remember pending image mode without mutating immediately');
  assert(tableMarkup.includes('data-content-type-switch="video"'), 'Expected table Video action to remember pending video mode without mutating immediately');
  assert(tableMarkup.includes('data-content-type-switch="newspaper"'), 'Expected table Periódico action to remember pending newspaper mode without mutating immediately');
  assert(tableMarkup.includes('data-action="open-newspaper-tab"'), 'Expected table to expose Cambiar a periódico as a first-class row action');
  assert(tableMarkup.includes('Cambiar a periódico'), 'Expected newspaper row action to use the requested visible label');
  assert(!tableMarkup.includes('data-action="upload-row-image"'), 'Expected table Cambiar action not to open file picker');
  assert(!detailMarkup.includes('Cambiar imagen'), 'Expected detail rail image button to be removed');
  assert(detailMarkup.includes('video-editor-detail__summary'), 'Expected detail rail to render phrase/time and image summary');
  assert(detailMarkup.includes('video-editor-detail__image-card'), 'Expected detail rail to render larger right-side image card');
  assert(detailMarkup.includes('video-editor-detail__thumb'), 'Expected detail rail to keep row image as larger context image');
  assert(detailMarkup.includes('data-start-time="16.76"'), 'Expected detail rail content type buttons to carry the selected row start time');

  const videoDetailMarkup = buildEditorDetailRail({
    row: { ...row, media: { kind: 'video-segment', sourceVideoSrc: 'https://cdn.example.com/video.mp4' } },
    project: makeProject(),
  });
  assert(videoDetailMarkup.includes('video-editor-row__video-card--detail'), 'Expected detail rail video rows to show the same video card placeholder as the table');
  assert(videoDetailMarkup.includes('video-editor-row__video-badge'), 'Expected detail rail video rows to show a Video badge');
  assert(!videoDetailMarkup.includes('video-editor-detail__thumb'), 'Expected detail rail video rows not to show the stale selected image thumbnail');
}

function createSelectableRow(rowId, startTime) {
  const listeners = new Map();
  return {
    dataset: { rowId, startTime: String(startTime) },
    classList: { toggle() {} },
    setAttribute() {},
    addEventListener(type, listener) { listeners.set(type, listener); },
    listeners,
  };
}

async function runTableRowSelectionKeepsDetailRailAlignedCheck() {
  const rowA = createSelectableRow('row-1', 0);
  const rowB = createSelectableRow('row-2', 5);
  const markerA = { dataset: { rowId: 'row-1' }, classList: { toggle() {} } };
  const markerB = { dataset: { rowId: 'row-2' }, classList: { toggle() {} } };
  const detailHost = {
    innerHTML: '',
    querySelectorAll() { return []; },
    querySelector() { return null; },
  };
  const project = {
    ...makeProject(),
    _selectedEditorRowId: 'row-1',
    _previewSeekTime: 0,
    _globalAudio: {},
  };
  const editorRows = [
    { id: 'row-1', startTime: 0, endTime: 5, effectiveEndTime: 5, phrase: 'Primera fila', selectedAssetId: 'https://cdn.example.com/selected-1.jpg' },
    { id: 'row-2', startTime: 5, endTime: 10, effectiveEndTime: 10, phrase: 'Segunda fila', selectedAssetId: 'https://cdn.example.com/custom-1.webp' },
  ];
  let renderCount = 0;
  const root = {
    ownerDocument: { body: {}, activeElement: null },
    querySelector(selector) {
      if (selector === '.video-editor-shell__right') return detailHost;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '.video-editor-row[data-row-id]') return [rowA, rowB];
      if (selector === '.video-preview-timeline__marker') return [markerA, markerB];
      if (selector === '.video-preview-timeline__marker[data-row-id]') return [markerA, markerB];
      return [];
    },
  };

  hydrateEditorPhaseInteractions({
    root,
    project,
    editorPhase: 'preview_ready',
    editorRows,
    renderSelectedVideoProject: () => { renderCount += 1; },
  });

  rowB.listeners.get('click')({ target: { closest: () => null } });

  assertEqual(project._selectedEditorRowId, 'row-2', 'Expected table row click to select the clicked row');
  assertEqual(project._previewSeekTime, 5, 'Expected table row click to seek to the clicked row start time');
  assertEqual(renderCount, 0, 'Expected table row click to avoid full editor rerender');
  assert(detailHost.innerHTML.includes('Segunda fila'), 'Expected detail rail to rerender with clicked row content');
  assert(detailHost.innerHTML.includes('data-row-id="row-2"'), 'Expected detail rail actions to target the clicked row');
  assert(!detailHost.innerHTML.includes('data-row-id="row-1"'), 'Expected detail rail actions not to keep stale first-row targets');
}

async function runNewspaperNavigationHydrationCheck() {
  const listeners = new Map();
  const newspaperButton = {
    dataset: { rowId: 'row-news', startTime: '12.5', contentTypeSwitch: 'newspaper', targetEffectTab: 'content' },
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
    updateRow: async (rowId, patch, options) => patches.push({ rowId, patch, options }),
    renderSelectedVideoProject: () => { renderCount += 1; },
  });

  await listeners.get('click')();

  assertEqual(project._selectedEditorRowId, 'row-news', 'Expected newspaper action to select the clicked row');
  assertEqual(project._previewSeekTime, 12.5, 'Expected newspaper action to seek to the row start time');
  assertEqual(project._editorEffectTab, 'content', 'Expected newspaper action to route to the asset selector before assignment');
  assertEqual(project._editorContentTypeByRow?.['row-news'], 'newspaper', 'Expected newspaper action to remember newspaper mode before assignment');
  assertEqual(patches.length, 0, 'Expected newspaper navigation not to persist a row mode patch before an image is chosen');
  assertEqual(renderCount, 0, 'Expected newspaper action to avoid a full editor rerender');
}

async function runContentTypeSwitcherHydrationCheck() {
  const listeners = new Map();
  const videoButton = {
    dataset: { rowId: 'row-content', contentTypeSwitch: 'video', targetEffectTab: 'content', startTime: '4.25' },
    addEventListener(type, listener) { listeners.set(type, listener); },
  };
  const project = { _selectedEditorRowId: null, _editorEffectTab: 'layers', _previewSeekTime: 0 };
  let renderCount = 0;

  const root = {
    querySelectorAll(selector) {
      if (selector === '[data-action="open-videos-tab"]') return [videoButton];
      return [];
    },
    querySelector() { return null; },
  };

  hydrateEditorPhaseInteractions({
    root,
    project,
    editorPhase: 'preview_ready',
    editorRows: [],
    renderSelectedVideoProject: () => { renderCount += 1; },
  });

  listeners.get('click')();

  assertEqual(project._selectedEditorRowId, 'row-content', 'Expected content type switch to select the clicked row');
  assertEqual(project._previewSeekTime, 4.25, 'Expected content type switch to seek to row start time when available');
  assertEqual(project._editorEffectTab, 'content', 'Expected content type switch to keep the Contenido panel open');
  assertEqual(project._editorContentTypeByRow?.['row-content'], 'video', 'Expected video switch to remember video picker visibility before assignment');
  assertEqual(renderCount, 0, 'Expected video content type switch to avoid a full editor rerender');
}

async function runContentTypeSwitcherKeepsCurrentPreviewTimeCheck() {
  const listeners = new Map();
  const newspaperButton = {
    dataset: { rowId: 'row-content', contentTypeSwitch: 'newspaper', targetEffectTab: 'content', startTime: '4.25' },
    addEventListener(type, listener) { listeners.set(type, listener); },
  };
  const project = { _selectedEditorRowId: 'row-content', _editorEffectTab: 'layers', _previewSeekTime: 5.5 };
  const editorRows = [{ id: 'row-content', startTime: 4.25, endTime: 9.75, effectiveEndTime: 9.75, phrase: 'Fila actual' }];
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
    editorRows,
    renderSelectedVideoProject: () => { renderCount += 1; },
  });

  listeners.get('click')();

  assertEqual(project._selectedEditorRowId, 'row-content', 'Expected content type switch to keep the current row selected');
  assertEqual(project._previewSeekTime, 5.5, 'Expected content type switch to preserve current preview time when already inside the target row');
  assertEqual(project._editorContentTypeByRow?.['row-content'], 'newspaper', 'Expected newspaper switch to remember pending newspaper mode');
  assertEqual(renderCount, 0, 'Expected content type switch to avoid a full editor rerender');
}

async function runPendingImageAssignmentAppliesRememberedMediaModeCheck() {
  const project = { _editorContentTypeByRow: { 'row-news': 'newspaper', 'row-image': 'image' } };
  const patches = [];
  const toasts = [];
  const commands = createRowImageCommands({
    api: {},
    ui: { toast: (message) => toasts.push(message) },
    getProject: () => project,
    resolveProjectKey: () => 'draft-1',
    renderSelectedVideoProject: () => {},
    updateRow: async (rowId, patch, options) => patches.push({ rowId, patch, options }),
  });

  await commands.assignExistingImageToRow('row-news', 'https://cdn.example.com/news.jpg');
  await commands.assignExistingImageToRow('row-image', 'https://cdn.example.com/image.jpg');

  assertEqual(patches[0].rowId, 'row-news', 'Expected pending newspaper assignment to target the requested row');
  assertEqual(patches[0].patch.selectedAssetId, 'https://cdn.example.com/news.jpg', 'Expected newspaper assignment to persist selected image');
  assertEqual(patches[0].patch.mediaMode, 'newspaper', 'Expected pending newspaper assignment to persist newspaper mode only on asset acceptance');
  assertEqual(patches[0].patch.media?.kind, 'image', 'Expected pending newspaper assignment to remain image-driven');
  assertEqual(patches[0].options?.preserveSelection, true, 'Expected pending newspaper assignment to preserve selected row and preview seek during rerender');
  assertEqual(patches[1].patch.mediaMode, 'image', 'Expected pending image assignment to convert video/newspaper rows back to image mode');
  assertEqual(patches[1].options?.preserveSelection, true, 'Expected pending image assignment to preserve selected row and preview seek during rerender');
  assertEqual(project._editorContentTypeByRow?.['row-news'], undefined, 'Expected pending newspaper mode to clear after assignment');
  assertEqual(project._editorContentTypeByRow?.['row-image'], undefined, 'Expected pending image mode to clear after assignment');
  assertEqual(toasts.length, 2, 'Expected assignment toast to remain user-visible after each accepted image');
}

async function runPreserveSelectionKeepsCurrentPreviewSeekCheck() {
  const project = {
    _selectedEditorRowId: 'row-2',
    _previewSeekTime: 37.5,
    _editorRows: [
      { id: 'row-1', startTime: 0, endTime: 12.5, selectedAssetId: 'old-1.jpg' },
      { id: 'row-2', startTime: 12.5, endTime: 50, selectedAssetId: 'old-2.jpg' },
    ],
    editor_state: { phase: 'preview_ready', composition_hash: 'previous' },
  };
  let renderCount = 0;
  let saveTimer = null;
  const commands = createRowCommands({
    store: { getState: () => ({ selectedVideoProject: project }) },
    ui: { toast() {} },
    persistEditorState: async () => {},
    isApprovalServiceMode: () => false,
    queueApprovalSnapshotOperations: async () => {},
    scheduleApprovalMotionPersistence: () => {},
    createMotionDraft: () => {},
    updateSelectedVideoProjectCompositionPreview: () => {},
    renderSelectedVideoProject: () => {
      renderCount += 1;
      project._selectedEditorRowId = 'row-1';
      project._previewSeekTime = 0;
    },
    getSaveTimer: () => saveTimer,
    setSaveTimer: (timer) => { saveTimer = timer; },
    cancelPendingEditorSave: () => { if (saveTimer) clearTimeout(saveTimer); saveTimer = null; },
    beforeMutate: () => {},
    debounceMs: 1000,
  });

  await commands.updateRow('row-2', { selectedAssetId: 'new-2.jpg' }, { preserveSelection: true });
  if (saveTimer) clearTimeout(saveTimer);

  assertEqual(renderCount, 1, 'Expected image assignment to rerender the editor once');
  assertEqual(project._selectedEditorRowId, 'row-2', 'Expected image assignment to keep the edited row selected after rerender');
  assertEqual(project._previewSeekTime, 37.5, 'Expected image assignment to keep the current timeline position, not jump to the row start');
}

async function runApprovalImageAssignmentKeepsCurrentPreviewSeekCheck() {
  const project = {
    _selectedEditorRowId: 'row-9',
    _previewSeekTime: 45.25,
    _editorRows: [
      { id: 'row-1', startTime: 0, endTime: 12.5, selectedAssetId: 'old-1.jpg', mediaMode: 'image' },
      { id: 'row-9', startTime: 43.78, endTime: 47.36, selectedAssetId: 'old-9.jpg', mediaMode: 'newspaper', media: { kind: 'image' } },
    ],
    editor_state: {
      phase: 'preview_ready',
      approval_contract_snapshot: { contractVersion: 1, assets: {} },
      composition_hash: 'previous',
    },
  };
  let renderCount = 0;
  const commands = createRowCommands({
    store: { getState: () => ({ selectedVideoProject: project }) },
    ui: { toast() {} },
    persistEditorState: async () => {},
    isApprovalServiceMode: () => true,
    queueApprovalSnapshotOperations: async () => {},
    scheduleApprovalMotionPersistence: () => {},
    createMotionDraft: () => {},
    updateSelectedVideoProjectCompositionPreview: () => {},
    renderSelectedVideoProject: () => {
      renderCount += 1;
      project._selectedEditorRowId = 'row-1';
      project._previewSeekTime = 0;
    },
    getSaveTimer: () => null,
    setSaveTimer: () => {},
    cancelPendingEditorSave: () => {},
    beforeMutate: () => {},
    debounceMs: 1000,
  });

  await commands.updateRow('row-9', { selectedAssetId: 'newspaper-9.jpg', mediaMode: 'newspaper', media: { kind: 'image' } }, { preserveSelection: true });

  assertEqual(renderCount, 1, 'Expected Approval image assignment to rerender the editor once');
  assertEqual(project._selectedEditorRowId, 'row-9', 'Expected Approval newspaper image selection to keep the edited row selected after rerender');
  assertEqual(project._previewSeekTime, 45.25, 'Expected Approval newspaper image selection to keep the current timeline position, not jump to the beginning');
}

async function runRightRailVideoContentSwitchKeepsRowSelectionCheck() {
  const rowA = createSelectableRow('seg-001', 0);
  const rowB = createSelectableRow('seg-002', 6.54);
  const markerA = { dataset: { rowId: 'seg-001' }, classList: { toggle() {} } };
  const markerB = { dataset: { rowId: 'seg-002' }, classList: { toggle() {} } };
  const listeners = new Map();
  const videoCardListeners = new Map();
  const videoButton = {
    dataset: { rowId: 'seg-002', contentTypeSwitch: 'video', targetEffectTab: 'content', startTime: '6.54' },
    addEventListener(type, listener) { listeners.set(type, listener); },
  };
  const videoCard = {
    dataset: { rowId: 'seg-002', videoId: 'video-a', videoSrc: 'https://cdn.example.com/a.mp4', videoDuration: '8' },
    addEventListener(type, listener) { videoCardListeners.set(type, listener); },
  };
  const detailHost = {
    innerHTML: '',
    querySelectorAll(selector) {
      if (selector === '[data-action="open-videos-tab"]') return [videoButton];
      if (selector === '[data-action="open-video-selector"]') return detailHost.innerHTML.includes('data-action="open-video-selector"') ? [videoCard] : [];
      return [];
    },
    querySelector() { return null; },
  };
  const project = {
    ...makeProject(),
    _selectedEditorRowId: 'seg-002',
    _previewSeekTime: 6.54,
    _globalAudio: {},
    video_assets: [{ id: 'video-a', src: 'https://cdn.example.com/a.mp4', title: 'Video A', durationSeconds: 8 }],
  };
  const editorRows = [
    { id: 'seg-001', startTime: 0, endTime: 6.54, effectiveEndTime: 6.54, phrase: 'Primera fila', selectedAssetId: 'https://cdn.example.com/selected-1.jpg' },
    { id: 'seg-002', startTime: 6.54, endTime: 12, effectiveEndTime: 12, phrase: 'Segunda fila', selectedAssetId: 'https://cdn.example.com/custom-1.webp' },
  ];
  project._editorRows = editorRows;
  let renderCount = 0;
  const root = {
    ownerDocument: { body: {}, activeElement: null },
    querySelector(selector) {
      if (selector === '.video-editor-shell__right') return detailHost;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '.video-editor-row[data-row-id]') return [rowA, rowB];
      if (selector === '.video-preview-timeline__marker') return [markerA, markerB];
      if (selector === '.video-preview-timeline__marker[data-row-id]') return [markerA, markerB];
      if (selector === '[data-action="open-videos-tab"]') return [videoButton];
      return [];
    },
  };

  hydrateEditorPhaseInteractions({
    root,
    project,
    editorPhase: 'preview_ready',
    editorRows,
    renderSelectedVideoProject: () => { renderCount += 1; project._selectedEditorRowId = 'seg-001'; project._previewSeekTime = 0; },
  });

  listeners.get('click')();

  assertEqual(project._selectedEditorRowId, 'seg-002', 'Expected right-rail video switch to keep row 2 selected');
  assertEqual(project._previewSeekTime, 6.54, 'Expected right-rail video switch to keep row 2 start seek time');
  assertEqual(renderCount, 0, 'Expected right-rail video switch not to call the full selected-project renderer');
  assert(detailHost.innerHTML.includes('Segunda fila'), 'Expected detail rail to stay on row 2 content');
  assert(detailHost.innerHTML.includes('data-row-id="seg-002"'), 'Expected refreshed detail rail actions to target row 2');
  assert(!detailHost.innerHTML.includes('data-row-id="seg-001"'), 'Expected refreshed detail rail actions not to target row 1');
  assert(detailHost.innerHTML.includes('Biblioteca de videos'), 'Expected video switch to show the row 2 video library');

  videoCardListeners.get('click')();

  assertEqual(project._selectedEditorRowId, 'seg-002', 'Expected row 2 video card click to keep row 2 selected');
  assertEqual(project._previewSeekTime, 6.54, 'Expected row 2 video card click to keep the row 2 preview seek time');
  assertEqual(project._videoSelector?.videoId, 'video-a', 'Expected row 2 video card click to open the selector for the clicked video');
  assertEqual(project._videoSelector?.rowId, 'seg-002', 'Expected opened video selector state to be owned by row 2');
  assertEqual(renderCount, 0, 'Expected row 2 video card click not to call the full selected-project renderer');
  assert(detailHost.innerHTML.includes('data-video-selector-modal'), 'Expected row 2 video card click to render the selector preview');
  assert(detailHost.innerHTML.includes('data-row-id="seg-002"'), 'Expected selector preview to target row 2');
}

function runVideoSelectorOwnerRowGuardCheck() {
  const videos = [{ id: 'video-a', src: 'https://cdn.example.com/a.mp4', title: 'Video A', durationSeconds: 12 }];
  const selector = { rowId: 'seg-003', videoId: 'video-a', sourceInSeconds: 0, durationSeconds: 4, sourceOutSeconds: 4, windowLeftPercent: 0, windowWidthPercent: 33.33, ok: true };
  const rowOneMarkup = buildEditorVideoPicker({ row: { id: 'seg-001', startTime: 0, endTime: 4 }, videos, selector });
  const rowThreeMarkup = buildEditorVideoPicker({ row: { id: 'seg-003', startTime: 8, endTime: 12 }, videos, selector });

  assert(!rowOneMarkup.includes('data-video-selector-modal'), 'Expected selector modal not to render for a non-owner row');
  assert(!rowOneMarkup.includes('data-action="commit-video-segment"'), 'Expected non-owner row not to expose a stale commit button');
  assert(rowThreeMarkup.includes('data-video-selector-modal'), 'Expected selector modal to render for its owner row');
  assert(rowThreeMarkup.includes('data-row-id="seg-003"'), 'Expected owner row selector markup to keep row 3 as target');
}

async function runVideoSelectorRejectsMismatchedCommitCheck() {
  const commitListeners = new Map();
  const commitButton = {
    dataset: { rowId: 'seg-001', videoId: 'video-a', sourceIn: '1.5' },
    closest(selector) { return selector === '[data-video-selector-modal]' ? { dataset: { rowId: 'seg-001' } } : null; },
    addEventListener(type, listener) { commitListeners.set(type, listener); },
  };
  const root = {
    ownerDocument: {
      body: { dataset: {}, style: {}, classList: { add() {}, remove() {} }, querySelector() { return null; } },
      documentElement: { dataset: {}, style: {}, classList: { add() {}, remove() {} } },
      defaultView: { scrollY: 0, scrollTo() {} },
    },
    querySelectorAll(selector) {
      if (selector === '[data-action="commit-video-segment"]') return [commitButton];
      return [];
    },
    querySelector() { return null; },
  };
  const project = {
    ...makeProject(),
    _selectedEditorRowId: 'seg-003',
    _videoSelector: { rowId: 'seg-003', videoId: 'video-a', sourceInSeconds: 1.5 },
    _editorRows: [{ id: 'seg-001', startTime: 0 }, { id: 'seg-003', startTime: 8 }],
    video_assets: [{ id: 'video-a', src: 'https://cdn.example.com/a.mp4', durationSeconds: 12 }],
  };
  const toasts = [];
  let assignCount = 0;
  let renderCount = 0;
  hydrateVideoSelectorControls({
    root,
    project,
    editorRows: project._editorRows,
    assignVideoSegmentToRow: async () => { assignCount += 1; },
    renderSelectedVideoProject: () => { renderCount += 1; },
    showToast: (message) => toasts.push(message),
  });

  await commitListeners.get('click')();

  assertEqual(assignCount, 0, 'Expected mismatched selector commit not to assign video to the stale row');
  assertEqual(project._videoSelector, null, 'Expected mismatched selector commit to close stale selector state');
  assertEqual(renderCount, 1, 'Expected mismatched selector commit to rerender after closing stale selector');
  assert(toasts.some((message) => message.includes('cambió de fila')), 'Expected mismatched selector commit to explain the stale selector');
}

async function runAcceptVideoSegmentKeepsSelectedRowCheck() {
  const videoCardListeners = new Map();
  const commitListeners = new Map();
  const videoCard = {
    dataset: { rowId: 'seg-010', videoId: 'video-a', videoSrc: 'https://cdn.example.com/a.mp4', videoDuration: '12' },
    addEventListener(type, listener) { videoCardListeners.set(type, listener); },
  };
  const commitButton = {
    dataset: { rowId: 'seg-010', videoId: 'video-a', sourceIn: '1.5' },
    addEventListener(type, listener) { commitListeners.set(type, listener); },
  };
  const detailHost = {
    innerHTML: '',
    querySelectorAll(selector) {
      if (selector === '[data-action="open-video-selector"]') return detailHost.innerHTML.includes('data-action="open-video-selector"') ? [videoCard] : [];
      if (selector === '[data-action="commit-video-segment"]') return detailHost.innerHTML.includes('data-action="commit-video-segment"') ? [commitButton] : [];
      return [];
    },
    querySelector() { return null; },
  };
  const editorRows = [
    { id: 'seg-001', startTime: 0, endTime: 6.54, effectiveEndTime: 6.54, phrase: 'Primera fila', selectedAssetId: 'https://cdn.example.com/selected-1.jpg' },
    { id: 'seg-010', startTime: 90.25, endTime: 96, effectiveEndTime: 96, phrase: 'Décima fila', selectedAssetId: 'https://cdn.example.com/custom-1.webp' },
  ];
  const project = {
    ...makeProject(),
    _selectedEditorRowId: 'seg-010',
    _previewSeekTime: 90.25,
    _globalAudio: {},
    _editorRows: editorRows,
    _editorContentTypeByRow: { 'seg-010': 'video' },
    video_assets: [{ id: 'video-a', src: 'https://cdn.example.com/a.mp4', title: 'Video A', durationSeconds: 12 }],
  };
  let renderCount = 0;
  let previewUpdateCount = 0;
  const assignVideoSegmentToRow = async (rowId) => {
    project._editorRows = project._editorRows.map((row) => (row.id === rowId
      ? { ...row, media: { kind: 'video-segment', sourceVideoAssetId: 'video-a', sourceVideoSrc: 'https://cdn.example.com/a.mp4', sourceInSeconds: 1.5, durationSeconds: 5.75 } }
      : row));
    renderCount += 1;
    project._selectedEditorRowId = 'seg-001';
    project._previewSeekTime = 0;
    return true;
  };
  const renderSelectedVideoProject = () => {
    renderCount += 1;
    project._selectedEditorRowId = 'seg-001';
    project._previewSeekTime = 0;
  };
  const refreshEditorSelectionOnly = (rowId) => {
    const currentEditorRows = project._editorRows;
    const rowIndex = currentEditorRows.findIndex((row) => row.id === rowId);
    detailHost.innerHTML = buildEditorDetailRail({ row: currentEditorRows[rowIndex], project, rowIndex });
    hydrateVideoSelectorControls({
      root: detailHost,
      project,
      editorRows: currentEditorRows,
      renderSelectedVideoProject,
      refreshEditorSelectionOnly,
      assignVideoSegmentToRow,
      updateSelectedVideoProjectCompositionPreview: () => { previewUpdateCount += 1; },
    });
  };

  refreshEditorSelectionOnly('seg-010');
  videoCardListeners.get('click')();
  await commitListeners.get('click')();

  assertEqual(project._selectedEditorRowId, 'seg-010', 'Expected accepted row 10 to remain selected after video assignment render side effects');
  assertEqual(project._previewSeekTime, 90.25, 'Expected preview seek to remain on row 10 start time after accepting video');
  assertEqual(project._previewRowSelectionLockRowId, 'seg-010', 'Expected accepting video to hold a short preview auto-selection lock on the accepted row');
  assertEqual(project._editorRows[1].media?.kind, 'video-segment', 'Expected row 10 to keep the accepted video segment assignment');
  assertEqual(project._videoSelector, null, 'Expected selector modal state to close after accepting video');
  assertEqual(previewUpdateCount, 1, 'Expected accepting video to refresh the composition preview once');
  assert(detailHost.innerHTML.includes('Décima fila'), 'Expected detail rail to stay aligned with row 10 after accepting video');
  assert(detailHost.innerHTML.includes('data-row-id="seg-010"'), 'Expected detail rail actions to keep targeting accepted row 10');
  assert(!detailHost.innerHTML.includes('data-row-id="seg-001"'), 'Expected detail rail actions not to reset to row 1 after accepting video');
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

async function runDustApplyAllHydrationCheck() {
  const listeners = new Map();
  const button = {
    dataset: { dustType: 'dust-2' },
    disabled: false,
    addEventListener(type, listener) { listeners.set(type, listener); },
  };
  const calls = [];

  hydrateEffectAndAudioControls({
    root: {
      querySelectorAll(selector) {
        return selector === '[data-action="apply-row-dust-all"]' ? [button] : [];
      },
    },
    project: {},
    applyDustToAllImageRows: async (dustType) => calls.push(dustType),
  });
  await listeners.get('click')({ preventDefault() {} });

  assertEqual(calls.length, 1, 'Expected apply-all dust click to invoke the batch command once');
  assertEqual(calls[0], 'dust-2', 'Expected apply-all dust click to use the selected dust value from the button');

  button.disabled = true;
  await listeners.get('click')({ preventDefault() {} });
  assertEqual(calls.length, 1, 'Expected disabled apply-all dust button not to invoke the batch command');
}

export async function runEditorAssetsTabCheck() {
  runAssetsViewModelCheck();
  runAssetsTabResolutionCheck();
  runAssetsMarkupCheck();
  runAssetsThumbnailStyleCheck();
  runProjectCardBottomAnchoringStyleCheck();
  runPreviewSeekCaptureGuardSourceCheck();
  runEditorShellSelectionFallsBackToPreviewTimeCheck();
  runVideoSelectorViewportModalCheck();
  runVideoSelectorScrollLockLifecycleCheck();
  runChangeImageNavigationCheck();
  await runTableRowSelectionKeepsDetailRailAlignedCheck();
  await runNewspaperNavigationHydrationCheck();
  await runContentTypeSwitcherHydrationCheck();
  await runContentTypeSwitcherKeepsCurrentPreviewTimeCheck();
  await runPendingImageAssignmentAppliesRememberedMediaModeCheck();
  await runPreserveSelectionKeepsCurrentPreviewSeekCheck();
  await runApprovalImageAssignmentKeepsCurrentPreviewSeekCheck();
  await runRightRailVideoContentSwitchKeepsRowSelectionCheck();
  runVideoSelectorOwnerRowGuardCheck();
  await runVideoSelectorRejectsMismatchedCommitCheck();
  await runAcceptVideoSegmentKeepsSelectedRowCheck();
  runLayersTabLabelAndSeparationCheck();
  await runDustApplyAllHydrationCheck();
  await runRowImageSwapHydrationCheck();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await runEditorAssetsTabCheck();
  console.log('editor-assets-tab-check: ok');
}
