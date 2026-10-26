#pragma once

// ---------------------------------------------------------------------------
// Device configuration (no secrets here; those go in secrets.h).
// ---------------------------------------------------------------------------

// API base URL, without a trailing slash.
//   Production: "https://lasierraapi.tavcode.com/api"
//   Local test: "http://<your-PC-IP>:3000/api"
#define API_URL "https://lasierraapi.tavcode.com/api"

// DS18B20 data pin. Needs a 4.7 kOhm pull-up resistor between DATA and 3.3 V.
#define TEMP_SENSOR_PIN 4

// Irrigation detection: a digital input that changes when irrigation runs
// (e.g. a relay contact or a flow/pressure switch wired between the pin and GND).
#define IRRIGATION_SENSOR_ENABLED true
#define IRRIGATION_PIN 27
// LOW = irrigation on when the contact closes to GND (uses the internal pull-up).
#define IRRIGATION_ACTIVE_LEVEL LOW

// Timing
#define READING_INTERVAL_MS 30000UL     // send a reading every 30 s
#define IRRIGATION_DEBOUNCE_MS 2000UL   // input must be stable this long
#define HTTP_TIMEOUT_MS 10000UL
#define WIFI_RETRY_INTERVAL_MS 30000UL  // give each attempt time to finish
#define EVENT_RETRY_INTERVAL_MS 5000UL

// Consecutive failed sensor reads before reporting a sensor_error event.
#define SENSOR_ERROR_THRESHOLD 3

// LCD 12864 screen (ST7920) in serial mode. PSB goes to GND.
// Wiring: E -> GPIO 18, R/W -> GPIO 23, RS -> GPIO 19, VCC/BLA -> 5 V (VIN), GND/BLK -> GND.
// Set to false if the shed has no screen.
#define DISPLAY_ENABLED true
#define DISPLAY_E_PIN 18
#define DISPLAY_RW_PIN 23
#define DISPLAY_RS_PIN 19
