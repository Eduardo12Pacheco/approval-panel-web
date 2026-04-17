# Approval Panel Web

Panel web interno para operación editorial en modo estático (HTML/CSS/JS), con bootstrap modular y contratos de paridad definidos para refactors seguros.

## Alcance de este change set

Este cambio está enfocado en **estructura y mantenibilidad**:

- Orden y delimitación de `index.html` para legibilidad.
- Redistribución de reglas CSS por capas (`layout`, `components`, `features`, `responsive`).
- Reescritura de documentación técnica.

Declaración contractual: **sin cambios de features, API ni UX**.

## Arquitectura

### Bootstrap y composición

1. `js/main.js` inicia la aplicación.
2. `js/modules/composition-root.js` construye dependencias.
3. `js/modules/app-shell.js` conecta vistas y handlers de UI.
4. Módulos de feature ejecutan flujos de negocio:
   - `features/approval`
   - `features/scripts`
   - `features/audio`
   - `features/subtitles`

### Contratos de UI

- `index.html` define el contrato de IDs consumido por:
  - `js/modules/shared/dom/selectors.js`
  - `js/modules/__checks__/parity-checklist.js`
- `#authGate` y `#appShell` son fronteras de sesión y shell.
- Las vistas `#viewApproval`, `#viewScripts`, `#viewAudio`, `#viewSubtitulos` son límites funcionales estables.

## Mapa de carpetas

```text
approval-panel-web/
├─ index.html
├─ styles.css
├─ styles/
│  ├─ tokens.css
│  ├─ base.css
│  ├─ layout.css
│  ├─ components/
│  │  ├─ buttons.css
│  │  ├─ dialogs.css
│  │  ├─ cards.css
│  │  ├─ forms.css
│  │  └─ toast.css
│  ├─ features/
│  │  ├─ approval.css
│  │  ├─ scripts.css
│  │  ├─ audio.css
│  │  ├─ subtitles.css
│  │  └─ auth.css
│  └─ responsive.css
├─ js/
│  ├─ main.js
│  └─ modules/
│     ├─ composition-root.js
│     ├─ app-shell.js
│     ├─ core/
│     ├─ features/
│     └─ __checks__/
├─ docs/parity/
│  ├─ contract-matrix.md
│  └─ style-guards.md
└─ tests/
   ├─ test_phase5_css_split_parity.py
   ├─ test_phase6_runtime_parity_and_boundaries.py
   └─ test_phase7_runtime_ui_replay_and_rollback.py
```

## Guardrails de paridad

### 1) Contrato DOM (NO negociar)

- No renombrar ni eliminar IDs contractuales (`authGate`, `appShell`, `authForm`, `sidebarNav`, etc.).
- No romper referencias usadas por `parity-checklist` ni por `selectors.js`.

### 2) Frontera de bootstrap

- `js/main.js` debe conservar:
  - import de `./modules/composition-root.js`
  - ejecución de `bootCompositionRoot`

### 3) Contrato de `styles.css`

- `styles.css` es **import-only**.
- El orden de imports es contrato de cascada y no se altera sin evidencia de paridad.

### 4) Guardas de estilo y runtime

Mantener paridad en selectores protegidos (`.sidebar`, `.topbar`, `.card`, `.audio-queue-card`, `.subtitle-phase-bar`) y en flujos protegidos definidos por los checks de runtime.

## Workflow seguro por slices

Aplicar cambios por lotes acotados, con promoción solo si hay paridad verde.

### Slice A — HTML readability

- Cambios permitidos: delimitadores/comentarios y orden visual interno.
- Cambios prohibidos: mutar IDs/clases contractuales o frontera de bootstrap.
- Rollback: revertir solo `index.html`.

### Slice B1 — Layout + Responsive

- Mover reglas de layout a `styles/layout.css`.
- Mover media query a `styles/responsive.css`.
- Limpiar de `styles/base.css` únicamente lo migrado.
- Rollback: revertir `layout.css`, `responsive.css` y diff de `base.css`.

### Slice B2 — Components

- Distribuir reglas en `styles/components/*`.
- Mantener selectores y especificidad efectiva.
- Rollback: revertir `styles/components/*` y diff correspondiente en `base.css`.

### Slice B3 — Features

- Distribuir reglas en `styles/features/*` por dominio funcional.
- Rollback: revertir `styles/features/*` y último diff en `base.css`.

### Slice C — README técnico

- Documentación en español, alineada a arquitectura actual.
- Sin claims de funcionalidades nuevas.
- Rollback: revertir solo `README.md`.

## Verificación de paridad

Ejecutar desde `approval-panel-web/`:

```bash
pytest tests/test_phase5_css_split_parity.py
pytest tests/test_phase6_runtime_parity_and_boundaries.py
pytest tests/test_phase7_runtime_ui_replay_and_rollback.py
```

Para cambios estructurales de este set, también:

```bash
pytest tests/test_phase8_html_css_readme_structure_refactor.py
```

## Operación local

Para servir estático:

```bash
python -m http.server 8080
```

Abrir `http://localhost:8080/approval-panel-web/`.
