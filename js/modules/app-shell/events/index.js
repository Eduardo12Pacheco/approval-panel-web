export function bindShellEvents({
  bindCore,
  bindRadar,
  bindScripts,
  bindAudio,
  bindSubtitles,
  bindApprovalDialog,
}) {
  bindCore();
  bindRadar();
  bindScripts();
  bindAudio();
  bindSubtitles();
  bindApprovalDialog();
}
