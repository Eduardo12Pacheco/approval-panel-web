export function formatCount(value, singular, plural = `${singular}s`) {
  const count = Number(value || 0);
  return `${count} ${count === 1 ? singular : plural}`;
}

export function formatDateLabel(value) {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin fecha';
  return date.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatSeconds(value) {
  const raw = Number(value || 0);
  if (!Number.isFinite(raw)) return '00:00.00';
  const totalCentiseconds = Math.max(0, Math.round(raw * 100));
  const minutes = Math.floor(totalCentiseconds / 6000);
  const seconds = Math.floor((totalCentiseconds % 6000) / 100);
  const centiseconds = totalCentiseconds % 100;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
}
