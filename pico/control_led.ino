/**************************************************************
 * Pico W - Web Joystick (Freenove wiring) + GPIO + PWM + Cal
 * Wiring:
 *   VRx -> GP26 (ADC0/A0)   VRy -> GP27 (ADC1/A1)   SW -> GP28 (active-LOW)
 * Endpoints:
 *   GET /                         -> mini HTML
 *   GET /LED_BUILTIN/ON|OFF
 *   GET /GPIO/{pin}/ON|OFF
 *   GET /PWM/{pin}/{duty_pct}     -> duty 0..100 (8-bit)
 *   GET /PWMOFF/{pin}             -> stop PWM
 *   GET /CALIBRATE                -> set center = current X/Y (JSON)
 *   GET /CALIBRATION              -> read center (JSON)
 *   GET /JOYSTICK                 -> JSON: raw, pct (centered), pressed, center
 **************************************************************/
#include <Arduino.h>
#include <WiFi.h>

// ---- Wi-Fi (set these) ----
const char* ssid     = "SFR_7C5F";
const char* password = "1cvyfc54wp1296jt8luj";

// ---- Pins (Freenove) ----
const int PIN_LED_BUILTIN = LED_BUILTIN; // onboard
const int PIN_JS_X  = A0;  // GP26 / ADC0
const int PIN_JS_Y  = A1;  // GP27 / ADC1
const int PIN_JS_SW = 28;  // GP28, joystick button (active-LOW, pull-up)

// Allowed GPIOs for /GPIO and /PWM
const int ALLOWED_PINS[] = {0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,
                            16,17,18,19,20,21,22,26,27,28};
const int ALLOWED_COUNT = sizeof(ALLOWED_PINS)/sizeof(ALLOWED_PINS[0]);

WiFiServer server(80);
String header;
String LEDState = "OFF";

// ---- Joystick calibration (RAM only) ----
int xCenter = 2048;
int yCenter = 2048;

// ---------- Types & helpers (DECLARE BEFORE USE!) ----------
struct Joy {
  int  xRaw, yRaw;  // 0..4095
  int  xPct, yPct;  // -100..100
  bool pressed;
};

static bool isAllowedPin(int p){ for(int i=0;i<ALLOWED_COUNT;i++) if(ALLOWED_PINS[i]==p) return true; return false; }
static int  clampi(int v, int lo, int hi){ return v<lo?lo:(v>hi?hi:v); }
static void setBuiltin(bool on){ digitalWrite(PIN_LED_BUILTIN, on?HIGH:LOW); LEDState = on? "ON":"OFF"; }
static void setPinOut(int p, bool on){ pinMode(p, OUTPUT); digitalWrite(p, on?HIGH:LOW); }

// Map raw using current center to -100..100 with small deadzone
static int pctFromRawCentered(int raw, int center){
  float pct = ((float)raw - (float)center) / 2048.0f * 100.0f; // 12-bit scale
  if (pct > -2 && pct < 2) pct = 0;
  return clampi((int)pct, -100, 100);
}

static Joy readJoy(){
  Joy j;
  j.xRaw = analogRead(PIN_JS_X);  // 0..4095
  j.yRaw = analogRead(PIN_JS_Y);
  j.pressed = (digitalRead(PIN_JS_SW) == LOW);  // active-LOW
  j.xPct = pctFromRawCentered(j.xRaw, xCenter);
  j.yPct = -pctFromRawCentered(j.yRaw, yCenter); // invert Y so up = +100
  return j;
}

// ------------- HTTP helpers -------------
static void sendHeaders(WiFiClient& c, const char* type="text/html; charset=utf-8"){
  c.println("HTTP/1.1 200 OK");
  c.print("Content-Type: "); c.println(type);
  c.println("Connection: close");
  c.println("Access-Control-Allow-Origin: *");
  c.println();
}

static void sendIndex(WiFiClient& c){
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

static void sendJoystickJSON(WiFiClient& c){
  Joy j = readJoy();
  sendHeaders(c, "application/json; charset=utf-8");
  c.print("{\"x\":");     c.print(j.xRaw);
  c.print(",\"y\":");     c.print(j.yRaw);
  c.print(",\"x_pct\":"); c.print(j.xPct);
  c.print(",\"y_pct\":"); c.print(j.yPct);
  c.print(",\"pressed\":"); c.print(j.pressed ? "true":"false");
  c.print(",\"center\":{\"x\":"); c.print(xCenter); c.print(",\"y\":"); c.print(yCenter); c.print("}");
  c.println("}");
}

static void handleGpio(WiFiClient& c, const String& path){
  // /GPIO/{pin}/ON|OFF
  int base = path.indexOf("/GPIO/"); if (base < 0){ sendHeaders(c,"text/plain"); c.println("BAD REQUEST"); return; }
  int pstart = base + 6;
  int slash  = path.indexOf('/', pstart); if (slash < 0){ sendHeaders(c,"text/plain"); c.println("BAD PIN"); return; }
  int pin = path.substring(pstart, slash).toInt();
  String state = path.substring(slash + 1);
  if (!isAllowedPin(pin)){ sendHeaders(c,"text/plain"); c.println("PIN NOT ALLOWED"); return; }
  bool on = state.startsWith("ON");
  setPinOut(pin, on);
  sendHeaders(c, "text/plain; charset=utf-8");
  c.print("GPIO "); c.print(pin); c.print(" = "); c.println(on? "ON":"OFF");
}

static void handlePwm(WiFiClient& c, const String& path){
  // /PWM/{pin}/{duty}
  int base = path.indexOf("/PWM/"); if (base < 0){ sendHeaders(c,"text/plain"); c.println("BAD REQUEST"); return; }
  int pstart = base + 5;
  int slash  = path.indexOf('/', pstart); if (slash < 0){ sendHeaders(c,"text/plain"); c.println("BAD PIN"); return; }
  int pin = path.substring(pstart, slash).toInt();
  String dutyStr = path.substring(slash + 1);
  if (!isAllowedPin(pin)){ sendHeaders(c,"text/plain"); c.println("PIN NOT ALLOWED"); return; }
  int duty = clampi(dutyStr.toInt(), 0, 100);
  #ifdef analogWriteResolution
    analogWriteResolution(8);
  #endif
  pinMode(pin, OUTPUT);
  int v = map(duty, 0, 100, 0, 255);
  analogWrite(pin, v);
  sendHeaders(c, "application/json; charset=utf-8");
  c.print("{\"pin\":"); c.print(pin); c.print(",\"duty_pct\":"); c.print(duty); c.println("}");
}

static void handlePwmOff(WiFiClient& c, const String& path){
  // /PWMOFF/{pin}
  int base = path.indexOf("/PWMOFF/"); if (base < 0){ sendHeaders(c,"text/plain"); c.println("BAD REQUEST"); return; }
  int pstart = base + 8;
  String ps = path.substring(pstart);
  int pin = ps.toInt();
  if (!isAllowedPin(pin)){ sendHeaders(c,"text/plain"); c.println("PIN NOT ALLOWED"); return; }
  #ifdef analogWriteResolution
    analogWriteResolution(8);
  #endif
  pinMode(pin, OUTPUT);
  analogWrite(pin, 0);
  sendHeaders(c, "application/json; charset=utf-8");
  c.print("{\"pin\":"); c.print(pin); c.println(",\"stopped\":true}");
}

static void handleCalibrate(WiFiClient& c){
  xCenter = analogRead(PIN_JS_X);
  yCenter = analogRead(PIN_JS_Y);
  sendHeaders(c, "application/json; charset=utf-8");
  c.print("{\"center\":{\"x\":"); c.print(xCenter); c.print(",\"y\":"); c.print(yCenter); c.println("}}");
}

static void handleCalibration(WiFiClient& c){
  sendHeaders(c, "application/json; charset=utf-8");
  c.print("{\"center\":{\"x\":"); c.print(xCenter); c.print(",\"y\":"); c.print(yCenter); c.println("}}");
}

// ------------- Setup / Loop -------------
void setup(){
  Serial.begin(115200);
  delay(300);
  pinMode(PIN_LED_BUILTIN, OUTPUT); setBuiltin(false);
  pinMode(PIN_JS_SW, INPUT_PULLUP);

  Serial.print("Connecting to "); Serial.println(ssid);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED){ delay(500); Serial.print("."); }
  Serial.println("\nWiFi connected"); Serial.print("IP: "); Serial.println(WiFi.localIP());
  server.begin();
}

void loop(){
  // Use accept(); if your core is older, available() fallback is fine
  WiFiClient client = server.accept();
  if (!client) client = server.available();
  if (!client) return;

  header = ""; String currentLine; unsigned long t0 = millis(); const unsigned long timeoutMs = 2500;
  while (client.connected() && (millis() - t0) <= timeoutMs){
    if (client.available()){
      char ch = client.read(); header += ch;
      if (ch == '\n'){
        if (currentLine.length() == 0){
          int eol = header.indexOf("\r\n");
          String first = eol>0? header.substring(0,eol) : header;

          if      (first.indexOf("GET /LED_BUILTIN/ON")  >= 0){ setBuiltin(true);  sendHeaders(client,"text/plain"); client.println("OK"); }
          else if (first.indexOf("GET /LED_BUILTIN/OFF") >= 0){ setBuiltin(false); sendHeaders(client,"text/plain"); client.println("OK"); }
          else if (first.indexOf("GET /JOYSTICK")        >= 0){ sendJoystickJSON(client); }
          else if (first.indexOf("GET /CALIBRATE")       >= 0){ handleCalibrate(client); }
          else if (first.indexOf("GET /CALIBRATION")     >= 0){ handleCalibration(client); }
          else if (first.indexOf("GET /GPIO/")           >= 0){
            int sp1 = first.indexOf(' '), sp2 = first.indexOf(' ', sp1+1);
            String path = first.substring(sp1+1, sp2);
            handleGpio(client, path);
          } else if (first.indexOf("GET /PWM/")          >= 0){
            int sp1 = first.indexOf(' '), sp2 = first.indexOf(' ', sp1+1);
            String path = first.substring(sp1+1, sp2);
            handlePwm(client, path);
          } else if (first.indexOf("GET /PWMOFF/")       >= 0){
            int sp1 = first.indexOf(' '), sp2 = first.indexOf(' ', sp1+1);
            String path = first.substring(sp1+1, sp2);
            handlePwmOff(client, path);
          } else {
            sendHeaders(client); sendIndex(client);
          }
          break;
        } else currentLine = "";
      } else if (ch != '\r') currentLine += ch;
    }
  }
  client.stop();
}
