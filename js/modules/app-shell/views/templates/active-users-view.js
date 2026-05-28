export const activeUsersViewHTML = `
  <section class="active-users-shell panel-shell">
    <header class="section-heading">
      <div>
        <h2>Activos</h2>
        <p class="meta">Sesiones activas reportadas por el Gateway.</p>
      </div>
      <button id="activeUsersRefreshBtn" class="secondary" type="button">Actualizar</button>
    </header>

    <p id="activeUsersStatus" class="meta" aria-live="polite">Sin presencia cargada.</p>
    <section id="activeUsersList" class="active-users-list" aria-label="Usuarios activos"></section>
  </section>`;
