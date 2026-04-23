export function createSubtitlesModeAwareFeature({ handlers, getMode }) {
  const resolveMode = () => (getMode ? getMode() : 'legacy');
  return {
    getMode: resolveMode,
    isLegacyMode: () => resolveMode() === 'legacy',
    isRemoteCoreMode: () => resolveMode() === 'remote-core',
    legacy: handlers,
    'remote-core': handlers,
  };
}

export function createSubtitlesFeature({ api, store, ui, selectors, handlers, getMode }) {
  const modeAware = createSubtitlesModeAwareFeature({ handlers, getMode });
  return {
    onUploadSelected: handlers.onUploadSelected,
    onSourceLanguageChanged: handlers.onSourceLanguageChanged,
    onSaveClicked: handlers.onSaveClicked,
    onReadyClicked: handlers.onReadyClicked,
    onDownloadClicked: handlers.onDownloadClicked,
    onTableInput: handlers.onTableInput,
    onTableClick: handlers.onTableClick,
    pollStatus: handlers.pollStatus,
    renderWorkflow: handlers.renderWorkflow,
    dependencies: {
      api,
      store,
      ui,
      selectors,
    },
    modeAware,
  };
}
