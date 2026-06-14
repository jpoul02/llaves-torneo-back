# llaves-torneo-back

API + sync en vivo (SSE) para el Torneo LLAVES. Estado compartido en **Postgres**.

## Variables de entorno

| Var | ¿Quién la pone? | Valor |
| --- | --- | --- |
| `ADMIN_KEY` | **Tú** (obligatoria) | Clave secreta para poder editar. Ej: `mi-clave-123` |
| `DATABASE_URL` | **Railway** (automática) | La inyecta al añadir el plugin Postgres. No la escribas a mano. |
| `ALLOWED_ORIGIN` | **Tú** | URL pública del front, ej: `https://llaves-torneo-front-production.up.railway.app`. Varios = separados por coma. `*` = cualquiera (menos seguro). |
| `PORT` | **Railway** (automática) | No tocar. |

## Deploy en Railway

1. **New Project → Deploy from GitHub repo** → `llaves-torneo-back`.
2. **+ New → Database → Add PostgreSQL.** Railway crea `DATABASE_URL` y la conecta al servicio.
3. En el servicio back → **Variables** → añade:
   - `ADMIN_KEY` = tu clave secreta.
   - `ALLOWED_ORIGIN` = URL del front (puedes ponerla después de desplegar el front).
4. Railway corre `npm start` solo. La tabla `app_state` se crea sola al arrancar.
5. Copia la **URL pública** del back (Settings → Networking → Generate Domain). Esa URL va en `API_BASE` del front.

## Local

```bash
npm install
ADMIN_KEY=test123 PORT=3000 node server.js   # sin DATABASE_URL = guarda en memoria
```

## Endpoints

| Método | Ruta | Auth | Qué hace |
| --- | --- | --- | --- |
| GET | `/api/state` | — | Estado actual `{ state }` |
| GET | `/api/admin/verify` | `x-admin-key` | `{ ok: true/false }` |
| POST | `/api/state` | `x-admin-key` | Guarda estado y avisa a todos |
| GET | `/api/events` | — | Stream SSE (push en vivo) |
