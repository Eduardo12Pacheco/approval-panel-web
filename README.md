# Approval Panel Web

Panel editorial interno en **HTML/CSS/JavaScript vanilla** para operar Approval, guiones, audio, subtítulos y proyectos de video.

La prioridad de este proyecto es simple:

> Mantener el comportamiento exactamente igual mientras el código se ordena por capas y features.

No es una app con framework. Es un panel de operación con contratos de DOM, APIs, assets y estilos protegidos por checks de paridad. La organización existe para refactorizar **sin cambios de features, API ni UX** fuera de lo aprobado.

## Qué podés hacer acá

- Revisar y accionar items de aprobación.
- Editar/publicar guiones.
- Pasar de Script → Audio.
- Gestionar jobs de audio/TTS.
- Ejecutar flujos de subtítulos.
- Trabajar con Video Projects, preview, overlays, logos, música y composición.
- Usar el servicio local Approval Editor para snapshots/contratos del editor.

## API unificada para Radar y Channel Monitor

En modo normal el panel usa un solo `API Origin / Endpoint del proyecto` y una sola `x-api-key compartida`.

```text
https://api.automatizacionedun8n.me/radar   -> Transcript Service
https://api.automatizacionedun8n.me/monitor -> Channel Monitor
```

El campo visible `Base URL Channel Monitor` ya no forma parte de la configuración normal. El estado conserva `channelMonitorBaseUrl` solo como fallback interno/migración para operación legacy explícita; en modo unificado Monitor resuelve desde `apiOrigin + /monitor` y usa la key compartida.

## Cómo abrir el panel

Desde la raíz del workspace:

```powershell
python -m http.server 8080
```

Abrir:

```text
http://localhost:8080/01-Control-Panel/
```

## Servicio local Approval Editor

El servicio local activo vive en:

```text
01-Control-Panel/services/approval-editor/
```

Se levanta con:

```powershell
cd C:\Users\pelot\Desktop\n8n\01-Control-Panel
node .\services\approval-editor\server.js
```

Contratos importantes:

| Contrato | Valor |
|---|---|
| Puerto default | `3042` |
| Health | `http://127.0.0.1:3042/health` |
| API | `/api/*` |
| Overlays | `/api/overlays/*` |
| Versión | `approval-editor-service-v1` |

`services/approval-editor/projects/` guarda snapshots/audio/output locales generados por el editor. Está ignorado por git. **No lo borres a ciegas.**

Si tenés snapshots viejos de antes de la mudanza, movelos manualmente desde:

```text
01-Control-Panel/approval-editor-service/projects/
```

hacia:

```text
01-Control-Panel/services/approval-editor/projects/
```

## Arquitectura

La arquitectura separa frontend browser, servicio local, assets livianos de preview, estilos, tests y documentación.

## Mapa de carpetas

```text
01-Control-Panel/
├─ index.html                      # HTML principal, IDs/data-action son contrato
├─ assets/                         # WebM livianos para preview del navegador
├─ js/                             # frontend browser ES modules
│  ├─ main.js
│  ├─ legacy/app.js                # histórico, no runtime
│  └─ modules/
│     ├─ composition-root.js
│     ├─ app-shell.js              # facade estable del shell
│     ├─ app-shell/                # lifecycle, composition, events, views, voice
│     ├─ core/                     # auth, state, http, ui helpers
│     ├─ features/
│     │  ├─ approval/
│     │  ├─ scripts/
│     │  ├─ audio/
│     │  ├─ subtitles/
│     │  ├─ video-projects/
│     │  └─ radar/
│     ├─ shared/
│     └─ __checks__/               # checks/facades de paridad
├─ services/
│  └─ approval-editor/             # backend Node local
├─ styles.css                      # import-only
├─ styles/                         # CSS organizado por tokens/base/layout/components/features
├─ tests/                          # pytest guardrails
├─ docs/
└─ openspec/                       # historial SDD
```

## Assets de preview

Los assets en `01-Control-Panel/assets/` son livianos para el navegador.

Dust actual:

```text
assets/dust-1.webm
assets/dust-2.webm
```

La preview usa:

```text
dust-1 -> ./assets/dust-1.webm
dust-2 -> ./assets/dust-2.webm
```

Los MP4 pesados/canónicos para render viven en `02-Video-Engine/assets/overlays/`. La idea es no cargar videos enormes en la preview si alcanza con WebM liviano.

## Cómo está organizado el código

### `js/modules/core/`

Utilidades compartidas:

- auth/session
- app store/localStorage
- clientes HTTP
- helpers UI como toast, escape HTML, word count

### `js/modules/features/approval/`

Approval queue, cards, detalle y acciones editoriales.

Entrada estable:

```text
features/approval/index.js
```

### `js/modules/features/scripts/`

Guiones, publicación, polling, descarga y Script → Audio.

Entrada estable:

```text
features/scripts/index.js
```

Internals actuales:

```text
cards.js
client.js
controller.js
polling.js
publish-status.js
render.js
```

### `js/modules/features/audio/`

Generación de audio/TTS, cola de jobs, SSE/polling, tracking y descargas.

### `js/modules/features/subtitles/`

Subtítulos remotos, preview, tabla editable, sesiones e historial.

### `js/modules/features/video-projects/`

Video Projects, preview/composición, editor visual, assets, motion, música y render payloads.

Áreas internas:

```text
video-projects/controller/*
data/
domain/
composition/
audio/
render/
events/
video-projects/__checks__/*
```

### `js/modules/app-shell/`

Orquestación general de la app: composición, lifecycle, events, views y flujo Script → Audio.

## Guardrails de paridad

No cambiar sin checks específicos:

- IDs del DOM en `index.html`.
- `data-action`.
- Copy visible/toasts.
- Endpoints, headers y payload keys.
- Orden de imports CSS.
- Rutas de assets usadas por preview.
- Facades públicas de features.
- Contrato `approval-editor-service-v1`.

## Validación recomendada

## Workflow seguro por slices

Desde `01-Control-Panel/`:

```powershell
python -m pytest tests/test_approval_editor_service_boundary_cleanup.py
python -m pytest tests/test_phase3_approval_scripts_extraction_parity.py
python -m pytest tests/test_phase6_runtime_parity_and_boundaries.py
python -m pytest tests/test_phase7_runtime_ui_replay_and_rollback.py
python -m pytest tests/test_phase8_html_css_readme_structure_refactor.py
node js/modules/__checks__/approval-editor-service-timings.check.cjs
```

Contrato cruzado con Video Engine:

```powershell
cd C:\Users\pelot\Desktop\n8n\02-Video-Engine
node --test tests/approval-editor-service-v1.test.js
```

No hace falta correr build para validar este panel. La validación normal es con pytest y checks Node focalizados. **No correr builds** para este subproyecto.

Checks focalizados para Radar/Monitor:

```powershell
python -m pytest "01-Control-Panel/tests/test_radar_panel_contract.py"
node --experimental-default-type=module "01-Control-Panel/js/modules/features/radar/__checks__/radar-panel-check.js"
```

## Qué NO borrar

- `js/legacy/app.js`: histórico/no runtime.
- `services/approval-editor/projects/`: datos runtime locales.
- `js/modules/__checks__/`: facades y checks de paridad.
- Facades de features como `features/*/index.js`; son fachadas de compatibilidad cuando sostienen imports existentes.
- Artifacts archivados en `openspec/changes/archive/`.

## Si vas a refactorizar

Hacelo en slices chicos y verificables.

Buen patrón:

1. Agregar/confirmar check de paridad.
2. Extraer detrás de una facade estable.
3. Mantener imports públicos igual.
4. Ejecutar checks focalizados.
5. Documentar si cambia la estructura.

No mezcles cambios grandes en un solo commit. Este proyecto tiene mucho historial SDD y varios contratos cruzados con `02-Video-Engine` y `03-Contracts-Core`.

## Estado actual de ordenamiento

Ya se completaron refactors importantes:

- Service boundary: `approval-editor-service` → `services/approval-editor`.
- Docs/source-tree hygiene.
- Scripts normalization.
- Approval normalization.
- App-shell events guard fix.
- Checks organization.
- Audio/app-shell decomposition.
- Subtitles controller decomposition.
- Video Projects architecture refactor.
- Dust preview WebM optimization.

Si algo parece duplicado, primero buscá si es facade de compatibilidad o contrato de paridad antes de borrarlo.
