export function hydrateProjectListCards({ root, openVideoProject, prefetchProjectDetail } = {}) {
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
      await open();
    });
    card.querySelector('[data-action="open-video-project"]')?.addEventListener('keydown', async (ev) => {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      ev.preventDefault();
      await open();
    });
  });
}
