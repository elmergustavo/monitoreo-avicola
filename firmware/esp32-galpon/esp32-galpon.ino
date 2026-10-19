// ---------------------------------------------------------------------------
// Monitoreo Avícola — ESP32 + DS18B20
//
// Reads the shed temperature, detects when irrigation turns on/off and sends
// the data to the API over HTTPS:
//   POST {API_URL}/readings  every 30 s   { "temperature": 29.50, "irrigation": false }
//   POST {API_URL}/events    on changes   { "type": "irrigation_off", "temperature": 28.10, "durationMin": 8.5 }
//
// The device only monitors; it never controls the irrigation system.
// Timestamps are set by the server.
// ---------------------------------------------------------------------------

#include <DallasTemperature.h>
#include <HTTPClient.h>
#include <OneWire.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <time.h>

#include "config.h"
#include "root_ca.h"
#include "secrets.h"

// ----- Hardware -------------------------------------------------------------

OneWire oneWire(TEMP_SENSOR_PIN);
DallasTemperature sensors(&oneWire);

// ----- Network --------------------------------------------------------------

WiFiClientSecure secureClient;
WiFiClient plainClient;
const bool useTls = String(API_URL).startsWith("https://");

// ----- State ----------------------------------------------------------------

float lastTemperature = NAN;  // last valid reading, NAN if none yet
uint8_t consecutiveSensorFailures = 0;
bool sensorErrorReported = false;

bool irrigationOn = false;
bool irrigationRawState = false;
unsigned long irrigationRawChangedAt = 0;
unsigned long irrigationStartedAt = 0;

unsigned long lastReadingAt = 0;
unsigned long lastWifiAttemptAt = 0;
unsigned long lastEventAttemptAt = 0;

// ----- Event queue (events are retried until the API accepts them) ----------

struct PendingEvent {
  const char *type;
  float temperature;  // NAN -> null
  float durationMin;  // NAN -> omitted
};

const uint8_t EVENT_QUEUE_SIZE = 16;
PendingEvent eventQueue[EVENT_QUEUE_SIZE];
uint8_t eventQueueHead = 0;
uint8_t eventQueueCount = 0;

void enqueueEvent(const char *type, float temperature, float durationMin) {
  if (eventQueueCount == EVENT_QUEUE_SIZE) {
    // Queue full: drop the oldest event to keep the most recent state.
    eventQueueHead = (eventQueueHead + 1) % EVENT_QUEUE_SIZE;
    eventQueueCount--;
    Serial.println("[events] queue full, dropped oldest event");
  }
  uint8_t tail = (eventQueueHead + eventQueueCount) % EVENT_QUEUE_SIZE;
  eventQueue[tail] = {type, temperature, durationMin};
  eventQueueCount++;
  Serial.printf("[events] queued %s\n", type);
}

// ----- Helpers --------------------------------------------------------------

bool isValidTemperature(float value) {
  // -127 = sensor disconnected; 85 = power-on value before the first conversion.
  return value != DEVICE_DISCONNECTED_C && value != 85.0f && value >= -40.0f && value <= 125.0f;
}

bool readIrrigationInput() {
#if IRRIGATION_SENSOR_ENABLED
  return digitalRead(IRRIGATION_PIN) == IRRIGATION_ACTIVE_LEVEL;
#else
  return false;
#endif
}

// Appends `"key": value` with two decimals, or null when the value is NAN.
void appendNumber(String &json, const char *key, float value) {
  json += "\"";
  json += key;
  json += "\":";
  json += isnan(value) ? String("null") : String(value, 2);
}

// ----- WiFi and time --------------------------------------------------------

const char *wifiStatusText(wl_status_t status) {
  switch (status) {
    case WL_NO_SSID_AVAIL: return "network not found (check the name, and that it is 2.4 GHz)";
    case WL_CONNECT_FAILED: return "connection failed (check the password)";
    case WL_CONNECTION_LOST: return "connection lost";
    case WL_DISCONNECTED: return "disconnected (still trying, or wrong password)";
    case WL_IDLE_STATUS: return "idle";
    default: return "unknown";
  }
}

// Lists nearby networks once, to diagnose a wrong name or a 5 GHz-only network.
void scanNetworks() {
  Serial.println("[wifi] scanning nearby 2.4 GHz networks...");
  int count = WiFi.scanNetworks();
  bool found = false;
  for (int i = 0; i < count; i++) {
    bool match = WiFi.SSID(i) == WIFI_SSID;
    found = found || match;
    Serial.printf("[wifi]   %s \"%s\" signal %d dBm, channel %d\n", match ? "->" : "  ", WiFi.SSID(i).c_str(),
                  (int)WiFi.RSSI(i), (int)WiFi.channel(i));
  }
  if (count <= 0) Serial.println("[wifi]   no networks found");
  Serial.printf("[wifi] \"%s\" %s\n", WIFI_SSID,
                found ? "is visible: if it still fails, check the password"
                      : "NOT found: check the exact name, or use the 2.4 GHz network");
  WiFi.scanDelete();
}

void ensureWifi() {
  static bool scanned = false;
  wl_status_t status = WiFi.status();
  if (status == WL_CONNECTED) return;
  unsigned long now = millis();
  if (lastWifiAttemptAt != 0 && now - lastWifiAttemptAt < WIFI_RETRY_INTERVAL_MS) return;

  if (lastWifiAttemptAt != 0) {
    Serial.printf("[wifi] not connected: %s\n", wifiStatusText(status));
    if (!scanned) {
      scanned = true;
      WiFi.disconnect();
      scanNetworks();
    }
  }
  lastWifiAttemptAt = now;
  Serial.printf("[wifi] connecting to \"%s\"...\n", WIFI_SSID);
  WiFi.disconnect();
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
}

// HTTPS certificate checks need the real date, so sync the clock via NTP.
void syncClock() {
  configTime(0, 0, "pool.ntp.org", "time.google.com");
  Serial.print("[time] syncing clock");
  time_t now = time(nullptr);
  unsigned long startedAt = millis();
  while (now < 1700000000 && millis() - startedAt < 15000) {
    delay(500);
    Serial.print(".");
    now = time(nullptr);
  }
  Serial.println(now >= 1700000000 ? " ok" : " failed (will retry on next connection)");
}

// ----- HTTP -----------------------------------------------------------------

// Sends a JSON body to the API. Returns the HTTP status, or a negative
// value when the request could not be sent (network/TLS error).
int postJson(const char *path, const String &body) {
  HTTPClient http;
  String url = String(API_URL) + path;
  bool started = useTls ? http.begin(secureClient, url) : http.begin(plainClient, url);
  if (!started) {
    Serial.printf("[http] could not start request to %s\n", url.c_str());
    return -1;
  }

  http.setTimeout(HTTP_TIMEOUT_MS);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-api-key", API_KEY);

  int status = http.POST(body);
  if (status == 201) {
    Serial.printf("[http] POST %s -> 201 %s\n", path, body.c_str());
  } else if (status > 0) {
    Serial.printf("[http] POST %s -> %d %s\n", path, status, http.getString().c_str());
    if (status == 401) Serial.println("[http] check API_KEY in secrets.h");
  } else {
    Serial.printf("[http] POST %s failed: %s\n", path, http.errorToString(status).c_str());
  }
  http.end();
  return status;
}

void sendReading(float temperature) {
  String body = "{";
  appendNumber(body, "temperature", temperature);
  body += ",\"irrigation\":";
  body += irrigationOn ? "true" : "false";
  body += "}";
  // Readings are periodic: if one fails it is simply replaced by the next.
  postJson("/readings", body);
}

void flushEvents() {
  if (eventQueueCount == 0 || WiFi.status() != WL_CONNECTED) return;
  unsigned long now = millis();
  if (lastEventAttemptAt != 0 && now - lastEventAttemptAt < EVENT_RETRY_INTERVAL_MS) return;
  lastEventAttemptAt = now;

  while (eventQueueCount > 0) {
    const PendingEvent &event = eventQueue[eventQueueHead];
    String body = "{\"type\":\"";
    body += event.type;
    body += "\",";
    appendNumber(body, "temperature", event.temperature);
    if (!isnan(event.durationMin)) {
      body += ",";
      appendNumber(body, "durationMin", event.durationMin);
    }
    body += "}";

    int status = postJson("/events", body);
    bool retryLater = status < 0 || status == 429 || status >= 500;
    if (retryLater) return;  // keep it queued and try again later

    // Accepted, or rejected for good (400/401): do not retry forever.
    eventQueueHead = (eventQueueHead + 1) % EVENT_QUEUE_SIZE;
    eventQueueCount--;
  }
}

// ----- Sensors --------------------------------------------------------------

void takeReading() {
  sensors.requestTemperatures();
  float temperature = sensors.getTempCByIndex(0);

  if (!isValidTemperature(temperature)) {
    consecutiveSensorFailures++;
    Serial.printf("[sensor] invalid reading (%.2f), failure %u\n", temperature, consecutiveSensorFailures);
    if (consecutiveSensorFailures >= SENSOR_ERROR_THRESHOLD && !sensorErrorReported) {
      sensorErrorReported = true;
      enqueueEvent("sensor_error", NAN, NAN);
    }
    return;
  }

  if (sensorErrorReported) Serial.println("[sensor] recovered");
  consecutiveSensorFailures = 0;
  sensorErrorReported = false;
  lastTemperature = temperature;
  Serial.printf("[sensor] %.2f C, irrigation %s\n", temperature, irrigationOn ? "on" : "off");

  if (WiFi.status() == WL_CONNECTED) sendReading(temperature);
}

void updateIrrigation() {
  bool raw = readIrrigationInput();
  unsigned long now = millis();

  if (raw != irrigationRawState) {
    irrigationRawState = raw;
    irrigationRawChangedAt = now;
    return;
  }
  // Only accept a change once the input has been stable (debounce).
  if (raw == irrigationOn || now - irrigationRawChangedAt < IRRIGATION_DEBOUNCE_MS) return;

  irrigationOn = raw;
  if (irrigationOn) {
    irrigationStartedAt = now;
    Serial.println("[irrigation] on");
    enqueueEvent("irrigation_on", lastTemperature, NAN);
  } else {
    float minutes = roundf((now - irrigationStartedAt) / 6000.0f) / 10.0f;  // one decimal
    Serial.printf("[irrigation] off after %.1f min\n", minutes);
    enqueueEvent("irrigation_off", lastTemperature, minutes);
  }
}

// ----- Arduino entry points -------------------------------------------------

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\nMonitoreo Avícola - ESP32");

  sensors.begin();
  sensors.setResolution(12);
  Serial.printf("[sensor] devices found: %u\n", sensors.getDeviceCount());

#if IRRIGATION_SENSOR_ENABLED
  pinMode(IRRIGATION_PIN, IRRIGATION_ACTIVE_LEVEL == LOW ? INPUT_PULLUP : INPUT_PULLDOWN);
#endif
  irrigationRawState = readIrrigationInput();
  irrigationRawChangedAt = millis();

  secureClient.setCACert(ROOT_CA_BUNDLE);

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  ensureWifi();
  unsigned long startedAt = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startedAt < 20000) delay(250);

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("[wifi] connected, IP %s\n", WiFi.localIP().toString().c_str());
    if (useTls) syncClock();
  } else {
    Serial.println("[wifi] not connected yet, will keep retrying");
  }

  // First reading right away instead of waiting 30 s.
  takeReading();
  lastReadingAt = millis();
}

void loop() {
  static bool wasConnected = WiFi.status() == WL_CONNECTED;
  bool connected = WiFi.status() == WL_CONNECTED;
  if (connected && !wasConnected) {
    Serial.printf("[wifi] connected, IP %s\n", WiFi.localIP().toString().c_str());
    if (useTls && time(nullptr) < 1700000000) syncClock();
  }
  wasConnected = connected;

  ensureWifi();
  updateIrrigation();

  if (millis() - lastReadingAt >= READING_INTERVAL_MS) {
    lastReadingAt = millis();
    takeReading();
  }

  flushEvents();
  delay(50);
}
