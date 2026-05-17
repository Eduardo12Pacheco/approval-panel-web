/**
 * Scripts / Video Projects view template.
 * 1:1 parity — exact DOM structure from original index.html.
 */
export const scriptsViewHTML = `\
          <header class="panel-shell video-projects-hero">
            <div>
              <h1>Proyectos de edici\u00f3n</h1>
              <p>Despu\u00e9s de procesar un guion, ac\u00e1 aparecen los proyectos de edici\u00f3n. Entr\u00e1, eleg\u00ed las im\u00e1genes y prepar\u00e1 el video.</p>
            </div>
            <div class="video-projects-hero__actions">
              <button id="videoProjectsRefreshBtn" class="approve button-icon" type="button">
                <span class="button-icon__glyph" aria-hidden="true">\u21bb</span>
                <span>Refrescar</span>
              </button>
              <button id="videoProjectsNewBtn" class="secondary button-icon" type="button">
                <span class="button-icon__glyph" aria-hidden="true">＋</span>
                <span>Nuevo</span>
              </button>
            </div>
          </header>

          <section class="video-projects-layout">
            <section id="videoProjectsCatalog" class="panel-shell video-projects-list-panel">
              <header class="video-projects-list-panel__header">
                <div>
                  <p class="video-projects-eyebrow">Proyectos</p>
                </div>
                <span id="videoProjectsMeta" class="section-counter">0 proyectos</span>
              </header>
              <main id="videoProjectsList" class="video-projects-list" aria-live="polite"></main>
            </section>

            <article id="videoProjectDetail" class="panel-shell video-project-detail hidden" aria-live="polite"></article>
          </section>`;
