#pragma once
#include <Arduino.h>
#include <WiFi.h>
#include <WiFiServer.h>

// ---------- Wi-Fi ----------
#define WIFI_SSID "SFR_7C5F"
#define WIFI_PASS ""

// ---------- Pins (Freenove joystick) ----------
constexpr int PIN_JS_X  = A0;   // GP26 / ADC0
constexpr int PIN_JS_Y  = A1;   // GP27 / ADC1
constexpr int PIN_JS_SW = 28;   // GP28, button (active-LOW)
constexpr int LED_PIN   = LED_BUILTIN;

// Allowed pins for /GPIO and /PWM
static const int ALLOWED_PINS[] = {
  0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,
  16,17,18,19,20,21,22,26,27,28
};
constexpr int ALLOWED_COUNT = sizeof(ALLOWED_PINS)/sizeof(ALLOWED_PINS[0]);

// ---- Declarations only (no definitions) ----
extern WiFiServer server;

bool   isAllowed(int p);
String toLowerPath(const String& s);
void   send200(WiFiClient& c, const String& body, const String& type="text/plain");
void   send404(WiFiClient& c);
void   send400(WiFiClient& c, const String& msg="Bad Request");
void   handleRequest(WiFiClient& client, const String& reqLine);
