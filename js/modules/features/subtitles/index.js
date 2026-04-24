export function createSubtitlesFeature({ api, store, ui, selectors, handlers }) {
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
  };
}
