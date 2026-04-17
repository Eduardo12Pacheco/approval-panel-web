export const REQUIRED_SELECTOR_IDS = [
  'authGate',
  'appShell',
  'authForm',
  'searchInput',
  'countryFilter',
  'sourcesFilter',
  'cards',
  'queueDialog',
  'settingsDialog',
  'sidebarNav',
  'viewApproval',
  'viewScripts',
  'viewAudio',
  'viewSubtitulos',
  'audioRunBtn',
  'subtitleRowsBody',
];

const COMPOSITION_ROOT_IMPORT_PATH = './modules/composition-root.js';
const COMPOSITION_ROOT_BOOT_FN = 'bootCompositionRoot';
const APP_SHELL_IMPORT_PATH = './app-shell.js';
const APP_SHELL_BOOT_FN = 'bootApp';

function assertSelectorContracts(indexHtmlSource, failures) {
  for (const selectorId of REQUIRED_SELECTOR_IDS) {
    if (!indexHtmlSource.includes(`id="${selectorId}"`)) {
      failures.push(`Missing selector contract: #${selectorId}`);
    }
  }
}

function assertBootstrapBoundary(mainJsSource, failures) {
  if (!mainJsSource.includes(COMPOSITION_ROOT_IMPORT_PATH)) {
    failures.push(`main.js must import ${COMPOSITION_ROOT_IMPORT_PATH}`);
  }
  if (!mainJsSource.includes(COMPOSITION_ROOT_BOOT_FN)) {
    failures.push(`main.js must call ${COMPOSITION_ROOT_BOOT_FN}`);
  }
}

function assertCompositionRootBoundary(compositionRootSource, failures) {
  if (!compositionRootSource.includes(APP_SHELL_IMPORT_PATH)) {
    failures.push(`composition-root.js must import ${APP_SHELL_IMPORT_PATH}`);
  }
  if (!compositionRootSource.includes(APP_SHELL_BOOT_FN)) {
    failures.push(`composition-root.js must call ${APP_SHELL_BOOT_FN}`);
  }
}

export function runParityChecklist({ indexHtmlSource, mainJsSource, compositionRootSource }) {
  const failures = [];

  assertSelectorContracts(indexHtmlSource || '', failures);
  assertBootstrapBoundary(mainJsSource || '', failures);
  assertCompositionRootBoundary(compositionRootSource || '', failures);

  return {
    pass: failures.length === 0,
    failures,
  };
}
