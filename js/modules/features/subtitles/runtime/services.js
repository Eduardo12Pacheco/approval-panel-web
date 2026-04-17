export function createSubtitlesRuntimeServices({ hooks }) {
  return {
    onUploadSelected: hooks.onUploadSelected,
    onSourceLanguageChanged: hooks.onSourceLanguageChanged,
    onSaveClicked: hooks.onSaveClicked,
    onReadyClicked: hooks.onReadyClicked,
    onDownloadClicked: hooks.onDownloadClicked,
    onTableInput: hooks.onTableInput,
    onTableClick: hooks.onTableClick,
    pollStatus: hooks.pollStatus,
    renderWorkflow: hooks.renderWorkflow,
  };
}
