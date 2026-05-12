# AGENTS.md — Control Panel

Guía para futuras sesiones/agentes que trabajen en `01-Control-Panel/`.

## Regla principal

Este subproyecto se refactoriza con **paridad 1:1**.

No cambies comportamiento, copy visible, endpoints, payloads, IDs del DOM, `data-action`, rutas de assets, orden CSS ni flujos de usuario salvo que el usuario lo pida explícitamente.

## Qué es este proyecto

`01-Control-Panel/` es un panel editorial en HTML/CSS/JS vanilla que orquesta:

- Approval queue y acciones editoriales.
- Scripts/guiones, publicación, descarga y Script → Audio.
- Audio/TTS job queue.
- Subtitles workflow.
- Video Projects, preview/composición y Approval Editor service.

El arranque real del frontend es:

```text
index.html
  -> js/main.js
  -> js/modules/composition-root.js
  -> js/modules/app-shell.js
```

## Estructura actual importante

```text
01-Control-Panel/
├─ index.html
├─ assets/                         # WebM livianos para preview del navegador
├─ js/                             # frontend browser ESM
│  ├─ main.js
│  ├─ legacy/app.js                # histórico, no runtime
│  └─ modules/
│     ├─ app-shell.js              # facade estable
│     ├─ app-shell/                # lifecycle, composition, events, views, voice
│     ├─ core/                     # auth/state/http/ui helpers
│     ├─ features/                 # approval, scripts, audio, subtitles, video-projects, radar
│     ├─ shared/                   # DOM selector contracts
│     └─ __checks__/               # facades/checks de paridad
├─ services/
│  └─ approval-editor/             # backend Node local, puerto 3042
├─ styles.css                      # import-only
├─ styles/                         # tokens/base/layout/components/features
├─ tests/                          # pytest parity guards
├─ docs/
└─ openspec/                       # artifacts SDD
```

## Servicios locales

### Approval Editor service

Ruta activa:

```text
01-Control-Panel/services/approval-editor/
```

No lo muevas a `js/`. Es backend Node/CommonJS, no frontend browser.

Contratos que debe preservar:

- Puerto por defecto: `3042`.
- Servicio: `approval-editor-service`.
- Versión de contrato: `approval-editor-service-v1`.
- Rutas: `/health`, `/api/*`, `/api/overlays/*`.
- Runtime local: `services/approval-editor/projects/`.

El viejo path `approval-editor-service/` solo puede aparecer como nota histórica/migración. No debe volver a tener código activo.

`services/approval-editor/projects/` contiene datos runtime locales y está ignorado por git. **No lo borres a ciegas.**

## Assets y preview

Los assets locales de `01-Control-Panel/assets/` son para preview del navegador, no necesariamente para render/export final.

Dust actual:

```text
assets/dust-1.webm
assets/dust-2.webm
```

Preview debe resolver:

```text
dust-1 -> ./assets/dust-1.webm
dust-2 -> ./assets/dust-2.webm
```

Los MP4 canónicos de render/export siguen viviendo en `02-Video-Engine/assets/overlays/`. No mezcles preview liviano con render final sin checks específicos.

## Features y facades

Mantener facades estables:

- `features/approval/index.js`
- `features/scripts/index.js`
- `features/audio/index.js`
- `features/subtitles/index.js`
- `features/video-projects/index.js`
- `js/modules/app-shell.js`

Los imports externos al feature deberían entrar por esas facades, no por internals, salvo checks explícitos o módulos del mismo feature.

### Scripts

Scripts ya fue normalizado. La lógica vive en módulos internos:

```text
features/scripts/cards.js
features/scripts/client.js
features/scripts/controller.js
features/scripts/domain.js
features/scripts/polling.js
features/scripts/publish-status.js
features/scripts/render.js
```

Preservar comportamiento de publicación, polling, DOCX/download y Script → Audio.

### Approval

Approval ya fue normalizado detrás de `features/approval/index.js`.

Preservar callbacks, toasts, render sequencing, `data-action`, dataset contracts y dependency injection. App-shell debe consumir la facade.

### App-shell

El guard correcto de events apunta a:

```text
js/modules/app-shell/events/
```

No recrees `js/modules/app-shell/events.js`; era un target stale.

## Checks

`js/modules/__checks__/` contiene facades/checks de compatibilidad. No los borres por parecer redundantes.

`manifest.js` mapea facades a implementaciones por ownership. Si movés un check, actualizá manifest y checks de manifest.

Checks útiles desde `01-Control-Panel/`:

```powershell
python -m pytest tests/test_approval_editor_service_boundary_cleanup.py
python -m pytest tests/test_phase3_approval_scripts_extraction_parity.py
python -m pytest tests/test_phase6_runtime_parity_and_boundaries.py
python -m pytest tests/test_phase7_runtime_ui_replay_and_rollback.py
python -m pytest tests/test_phase8_html_css_readme_structure_refactor.py
node js/modules/__checks__/approval-editor-service-timings.check.cjs
```

Para el contrato cruzado con Video Engine:

```powershell
# desde 02-Video-Engine/
node --test tests/approval-editor-service-v1.test.js
```

## No build

No corras build para validar este subproyecto. La validación esperada es con pytest/checks Node focalizados.

## Cosas que NO se tocan casualmente

- `index.html` IDs y `data-action`.
- `styles.css` como import-only y orden de cascada.
- `styles/features/subtitles/index.css` como facade import-only.
- `js/legacy/app.js`, es histórico/no runtime.
- Runtime data en `services/approval-editor/projects/`.
- Facades de compatibilidad de checks y features.
- Contratos `approval-editor-service` / `approval-editor-service-v1`.

## Estado SDD reciente

Cambios relevantes completados y archivados:

- `approval-editor-service-boundary-cleanup`
- `control-panel-docs-hygiene`
- `scripts-feature-normalization`
- `app-shell-events-guard-fix`
- `approval-feature-normalization`
- `checks-organization`
- `audio-app-shell-decomposition`
- `subtitles-controller-decomposition`
- `control-panel-architecture-refactor`
- `brand-channel-assets-selection`

Antes de seguir, buscá memoria/SDD por el cambio correspondiente. Hay mucho contexto persistido en Engram y OpenSpec.

## Gotchas conocidos

- El working tree puede estar muy cargado por cambios acumulados. No hagas un commit gigante.
- Si hay que commitear, dividir por work units revisables.
- El root `C:\Users\pelot\Desktop\n8n` es un workspace grande; para Control Panel usá `C:\Users\pelot\Desktop\n8n\01-Control-Panel`.
- Las menciones antiguas a `approval-editor-service/` en archivos archivados son historia, no fuente de verdad actual.
- Si aparece la carpeta vieja `approval-editor-service/` vacía, puede ser un resto de Windows. No debería contener código activo.
