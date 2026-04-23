import path from 'node:path';
import { mkdir, rename } from 'node:fs/promises';

function normalizePath(path) {
  return (path || '').replaceAll('\\', '/').trim();
}

const CHECKPOINT_ALLOWED_PREFIXES = {
  P0: ['js/main.js', 'js/modules/composition-root.js'],
  P1: ['js/modules/core/'],
  P2: ['js/modules/features/approval/', 'js/modules/features/scripts/', 'js/modules/core/http/approval-api.js'],
  P3: ['js/modules/features/audio/', 'js/modules/features/subtitles/', 'js/modules/core/http/tts-api.js'],
  P4: ['styles.css', 'styles/', 'docs/parity/style-guards.md'],
  S1: ['js/modules/features/subtitles/', 'js/modules/app-shell.js'],
  S2: ['js/modules/features/audio/', 'js/modules/app-shell.js'],
  S3: ['js/modules/app-shell.js', 'js/modules/features/audio/', 'js/modules/features/subtitles/'],
  S4: [
    'js/legacy/app.js',
    'docs/parity/contract-matrix.md',
    'docs/parity/style-guards.md',
    'js/modules/__checks__/dependency-boundary-validator.js',
    'openspec/changes/approval-panel-web-appshell-decomposition-archive-legacy/tasks.md',
  ],
  'subtitles-remote-core': ['js/modules/app-shell.js', 'js/modules/core/http/tts-api.js', 'js/modules/core/state/app-store.js', 'js/modules/shared/dom/selectors.js', 'js/modules/__checks__/parity-checklist.js', 'js/modules/__checks__/rollback-scope-validator.js', 'js/modules/__checks__/runtime-ui-parity-replay.js', 'index.html', 'styles/features/subtitles.css'],
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

export async function simulateS4ArchivalRollback({ projectRoot, direction = 'rollback' }) {
  const rootPath = path.join(projectRoot || '', 'app.js');
  const legacyDir = path.join(projectRoot || '', 'js', 'legacy');
  const legacyPath = path.join(legacyDir, 'app.js');

  try {
    if (direction === 'archive') {
      await mkdir(legacyDir, { recursive: true });
      await rename(rootPath, legacyPath);
      return {
        ok: true,
        direction,
        from: 'app.js',
        to: 'js/legacy/app.js',
      };
    }

    await rename(legacyPath, rootPath);
    return {
      ok: true,
      direction: 'rollback',
      from: 'js/legacy/app.js',
      to: 'app.js',
    };
  } catch (error) {
    return {
      ok: false,
      direction,
      error: (error?.message || '').toString(),
    };
  }
}
