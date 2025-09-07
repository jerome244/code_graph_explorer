/**************************************************************
 * Pico W - Generic GPIO Web Control + On-board LED
 * Endpoints:
 *   GET /                        -> mini HTML
 *   GET /LED_BUILTIN/ON|OFF
 *   GET /GPIO/{pin}/ON|OFF       -> set pin OUTPUT and drive
 **************************************************************/
#include <WiFi.h>
#include <Arduino.h>

// Wi-Fi
const char* ssid     = "SFR_7C5F";
const char* password = "1cvyfc54wp1296jt8luj";

// Allowed pins (common breakouts): 0-22, 26-28
const int ALLOWED_PINS[] = {0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,26,27,28};
const int ALLOWED_COUNT = sizeof(ALLOWED_PINS)/sizeof(ALLOWED_PINS[0]);

WiFiServer server(80);
String header;
String LEDState = "OFF";

bool isAllowedPin(int p) {
  for (int i=0;i<ALLOWED_COUNT;i++) if (ALLOWED_PINS[i]==p) return true;
  return false;
}

void setPin(int p, bool on) {
  pinMode(p, OUTPUT);
  digitalWrite(p, on ? HIGH : LOW);
}

void writeHeaders(WiFiClient& client, const char* ctype="text/html; charset=utf-8") {
  client.println("HTTP/1.1 200 OK");
  client.print("Content-Type: "); client.println(ctype);
  client.println("Connection: close");
  client.println("Access-Control-Allow-Origin: *"); // not needed via proxy, but fine
  client.println();
}

void writePage(WiFiClient& client) {
  client.println("<!DOCTYPE html><html><head><title>Pico W</title>"
                 "<meta name='viewport' content='width=device-width, initial-scale=1'>"
                 "<style>html{font-family:Arial;text-align:center}"
                 ".btn{background:#2563eb;color:#fff;border:0;border-radius:8px;padding:12px 20px;font-size:20px;cursor:pointer;margin:6px}"
                 "input{padding:8px 10px;border:1px solid #ddd;border-radius:8px}</style>"
                 "</head><body><h1>Pico W Web GPIO</h1>");
  client.print("<p>On-board LED: "); client.print(LEDState); client.println("</p>");
  client.println("<p><a href='/LED_BUILTIN/ON'><button class='btn'>LED ON</button></a>"
                 "<a href='/LED_BUILTIN/OFF'><button class='btn'>LED OFF</button></a></p>");
  client.println("<p>Try /GPIO/15/ON or /GPIO/15/OFF</p>");
  client.println("</body></html>");
}

void setBuiltin(bool on) {
  digitalWrite(LED_BUILTIN, on ? HIGH : LOW);
  LEDState = on ? "ON" : "OFF";
}

void setup() {
  Serial.begin(115200);
  delay(500);
  pinMode(LED_BUILTIN, OUTPUT);
  setBuiltin(false);

  Serial.print("Connecting to "); Serial.println(ssid);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.println("\nWiFi connected");
  Serial.print("IP address: "); Serial.println(WiFi.localIP());
  server.begin();
}

void handleGpio(WiFiClient& client, const String& path) {
  // Expect /GPIO/{pin}/{state}
  // e.g., /GPIO/15/ON
  int base = path.indexOf("/GPIO/");
  if (base < 0) { writeHeaders(client, "text/plain"); client.println("BAD REQUEST"); return; }
  int pstart = base + 6;
  int slash = path.indexOf('/', pstart);
  if (slash < 0) { writeHeaders(client, "text/plain"); client.println("BAD PIN"); return; }
  String pinStr = path.substring(pstart, slash);
  String state  = path.substring(slash + 1);
  int pin = pinStr.toInt();
  if (!isAllowedPin(pin)) { writeHeaders(client, "text/plain"); client.println("PIN NOT ALLOWED"); return; }
  bool on = (state.startsWith("ON"));
  setPin(pin, on);
  writeHeaders(client, "text/plain; charset=utf-8");
  client.print("GPIO "); client.print(pin); client.print(" = "); client.println(on ? "ON" : "OFF");
}

void loop() {
  WiFiClient client = server.available();
  if (!client) return;

  Serial.println("New Client");
  header = "";
  String currentLine = "";
  unsigned long t0 = millis();

  while (client.connected() && (millis() - t0) <= 2000) {
    if (client.available()) {
      char c = client.read();
      header += c;
      if (c == '\n') {
        if (currentLine.length() == 0) {
          // Parse first line
          int eol = header.indexOf("\r\n");
          String first = eol > 0 ? header.substring(0, eol) : header;
          // Routes
          if (first.indexOf("GET /LED_BUILTIN/ON") >= 0) {
            setBuiltin(true);  writeHeaders(client, "text/plain"); client.println("OK");
          } else if (first.indexOf("GET /LED_BUILTIN/OFF") >= 0) {
            setBuiltin(false); writeHeaders(client, "text/plain"); client.println("OK");
          } else if (first.indexOf("GET /GPIO/") >= 0) {
            // Extract path "GET /XXXX HTTP/1.1"
            int sp1 = first.indexOf(' ');
            int sp2 = first.indexOf(' ', sp1+1);
            String path = first.substring(sp1+1, sp2);
            handleGpio(client, path);
          } else {
            writeHeaders(client); writePage(client);
          }
          break;
        } else {
          currentLine = "";
        }
      } else if (c != '\r') {
        currentLine += c;
      }
    }
  }
  client.stop();
  Serial.println("Client disconnected");
}
