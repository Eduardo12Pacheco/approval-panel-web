export const errorsAuditViewHTML = `
  <section class="errors-audit-shell panel-shell">
    <header class="section-heading">
      <div>
        <h2>Errors/Audit</h2>
        <p class="meta">Eventos Gateway sanitizados para diagnóstico operativo.</p>
      </div>
      <button id="errorsAuditRefreshBtn" class="secondary" type="button">Reintentar</button>
    </header>

    <section class="errors-audit-filters" aria-label="Filtros Errors/Audit">
      <label class="control-group"><span class="control-label">Tipo</span><select id="errorsAuditKindFilter"><option value="">Todos</option><option value="error">Error</option><option value="audit">Audit</option></select></label>
      <label class="control-group"><span class="control-label">Estado</span><input id="errorsAuditStatusFilter" placeholder="failure, success, 500" /></label>
      <label class="control-group"><span class="control-label">Servicio</span><input id="errorsAuditServiceFilter" placeholder="gateway" /></label>
      <label class="control-group"><span class="control-label">Actor</span><input id="errorsAuditActorFilter" placeholder="operator" /></label>
      <label class="control-group"><span class="control-label">Correlation ID</span><input id="errorsAuditCorrelationFilter" placeholder="corr-..." /></label>
      <label class="control-group"><span class="control-label">Desde</span><input id="errorsAuditFromFilter" type="date" /></label>
      <label class="control-group"><span class="control-label">Hasta</span><input id="errorsAuditToFilter" type="date" /></label>
    </section>

    <p id="errorsAuditStatus" class="meta" aria-live="polite">Sin eventos cargados.</p>
    <div class="errors-audit-layout">
      <section id="errorsAuditList" class="errors-audit-list" aria-label="Eventos Gateway"></section>
      <aside id="errorsAuditDetail" class="errors-audit-detail-panel" aria-label="Detalle de evento"><p class="meta">Seleccioná un evento para ver el detalle.</p></aside>
    </div>
  </section>`;
