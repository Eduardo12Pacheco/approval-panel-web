export function isVoiceVideoAudioInput(kind, file) {
  if (kind !== 'voice' || !file) return false;
  const type = String(file.type || '').split(';')[0].trim().toLowerCase();
  const name = String(file.name || '').toLowerCase();
  return type === 'video/mp4' || (!type && name.endsWith('.mp4'));
}
