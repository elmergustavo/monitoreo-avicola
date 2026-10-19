# Firmware ESP32 — Monitoreo Avícola

Firmware para el ESP32 que mide la temperatura con un DS18B20, detecta cuándo se enciende o apaga el riego y envía los datos a la API por HTTPS.

- Cada **30 s**: `POST /api/readings` con `{ "temperature": 29.50, "irrigation": false }`
- Cuando cambia el riego: `POST /api/events` con `irrigation_on` / `irrigation_off` (con la duración en minutos)
- Si el sensor falla 3 lecturas seguidas: `POST /api/events` con `sensor_error`

El ESP32 **solo monitorea**, no controla el riego. La fecha de cada dato la pone el servidor.

## 1. Conexiones

### Sensor DS18B20

| DS18B20 | ESP32 |
| --- | --- |
| Rojo (VDD) | 3V3 |
| Negro (GND) | GND |
| Amarillo (DATA) | GPIO 4 |

Pon una **resistencia de 4.7 kΩ entre DATA y 3V3**. Es obligatoria para que la lectura sea estable, sobre todo con cables largos (la resistencia interna del ESP32 no es suficiente).

### Detección del riego

Por defecto se usa **GPIO 27** como entrada con pull-up interno: cuando el pin se conecta a GND, el riego se considera **encendido**. Sirve, por ejemplo, para:

- un **contacto seco** de un relé auxiliar que se cierra cuando la bomba o la válvula está activa, o
- un **interruptor de flujo o de presión** en la tubería.

> ⚠️ Nunca conectes 110/220 V al ESP32. Si quieres detectar la bomba directamente, usa un relé o un optoacoplador que aísle la parte eléctrica.

Puedes cambiar el pin y la lógica en `config.h` (`IRRIGATION_PIN`, `IRRIGATION_ACTIVE_LEVEL`). Si todavía no hay detector de riego, pon `IRRIGATION_SENSOR_ENABLED false` y se enviará siempre `irrigation: false`.

## 2. Preparar el Arduino IDE

1. **Soporte para ESP32:** *Herramientas → Placa → Gestor de tarjetas* → busca **esp32** (de Espressif Systems) → *Instalar*.
2. **Librerías:** *Herramientas → Administrar bibliotecas* → instala **OneWire** y **DallasTemperature**.
3. **Placa:** *Herramientas → Placa → esp32 → ESP32 Dev Module* (o el modelo que tengas) y el puerto USB correspondiente.

## 3. Configurar

1. Abre `esp32-galpon/esp32-galpon.ino` en el Arduino IDE (la carpeta y el archivo deben llamarse igual).
2. Copia `secrets.example.h` como **`secrets.h`** en la misma carpeta y completa:
   ```cpp
   #define WIFI_SSID "nombre-de-la-red"
   #define WIFI_PASSWORD "contraseña-de-la-red"
   #define API_KEY "la-api-key-del-dispositivo"
   ```
   `secrets.h` está en `.gitignore`: nunca se sube al repositorio.
3. Revisa `config.h`:
   - Producción: `#define API_URL "https://lasierraapi.tavcode.com/api"`
   - Pruebas con la API en tu PC: `#define API_URL "http://<IP-de-tu-PC>:3000/api"` (y la API key del `.env` local)

El ESP32 solo funciona con WiFi de **2.4 GHz**.

## 4. Cargar y probar

1. Presiona **Subir** (→). Si se queda en "Connecting…", mantén presionado el botón **BOOT** del ESP32 hasta que empiece a cargar.
2. Abre el **Monitor serie** a **115200** baudios. Deberías ver algo así:

```
Monitoreo Avícola - ESP32
[sensor] devices found: 1
[wifi] connecting to MiRed...
[wifi] connected, IP 192.168.0.45
[time] syncing clock... ok
[sensor] 28.44 C, irrigation off
[http] POST /readings -> 201 {"temperature":28.44,"irrigation":false}
```

### Problemas comunes

| Mensaje | Causa probable |
| --- | --- |
| `devices found: 0` o `invalid reading (-127.00)` | Cable de DATA suelto o falta la resistencia de 4.7 kΩ |
| `[http] ... -> 401` | `API_KEY` incorrecta en `secrets.h` |
| `failed: connection refused` (prueba local) | La API no está corriendo, la IP es incorrecta o el firewall bloquea el puerto 3000 |
| `failed: ...` con HTTPS | Reloj sin sincronizar (falta internet) o URL mal escrita |
| No conecta al WiFi | Red de 5 GHz, o nombre/contraseña incorrectos |

## Certificados HTTPS

`root_ca.h` contiene los certificados raíz de Let's Encrypt (**ISRG Root X1** y **ISRG Root YR**) que usa `lasierraapi.tavcode.com`. Con los dos, el ESP32 seguirá conectando cuando Let's Encrypt termine de migrar a su nueva raíz. Si algún día el dominio pasa por el proxy de Cloudflare, habrá que cambiar estos certificados.
