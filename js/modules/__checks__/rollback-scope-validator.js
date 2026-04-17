function normalizePath(path) {
  return (path || '').replaceAll('\\', '/').trim();
}

const CHECKPOINT_ALLOWED_PREFIXES = {
  P0: ['js/main.js', 'js/modules/composition-root.js'],
  P1: ['js/modules/core/'],
  P2: ['js/modules/features/approval/', 'js/modules/features/scripts/', 'js/modules/core/http/approval-api.js'],
  P3: ['js/modules/features/audio/', 'js/modules/features/subtitles/', 'js/modules/core/http/tts-api.js'],
  P4: ['styles.css', 'styles/', 'docs/parity/style-guards.md'],
};

export function evaluateRollbackPlan({ checkpoint, changedFiles = [] }) {
  const allowedPrefixes = CHECKPOINT_ALLOWED_PREFIXES[checkpoint] || [];
  const normalized = changedFiles.map(normalizePath).filter(Boolean);

  const offendingFiles = normalized.filter((file) => !allowedPrefixes.some((prefix) => file.startsWith(prefix)));

  return {
    checkpoint,
    allowed: offendingFiles.length === 0,
    offendingFiles,
    allowedPrefixes,
  };
}
