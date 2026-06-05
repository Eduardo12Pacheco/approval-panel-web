const VALID_SHELL_VIEWS = new Set(['approval', 'scripts', 'audio', 'radar', 'errors-audit', 'active-users', 'subtitulos2']);

export function normalizeShellView(view) {
  const requestedView = typeof view === 'string' ? view.trim() : '';
  return VALID_SHELL_VIEWS.has(requestedView) ? requestedView : 'approval';
}
