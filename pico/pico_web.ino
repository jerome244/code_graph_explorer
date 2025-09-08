#include "config.h"

void setup() {
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  Serial.begin(115200);
  delay(50);
  Serial.println("\nBooting…");

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  Serial.print("Connecting");
  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 20000) {
    delay(300); Serial.print('.');
  }
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("\nWi-Fi connect timeout; staying in loop without reset");
    // (See section 2 below for reset options)
  } else {
    Serial.println();
    Serial.print("IP: ");  Serial.println(WiFi.localIP());
    Serial.print("MAC: "); Serial.println(WiFi.macAddress());
  }

  server.begin();
  Serial.println("HTTP server started on port 80");
}

void loop() {
  // Use accept() to avoid the deprecation warning
  WiFiClient client = server.accept();
  if (!client) return;

  // Read the request line (simple)
  uint32_t t0 = millis();
  String req;
  while (client.connected() && millis() - t0 < 2000) {
    if (client.available()) {
      char ch = client.read();
      if (ch == '\r') continue;
      if (ch == '\n') break;
      req += ch;
    }
  }

  if (req.startsWith("GET ")) handleRequest(client, req);
  else if (req.length())      send400(client, "Only GET supported");
  else                        send400(client, "Empty request");

  delay(1);
  client.stop();
}
