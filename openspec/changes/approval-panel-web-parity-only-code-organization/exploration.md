## Exploration: approval-panel-web-parity-only-code-organization

### Current State
El proyecto ya está altamente protegido por contratos de paridad (DOM IDs, bootstrap chain, APIs, CSS import order y replay runtime). La arquitectura funcional existe (`core`, `features`, `runtime`), pero `js/modules/app-shell.js` concentra todavía demasiado volumen (estado global, wiring, handlers, render, utilidades puras y test hooks) en un único archivo (~2292 líneas). Esto aumenta el costo de mantenimiento sin aportar valor funcional.

### Affected Areas
- `js/modules/app-shell.js` — mayor punto de concentración; contiene responsabilidades mezcladas que pueden separarse sin cambiar comportamiento.
- `js/modules/shared/dom/selectors.js` — contrato crítico de IDs; cualquier reorganización debe respetarlo 1:1.
- `js/modules/core/bootstrap.js` — frontera de eventos core; puede mantenerse estable mientras se extrae lógica no-core de `app-shell`.
- `js/modules/features/audio/runtime/*.js` — actualmente son pasarelas; permiten extraer organización de audio sin tocar UX.
- `js/modules/features/subtitles/runtime/*.js` — mismo patrón de pasarela; útil para mover utilidades/servicios puros.
- `js/modules/__checks__/parity-checklist.js` — congela bootstrap (`index.html -> main.js -> composition-root.js -> app-shell.js`).
- `docs/parity/contract-matrix.md` — define checkpoints de no-regresión para flujos protegidos.
- `tests/test_phase6_runtime_parity_and_boundaries.py` — protege contratos HTTP y límites de dependencia.
- `tests/test_phase7_runtime_ui_replay_and_rollback.py` — protege replay de flujo visible.
- `tests/test_phase9_appshell_decomposition_archive_legacy.py` — protege descomposición y reglas de runtime/archive.

### Approaches
1. **Extract pure utility modules from `app-shell` first** — mover únicamente funciones puras (sin acceso directo a DOM/estado mutable) a módulos por dominio.
   - Pros: riesgo bajo; diffs auditables; alta mejora de legibilidad; fácil rollback.
   - Cons: beneficio parcial (wiring sigue en `app-shell`).
   - Effort: Low.

2. **Domain controller split with stable façade** — separar `app-shell` en controladores por dominio (approval/scripts/audio/subtitles + shell bootstrap), manteniendo `bootApp`/`bootCompatibilityShell` como API estable.
   - Pros: mayor mantenibilidad y ownership claro por dominio.
   - Cons: riesgo medio por cambios en wiring/eventos; más puntos de integración.
   - Effort: Medium.

3. **Declarative binding maps for event wiring** — reemplazar binding imperativo repetitivo por tablas declarativas de eventos/handlers (core + features).
   - Pros: reduce duplicación y errores de wiring.
   - Cons: más riesgo de drift silencioso en listeners si no se hace incrementalmente.
   - Effort: Medium.

### Recommendation
Aplicar un plan incremental en **2 olas de bajo riesgo**, empezando por la opción 1:

1) **Ola A (muy baja fricción):** extraer utilidades puras desde `app-shell` a módulos de dominio (subtitles/audio/ui-formatters), sin tocar nombres de funciones públicas ni contratos de bootstrap/DOM/API.

2) **Ola B (solo si A queda verde):** split interno de controladores por dominio con una fachada estable en `app-shell` que conserve exactamente el entrypoint actual.

No recomiendo arrancar por bindings declarativos globales (opción 3) porque tiene mayor superficie de error para una meta de paridad estricta.

### Risks
- Drift accidental en contrato de IDs del DOM al mover wiring (impacta `selectors.js` + checks).
- Drift en bootstrap boundary si se altera import chain protegida por checklist.
- Cambios de timing en polling/autosave/render de subtítulos al reubicar funciones con side effects.
- Riesgo de “refactor cosmético” sin reducción real de acoplamiento si no se separan primero utilidades puras.

### Ready for Proposal
Yes — listo para `sdd-propose` con alcance acotado a reorganización interna de `app-shell` en fases pequeñas y rollback por slice.
