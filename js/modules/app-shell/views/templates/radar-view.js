/**
 * Radar / Investigación view template.
 * 1:1 parity — exact DOM structure from original index.html.
 */
export const radarViewHTML = `\
          <section class="radar-layout">
            <section class="panel-shell radar-monitor-panel">
              <header class="audio-queue-header">
                <div>
                  <h3>Radar Monitor</h3>
                  <p id="radarMonitorStatus" class="meta word-count">Cargando videos monitoreados.</p>
                </div>
                <div class="radar-monitor-toolbar" aria-label="Acciones Radar Monitor">
                  <button id="radarBasuraBtn" class="secondary" type="button">Basura <span id="radarBasuraCount">0</span></button>
                  <button id="radarMonitorRefreshBtn" class="secondary" type="button">Actualizar</button>
                </div>
              </header>
              <nav id="radarCountryBar" class="radar-country-bar" aria-label="Pa\u00edses monitoreados">
                <button class="radar-country-card" type="button" data-radar-country-option="ecuador" aria-pressed="false"><span>01 / Ecuador</span><strong>Monitoreo</strong></button>
                <button class="radar-country-card" type="button" data-radar-country-option="colombia" aria-pressed="false"><span>02 / Colombia</span><strong>Monitoreo</strong></button>
                <button class="radar-country-card" type="button" data-radar-country-option="argentina" aria-pressed="false"><span>03 / Argentina</span><strong>Monitoreo</strong></button>
                <button class="radar-country-card" type="button" data-radar-country-option="uruguay" aria-pressed="false"><span>04 / Uruguay</span><strong>Monitoreo</strong></button>
                <button class="radar-country-card" type="button" data-radar-country-option="paraguay" aria-pressed="false"><span>05 / Paraguay</span><strong>Monitoreo</strong></button>
                <button class="radar-country-card" type="button" data-radar-country-option="mexico" aria-pressed="false"><span>06 / M\u00e9xico</span><strong>Monitoreo</strong></button>
                <button class="radar-country-card" type="button" data-radar-country-option="important" aria-pressed="false"><span>07 / IMPORTANTES</span><strong>MONITOREO</strong></button>
              </nav>
              <section id="radarMonitorList" class="radar-monitor-list is-empty">Cargando videos monitoreados.</section>
            </section>
          </section>

          <dialog id="radarBasuraDialog">
            <article>
              <header class="dialog-header">
                <h2>Basura</h2>
                <button id="radarBasuraCloseBtn" class="secondary" type="button">Cerrar</button>
              </header>
              <div id="radarBasuraList" class="radar-basura-list"></div>
            </article>
          </dialog>

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
                <label><input id="radarCountryParaguay" type="checkbox" value="paraguay" /> Paraguay</label>
                <label><input id="radarCountryUruguay" type="checkbox" value="uruguay" /> Uruguay</label>
                <label><input id="radarCountryMexico" type="checkbox" value="mexico" /> M\u00e9xico</label>
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
