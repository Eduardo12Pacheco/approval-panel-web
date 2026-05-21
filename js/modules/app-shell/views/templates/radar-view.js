/**
 * Radar / Investigación view template.
 * 1:1 parity — exact DOM structure from original index.html.
 */
export const radarViewHTML = `\
          <header class="panel-shell radar-screen__header">
            <div>
              <p class="subtitle2-section-label">Radar local</p>
              <h1>Investigaci\u00f3n</h1>
              <p>Cre\u00e1 investigaciones por pa\u00eds, monitore\u00e1 la cola y descarg\u00e1 el TXT generado por el backend.</p>
            </div>
            <button id="radarNewJobBtn" class="approve" type="button">+ Nuevo</button>
            <div id="radarHealthStatus" class="subtitle2-health-chip">Servicio sin verificar</div>
          </header>

          <section class="audio-screen__grid radar-layout">
            <section class="audio-panel audio-panel--main panel-shell radar-monitor-panel">
              <header class="audio-queue-header">
                <div>
                  <h3>Radar Monitor</h3>
                  <p id="radarMonitorStatus" class="meta word-count">Cargando videos monitoreados.</p>
                </div>
                <div class="radar-monitor-toolbar" aria-label="Filtros Radar Monitor">
                  <label class="control-group approval-control approval-control--select">
                    <span class="control-label">Pa\u00eds</span>
                    <select id="radarCountryFilter">
                      <option value="">Todos</option>
                      <option value="colombia">Colombia</option>
                      <option value="ecuador">Ecuador</option>
                      <option value="argentina">Argentina</option>
                    </select>
                  </label>
                  <button id="radarMonitorRefreshBtn" class="secondary" type="button">Actualizar</button>
                </div>
              </header>
              <section id="radarMonitorList" class="radar-monitor-list is-empty">Cargando videos monitoreados.</section>
            </section>

            <aside class="audio-panel audio-panel--queue panel-shell radar-queue-panel">
              <header class="audio-queue-header">
                <div>
                  <h3>Cola de jobs</h3>
                  <p id="radarProgressStatus" class="meta">Listo para investigar.</p>
                </div>
              </header>
              <section id="radarQueueList" class="audio-queue-list is-empty">Sin trabajos en cola.</section>
              <section class="radar-history-secondary">
                <h3>Transcripciones</h3>
                <section id="radarHistoryList" class="audio-queue-list is-empty">Sin transcripciones todav\u00eda.</section>
              </section>
            </aside>
          </section>

          <dialog id="radarNewJobDialog">
            <article>
              <header class="dialog-header">
                <h2>Nueva investigaci\u00f3n</h2>
                <button id="radarNewJobCancelBtn" class="secondary" type="button">Cerrar</button>
              </header>
              <label class="editor-label audio-field audio-field--grow">
                <span>Link del video</span>
                <input id="radarUrlInput" placeholder="https://youtu.be/..." />
              </label>
              <fieldset class="settings-section">
                <legend>Pa\u00edses</legend>
                <label><input id="radarCountryColombia" type="checkbox" value="colombia" /> Colombia</label>
                <label><input id="radarCountryEcuador" type="checkbox" value="ecuador" /> Ecuador</label>
                <label><input id="radarCountryArgentina" type="checkbox" value="argentina" /> Argentina</label>
              </fieldset>
              <label class="editor-label audio-field">
                <span>Keywords extra</span>
                <textarea id="radarExtraKeywordsInput" class="script-area" placeholder="Messi, Di Mar\u00eda, Scaloni"></textarea>
              </label>
              <p id="radarValidationMessage" class="meta" aria-live="polite"></p>
              <div class="queue-actions">
                <button id="radarSubmitBtn" class="approve" type="button">Crear job</button>
              </div>
            </article>
          </dialog>

          <dialog id="radarSummaryDialog">
            <article>
              <header class="dialog-header">
                <h2>Resumen</h2>
                <button id="radarSummaryCloseBtn" class="secondary" type="button">Cerrar</button>
              </header>
              <div id="radarSummaryBody" class="topic-dialog-body"></div>
            </article>
          </dialog>

          <dialog id="radarConfirmDialog">
            <article>
              <header class="dialog-header"><h2 id="radarConfirmTitle">Confirmar acci\u00f3n</h2></header>
              <p id="radarConfirmMessage">Esta acci\u00f3n modifica el job seleccionado.</p>
              <div class="queue-actions">
                <button id="radarConfirmCancelBtn" class="secondary" type="button">Cancelar</button>
                <button id="radarConfirmAcceptBtn" class="approve" type="button">Confirmar</button>
              </div>
            </article>
          </dialog>`;
