export const aiRescueViewHTML = `\
          <section class="ai-rescue-layout">
            <section class="panel-shell ai-rescue-panel">
              <header class="audio-queue-header">
                <div>
                  <h3>Prensa IA</h3>
                  <p id="aiRescueStatus" class="meta word-count">Cargando candidatos Prensa IA.</p>
                </div>
                <div class="ai-rescue-toolbar" aria-label="Acciones Prensa IA">
                  <button id="aiRescueQueueBtn" class="secondary" type="button">Cola</button>
                  <button id="aiRescueRefreshBtn" class="secondary" type="button">Actualizar</button>
                </div>
              </header>
              <nav id="aiRescueTabs" class="ai-rescue-country-bar" aria-label="Países Prensa IA"></nav>
              <section id="aiRescueList" class="ai-rescue-list is-empty">Cargando candidatos Prensa IA.</section>
            </section>
          </section>

          <dialog id="aiRescueQueueDialog">
            <article>
              <header class="dialog-header">
                <div>
                  <h2>Cola Prensa IA</h2>
                  <p class="meta">Estado del análisis de rechazados.</p>
                </div>
                <button id="aiRescueQueueCloseBtn" class="secondary" type="button">Cerrar</button>
              </header>
              <div class="queue-actions"><button id="aiRescueQueueRefreshBtn" class="secondary" type="button">Actualizar cola</button></div>
              <div id="aiRescueQueueBody" class="ai-rescue-queue-body"></div>
            </article>
          </dialog>

          <dialog id="aiRescueDetailDialog">
            <article>
              <header class="dialog-header">
                <h2>Resumen Prensa IA</h2>
                <button id="aiRescueDetailCloseBtn" class="secondary" type="button">Cerrar</button>
              </header>
              <div id="aiRescueDetailBody" class="topic-dialog-body"></div>
            </article>
          </dialog>

          <dialog id="aiRescueConfirmDialog">
            <article>
              <header class="dialog-header"><h2 id="aiRescueConfirmTitle">Confirmar acción</h2></header>
              <p id="aiRescueConfirmMessage">Esta acción modifica el candidato Prensa IA.</p>
              <div class="queue-actions">
                <button id="aiRescueConfirmCancelBtn" class="secondary" type="button">Cancelar</button>
                <button id="aiRescueConfirmAcceptBtn" class="approve" type="button">Confirmar</button>
              </div>
            </article>
          </dialog>`;
