# Monitoreo Avícola — Granjas Avícolas La Sierra

Sistema de monitoreo de temperatura y riego para los galpones. Un ESP32 con sensor DS18B20 mide la temperatura, detecta cuándo se enciende o apaga el riego (solo monitorea, no controla nada) y envía los datos por HTTP/JSON a esta API.

```
monitoreo-avicola/
├── backend/            # API (NestJS + Prisma + PostgreSQL 18)
├── frontend/           # Dashboard en React (pendiente)
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

# 5. Seed: registra el dispositivo "Galpón 1" con su configuración por defecto
npm run prisma:seed

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

1. Averigua la IP de tu computadora en la red WiFi:
   - Windows: `ipconfig` → "Dirección IPv4" del adaptador WiFi
   - macOS: `ipconfig getifaddr en0` · Linux: `hostname -I`
2. En el firmware configura:
   ```cpp
   const char* API_URL = "http://<IP-de-mi-PC>:3000/api";   // ej. http://192.168.0.2:3000/api
   const char* API_KEY = "<SEED_DEVICE_API_KEY de tu .env>";
   ```
3. El ESP32 envía el header `x-api-key: <API_KEY>` y `Content-Type: application/json` a:
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
| `CORS_ORIGINS` | No | `https://dashboard.midominio.com` (separadas por coma; `*` = cualquiera; vacío = CORS desactivado) |
| `TRUST_PROXY` | No | `true` detrás del proxy de Dokploy (Traefik), para que el rate limit use la IP real |
| `THROTTLE_TTL_MS` / `THROTTLE_LIMIT` | No | `60000` / `120` |
| `SWAGGER_ENABLED` | No | `true` (ponlo en `false` si no quieres exponer la documentación) |
| `SEED_DEVICE_API_KEY` | Solo para el seed | Una key distinta a la de desarrollo (`openssl rand -hex 32`) |

**Healthcheck:** `GET /api/health` (200 si la base de datos responde, 503 si no). La imagen ya incluye un `HEALTHCHECK` que lo consulta.

**Seed en producción** (una sola vez, desde la terminal del contenedor en Dokploy, con `SEED_DEVICE_API_KEY` definida):

```bash
npm run seed:prod
```

Si la API usa un dominio con HTTPS, el ESP32 debe usar esa URL (`https://api.midominio.com/api`) y validar el certificado.
