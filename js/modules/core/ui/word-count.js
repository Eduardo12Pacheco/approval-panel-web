export function calculateWordCount(text) {
  const words = (text || '').trim().match(/\S+/g);
  return words ? words.length : 0;
}

export function updateWordCounterCore(text, targetEl) {
  if (!targetEl) return;
  const count = calculateWordCount(text);
  targetEl.textContent = `Palabras: ${count}`;
}
