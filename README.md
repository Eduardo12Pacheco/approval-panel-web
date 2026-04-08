# Approval Panel Web (MVP)

Panel privado para revisar y aprobar temas sin abrir Google Sheets.

## Qué incluye

- Lista de pendientes (`GET /webhook/approval/pending/v1`)
- Filtros por búsqueda, país y cantidad de fuentes
- Detalle por tema con fuentes (`GET /webhook/approval/topic/v1?cluster_id=...`)
- Acciones aprobar/rechazar (`POST /webhook/approval/decision/v1`)

## Ejecutar local

Podés abrir `index.html` directamente, pero es mejor servir la carpeta con un servidor estático:

```bash
python -m http.server 8080
```

Luego abrir:

`http://localhost:8080/approval-panel-web/`

## Configuración dentro de la app

Botón **Configuración**:

- **Base URL n8n**: ej. `https://tu-n8n.midominio.com`
- **x-approval-secret**: opcional (si activás validación por header en endpoints)

La configuración se guarda en `localStorage` del navegador.

## Deploy gratis + privado (Cloudflare Pages + Access)

### 1) Deploy en Cloudflare Pages

1. Subí este repo a GitHub (o conectá repositorio existente).
2. En Cloudflare Pages: **Create Project** -> conectar repo.
3. Build settings:
   - Framework preset: `None`
   - Build command: *(vacío)*
   - Build output directory: `approval-panel-web`
4. Deploy.

### 2) Restringir acceso solo a 3 personas (Cloudflare Access)

1. Cloudflare Zero Trust -> Access -> Applications -> Add application.
2. Tipo: **Self-hosted** (apunta al dominio de Pages).
3. Policy: **Allow** solo estos 3 emails.
4. Deny por default para todo lo demás.

### 3) CORS (si tu n8n está en otro dominio)

Si la app web y n8n están en dominios distintos, verificá que n8n permita CORS para el dominio del panel.

## Endpoints esperados

- `GET /webhook/approval/pending/v1`
- `GET /webhook/approval/topic/v1?cluster_id=<id>`
- `POST /webhook/approval/decision/v1`

## Próximas mejoras sugeridas

- Acción `reset` visible desde UI
- Filtro por estado y fecha
- Historial de decisiones por usuario (audit)
- Token/HMAC obligatorio en decision endpoint
