/**
 * Audio / TTS view template.
 * 1:1 parity — exact DOM structure from original index.html.
 */
export const audioViewHTML = `\
        <section id="viewAudio" class="view hidden">
          <div class="audio-screen">
            <header class="panel-shell audio-screen__header">
              <div>
                <h1>Creaci\u00f3n de audio</h1>
                <p>Gener\u00e1 narraciones con preset fijo y monitore\u00e1 la cola de jobs en tiempo real.</p>
              </div>
            </header>

            <section class="audio-screen__grid">
              <section class="audio-panel audio-panel--main panel-shell">
                <label class="editor-label audio-field">
                  <span>Preset de generaci\u00f3n</span>
                  <select id="audioPresetSelect" data-custom-dropdown data-dropdown-label="Preset" data-dropdown-placeholder="Preset">
                    <option value="balanced_default">Voz Balanceada</option>
                    <option value="pelotazo_emotivo">Voz Emotivo</option>
                    <option value="pelotazo_informativo">Voz Informativa</option>
                  </select>
                </label>

                <label class="editor-label audio-field audio-field--grow">
                  <span>Texto para narraci\u00f3n</span>
                  <textarea id="audioTextArea" class="script-area script-area--audio" placeholder="Peg\u00e1 aqu\u00ed el guion que quer\u00e9s convertir a audio..."></textarea>
                </label>

                <div class="audio-actions">
                  <p id="audioWordCount" class="meta word-count">Palabras: 0</p>
                  <button id="audioClearBtn" class="secondary">Limpiar</button>
                  <button id="audioRunBtn">Ejecutar</button>
                </div>
              </section>

              <aside class="audio-panel audio-panel--queue panel-shell">
                <header class="audio-queue-header">
                  <div>
                    <h3>Cola de jobs</h3>
                    <p class="meta">Estados de render, errores y descargas listas.</p>
                  </div>
                  <span id="audioQueueMeta" class="section-counter"></span>
                </header>

                <section id="audioQueueList" class="audio-queue-list is-empty">
                  <p class="audio-queue-empty">Sin jobs todav\u00eda.</p>
                </section>
              </aside>
            </section>
          </div>
        </section>`;
