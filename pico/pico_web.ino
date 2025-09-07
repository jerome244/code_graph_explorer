/**************************************************************
 * Pico W - Web Joystick (Freenove) + GPIO + PWM + Cal
 **************************************************************/
#include <Arduino.h>
#include <WiFi.h>
#include "config.h"
#include "joystick.h"
#include "routes.h"

WiFiServer server(80);

void setup() {
  Serial.begin(115200);
  delay(300);

  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);
  joystickBegin();

  Serial.print("Connecting to "); Serial.println(WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.println("\nWiFi connected");
  Serial.print("IP: "); Serial.println(WiFi.localIP());

  server.begin();
}

void loop() {
  WiFiClient client = server.accept();
  if (!client) client = server.available();
  if (!client) return;

  String header = "", currentLine = "";
  unsigned long t0 = millis(), timeoutMs = 2500;

  while (client.connected() && (millis() - t0) <= timeoutMs) {
    if (client.available()) {
      char ch = client.read();
      header += ch;
      if (ch == '\n') {
        if (currentLine.length() == 0) {
          int eol = header.indexOf("\r\n");
          String first = eol > 0 ? header.substring(0, eol) : header; // "GET /... HTTP/1.1"
          handleFirstLine(first, client);
          break;
        } else currentLine = "";
      } else if (ch != '\r') currentLine += ch;
    }
  }
  client.stop();
}
