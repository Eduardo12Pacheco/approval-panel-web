export function renderToast({ toastEl, message, existingTimer, durationMs = 3000 }) {
  if (!toastEl) return null;

  toastEl.textContent = message;

  if (typeof toastEl.showPopover === 'function') {
    toastEl.showPopover();
  }

  toastEl.classList.add('show');

  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  return setTimeout(() => {
    toastEl.classList.remove('show');

    if (typeof toastEl.hidePopover === 'function') {
      toastEl.hidePopover();
    }
  }, durationMs);
}
