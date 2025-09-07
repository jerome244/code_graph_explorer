#include "joystick.h"

static int xCenter = 2048; // 12-bit
static int yCenter = 2048;

static int clampi(int v, int lo, int hi){ return v<lo?lo:(v>hi?hi:v); }
static int pctFromRawCentered(int raw, int center){
  float pct = ((float)raw - (float)center) / 2048.0f * 100.0f;
  if (pct > -2 && pct < 2) pct = 0;
  return clampi((int)pct, -100, 100);
}

void joystickBegin() { pinMode(PIN_JS_SW, INPUT_PULLUP); }

Joy joystickRead() {
  Joy j;
  j.xRaw = analogRead(PIN_JS_X);
  j.yRaw = analogRead(PIN_JS_Y);
  j.pressed = (digitalRead(PIN_JS_SW) == LOW);
  j.xPct = pctFromRawCentered(j.xRaw, xCenter);
  j.yPct = -pctFromRawCentered(j.yRaw, yCenter);
  return j;
}

void joystickCalibrate() { xCenter = analogRead(PIN_JS_X); yCenter = analogRead(PIN_JS_Y); }
void joystickGetCenter(int& cx, int& cy) { cx = xCenter; cy = yCenter; }

String joystickJson() {
  Joy j = joystickRead(); int cx, cy; joystickGetCenter(cx, cy);
  String s = "{\"x\":"; s += j.xRaw;
  s += ",\"y\":"; s += j.yRaw;
  s += ",\"x_pct\":"; s += j.xPct;
  s += ",\"y_pct\":"; s += j.yPct;
  s += ",\"pressed\":"; s += (j.pressed ? "true":"false");
  s += ",\"center\":{\"x\":"; s += cx; s += ",\"y\":"; s += cy; s += "}}";
  return s;
}
