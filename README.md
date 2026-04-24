# Approval Panel Web

Panel interno editorial en **HTML/CSS/JS vanilla**.
Este repositorio quedó organizado por capas y features, manteniendo la regla principal:

> **Paridad 1:1**: no cambiar funcionalidades ni apariencia para el usuario.

Este orden existe para refactorizar y endurecer el frontend **sin cambios de features, API ni UX** fuera de lo aprobado por diseño.

---

## 1) Cómo arranca la app (entrypoints reales)

1. `index.html`
2. `js/main.js` (bootstrap mínimo)
3. `js/modules/composition-root.js` (ensambla dependencias)
4. `js/modules/app-shell.js` (composition shell liviano: estado compartido, navegación, wiring y delegación)

En estilos:

1. `styles.css` (**import-only**)
2. Imports ordenados a `styles/*` (tokens → base → layout → components → features → responsive)
3. `styles/features/subtitles/index.css` funciona como fachada import-only del split de Subtítulos.

---

## 2) Dónde está cada cosa

## Arquitectura

### Núcleo (`js/modules/core`)
- `auth/session-gate.js` → sesión/login y estado de autenticación.
- `state/app-store.js` → configuración persistida (localStorage).
- `bootstrap.js` → wiring de eventos base compartidos.
- `http/approval-api.js` y `http/tts-api.js` → clientes API.
- `ui/*` → utilidades UI puras (`toast`, `word-count`, `escape-html`).

### Features (`js/modules/features`)
- `approval/index.js` → flujo panel de aprobación.
- `approval/cards.js`, `approval/detail-dialog.js`, `approval/queue-monitor.js` → render y helpers UI propios de approval.
- `scripts/index.js` → edición/publicación de guiones.
- `scripts/render.js` → render del listado/editor de guiones.
- `audio/index.js`, `audio/controller.js` + `audio/runtime/*` → generación audio, tracking, SSE, polling, descarga y helpers.
- `subtitles/index.js`, `subtitles/controller.js` + `subtitles/runtime/*` → flujo Subtítulos 2, sesión remota, tabla, preview, historial y helpers.

### Shared
- `shared/dom/selectors.js` → contrato de selectores/IDs del DOM.

### Checks de paridad (`js/modules/__checks__`)
- `parity-checklist.js` → guardrails de contratos (DOM/bootstrap/imports).
- `runtime-ui-parity-replay.js` → replay de paridad de flujos.
- `dependency-boundary-validator.js` → límites de dependencias.
- `rollback-scope-validator.js` → validaciones de rollback por slice.
- `css-computed-style-parity.js` → paridad de estilos computados en selectores protegidos.

### Legacy (archivado, no runtime)
- `js/legacy/app.js` → **archivo histórico**.
  - No participa del arranque actual.
  - Se conserva por trazabilidad/rollback.

---

## 3) Estructura de carpetas actual

## Mapa de carpetas

```text
approval-panel-web/
├─ index.html
├─ styles.css                      # import-only, orden de cascada contractual
├─ styles/
│  ├─ tokens.css
│  ├─ base.css
│  ├─ layout.css
│  ├─ responsive.css
│  ├─ components/
│  │  ├─ buttons.css
│  │  ├─ dialogs.css
│  │  ├─ cards.css
│  │  ├─ forms.css
│  │  └─ toast.css
│  └─ features/
│     ├─ approval.css
│     ├─ scripts.css
│     ├─ audio.css
│     ├─ subtitles/
│     │  ├─ index.css               # fachada import-only
│     │  ├─ legacy-base.css
│     │  ├─ tokens.css
│     │  ├─ layout.css
│     │  ├─ upload.css
│     │  ├─ preview.css
│     │  ├─ history.css
│     │  ├─ phases.css
│     │  ├─ table.css
│     │  └─ responsive.css
│     └─ auth.css
├─ js/
│  ├─ main.js
│  ├─ legacy/
│  │  └─ app.js                    # archivado
│  └─ modules/
│     ├─ composition-root.js
│     ├─ app-shell.js
│     ├─ subtitles-workflow.mjs
│     ├─ core/
│     ├─ features/
│     ├─ shared/
│     └─ __checks__/
├─ docs/parity/
│  ├─ contract-matrix.md
│  └─ style-guards.md
├─ tests/
│  ├─ test_phase5_css_split_parity.py
│  ├─ test_phase6_runtime_parity_and_boundaries.py
│  ├─ test_phase7_runtime_ui_replay_and_rollback.py
│  ├─ test_phase8_html_css_readme_structure_refactor.py
│  └─ test_phase9_appshell_decomposition_archive_legacy.py
└─ openspec/
   └─ changes/                     # artifacts SDD de cambios ejecutados
```

---

## 4) Contratos que NO se tocan

## Guardrails de paridad

1. **DOM contract**
   - No renombrar/eliminar IDs usados por `selectors.js` y `parity-checklist.js`.

2. **Bootstrap contract**
   - `index.html -> js/main.js -> composition-root.js -> app-shell.js`.

3. **CSS contract**
   - `styles.css` se mantiene import-only.
   - `styles/features/subtitles/index.css` también es import-only y preserva el orden original del viejo `subtitles.css` mediante chunks secuenciales.
   - El orden de imports define la cascada (no alterar sin pruebas de paridad).

4. **Parity contract**
   - Cualquier refactor debe pasar checks y tests de paridad antes de promoverse.

---

## 5) Cómo validar que no rompiste nada

## Workflow seguro por slices

Desde `approval-panel-web/`:

```bash
pytest tests/test_phase5_css_split_parity.py
pytest tests/test_phase6_runtime_parity_and_boundaries.py
pytest tests/test_phase7_runtime_ui_replay_and_rollback.py
pytest tests/test_phase8_html_css_readme_structure_refactor.py
pytest tests/test_phase9_appshell_decomposition_archive_legacy.py
pytest tests/test_subtitle2_parity_polish.py
pytest tests/test_ui_design_recomposition.py
```

Reglas de refactor:

- No mover HTML a templates; `index.html` conserva los IDs y `data-action` como contrato público.
- No cambiar endpoints, headers, payload keys, toasts ni copy visible.
- No reintroducir `x-user-email` ni flujos legacy de Subtítulos.
- No correr builds para validar este proyecto; usar pytest/parity guards.

Si querés corrida completa:

```bash
pytest
```

---

## 6) Levantar local

```bash
python -m http.server 8080
```

Abrir:

`http://localhost:8080/approval-panel-web/`
