export function hydrateProjectListCards({ root, openVideoProject, prefetchProjectDetail, disableVideoProject, confirmDelete = globalThis.confirm } = {}) {
  root?.querySelectorAll?.('.video-project-card[data-project-id]')?.forEach((card) => {
    const projectId = decodeURIComponent(card.dataset.projectId || '');
    const open = async () => {
      await openVideoProject(projectId);
    };

    if (typeof prefetchProjectDetail === 'function') {
      const prefetch = () => prefetchProjectDetail(projectId);
      card.addEventListener('mouseenter', prefetch, { once: true });
      card.addEventListener('focusin', prefetch, { once: true });
      card.addEventListener('touchstart', prefetch, { once: true });
    }

    card.addEventListener('click', async (ev) => {
      if (ev.target.closest('a')) return;
      if (ev.target.closest('[data-action="delete-video-project"]')) return;
      await open();
    });
    card.querySelector('[data-action="delete-video-project"]')?.addEventListener('click', async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const confirmed = typeof confirmDelete === 'function'
        ? confirmDelete('¿Seguro que querés eliminar este proyecto de edición? Esta acción lo va a ocultar de la lista, pero no borra los assets ya generados.')
        : true;
      if (!confirmed) return;
      await disableVideoProject?.(projectId);
    });
    card.querySelector('[data-action="open-video-project"]')?.addEventListener('keydown', async (ev) => {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      ev.preventDefault();
      await open();
    });
  });
}
