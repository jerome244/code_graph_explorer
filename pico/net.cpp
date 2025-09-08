#include "config.h"

WiFiServer server(80);

bool isAllowed(int p) {
  for (int i = 0; i < ALLOWED_COUNT; ++i) if (ALLOWED_PINS[i] == p) return true;
  return false;
}

String toLowerPath(const String& s) { String t=s; t.toLowerCase(); return t; }

void send200(WiFiClient& c, const String& body, const String& type) {
  c.print(
    "HTTP/1.1 200 OK\r\n"
    "Connection: close\r\n"
    "Content-Type: " + type + "\r\n"
    "Access-Control-Allow-Origin: *\r\n"
    "Content-Length: " + String(body.length()) + "\r\n\r\n" + body);
}

void send404(WiFiClient& c) {
  c.print("HTTP/1.1 404 Not Found\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
}

void send400(WiFiClient& c, const String& msg) {
  String b = msg + "\n";
  c.print("HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Type: text/plain\r\nContent-Length: "
          + String(b.length()) + "\r\n\r\n" + b);
}

// Minimal example routes; expand as you had before.
void handleRequest(WiFiClient& client, const String& reqLine) {
  int s1 = reqLine.indexOf(' ');
  int s2 = reqLine.indexOf(' ', s1 + 1);
  if (s1 < 0 || s2 < 0) { send400(client); return; }
  String path  = reqLine.substring(s1 + 1, s2);
  String lpath = toLowerPath(path);

  if (lpath == "/") { send200(client, "OK\n"); return; }

  if (lpath == "/led_builtin/on" || lpath == "/led/on")  { pinMode(LED_PIN, OUTPUT); digitalWrite(LED_PIN, HIGH); send200(client, "LED ON\n");  return; }
  if (lpath == "/led_builtin/off"|| lpath == "/led/off") { pinMode(LED_PIN, OUTPUT); digitalWrite(LED_PIN, LOW);  send200(client, "LED OFF\n"); return; }

  send404(client);
}
