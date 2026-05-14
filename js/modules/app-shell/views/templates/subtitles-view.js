/**
 * Subtitles / Subtitulos2 view template.
 * 1:1 parity — exact DOM structure from original index.html.
 */
export const subtitlesViewHTML = `\
          <section class="subtitle2-workspace">
            <section class="subtitle2-master-card">
              <header class="subtitle2-screen__header">
                <div>
                  <p class="subtitle2-eyebrow">Workstation subtitle pipeline</p>
                  <h1>Subt\u00edtulos</h1>
                </div>
                <div id="subtitle2ServiceHealthBanner" class="subtitle2-health-chip subtitle-health-banner">
                  Servidor desconectado
                </div>
              </header>

              <ol id="subtitle2PhaseBar" class="subtitle-phase-bar" aria-label="Fases de Subt\u00edtulos 2">
                <li class="subtitle-phase-item" data-phase="Carga">Carga</li>
                <li class="subtitle-phase-item" data-phase="Procesando audio">Procesando audio</li>
                <li class="subtitle-phase-item" data-phase="Edicion">Edicion</li>
                <li class="subtitle-phase-item" data-phase="Procesando video">Procesando video</li>
                <li class="subtitle-phase-item" data-phase="Terminado">Terminado</li>
              </ol>

              <section id="subtitle2PhaseUpload" class="subtitle-phase-section subtitle-phase-section--centered">
                <article class="subtitle2-upload-source-card">
                  <div class="subtitle2-card-heading">
                    <span class="subtitle2-section-label">Upload source</span>
                    <h3>Sub\u00ed tu archivo</h3>
                  </div>
                  <label class="subtitle-upload-dropzone" for="subtitle2UploadInput">
                    <input id="subtitle2UploadInput" type="file" accept=".mp4,.mov,video/mp4,video/quicktime" />
                    <div class="subtitle-upload-cta-icon" aria-hidden="true">\uff0b</div>
                    <div class="subtitle-upload-cta-title">Agregar video</div>
                    <div class="subtitle-upload-cta-sub">Arrastr\u00e1 un .mp4 o .mov para crear una sesi\u00f3n remota</div>
                  </label>
                  <div class="subtitle-source-language">
                    <p class="subtitle-source-language-title">Idioma origen</p>
                    <select id="subtitle2SourceLanguagePicker" class="subtitle-lang-select" data-custom-dropdown data-dropdown-label="Idioma origen" data-dropdown-placeholder="Idioma origen" aria-label="Idioma origen para Subt\u00edtulos 2">
                      <option value="auto">Detectar autom\u00e1ticamente</option>
                      <option value="de">Alem\u00e1n</option>
                      <option value="ber">Amazigh / Bereber</option>
                      <option value="ar">\u00c1rabe</option>
                      <option value="ca">Catal\u00e1n</option>
                      <option value="cs">Checo</option>
                      <option value="ko">Coreano</option>
                      <option value="es">Espa\u00f1ol</option>
                      <option value="fr">Franc\u00e9s</option>
                      <option value="gd">Ga\u00e9lico escoc\u00e9s</option>
                      <option value="en">Ingl\u00e9s</option>
                      <option value="it">Italiano</option>
                      <option value="nl">Neerland\u00e9s</option>
                      <option value="pap">Papiamento</option>
                      <option value="pt">Portugu\u00e9s</option>
                      <option value="tzm">Tamazight (Tzm)</option>
                      <option value="tr">Turco</option>
                      <option value="uz">Uzbeko</option>
                    </select>
                    <p id="subtitle2SourceLanguageEngineHint" class="meta subtitle-source-engine-hint"></p>
                  </div>
                </article>
              </section>

              <section id="subtitle2AnalyzeMeta" class="subtitle2-editor-card subtitle-meta-card hidden">
                <h3>Metadata del an\u00e1lisis</h3>
                <div class="subtitle-meta-grid">
                  <div class="subtitle-meta-chip"><span class="subtitle-meta-chip__label">source_language_requested</span><strong id="subtitle2MetaRequested">\u2014</strong></div>
                  <div class="subtitle-meta-chip"><span class="subtitle-meta-chip__label">source_language_effective</span><strong id="subtitle2MetaEffective">\u2014</strong></div>
                  <div class="subtitle-meta-chip"><span class="subtitle-meta-chip__label">detected_language</span><strong id="subtitle2MetaDetected">\u2014</strong></div>
                  <div class="subtitle-meta-chip"><span class="subtitle-meta-chip__label">asr_model</span><strong id="subtitle2MetaAsrModel">\u2014</strong></div>
                  <div class="subtitle-meta-chip"><span class="subtitle-meta-chip__label">mt_model</span><strong id="subtitle2MetaMtModel">\u2014</strong></div>
                </div>
              </section>

              <section id="subtitle2PhaseProcessing" class="subtitle-phase-section subtitle-phase-section--centered hidden">
                <article class="subtitle2-editor-card subtitle-centered-card subtitle-processing-card">
                  <div id="subtitle2ProcessingIcon" class="subtitle-phase-icon" aria-hidden="true">\u23f3</div>
                  <h3 id="subtitle2ProcessingTitle">Procesando audio</h3>
                  <p id="subtitle2ProcessingMessage" class="meta">Estamos analizando tu archivo\u2026</p>
                  <div class="subtitle-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
                    <div id="subtitle2ProgressFill" class="subtitle-progress-fill" style="width: 0%"></div>
                  </div>
                  <p id="subtitle2ProgressPercent" class="subtitle-progress-percent">0%</p>
                </article>
              </section>

              <section id="subtitle2PhaseEdition" class="subtitle-phase-section hidden">
                <article class="subtitle2-editor-card">
                  <div class="subtitle2-card-heading subtitle2-card-heading--inline">
                    <div>
                      <span class="subtitle2-section-label">Editor</span>
                      <h3>Tabla de edici\u00f3n</h3>
                    </div>
                    <p class="meta">Ajust\u00e1 tiempos, frase y estilo antes de renderizar.</p>
                  </div>

                   <div class="subtitle-table-scroll">
                     <table class="subtitle-table subtitle-table--remote" id="subtitle2RowsTable">
                       <colgroup>
                          <col class="subtitle-table__col subtitle-table__col--time-range" />
                         <col class="subtitle-table__col subtitle-table__col--phrase" />
                         <col class="subtitle-table__col subtitle-table__col--size" />
                         <col class="subtitle-table__col subtitle-table__col--space" />
                          <col class="subtitle-table__col subtitle-table__col--font" />
                          <col class="subtitle-table__col subtitle-table__col--color" />
                          <col class="subtitle-table__col subtitle-table__col--align" />
                          <col class="subtitle-table__col subtitle-table__col--delete" />
                       </colgroup>
                       <thead>
                         <tr>
                            <th><span class="subtitle-table__title">Start / End</span><span class="subtitle-table__hint">rango</span></th>
                           <th><span class="subtitle-table__title">Frase</span><span class="subtitle-table__hint">texto visible</span></th>
                           <th><span class="subtitle-table__title">Tama\u00f1o</span><span class="subtitle-table__hint">escala cue</span></th>
                           <th><span class="subtitle-table__title">Ancho m\u00e1x</span><span class="subtitle-table__hint">espacio</span></th>
                           <th><span class="subtitle-table__title">Fuente</span><span class="subtitle-table__hint">familia</span></th>
                            <th><span class="subtitle-table__title">Color</span><span class="subtitle-table__hint">cue</span></th>
                            <th><span class="subtitle-table__title">Alineaci\u00f3n</span><span class="subtitle-table__hint">I \u00b7 C \u00b7 D</span></th>
                            <th aria-label="Eliminar"></th>
                          </tr>
                       </thead>
                       <tbody id="subtitle2RowsBody"></tbody>
                     </table>
                  </div>

                  <div class="audio-actions">
                    <button id="subtitle2AddRowBtn" class="secondary">Agregar subt\u00edtulo</button>
                    <button id="subtitle2SaveBtn" class="secondary">Guardar cambios</button>
                    <button id="subtitle2ReadyBtn" class="approve">Listo</button>
                  </div>
                </article>
              </section>

              <section id="subtitle2PhaseDone" class="subtitle-phase-section subtitle-phase-section--centered hidden">
                <article class="subtitle2-editor-card subtitle-centered-card subtitle-success-card">
                  <div class="subtitle-phase-icon subtitle-phase-icon--success" aria-hidden="true">\u2705</div>
                  <h3 id="subtitle2DoneTitle">Video listo</h3>
                  <p id="subtitle2DoneMessage" class="meta">Tu video ya est\u00e1 listo. Descargalo manualmente cuando quieras.</p>
                  <div class="audio-actions subtitle-finish-actions">
                    <button id="subtitle2DownloadBtn">Descargar video</button>
                    <button id="subtitle2AnotherVideoBtn" class="secondary">Subtitular otro video</button>
                  </div>
                </article>
              </section>
            </section>

            <aside class="subtitle2-side-card">
              <div class="subtitle-preview-frame">
                <div class="subtitle-preview-frame__header">
                  <div>
                    <span class="subtitle2-section-label">Live preview</span>
                    <h3>Preview</h3>
                  </div>
                </div>
                <div id="subtitle2PreviewStage" class="subtitle-preview-stage">
                  <video id="subtitle2PreviewVideo" playsinline preload="auto"></video>
                  <div id="subtitle2PreviewEmpty" class="subtitle-preview-empty">Agreg\u00e1 o retom\u00e1 una sesi\u00f3n para iniciar el preview</div>
                  <div id="subtitle2PreviewOverlay" class="subtitle-preview-overlay">
                    <div id="subtitle2PreviewCue" class="subtitle-preview-cue hidden"></div>
                  </div>
                </div>
                <div class="subtitle-preview-controls">
                  <button id="subtitle2PreviewPlayBtn" class="subtitle-preview-play-btn" type="button" aria-label="Reproducir preview">\u25b6</button>
                  <div id="subtitle2PreviewTimeline" class="subtitle-preview-timeline" role="slider" aria-label="Timeline preview subt\u00edtulos 2">
                    <div id="subtitle2PreviewTimelineTrack" class="subtitle-preview-timeline-track">
                      <div id="subtitle2PreviewPlayhead" class="subtitle-preview-playhead"></div>
                    </div>
                  </div>
                  <span id="subtitle2PreviewTimecode" class="subtitle-preview-timecode">00:00.00</span>
                </div>
              </div>

              <div class="subtitle2-history-section">
                <div>
                  <span class="subtitle2-section-label">\u00daltimos proyectos</span>
                  <h3>Historial</h3>
                </div>
                <div id="subtitle2SessionHistory" class="subtitle-history-list">Todav\u00eda no hay sesiones remotas.</div>
              </div>
            </aside>
          </section>`;
