# Monitoreo Avícola — Granjas Avícolas La Sierra

Sistema de monitoreo de temperatura y riego para los galpones. Un ESP32 con sensor DS18B20 mide la temperatura, detecta cuándo se enciende o apaga el riego (solo monitorea, no controla nada) y envía los datos por HTTP/JSON a esta API.

```
monitoreo-avicola/
├── backend/            # API (NestJS + Prisma + PostgreSQL 18)
├── frontend/           # Dashboard en React (prototipo con datos de demostración)
├── firmware/           # Firmware del ESP32 (DS18B20 + detección de riego)
├── docker-compose.yml  # Entorno local: postgres, adminer y api (perfil "full")
└── .env.example
```

Todas las fechas se guardan en UTC (`timestamptz`) y siempre las asigna el servidor.

## 1. Requisitos

- Node.js 24 LTS y npm
- Docker y Docker Compose
- (Opcional) `openssl` para generar API keys

## 2. Entorno local paso a paso

```bash
# 1. Variables de entorno (un solo .env en la raíz, lo usan Docker y la API)
cp .env.example .env
#    Genera una API key para el ESP32 y pégala en SEED_DEVICE_API_KEY:
openssl rand -hex 32

# 2. Levantar PostgreSQL y Adminer
docker compose up -d

# 3. Instalar dependencias (también genera el cliente de Prisma)
cd backend
npm install

# 4. Aplicar migraciones
npm run prisma:deploy        # o `npm run prisma:migrate` si cambias el schema

# 5. Seed: crea los roles, el primer administrador (ADMIN_EMAIL) y el dispositivo "Galpón 1"
npm run prisma:seed
#    Si ADMIN_PASSWORD está vacío, el seed imprime una contraseña temporal
#    que se cambia en el primer inicio de sesión.

# 6. Arrancar la API con recarga automática
npm run start:dev
```

- API: http://localhost:3000/api
- Swagger: http://localhost:3000/api/docs (botón **Authorize** → `x-api-key`)
- Health: http://localhost:3000/api/health

Para levantar todo en Docker (incluida la API compilada): `docker compose --profile full up -d --build`.

### Probar con curl

```bash
API_KEY=<la SEED_DEVICE_API_KEY de tu .env>

# Lectura (cada 30 s desde el ESP32) → 201
curl -i -X POST http://localhost:3000/api/readings \
  -H "x-api-key: $API_KEY" -H "Content-Type: application/json" \
  -d '{ "temperature": 29.50, "irrigation": false }'

# Lectura con humedad opcional → 201
curl -i -X POST http://localhost:3000/api/readings \
  -H "x-api-key: $API_KEY" -H "Content-Type: application/json" \
  -d '{ "temperature": 29.50, "humidity": 65, "irrigation": true }'

# Evento (cuando cambia el riego) → 201
curl -i -X POST http://localhost:3000/api/events \
  -H "x-api-key: $API_KEY" -H "Content-Type: application/json" \
  -d '{ "type": "irrigation_off", "temperature": 28.10, "durationMin": 8.5 }'

# Evento con temperatura null → 201
curl -i -X POST http://localhost:3000/api/events \
  -H "x-api-key: $API_KEY" -H "Content-Type: application/json" \
  -d '{ "type": "sensor_error", "temperature": null }'

# Sin key → 401 · Key incorrecta → 401 · Temperatura fuera de rango → 400
curl -i -X POST http://localhost:3000/api/readings -H "Content-Type: application/json" -d '{ "temperature": 29.5, "irrigation": false }'
curl -i -X POST http://localhost:3000/api/readings -H "x-api-key: incorrecta" -H "Content-Type: application/json" -d '{ "temperature": 29.5, "irrigation": false }'
curl -i -X POST http://localhost:3000/api/readings -H "x-api-key: $API_KEY" -H "Content-Type: application/json" -d '{ "temperature": 200, "irrigation": false }'

# Health
curl http://localhost:3000/api/health
```

Tipos de evento válidos: `irrigation_on`, `irrigation_off`, `heat_alert_no_irrigation`, `prolonged_irrigation_alert`, `sensor_error`.

Validaciones: `temperature` entre -40 y 125 °C; `humidity` (opcional) entre 0 y 100; `durationMin` (opcional) ≥ 0. Cualquier campo extra (por ejemplo `createdAt`) se rechaza con 400.

### Pruebas

```bash
cd backend
npm test           # unitarias
npm run test:e2e   # e2e de /api/readings y /api/events (Postgres debe estar en marcha)
```

Las pruebas e2e crean un dispositivo temporal en la base de datos de `DATABASE_URL` y lo eliminan al terminar (sus lecturas y eventos se borran en cascada).

## Usuarios, roles y permisos

El dashboard usa inicio de sesión con correo y contraseña. No hay registro público: el administrador crea los usuarios, que reciben una **contraseña temporal** y deben cambiarla en su primer ingreso.

- **Access token** (JWT, 15 min) en el header `Authorization: Bearer …`.
- **Refresh token** en una cookie `httpOnly` (30 días, se renueva en cada uso). Cerrar sesión, desactivar al usuario o cambiar la contraseña invalida las sesiones al instante.
- Contraseñas con **Argon2id**. El login tiene un límite de 5 intentos por minuto.

| Rol | Permisos |
| --- | --- |
| Administrador | Todos (no se puede editar) |
| Encargado | `telemetry.read`, `reports.export`, `alerts.manage`, `settings.manage` |
| Observador | `telemetry.read` |

Permisos disponibles: `telemetry.read` (ver galpones y datos), `reports.export` (descargar reportes), `alerts.manage` (cerrar alertas, recibir escalamientos, ajustar sus tiempos), `settings.manage` (umbrales), `devices.manage` (registrar galpones y API keys), `users.read`, `users.manage`, `roles.manage`, `audit.read` (bitácora). El administrador puede crear roles propios combinándolos.

> Los permisos nuevos se agregan solos al Administrador al correr el seed. En una base que ya tenía roles, actívalos para los demás roles desde **Roles y permisos**.

### Comandos de administración

Desde `backend/` (local) o desde la terminal del contenedor en Dokploy (`cd /app`):

```bash
npm run cli -- create-user --email ana@granja.com --name "Ana" --role viewer   # local (compila a .cli-build/)
npm run cli:prod -- create-user --email ana@granja.com --name "Ana" --role viewer  # contenedor
npm run cli:prod -- reset-password --email ana@granja.com
npm run cli:prod -- list-devices
npm run cli:prod -- create-device --name "Galpón 2" --shed "Galpón 2"   # imprime la API key del ESP32
npm run cli:prod -- rotate-device-key --device <id>                      # la key anterior deja de funcionar
```

### Endpoints del dashboard

| Método y ruta | Permiso |
| --- | --- |
| `POST /api/auth/login` · `POST /api/auth/refresh` | Público |
| `GET /api/auth/me` · `PATCH /api/auth/me/password` · `POST /api/auth/logout` | Sesión |
| `GET /api/devices` · `GET /api/devices/:id` | `telemetry.read` |
| `GET /api/devices/:id/readings?from&to` · `/events` · `/summary` | `telemetry.read` |
| `GET /api/stream` (tiempo real, server-sent events) | `telemetry.read` |
| `PATCH /api/devices/:id/settings` | `settings.manage` |
| `POST /api/devices` · `PATCH /api/devices/:id` · `POST /api/devices/:id/rotate-key` | `devices.manage` |
| `GET /api/users` · `GET /api/roles` | `users.read` |
| `POST /api/users` · `PATCH /api/users/:id` · `POST /api/users/:id/reset-password` | `users.manage` |
| `POST/PATCH/DELETE /api/roles` · `GET /api/roles/permissions` | `roles.manage` |
| `GET /api/reports/operations?format=pdf\|xlsx&from&to&deviceId` · `GET /api/reports/recent` | `reports.export` |
| `GET /api/alerts?status&deviceId&kind&severity&before` · `GET /api/alerts/stats?days&deviceId` · `GET /api/alerts/:id` · `POST /api/alerts/:id/acknowledge` | `telemetry.read` |
| `POST /api/alerts/:id/resolve` · `PATCH /api/devices/:id/alert-rules` | `alerts.manage` |
| `GET /api/notifications` · `/unread-count` · `POST /api/notifications/:id/read` · `/read-all` | Sesión |
| `GET /api/notifications/settings` · `PATCH /api/notifications/preferences` · `POST /api/notifications/channels/telegram/link` · `/channels/whatsapp/link` · `DELETE /api/notifications/channels/:id` · `POST /api/notifications/test` | Sesión |
| `GET /api/notifications/groups` · `POST /api/notifications/groups/link` · `DELETE /api/notifications/groups/:id` · `GET /api/notifications/deliveries` · `POST /api/notifications/deliveries/:id/retry` | `alerts.manage` |
| `POST /api/telegram/webhook` (secreto en cabecera) · `POST /api/whatsapp/webhook` (firma de Twilio) | Público, verificado |
| `GET /api/audit-logs` | `audit.read` |

La documentación interactiva completa está en `/api/docs`.

### Reportes

Sección **Reportes** del dashboard (permiso `reports.export`): se elige galpón (o todos), periodo (hoy, ayer, 7 o 30 días, este mes, mes anterior o personalizado, hasta 92 días) y formato. Los archivos se generan en el servidor, en hora de Guatemala.

- **PDF** (pdfkit): membrete, código de reporte, indicadores (promedio, mínima y máxima con fecha, tiempo en rango óptimo, riego, alertas, cobertura de datos), hallazgos redactados a partir de los datos, gráfica con umbrales, detalle por día, registro de alertas, notas y firmas. Numeración "Página X de Y".
- **Excel** (exceljs): hojas *Resumen*, *Resumen diario* (con filtros y barras de rango óptimo), *Eventos* y *Lecturas* (cada lectura hasta 7 días; promedios de 5 minutos en periodos más largos).

Cada descarga queda en la bitácora (`report.exported`).

### Alertas y notificaciones

Cada problema se convierte en una **alerta** (un incidente) que se abre una sola vez, se recuerda mientras nadie la atiende y se cierra sola cuando el problema termina.

| Alerta | Origen | Gravedad | Se cierra cuando… |
| --- | --- | --- | --- |
| Calor sin riego | Evento del ESP32 | Crítica | Se enciende el riego o la temperatura baja de la alerta − 0.5 °C por 5 min |
| Error del sensor | Evento del ESP32 | Crítica | Llega una lectura válida |
| Riego prolongado | Evento del ESP32 | Advertencia | Se apaga el riego |
| Galpón sin conexión | Servidor (cada minuto) | Crítica | Vuelven a llegar datos |
| Calor sostenido | Servidor | Crítica | Igual que calor sin riego |
| Frío sostenido | Servidor | Advertencia | La temperatura supera el mínimo + 0.5 °C por 5 min |

- **"Lo atiendo"** registra quién se hace cargo y detiene recordatorios y escalamiento.
- **Recordatorios** cada 30 min mientras nadie la atiende (máx. 4). **Escalamiento** a quienes tienen `alerts.manage` si una crítica no se atiende en 15 min.
- Tiempos por galpón (botón **Tiempos de alerta** en cada galpón, o `PATCH /api/devices/:id/alert-rules`): sin conexión 5 min, calor sostenido 10 min, frío sostenido 30 min, recordatorio 30 min, escalamiento 15 min.
- En el dashboard: campana con contador, panel de alertas activas y notificaciones, avisos en vivo y aviso fijo en el resumen y en cada galpón.
- Página **Alertas** (`/alertas`): resumen de 7/30/90 días (cantidad, tiempo de respuesta, duración, escaladas, por tipo) e historial agrupado por día con quién la atendió, cuánto duró y cómo se cerró. Los filtros quedan en la URL para compartir la vista.

#### Telegram y WhatsApp

Cada notificación de la campana también sale por los chats que la persona vinculó en **Mi perfil**:

- **Telegram**: el botón "Vincular" abre el bot con un código de un solo uso (`/start 123456`). Los mensajes de alerta traen **✋ Lo atiendo** y **📊 Ver galpón**. Comandos: `/estado`, `/alertas`, `/ayuda`, `/desvincular`.
- **Grupo de la granja** (Administración → Notificaciones, `alerts.manage`): se agrega el bot al grupo y se escribe `/vincular 123456`. El grupo recibe aperturas, recordatorios, cierres, quién atiende cada alerta y el resumen diario. Para tocar "Lo atiendo" en el grupo, la persona debe tener su propio Telegram vinculado.
- **WhatsApp (Twilio)**: la persona escribe su número y envía `VINCULAR 123456` desde ese número. Responde **OK** para atender la última alerta, **ESTADO** para ver los galpones, **ALERTAS** y **SALIR**. En el *sandbox* de Twilio cada persona envía primero `join <palabras>` y WhatsApp solo entrega mensajes dentro de las 24 h siguientes a su último mensaje; fuera de esa ventana el envío queda como "No enviado" y el perfil le pide escribir **ESTADO**.
- **Preferencias por persona**: canal encendido o pausado, incluir advertencias, horario de silencio (solo críticas) y resumen diario. Las alertas críticas llegan siempre.
- **Resumen diario a las 18:00** (Guatemala): temperaturas, tiempo en rango, riegos y alertas de cada galpón. En Telegram llega con el reporte PDF del día.
- **Entrega confiable**: cada mensaje queda en `notification_deliveries` y se reintenta hasta 5 veces (30 s, 2 min, 10 min, 30 min). Si alguien bloquea el bot, su chat se desactiva. El registro con reintento manual está en Administración → Notificaciones.
- Sin credenciales, cada canal simplemente queda apagado; el resto del sistema funciona igual.

**Configurar Telegram**
1. En Telegram, habla con [@BotFather](https://t.me/BotFather) → `/newbot` → copia el token.
2. Local: `TELEGRAM_BOT_TOKEN=<token>` en `.env` (modo `polling`, no necesita URL pública).
3. Producción: además `TELEGRAM_MODE=webhook`, `TELEGRAM_WEBHOOK_URL=https://lasierraapi.tavcode.com/api/telegram/webhook` y `TELEGRAM_WEBHOOK_SECRET` (`openssl rand -hex 24`). La API registra el webhook al arrancar. Un mismo bot no puede usarse en polling y webhook a la vez: usa un bot distinto para local.

**Configurar WhatsApp (Twilio sandbox)**
1. Crea una cuenta en twilio.com → *Messaging → Try it out → Send a WhatsApp message*. Anota el número y la frase `join …`.
2. `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_SANDBOX_JOIN_CODE="join …"` (y `TWILIO_WHATSAPP_FROM` si no es el número del sandbox).
3. En la consola del sandbox, *When a message comes in*: `https://lasierraapi.tavcode.com/api/whatsapp/webhook` (POST), y la misma URL en `TWILIO_WEBHOOK_URL` (se usa para verificar la firma). Localmente hace falta un túnel (por ejemplo `ngrok http 3000`).

## 3. Ver la base de datos en Adminer

Abre http://localhost:8080 e ingresa:

| Campo | Valor |
| --- | --- |
| Sistema | PostgreSQL |
| Servidor | `postgres` |
| Usuario | `POSTGRES_USER` de tu `.env` (por defecto `avicola`) |
| Contraseña | `POSTGRES_PASSWORD` (por defecto `avicola_dev`) |
| Base de datos | `POSTGRES_DB` (por defecto `monitoreo_avicola`) |

Tablas: `devices`, `device_settings`, `readings`, `events`. También puedes usar `npm run prisma:studio` desde `backend/`.

## 4. Configurar el ESP32

Las conexiones, la configuración y cómo cargar el firmware están en [`firmware/README.md`](firmware/README.md). En resumen:

1. Copia `firmware/esp32-galpon/secrets.example.h` como `secrets.h` y pon el WiFi y la `API_KEY`.
2. En `firmware/esp32-galpon/config.h` elige la URL:
   ```cpp
   #define API_URL "https://lasierraapi.tavcode.com/api"   // producción
   #define API_URL "http://<IP-de-mi-PC>:3000/api"          // pruebas locales, ej. http://192.168.0.2:3000/api
   ```
   Para la IP de tu PC: Windows `ipconfig` ("Dirección IPv4" del adaptador WiFi) · macOS `ipconfig getifaddr en0` · Linux `hostname -I`.
3. El ESP32 envía el header `x-api-key` y `Content-Type: application/json` a:
   - `POST {API_URL}/readings` con `{ "temperature": 29.50, "irrigation": false }` cada 30 s
   - `POST {API_URL}/events` con `{ "type": "irrigation_off", "temperature": 28.10, "durationMin": 8.5 }` cuando cambia el riego

La API escucha en `0.0.0.0`, así que acepta conexiones de la red local. El ESP32 y la PC deben estar en la misma red WiFi.

**Firewall de Windows:** puede ser necesario permitir el puerto 3000. En PowerShell como administrador:

```powershell
New-NetFirewallRule -DisplayName "Monitoreo Avicola API" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
```

(En macOS, si el firewall está activo, acepta el aviso "¿Permitir conexiones entrantes a node?".)

## 5. Despliegue en Dokploy (AWS EC2)

La base de datos se crea aparte (servicio PostgreSQL 18 en Dokploy) y la API se despliega desde el Dockerfile.

- **Tipo de build:** Dockerfile
- **Contexto de build:** `backend/` · **Dockerfile:** `backend/Dockerfile`
- **Puerto del contenedor:** `3000`
- Al iniciar, el contenedor ejecuta `prisma migrate deploy` y luego arranca la API.

Variables de entorno:

| Variable | Obligatoria | Ejemplo / valor por defecto |
| --- | --- | --- |
| `DATABASE_URL` | Sí | `postgresql://user:pass@host:5432/monitoreo_avicola?schema=public` |
| `NODE_ENV` | No | `production` (por defecto en la imagen) |
| `HOST` | No | `0.0.0.0` |
| `PORT` | No | `3000` |
| `CORS_ORIGINS` | Sí, para el dashboard | `https://lasierra.tavcode.com` (separadas por coma; vacío = CORS desactivado) |
| `TRUST_PROXY` | No | `true` detrás del proxy de Dokploy (Traefik), para que el rate limit use la IP real |
| `THROTTLE_TTL_MS` / `THROTTLE_LIMIT` | No | `60000` / `120` |
| `SWAGGER_ENABLED` | No | `true` (ponlo en `false` si no quieres exponer la documentación) |
| `JWT_SECRET` | **Sí** | Secreto para firmar sesiones: `openssl rand -base64 48` |
| `ACCESS_TOKEN_TTL_SECONDS` / `REFRESH_TOKEN_TTL_DAYS` | No | `900` / `30` |
| `ADMIN_EMAIL` / `ADMIN_NAME` / `ADMIN_PASSWORD` | Solo para el seed | Primer administrador. Sin `ADMIN_PASSWORD` se imprime una contraseña temporal |
| `SEED_DEVICE_API_KEY` | Solo para el seed | Una key distinta a la de desarrollo (`openssl rand -hex 32`) |
| `DASHBOARD_URL` | No | `https://lasierra.tavcode.com` (enlaces "Ver galpón" en Telegram y WhatsApp) |
| `TELEGRAM_BOT_TOKEN` | No | Token de @BotFather. Sin él, Telegram queda apagado |
| `TELEGRAM_MODE` / `TELEGRAM_WEBHOOK_URL` / `TELEGRAM_WEBHOOK_SECRET` | No | `webhook` / `https://lasierraapi.tavcode.com/api/telegram/webhook` / `openssl rand -hex 24` |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | No | Credenciales de Twilio. Sin ellas, WhatsApp queda apagado |
| `TWILIO_WHATSAPP_FROM` / `TWILIO_SANDBOX_JOIN_CODE` / `TWILIO_WEBHOOK_URL` | No | `whatsapp:+14155238886` / `join …` / `https://lasierraapi.tavcode.com/api/whatsapp/webhook` |

**Healthcheck:** `GET /api/health` (200 si la base de datos responde, 503 si no). La imagen ya incluye un `HEALTHCHECK` que lo consulta.

**Seed en producción** (una sola vez, desde la terminal del contenedor en Dokploy, con `SEED_DEVICE_API_KEY` definida):

```sh
cd /app && npm run seed:prod
```

La terminal de Dokploy se abre en `/`; la app vive en `/app`.

Si la API usa un dominio con HTTPS, el ESP32 debe usar esa URL (`https://api.midominio.com/api`) y validar el certificado.
