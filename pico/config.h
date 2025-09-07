#pragma once
#include <Arduino.h>

// ---------- Wi-Fi (edit these) ----------
#define WIFI_SSID "SFR_7C5F"
#define WIFI_PASS "1cvyfc54wp1296jt8luj"

// ---------- Pins (Freenove joystick) ----------
constexpr int PIN_JS_X  = A0;   // GP26 / ADC0
constexpr int PIN_JS_Y  = A1;   // GP27 / ADC1
constexpr int PIN_JS_SW = 28;   // GP28, button (active-LOW)
constexpr int LED_PIN   = LED_BUILTIN;  // use this name (avoids PIN_LED macro clash)

// Allowed pins for /GPIO and /PWM
static const int ALLOWED_PINS[] = {
  0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,
  16,17,18,19,20,21,22,26,27,28
};
constexpr int ALLOWED_COUNT = sizeof(ALLOWED_PINS)/sizeof(ALLOWED_PINS[0]);
