#include "routes.h"
#include "config.h"
#include "joystick.h"

static String LEDState = "OFF";
static bool isAllowedPin(int p){ for(int i=0;i<ALLOWED_COUNT;i++) if(ALLOWED_PINS[i]==p) return true; return false; }
static void setBuiltin(bool on){ digitalWrite(LED_PIN, on?HIGH:LOW); LEDState = on? "ON":"OFF"; }
static void setPinOut(int p, bool on){ pinMode(p, OUTPUT); digitalWrite(p, on?HIGH:LOW); }

void sendHeaders(WiFiClient& c, const char* type){
  c.println("HTTP/1.1 200 OK");
  c.print("Content-Type: "); c.println(type);
  c.println("Connection: close");
  c.println("Access-Control-Allow-Origin: *");
  c.println();
}

void sendIndex(WiFiClient& c){
  sendHeaders(c);
  c.println("<!DOCTYPE html><html><head><title>Pico W</title>"
            "<meta name='viewport' content='width=device-width, initial-scale=1'>"
            "<style>html{font-family:sans-serif;text-align:center}"
            ".btn{background:#2563eb;color:#fff;border:0;border-radius:8px;padding:12px 20px;font-size:18px;cursor:pointer;margin:6px}</style>"
            "</head><body><h1>Pico W</h1>");
  c.print("<p>LED: "); c.print(LEDState); c.println("</p>");
  c.println("<p><a href='/LED_BUILTIN/ON'><button class='btn'>LED ON</button></a>"
            "<a href='/LED_BUILTIN/OFF'><button class='btn'>LED OFF</button></a></p>");
  c.println("<p>Endpoints: <code>/JOYSTICK</code>, <code>/CALIBRATE</code>, "
            "<code>/GPIO/15/ON</code>, <code>/PWM/15/50</code>, <code>/PWMOFF/15</code></p>");
  c.println("</body></html>");
}

static void handleGpioPath(WiFiClient& c, const String& path){
  int base = path.indexOf("/GPIO/"); if (base < 0){ sendHeaders(c,"text/plain"); c.println("BAD REQUEST"); return; }
  int pstart = base + 6; int slash  = path.indexOf('/', pstart); if (slash < 0){ sendHeaders(c,"text/plain"); c.println("BAD PIN"); return; }
  int pin = path.substring(pstart, slash).toInt(); String state = path.substring(slash + 1);
  if (!isAllowedPin(pin)){ sendHeaders(c,"text/plain"); c.println("PIN NOT ALLOWED"); return; }
  bool on = state.startsWith("ON"); setPinOut(pin, on);
  sendHeaders(c, "text/plain; charset=utf-8"); c.print("GPIO "); c.print(pin); c.print(" = "); c.println(on? "ON":"OFF");
}

static void handlePwmPath(WiFiClient& c, const String& path){
  int base = path.indexOf("/PWM/"); if (base < 0){ sendHeaders(c,"text/plain"); c.println("BAD REQUEST"); return; }
  int pstart = base + 5; int slash  = path.indexOf('/', pstart); if (slash < 0){ sendHeaders(c,"text/plain"); c.println("BAD PIN"); return; }
  int pin = path.substring(pstart, slash).toInt(); String dutyStr = path.substring(slash + 1);
  if (!isAllowedPin(pin)){ sendHeaders(c,"text/plain"); c.println("PIN NOT ALLOWED"); return; }
  int duty = dutyStr.toInt(); if (duty < 0) duty = 0; if (duty > 100) duty = 100;
#ifdef analogWriteResolution
  analogWriteResolution(8);
#endif
  pinMode(pin, OUTPUT); analogWrite(pin, map(duty, 0, 100, 0, 255));
  sendHeaders(c, "application/json; charset=utf-8"); c.print("{\"pin\":"); c.print(pin); c.print(",\"duty_pct\":"); c.print(duty); c.println("}");
}

static void handlePwmOffPath(WiFiClient& c, const String& path){
  int base = path.indexOf("/PWMOFF/"); if (base < 0){ sendHeaders(c,"text/plain"); c.println("BAD REQUEST"); return; }
  int pin = path.substring(base + 8).toInt();
  if (!isAllowedPin(pin)){ sendHeaders(c,"text/plain"); c.println("PIN NOT ALLOWED"); return; }
#ifdef analogWriteResolution
  analogWriteResolution(8);
#endif
  pinMode(pin, OUTPUT); analogWrite(pin, 0);
  sendHeaders(c, "application/json; charset=utf-8"); c.print("{\"pin\":"); c.print(pin); c.println(",\"stopped\":true}");
}

void handleFirstLine(const String& first, WiFiClient& client){
  int sp1 = first.indexOf(' '), sp2 = first.indexOf(' ', sp1 + 1);
  String method = first.substring(0, sp1);
  String path   = (sp1 > 0 && sp2 > sp1) ? first.substring(sp1 + 1, sp2) : "/";

  if (method != "GET") { sendHeaders(client, "text/plain"); client.println("ONLY GET"); return; }

  if      (path.startsWith("/LED_BUILTIN/ON"))  { setBuiltin(true);  sendHeaders(client,"text/plain"); client.println("OK"); }
  else if (path.startsWith("/LED_BUILTIN/OFF")) { setBuiltin(false); sendHeaders(client,"text/plain"); client.println("OK"); }
  else if (path.startsWith("/JOYSTICK"))        { String js = joystickJson(); sendHeaders(client,"application/json; charset=utf-8"); client.println(js); }
  else if (path.startsWith("/CALIBRATE"))       { joystickCalibrate(); int cx,cy; joystickGetCenter(cx,cy); sendHeaders(client,"application/json; charset=utf-8"); client.print("{\"center\":{\"x\":"); client.print(cx); client.print(",\"y\":"); client.print(cy); client.println("}}"); }
  else if (path.startsWith("/CALIBRATION"))     { int cx,cy; joystickGetCenter(cx,cy); sendHeaders(client,"application/json; charset=utf-8"); client.print("{\"center\":{\"x\":"); client.print(cx); client.print(",\"y\":"); client.print(cy); client.println("}}"); }
  else if (path.startsWith("/GPIO/"))           { handleGpioPath(client, path); }
  else if (path.startsWith("/PWM/"))            { handlePwmPath(client, path); }
  else if (path.startsWith("/PWMOFF/"))         { handlePwmOffPath(client, path); }
  else                                          { sendIndex(client); }
}
