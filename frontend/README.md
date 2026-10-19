# Dashboard — Monitoreo Avícola

Dashboard en React para ver en tiempo real la temperatura y el riego de los galpones, con inicio de sesión, roles y administración.

## Stack

- Vite + React + TypeScript, React Router, TanStack Query
- Tailwind CSS + shadcn/ui (tema propio en `src/index.css`)
- Apache ECharts para las gráficas
- Fuentes: Bricolage Grotesque (títulos y cifras) e IBM Plex Sans / Mono

## Pantallas

| Ruta | Permiso |
| --- | --- |
| `/login`, `/cambiar-contrasena` | — |
| `/` resumen de galpones · `/galpones/:id` detalle en vivo | `telemetry.read` |
| `/administracion/galpones` | `devices.manage` |
| `/administracion/usuarios` | `users.read` (editar: `users.manage`) |
| `/administracion/roles` | `roles.manage` |
| `/administracion/bitacora` | `audit.read` |
| `/perfil` | sesión |

## Cómo funciona la sesión

- El access token vive solo en memoria; la sesión se mantiene con una cookie `httpOnly` que se renueva sola.
- Las pestañas se turnan para renovar la sesión (Web Locks), así varias pestañas abiertas no se cierran entre sí.
- Los datos en vivo llegan por `GET /api/stream` (server-sent events) y se mezclan en la caché de TanStack Query.

## Desarrollo

```bash
cp .env.example .env   # VITE_API_URL=http://localhost:3000/api
npm install
npm run dev            # http://localhost:5180
npm run build
npm run lint
```

## Producción

`Dockerfile` multi-stage: compila con Node 24 y sirve los archivos estáticos con nginx sin privilegios en el puerto 8080. Requiere el build argument `VITE_API_URL`.

Todas las horas se muestran en tiempo de Guatemala (`America/Guatemala`, UTC−6).
