export function renderApprovalTopicDetail({ item, el, state, escapeHtml, resolveApprovalSourceLink }) {
  if (!item) return;
  const approvingSourceId = (state.approvingSourceId || '').toString();
  const sources = Array.isArray(item.sources) ? item.sources : [];
  const sourcesMarkup = sources.map((s) => {
    const sourceId = (s.id_noticia || '').toString();
    const isApproving = approvingSourceId && approvingSourceId === sourceId;
    const sourceStateClass = isApproving ? ' source-item--approved' : '';

    return `
      <div class="source-item${sourceStateClass}">
        <div class="source-content">
          <div><strong>${escapeHtml(s.titular || 'Sin titular')}</strong></div>
          <div class="meta">${escapeHtml(s.fuente || 'Sin fuente')}</div>
        </div>
        <div class="source-actions">
          <button
            type="button"
            class="secondary"
            data-action="open-source"
            data-url="${encodeURIComponent(resolveApprovalSourceLink(s))}"
          >Ver fuente</button>
          <button
            type="button"
            class="approve"
            data-action="approve-source"
            data-id-noticia="${encodeURIComponent(s.id_noticia || '')}"
            ${(state.deletingSource || isApproving) ? 'disabled' : ''}
          >${isApproving ? 'Aprobando...' : 'Aprobar'}</button>
          <button
            type="button"
            class="reject"
            data-action="delete-source"
            data-index="${s.index}"
            data-id-noticia="${encodeURIComponent(s.id_noticia || '')}"
            ${(state.deletingSource || isApproving) ? 'disabled' : ''}
          >Eliminar</button>
        </div>
      </div>
    `;
  }).join('');
  const hasSources = sources.length > 0;
  const sourcesContent = hasSources
    ? sourcesMarkup
    : '<div class="queue-list__empty topic-detail-sources__empty">No quedan fuentes pendientes en este tema.</div>';

  el.dialogTitle.textContent = `${item.jugador} · ${item.tema_principal}`;
  el.dialogBody.innerHTML = `
    <p class="topic-dialog-summary-label">Resumen</p>
    <p class="topic-dialog-summary">${escapeHtml(item.resumen_cluster || 'Sin resumen')}</p>
    <section class="topic-detail-sources">
      <header class="topic-detail-sources__header">
        <div>
          <h3>Fuentes detectadas</h3>
        </div>
        <div class="topic-detail-sources__meta">${sources.length} fuentes</div>
      </header>
      ${sourcesContent}
    </section>
  `;
}
