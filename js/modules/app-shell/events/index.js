export function bindShellEvents({
  bindCore,
  bindRadar,
  bindScripts,
  bindAudio,
  bindSubtitles,
  bindApprovalDialog,
}) {
  const binders = [
    ['core', bindCore],
    ['radar', bindRadar],
    ['scripts', bindScripts],
    ['audio', bindAudio],
    ['subtitles', bindSubtitles],
    ['approval dialog', bindApprovalDialog],
  ];

  for (const [name, bind] of binders) {
    try {
      bind();
    } catch (err) {
      console.warn(`Control Panel ${name} event binding skipped:`, err);
    }
  }
}
