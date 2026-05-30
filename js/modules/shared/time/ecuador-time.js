export function formatEcuadorDateTime(value = '') {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.toString();
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Guayaquil',
  }).format(date).replace(/\./g, '');
}

export function formatEcuadorDateTimeWithZone(value = '') {
  const formatted = formatEcuadorDateTime(value);
  return formatted ? `${formatted} ECT` : '';
}
