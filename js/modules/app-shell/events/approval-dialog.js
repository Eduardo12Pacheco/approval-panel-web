export function bindApprovalDialogEvents({
  state,
  el,
  renderQueue,
  removeSourceFromTopic,
  approveSourceFromTopic,
  runSearchRefresh,
  toast,
  windowRef,
}) {
  el.queueList?.addEventListener('click', (ev) => {
    const button = ev.target.closest('[data-action="dismiss-approval-queue-job"]');
    if (!button) return;
    const queueId = (button.dataset.queueId || '').trim();
    if (!queueId) return;
    state.dismissedQueueJobs.add(queueId);
    renderQueue();
  });

  el.searchRefreshBtn?.addEventListener('click', () => {
    void runSearchRefresh();
  });

  el.dialogBody?.addEventListener('click', async (ev) => {
    const actionBtn = ev.target.closest('button[data-action]');
    if (!actionBtn) return;

    const action = actionBtn.dataset.action;
    if (action === 'open-source') {
      const encodedUrl = actionBtn.dataset.url || actionBtn.dataset.link || '';
      const url = decodeURIComponent(encodedUrl);
      if (!url) return;
      windowRef.open(url, '_blank', 'noopener,noreferrer');
      return;
    }

    if (action === 'delete-source') {
      const index = Number(actionBtn.dataset.index || 0);
      const idNoticia = decodeURIComponent(actionBtn.dataset.idNoticia || '');
      const source = (state.selectedTopic?.sources || []).find((s) => {
        if (idNoticia) return (s.id_noticia || '').toString() === idNoticia;
        return Number(s.index) === index;
      });
      if (!source) return;
      await removeSourceFromTopic(source);
      return;
    }

    if (action === 'approve-source') {
      const idNoticia = decodeURIComponent(actionBtn.dataset.idNoticia || '');
      const source = (state.selectedTopic?.sources || []).find((s) => (s.id_noticia || '').toString() === idNoticia);
      if (!source) {
        toast('No encontré la noticia seleccionada. Actualizá y probá de nuevo.');
        return;
      }
      await approveSourceFromTopic(source);
    }
  });
}
