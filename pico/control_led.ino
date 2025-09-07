/**************************************************************
 * Raspberry Pi Pico W - Simple LED Web Server (Arduino)
 * Exposes:
 *   GET /              -> HTML control page
 *   GET /LED_BUILTIN/ON
 *   GET /LED_BUILTIN/OFF
 * Adds CORS: Access-Control-Allow-Origin: *
 **************************************************************/
#include <WiFi.h>          // For Pico W with Arduino-Pico core
#include <Arduino.h>

// Replace with your Wi-Fi credentials
const char* ssid     = "SFR_7C5F";
const char* password = "1cvyfc54wp1296jt8luj";

WiFiServer server(80);
String header;
String PIN_LEDState = "OFF";

unsigned long currentTime = 0;
unsigned long previousTime = 0;
const long timeoutTime = 2000;

void setup() {
  Serial.begin(115200);
  delay(1000);

  pinMode(LED_BUILTIN, OUTPUT);
  digitalWrite(LED_BUILTIN, LOW);

  Serial.print("Connecting to ");
  Serial.println(ssid);
  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  Serial.println("WiFi connected");
  Serial.print("IP address: ");
  Serial.println(WiFi.localIP());

  server.begin();
}

void writeHeaders(WiFiClient& client) {
  client.println("HTTP/1.1 200 OK");
  client.println("Content-type:text/html; charset=utf-8");
  client.println("Connection: close");
  client.println("Access-Control-Allow-Origin: *"); // allow fetch() from your web app
  client.println();
}

void writePage(WiFiClient& client) {
  client.println("<!DOCTYPE html><html><head><title>Pico W Web Server</title><meta name='viewport' content='width=device-width, initial-scale=1'><style>");
  client.println("html{font-family:Arial; text-align:center;} .btn{background:#2563eb;color:#fff;border:0;border-radius:8px;padding:12px 20px;font-size:20px;cursor:pointer;margin:6px;}");
  client.println("</style></head><body><h1>Pico W Web Server</h1>");
  client.print("<p>GPIO state: ");
  client.print(PIN_LEDState);
  client.println("</p>");
  client.println("<p><a href='/LED_BUILTIN/ON'><button class='btn'>ON</button></a></p>");
  client.println("<p><a href='/LED_BUILTIN/OFF'><button class='btn'>OFF</button></a></p>");
  client.println("</body></html>");
}

void loop() {
  WiFiClient client = server.available();
  if (client) {
    Serial.println("New Client");
    String currentLine = "";
    currentTime = millis();
    previousTime = currentTime;

    while (client.connected() && currentTime - previousTime <= timeoutTime) {
      currentTime = millis();
      if (client.available()) {
        char c = client.read();
        header += c;
        if (c == '\n') {
          if (currentLine.length() == 0) {
            if (header.indexOf("GET /LED_BUILTIN/ON") >= 0) {
              Serial.println("LED ON");
              PIN_LEDState = "ON";
              digitalWrite(LED_BUILTIN, HIGH);
              writeHeaders(client);
              client.println("OK");
            } else if (header.indexOf("GET /LED_BUILTIN/OFF") >= 0) {
              Serial.println("LED OFF");
              PIN_LEDState = "OFF";
              digitalWrite(LED_BUILTIN, LOW);
              writeHeaders(client);
              client.println("OK");
            } else {
              writeHeaders(client);
              writePage(client);
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
    header = "";
    client.stop();
    Serial.println("Client disconnected");
  }
}
