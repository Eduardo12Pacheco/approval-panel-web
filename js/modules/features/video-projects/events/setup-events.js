export function hydrateSetupEvents({
  root,
  uploadProjectAudio,
  selectDefaultBackgroundMusic,
  uploadCustomImages,
  toggleImageSelection,
} = {}) {
  if (typeof uploadProjectAudio === 'function') {
    root?.querySelectorAll?.('[data-action="upload-project-audio"]')?.forEach((input) => {
      input.addEventListener('change', async () => {
        const [file] = input.files || [];
        const kind = input.dataset.audioKind;
        if (!file || !kind) return;
        await uploadProjectAudio(kind, file);
      });
    });
  }

  if (typeof selectDefaultBackgroundMusic === 'function') {
    root?.querySelector?.('[data-action="select-default-background-music"]')?.addEventListener('change', async (ev) => {
      const trackId = ev.currentTarget?.value || '';
      if (!trackId) return;
      await selectDefaultBackgroundMusic(trackId);
    });
  }

  if (typeof uploadCustomImages === 'function') {
    root?.querySelector?.('[data-action="upload-custom-images"]')?.addEventListener('change', async (ev) => {
      const input = ev.currentTarget;
      const files = input?.files ? Array.from(input.files) : [];
      if (!files.length) return;
      await uploadCustomImages(files);
      input.value = '';
    });
  }

  if (typeof toggleImageSelection === 'function') {
    const toggleCard = (card) => {
      const candidateId = card?.dataset.candidateId;
      if (candidateId) toggleImageSelection(candidateId);
    };

    root?.querySelectorAll?.('.video-image-card[data-candidate-id]')?.forEach((card) => {
      card.addEventListener('click', (ev) => {
        ev.preventDefault();
        toggleCard(card);
      });

      card.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Enter' && ev.key !== ' ') return;
        ev.preventDefault();
        toggleCard(card);
      });
    });
  }
}
